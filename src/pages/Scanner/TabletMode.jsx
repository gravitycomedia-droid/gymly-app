import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getGym } from '../../firebase/firestore';
import jsQR from 'jsqr';
import { db } from '../../firebase/config';
import { getDoc, doc, updateDoc, addDoc, collection, query, where, getDocs, serverTimestamp, increment, onSnapshot } from 'firebase/firestore';
import { formatDateKey, createAttendanceLog, getTodayActiveMembers } from '../../firebase/firestore-payments';
import { getInitials, getAvatarColor } from '../../utils/helpers';
import './Scanner.css';

const TabletMode = () => {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanningRef = useRef(true);

  const [gym, setGym] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [result, setResult] = useState(null);
  const [activeMembers, setActiveMembers] = useState([]);

  // Wake Lock
  useEffect(() => {
    let wakeLock = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (err) {
        console.log('Wake lock failed:', err);
      }
    };
    requestWakeLock();
    return () => { if (wakeLock) wakeLock.release(); };
  }, []);

  // Load gym
  useEffect(() => {
    if (userDoc?.gym_id) getGym(userDoc.gym_id).then(setGym);
  }, [userDoc?.gym_id]);

  // Live "who's inside"
  useEffect(() => {
    if (!userDoc?.gym_id) return;
    const unsub = getTodayActiveMembers(userDoc.gym_id, setActiveMembers);
    return () => unsub();
  }, [userDoc?.gym_id]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 1280 } }
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
        setResult({ type: 'error', message: 'Member not found' });
        setTimeout(resetScan, 5000);
        return;
      }
      const member = { id: memberSnap.id, ...memberSnap.data() };
      const expectedGym = userDoc?.gym_id || gymId;

      if (member.gym_id !== expectedGym) {
        setResult({ type: 'error', message: 'Wrong gym QR code' });
        setTimeout(resetScan, 5000);
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
          date: formatDateKey(now), scanned_by: 'qr_self', scan_mode: 'tablet', is_expired: true,
        });
        setResult({ type: 'expired', member });
        setTimeout(resetScan, 5000);
        return;
      }

      // Duplicate check
      const todayQ = query(collection(db, 'attendance_logs'),
        where('member_id', '==', memberId), where('date', '==', formatDateKey(now)),
        where('is_expired', '==', false));
      const todaySnap = await getDocs(todayQ);
      if (!todaySnap.empty) {
        setResult({ type: 'already', member });
        setTimeout(resetScan, 3000);
        return;
      }

      await createAttendanceLog({
        gym_id: expectedGym, member_id: memberId, member_name: member.name,
        member_photo: member.profile_photo || null, plan_name: member.plan_name || '',
        subscription_expiry: member.subscription_expiry, exit_time: null,
        date: formatDateKey(now), scanned_by: 'qr_self', scan_mode: 'tablet', is_expired: false,
      });

      await updateDoc(doc(db, 'users', memberId), {
        last_seen: serverTimestamp(), attendance_count: increment(1),
      });

      setResult({ type: 'success', member });
      setTimeout(resetScan, 3000);
    } catch (err) {
      console.error('Check-in error:', err);
      setResult({ type: 'error', message: 'Check-in failed' });
      setTimeout(resetScan, 5000);
    }
  }, [userDoc]);

  const resetScan = () => { setResult(null); scanningRef.current = true; };

  // Scanning loop
  useEffect(() => {
    if (!cameraReady) return;
    let animFrame;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas?.getContext('2d');

    function scan() {
      if (!video || !ctx || !scanningRef.current) { animFrame = requestAnimationFrame(scan); return; }
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
          }
          return;
        }
      }
      animFrame = requestAnimationFrame(scan);
    }
    animFrame = requestAnimationFrame(scan);
    return () => cancelAnimationFrame(animFrame);
  }, [cameraReady, handleCheckin]);

  useEffect(() => { startCamera(); return () => stopCamera(); }, []);

  // Fullscreen result overlay
  if (result && result.type !== 'error') {
    return (
      <div className={`tablet-result-fullscreen ${result.type}`}>
        <div className="tablet-result-icon">
          {result.type === 'success' ? '✓' : result.type === 'expired' ? '✗' : '✓'}
        </div>
        <div className="tablet-result-name">
          {result.type === 'success' && `Welcome back, ${result.member?.name}!`}
          {result.type === 'expired' && 'Access Denied'}
          {result.type === 'already' && `Welcome, ${result.member?.name}!`}
        </div>
        <div className="tablet-result-subtitle">
          {result.type === 'success' && (result.member?.plan_name || 'Active member')}
          {result.type === 'expired' && `${result.member?.name}'s membership has expired`}
          {result.type === 'already' && 'Already checked in today'}
        </div>
        {result.type === 'expired' && (
          <div className="tablet-result-subtitle" style={{ marginTop: 12, opacity: 0.7 }}>
            Please renew at reception
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="screen tablet-screen">
      <div className="screen-content">
        {/* Header */}
        <div className="tablet-header">
          <div className="tablet-gym-name">{gym?.name || 'Gymly'}</div>
          <div className="tablet-subtitle">Scan your membership QR to check in</div>
        </div>

        {/* Scanner zone */}
        <div className="tablet-scanner-zone">
          {cameraError ? (
            <div className="camera-prompt">
              <div className="camera-prompt-icon">📷</div>
              <h3>Camera access needed</h3>
              <p>{cameraError}</p>
            </div>
          ) : (
            <div className="tablet-video-wrapper">
              <video ref={videoRef} className="tablet-video" playsInline muted />
              <canvas ref={canvasRef} className="scanner-canvas" />
              <div className="tablet-scan-frame">
                <div className="scan-corner tl" />
                <div className="scan-corner tr" />
                <div className="scan-corner bl" />
                <div className="scan-corner br" />
                <div className="scan-beam" />
              </div>
            </div>
          )}
        </div>

        {/* Who's inside */}
        <div className="tablet-inside-panel">
          <div className="tablet-inside-header">
            <span className="tablet-inside-count">
              {activeMembers.length} member{activeMembers.length !== 1 ? 's' : ''} inside
            </span>
          </div>
          <div className="tablet-inside-avatars">
            {activeMembers.slice(0, 15).map((m, i) => {
              const color = getAvatarColor(m.member_name);
              return (
                <div key={m.id || i} className="tablet-inside-avatar" style={{ background: color.bg, color: color.text }}>
                  {getInitials(m.member_name)}
                </div>
              );
            })}
          </div>
        </div>

        {result?.type === 'error' && (
          <div style={{ textAlign: 'center', color: '#E24B4A', padding: 20, fontSize: 14, fontWeight: 600 }}>
            {result.message}
          </div>
        )}
      </div>
    </div>
  );
};

export default TabletMode;
