import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import { functions } from '../../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { playHapticSound } from '../../utils/helpers';
import './Scanner.css';

const QRScanner = () => {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanningRef = useRef(true);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [result, setResult] = useState(null); // { type, member }
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' = back, 'user' = front


  const startCamera = async (facing = facingMode) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing }
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

  const flipCamera = async () => {
    stopCamera();
    setCameraReady(false);
    const newFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newFacing);
    await startCamera(newFacing);
  };


  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  // All check-in logic now lives server-side in the processScan Cloud Function
  // (expiry / duplicate / gym-match / signed-token verification). The scanner
  // just forwards the raw QR payload and renders the returned status.
  const handleCheckin = useCallback(async (qrPayload) => {
    if (!scanningRef.current) return;
    scanningRef.current = false;

    try {
      const processScan = httpsCallable(functions, 'processScan');
      const { data } = await processScan({ qrPayload });
      const member = {
        id: data.memberId,
        name: data.memberName,
        profile_photo: data.memberPhoto,
        plan_name: data.planName,
      };

      if (data.status === 'success') {
        playHapticSound('success');
        setResult({ type: 'success', member, streak: data.currentStreak, isNewRecord: data.isNewRecord });
      } else if (data.status === 'expired') {
        playHapticSound('error');
        setResult({ type: 'expired', member });
      } else if (data.status === 'duplicate') {
        playHapticSound('error');
        setResult({ type: 'already', member });
      } else {
        playHapticSound('error');
        setResult({ type: 'error', message: data.message || 'Check-in failed' });
      }
    } catch (err) {
      console.error('Check-in error:', err);
      playHapticSound('error');
      const msg = err?.message?.includes('Expired or invalid') ? 'Expired code — ask member to reopen app'
        : err?.message?.includes('different gym') ? 'Wrong gym QR code'
        : err?.message?.includes('Outdated') ? 'Outdated code — ask member to reopen app'
        : 'Check-in failed';
      setResult({ type: 'error', message: msg });
    }
    setTimeout(resetScan, 3000);
  }, []);

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

          if (action === 'checkin') {
            handleCheckin(code.data);
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
          <div className="flex items-center gap-2">
            <button
              className="scanner-mode-link"
              onClick={flipCamera}
              title={facingMode === 'environment' ? 'Switch to front camera' : 'Switch to back camera'}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>flip_camera_ios</span>
              {facingMode === 'environment' ? 'Front' : 'Back'}
            </button>
            <button className="scanner-mode-link" onClick={() => navigate('/tablet')}>Tablet mode</button>
          </div>
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
              {result.type === 'expired' && 'Membership expired'}
              {result.type === 'already' && 'Already checked in today'}
              {result.type === 'error' && (result.message || 'An error occurred')}
            </div>
            {result.type === 'success' && result.streak > 1 && (
              <div className="scan-result-badge" style={{ background: 'rgba(255,255,255,0.2)' }}>
                🔥 {result.streak}-day streak{result.isNewRecord ? ' · new record!' : ''}
              </div>
            )}
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
