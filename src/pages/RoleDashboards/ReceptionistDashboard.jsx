import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import jsQR from 'jsqr';
import { db } from '../../firebase/config';
import { getDoc, doc, updateDoc, collection, query, where, getDocs, serverTimestamp, increment } from 'firebase/firestore';
import { formatDateKey, createAttendanceLog, getPaymentsRealtime, updatePayment } from '../../firebase/firestore-payments';
import { playHapticSound, getInitials, getAvatarColor, formatDate } from '../../utils/helpers';
import BottomNav from '../../components/BottomNav';
import '../Scanner/Scanner.css';
import '../Payments/Payments.css';

const ReceptionistDashboard = () => {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanningRef = useRef(true);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [result, setResult] = useState(null); // { type, member }
  
  // Pending payments state
  const [payments, setPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(true);

  // Partial Payment UI State
  const [clearModalPayment, setClearModalPayment] = useState(null);
  const [clearAmount, setClearAmount] = useState('');
  const [clearingId, setClearingId] = useState(null);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    const unsub = getPaymentsRealtime(userDoc.gym_id, (list) => {
      // Filter out only pending and partial ones across the whole gym
      const pending = list.filter(p => p.status === 'pending' || p.status === 'partial');
      setPayments(pending);
      setLoadingPayments(false);
    });
    return () => unsub();
  }, [userDoc?.gym_id]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCameraReady(true);
      }
    } catch (err) {
      console.error('Camera error:', err);
      setCameraError(err.message);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const handleCheckin = useCallback(async (memberId, gymId) => {
    if (!scanningRef.current) return;
    scanningRef.current = false;

    try {
      const memberSnap = await getDoc(doc(db, 'users', memberId));
      if (!memberSnap.exists()) {
        playHapticSound('error');
        setResult({ type: 'error', message: 'Member not found' });
        setTimeout(resetScan, 3000);
        return;
      }
      const member = { id: memberSnap.id, ...memberSnap.data() };

      const expectedGym = userDoc?.gym_id || gymId;
      if (member.gym_id !== expectedGym) {
        playHapticSound('error');
        setResult({ type: 'error', message: 'Wrong gym QR code' });
        setTimeout(resetScan, 3000);
        return;
      }

      const now = new Date();
      const expiry = member.subscription_expiry?.toDate ? member.subscription_expiry.toDate() : null;
      const isExpired = !expiry || expiry < now;

      if (isExpired) {
        await createAttendanceLog({
          gym_id: expectedGym, member_id: memberId, member_name: member.name,
          member_photo: member.profile_photo || null, plan_name: member.plan_name || '',
          subscription_expiry: member.subscription_expiry, exit_time: null,
          date: formatDateKey(now), scanned_by: 'qr_self', scan_mode: 'reception',
          is_expired: true,
        });
        playHapticSound('error');
        setResult({ type: 'expired', member, daysAgo: expiry ? Math.ceil((now - expiry) / (1000*60*60*24)) : 0 });
        setTimeout(resetScan, 3000);
        return;
      }

      const todayKey = formatDateKey(now);
      const todayQ = query(
        collection(db, 'attendance_logs'),
        where('member_id', '==', memberId),
        where('date', '==', todayKey),
        where('is_expired', '==', false)
      );
      const todaySnap = await getDocs(todayQ);

      if (!todaySnap.empty) {
        playHapticSound('error');
        setResult({ type: 'already', member });
        setTimeout(resetScan, 3000);
        return;
      }

      await createAttendanceLog({
        gym_id: expectedGym, member_id: memberId, member_name: member.name,
        member_photo: member.profile_photo || null, plan_name: member.plan_name || '',
        subscription_expiry: member.subscription_expiry, exit_time: null,
        date: todayKey, scanned_by: 'qr_self', scan_mode: 'reception',
        is_expired: false,
      });

      await updateDoc(doc(db, 'users', memberId), {
        last_seen: serverTimestamp(),
        attendance_count: increment(1),
      });

      playHapticSound('success');
      setResult({ type: 'success', member });
      setTimeout(resetScan, 3000);
    } catch (err) {
      console.error('Check-in error:', err);
      playHapticSound('error');
      setResult({ type: 'error', message: 'Check-in failed' });
      setTimeout(resetScan, 3000);
    }
  }, [userDoc]);

  const resetScan = () => {
    setResult(null);
    scanningRef.current = true;
  };

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (!cameraReady) return;

    let animFrame;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });

    function scan() {
      if (!video || !ctx || !scanningRef.current) {
        animFrame = requestAnimationFrame(scan);
        return;
      }

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });

          if (code && code.data.startsWith('gymly://checkin/')) {
            const parts = code.data.split('/');
            if (parts.length >= 5) {
              const memberId = parts[3];
              const gymId = parts[4];
              handleCheckin(memberId, gymId);
            }
          }
        } catch (e) {
          // ignore scan errors
        }
      }
      animFrame = requestAnimationFrame(scan);
    }

    scan();
    return () => cancelAnimationFrame(animFrame);
  }, [cameraReady, handleCheckin]);

  // Partial Payment Modal Handlers
  const handleConfirmClear = async () => {
    if (!clearAmount || isNaN(clearAmount) || Number(clearAmount) <= 0) {
      showToast('Enter a valid amount', 'error'); return;
    }
    const paying = Math.floor(Number(clearAmount));
    const currentPending = clearModalPayment.pending_amount || clearModalPayment.final_amount;

    if (paying > currentPending) {
      showToast('Amount exceeds pending due', 'error'); return;
    }

    setClearingId(clearModalPayment.id);
    try {
      const newPaid = (clearModalPayment.paid_amount || 0) + paying;
      const newPending = currentPending - paying;
      const newStatus = newPending === 0 ? 'paid' : 'partial';

      await updatePayment(clearModalPayment.id, {
        status: newStatus,
        paid_amount: newPaid,
        pending_amount: newPending,
      });
      showToast(`Payment updated for ${clearModalPayment.member_name} (₹${paying} collected)`, 'success');
    } catch (err) {
      showToast('Failed to update due', 'error');
    } finally {
      setClearingId(null);
      setClearModalPayment(null);
      setClearAmount('');
    }
  };

  return (
    <div className="screen">
      <div className="screen-content" style={{ padding: 0 }}>
        
        {/* Top Header */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '20px 20px 0', zIndex: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1 style={{ color: 'white', margin: 0, textShadow: '0 2px 4px rgba(0,0,0,0.5)', fontSize: 24 }}>Scanner</h1>
            <button 
              className="glass-btn" 
              onClick={() => navigate('/receptionist/members')}
              style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '8px 16px', borderRadius: 20 }}
            >
              Member Directory →
            </button>
          </div>
        </div>

        {/* Scanner Viewport */}
        <div className="scanner-viewport" style={{ height: '50vh', position: 'relative', overflow: 'hidden', background: '#000' }}>
          <video ref={videoRef} className="scanner-video" playsInline muted style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          
          <div className="scanner-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', pointerEvents: 'none' }}>
            {cameraError ? (
              <div className="scanner-error" style={{ color: 'white', textAlign: 'center', marginTop: '25%' }}>
                <div>📷</div>
                <h3>Camera Required</h3>
                <p>{cameraError}</p>
                <button onClick={startCamera} style={{ background: 'white', color: 'black', padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', marginTop: 10 }}>Try Again</button>
              </div>
            ) : !cameraReady ? (
              <div className="scanner-loading" style={{ color: 'white', textAlign: 'center', marginTop: '25%' }}>
                <div className="spinner" style={{ borderColor: 'white', borderTopColor: 'transparent', margin: '0 auto 10px' }} />
                <p>Initializing camera...</p>
              </div>
            ) : (
              <div className="scanner-guides" style={{ width: 220, height: 220, border: '2px solid rgba(255,255,255,0.5)', borderRadius: 24, position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', boxShadow: '0 0 0 4000px rgba(0,0,0,0.5)' }} />
            )}
          </div>

          {/* Result Overlay */}
          {result && (
            <div className={`scanner-result glass-card ${result.type}`} style={{ position: 'absolute', bottom: 20, left: 20, right: 20, zIndex: 100 }}>
              {result.type === 'error' && (
                <>
                  <div className="result-icon">❌</div>
                  <div className="result-info">
                    <h3 style={{ margin: 0 }}>Error</h3>
                    <p style={{ margin: '4px 0 0' }}>{result.message}</p>
                  </div>
                </>
              )}
              {result.type === 'already' && result.member && (
                <>
                  <div className="result-icon">⚠️</div>
                  <div className="result-info">
                    <h3 style={{ margin: 0 }}>{result.member.name}</h3>
                    <p style={{ margin: '4px 0 0' }}>Already checked in today</p>
                  </div>
                </>
              )}
              {result.type === 'expired' && result.member && (
                <>
                  <div className="result-icon" style={{ background: 'var(--error)', color: 'white' }}>❌</div>
                  <div className="result-info">
                    <h3 style={{ margin: 0, color: 'var(--error)' }}>{result.member.name}</h3>
                    <p style={{ margin: '4px 0 0', fontWeight: 600, color: 'var(--error)' }}>Membership Expired</p>
                    <p style={{ margin: 0, fontSize: 13, color: 'rgba(226, 75, 74, 0.8)' }}>
                      Expired {result.daysAgo} days ago
                    </p>
                  </div>
                </>
              )}
              {result.type === 'success' && result.member && (
                <>
                  <div className="result-icon" style={{ background: '#1D9E75', color: 'white' }}>✓</div>
                  <div className="result-info">
                    <h3 style={{ margin: 0, color: '#1D9E75' }}>{result.member.name}</h3>
                    <p style={{ margin: '4px 0 0', fontWeight: 600, color: '#1D9E75' }}>Successfully Checked-in</p>
                    <p style={{ margin: 0, fontSize: 13, color: 'rgba(29, 158, 117, 0.8)' }}>
                      {result.member.plan_name || 'Active Member'}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Pending Payments List */}
        <div style={{ height: '50vh', background: '#f8f9fc', borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -24, position: 'relative', zIndex: 5, padding: '24px 20px', overflowY: 'auto' }}>
          <h2 style={{ fontSize: 18, marginBottom: 16 }}>Pending Payments <span style={{ background: 'var(--amber)', color: 'white', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>{payments.length}</span></h2>
          
          {loadingPayments ? (
            <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner spinner-primary" /></div>
          ) : payments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <p>All clear! No pending payments.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 100 }}>
              {payments.map(p => {
                const isPartial = p.status === 'partial';
                return (
                  <div key={p.id} className="payment-card glass-card">
                    <div className="payment-header">
                      <div className="payment-member">
                        <div className="payment-avatar" style={{ background: getAvatarColor(p.member_name).bg, color: getAvatarColor(p.member_name).text }}>
                          {getInitials(p.member_name)}
                        </div>
                        <div>
                          <div className="payment-name">{p.member_name}</div>
                          <div className="payment-date">{formatDate(p.created_at)}</div>
                        </div>
                      </div>
                      <span className={`payment-status ${p.status}`}>{p.status}</span>
                    </div>

                    <div className="payment-body">
                      <div className="payment-plan">{p.plan_name}</div>
                      <div className="payment-amounts">
                        <div className="amount-col">
                          <span className="amount-label">Total</span>
                          <span className="amount-value">₹{p.final_amount?.toLocaleString('en-IN')}</span>
                        </div>
                        {isPartial && (
                          <div className="amount-col">
                            <span className="amount-label">Paid</span>
                            <span className="amount-value" style={{ color: 'var(--success)' }}>₹{p.paid_amount?.toLocaleString('en-IN')}</span>
                          </div>
                        )}
                        <div className="amount-col">
                          <span className="amount-label">Due</span>
                          <span className="amount-value" style={{ color: 'var(--danger)' }}>₹{(p.pending_amount || p.final_amount)?.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="payment-footer">
                      <button 
                        className="btn-ghost" 
                        style={{ color: 'var(--success)', borderColor: 'var(--success)', padding: '6px 12px', fontSize: 13, flex: 1 }}
                        onClick={(e) => { e.stopPropagation(); setClearModalPayment(p); setClearAmount(p.pending_amount || p.final_amount || ''); }}
                      >
                        ✓ Clear Due
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Partial Payment Clear Modal */}
      {clearModalPayment && (
        <div className="settings-edit-overlay" onClick={() => setClearModalPayment(null)} style={{ zIndex: 1000 }}>
          <div className="settings-edit-sheet glass-card" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 className="settings-edit-title" style={{ marginBottom: 0, flex: 1, textAlign: 'center' }}>Clear Payment</h2>
              <button onClick={() => setClearModalPayment(null)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            
            <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>
              {clearModalPayment.member_name} currently owes<br />
              <strong style={{ fontSize: 24, color: 'var(--danger)', display: 'block', marginTop: 8 }}>
                ₹{clearModalPayment.pending_amount || clearModalPayment.final_amount}
              </strong>
            </p>

            <div className="input-group">
              <label className="input-label">Amount collected today (₹)</label>
              <input
                type="number"
                className="input-field"
                value={clearAmount}
                onChange={(e) => setClearAmount(e.target.value)}
                placeholder="0"
                autoFocus
              />
            </div>

            <button 
              className="btn-primary" 
              style={{ width: '100%', marginTop: 24 }}
              onClick={handleConfirmClear}
              disabled={clearingId === clearModalPayment.id}
            >
              {clearingId === clearModalPayment.id ? <div className="spinner" /> : 'Confirm Payment'}
            </button>
          </div>
        </div>
      )}

      <BottomNav activeTab="home" role="receptionist" />
    </div>
  );
};

export default ReceptionistDashboard;
