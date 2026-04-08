import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import jsQR from 'jsqr';
import { db } from '../../firebase/config';
import { getDoc, doc, updateDoc, addDoc, collection, query, where, getDocs, serverTimestamp, increment } from 'firebase/firestore';
import { formatDateKey, createAttendanceLog } from '../../firebase/firestore-payments';
import { getInitials, getAvatarColor } from '../../utils/helpers';
import './Scanner.css';

const QRScanner = () => {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanningRef = useRef(true);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [result, setResult] = useState(null); // { type, member }

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
      // 1. Fetch member
      const memberSnap = await getDoc(doc(db, 'users', memberId));
      if (!memberSnap.exists()) {
        setResult({ type: 'error', message: 'Member not found' });
        setTimeout(resetScan, 3000);
        return;
      }
      const member = { id: memberSnap.id, ...memberSnap.data() };

      // 2. Verify gym
      const expectedGym = userDoc?.gym_id || gymId;
      if (member.gym_id !== expectedGym) {
        setResult({ type: 'error', message: 'Wrong gym QR code' });
        setTimeout(resetScan, 3000);
        return;
      }

      // 3. Check expiry
      const now = new Date();
      const expiry = member.subscription_expiry?.toDate ? member.subscription_expiry.toDate() : null;
      const isExpired = !expiry || expiry < now;

      if (isExpired) {
        await createAttendanceLog({
          gym_id: expectedGym,
          member_id: memberId,
          member_name: member.name,
          member_photo: member.profile_photo || null,
          plan_name: member.plan_name || '',
          subscription_expiry: member.subscription_expiry,
          exit_time: null,
          date: formatDateKey(now),
          scanned_by: 'qr_self',
          scan_mode: 'phone',
          is_expired: true,
        });
        setResult({ type: 'expired', member, daysAgo: expiry ? Math.ceil((now - expiry) / (1000*60*60*24)) : 0 });
        setTimeout(resetScan, 3000);
        return;
      }

      // 4. Duplicate check
      const todayKey = formatDateKey(now);
      const todayQ = query(
        collection(db, 'attendance_logs'),
        where('member_id', '==', memberId),
        where('date', '==', todayKey),
        where('is_expired', '==', false)
      );
      const todaySnap = await getDocs(todayQ);

      if (!todaySnap.empty) {
        setResult({ type: 'already', member });
        setTimeout(resetScan, 3000);
        return;
      }

      // 5. Log valid entry
      await createAttendanceLog({
        gym_id: expectedGym,
        member_id: memberId,
        member_name: member.name,
        member_photo: member.profile_photo || null,
        plan_name: member.plan_name || '',
        subscription_expiry: member.subscription_expiry,
        exit_time: null,
        date: todayKey,
        scanned_by: 'qr_self',
        scan_mode: 'phone',
        is_expired: false,
      });

      // 6. Update user
      await updateDoc(doc(db, 'users', memberId), {
        last_seen: serverTimestamp(),
        attendance_count: increment(1),
      });

      setResult({ type: 'success', member });
      setTimeout(resetScan, 3000);
    } catch (err) {
      console.error('Check-in error:', err);
      setResult({ type: 'error', message: 'Check-in failed' });
      setTimeout(resetScan, 3000);
    }
  }, [userDoc]);

  const resetScan = () => {
    setResult(null);
    scanningRef.current = true;
  };

  // Scanning loop
  useEffect(() => {
    if (!cameraReady) return;

    let animFrame;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas?.getContext('2d');

    function scan() {
      if (!video || !ctx || !scanningRef.current) {
        animFrame = requestAnimationFrame(scan);
        return;
      }

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code && code.data.startsWith('gymly://')) {
          const actionData = code.data.replace('gymly://', '');
          const parts = actionData.split('/');
          const action = parts[0];
          const memberId = parts[1];
          const gymId = parts[2];
          
          if (action === 'checkin') {
            handleCheckin(memberId, gymId);
          } else if (action === 'member') {
            navigate(`/owner/members/${memberId}`);
          }
          return;
        }
      }
      animFrame = requestAnimationFrame(scan);
    }

    animFrame = requestAnimationFrame(scan);
    return () => cancelAnimationFrame(animFrame);
  }, [cameraReady, handleCheckin]);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  return (
    <div className="screen scanner-screen">
      <div className="screen-content">
        {/* Top bar */}
        <div className="scanner-top-bar">
          <button className="scanner-back-btn" onClick={() => navigate(-1)}>← Back</button>
          <span className="scanner-title">Scan QR</span>
          <button className="scanner-mode-link" onClick={() => navigate('/tablet')}>Tablet mode</button>
        </div>

        {/* Camera */}
        <div className="scanner-video-container">
          {cameraError ? (
            <div className="camera-prompt">
              <div className="camera-prompt-icon">📷</div>
              <h3>Camera access needed</h3>
              <p>Please allow camera access to scan QR codes. {cameraError}</p>
            </div>
          ) : (
            <>
              <video ref={videoRef} className="scanner-video" playsInline muted />
              <canvas ref={canvasRef} className="scanner-canvas" />
              {!result && (
                <div className="scan-overlay">
                  <div className="scan-frame">
                    <div className="scan-corner tl" />
                    <div className="scan-corner tr" />
                    <div className="scan-corner bl" />
                    <div className="scan-corner br" />
                    <div className="scan-beam" />
                    <div className="scan-hint">Align QR code within frame</div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Result panel */}
        {result && (
          <div className={`scan-result-panel ${result.type}`}>
            <div className="scan-result-check">
              {result.type === 'success' ? '✓' : result.type === 'expired' ? '✗' : result.type === 'already' ? '✓' : '⚠'}
            </div>
            <div className="scan-result-name">
              {result.member?.name || result.message || 'Unknown'}
            </div>
            <div className="scan-result-detail">
              {result.type === 'success' && 'Entry logged successfully!'}
              {result.type === 'expired' && `Membership expired ${result.daysAgo || ''} days ago`}
              {result.type === 'already' && 'Already checked in today'}
              {result.type === 'error' && (result.message || 'An error occurred')}
            </div>
            {result.member?.plan_name && (
              <div className="scan-result-badge">{result.member.plan_name}</div>
            )}
            {result.type === 'expired' && (
              <button
                className="btn-primary"
                style={{ marginTop: 16, background: 'rgba(255,255,255,0.2)', maxWidth: 200 }}
                onClick={() => navigate(`/owner/members/${result.member?.id}`)}
              >
                Renew membership →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default QRScanner;
