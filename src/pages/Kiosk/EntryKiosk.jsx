import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../../firebase/config';
import { getDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import useKioskCamera from '../../hooks/useKioskCamera';
import useKioskAuth from '../../hooks/useKioskAuth';
import useLiveOccupancy from '../../hooks/useLiveOccupancy';
import {
  createAttendanceSession,
  completeAttendanceSession,
  findActiveSession,
  createAccessDeniedLog,
  updateKioskDevice,
} from '../../firebase/firestore-kiosk';
import { playKioskSound, resumeAudioContext } from '../../utils/kioskSounds';
import './Kiosk.css';

// ─── Pairing screen ───────────────────────────────────────────────
const PairingScreen = ({ pair, pairing, pairingError }) => {
  const [digits, setDigits] = useState([]);

  const press = (d) => {
    if (digits.length >= 6) return;
    setDigits((prev) => [...prev, d]);
  };
  const del = () => setDigits((prev) => prev.slice(0, -1));
  const submit = async () => {
    if (digits.length !== 6) return;
    const ok = await pair(digits.join(''));
    if (ok) window.location.reload();
  };

  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'];

  return (
    <div className="kiosk-setup">
      <div className="kiosk-setup-logo">GYMLY</div>
      <div className="kiosk-setup-title">Connect Kiosk Device</div>
      <div className="kiosk-setup-sub">
        Enter the 6-digit pairing code shown in the owner dashboard to activate this kiosk.
      </div>

      {/* PIN display */}
      <div className="kiosk-pin-row">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`kiosk-pin-cell ${digits[i] !== undefined ? 'filled' : ''}`}>
            {digits[i] ?? ''}
          </div>
        ))}
      </div>

      {pairingError && (
        <div className="kiosk-setup-error">{pairingError}</div>
      )}

      {/* Numpad */}
      <div className="kiosk-numpad">
        {keys.map((k, idx) =>
          k === null ? (
            <div key={`empty-${idx}`} />
          ) : k === 'del' ? (
            <button key="del" className="kiosk-numpad-btn delete" onClick={del}>⌫</button>
          ) : (
            <button key={`key-${k}`} className="kiosk-numpad-btn" onClick={() => press(k)}>{k}</button>
          )
        )}
        <button
          className="kiosk-numpad-btn connect"
          onClick={submit}
          disabled={digits.length !== 6 || pairing}
        >
          {pairing ? 'Connecting...' : 'Connect This Kiosk →'}
        </button>
      </div>
    </div>
  );
};

// ─── Result overlay ───────────────────────────────────────────────
const ResultOverlay = ({ result, countdown }) => {
  const icons = {
    success: '✓',
    'exit-success': '👋',
    expiring: '⚠',
    expired: '✕',
    error: '?',
  };
  const titles = {
    success: `Welcome, ${result.member?.name || 'Member'}! 👋`,
    'exit-success': `Goodbye, ${result.member?.name || 'Member'}! 👋`,
    expiring: `Welcome, ${result.member?.name || 'Member'}! 👋`,
    expired: 'Access Denied',
    error: 'Unknown QR Code',
  };
  const subtitles = {
    success: 'Your membership is valid. Entry logged.',
    'exit-success': `Checked out successfully. You worked out for ${result.durationMinutes || 0} minutes.`,
    expiring: `Membership expires in ${result.daysLeft} day${result.daysLeft !== 1 ? 's' : ''}. Please renew soon.`,
    expired: result.member
      ? `${result.member.name}'s membership has expired. Please contact the front desk.`
      : 'This QR code is not a valid Gymly membership card.',
    error: 'This QR code is not a valid Gymly membership card for this gym.',
  };

  return (
    <div className={`kiosk-result ${result.type}`}>
      <div className="kiosk-result-icon-circle">{icons[result.type]}</div>
      <div className="kiosk-result-name">{titles[result.type]}</div>
      <div className="kiosk-result-subtitle">{subtitles[result.type]}</div>
      {result.member?.plan_name && (
        <div className="kiosk-result-badge">{result.member.plan_name}</div>
      )}
      <div className="kiosk-result-timer">
        Returning to idle in <span>{countdown}</span>...
      </div>
    </div>
  );
};

// ─── Main Entry Kiosk ─────────────────────────────────────────────
const EntryKiosk = () => {
  const { isPaired, deviceId, gymId, mode, pairing, pairingError, pair } = useKioskAuth();
  const { occupancy } = useLiveOccupancy(gymId);
  const [result, setResult] = useState(null);
  const [countdown, setCountdown] = useState(3);
  const [clock, setClock] = useState('');
  const [scanning, setScanning] = useState(false);
  const countdownRef = useRef(null);

  // ── Clock ────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      let h = now.getHours(), m = now.getMinutes();
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      setClock(`${h}:${m.toString().padStart(2, '0')} ${ampm}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Wake Lock ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPaired) return;
    let wl = null;
    const req = async () => {
      try {
        if ('wakeLock' in navigator) wl = await navigator.wakeLock.request('screen');
      } catch (_) {}
    };
    req();
    const onVis = () => { if (document.visibilityState === 'visible') req(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if (wl) wl.release();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [isPaired]);

  // ── Auto-return countdown ─────────────────────────────────────────
  const autoReturn = useCallback((seconds = 3) => {
    setCountdown(seconds);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(countdownRef.current);
          setResult(null);
          setScanning(false);
          return 3;
        }
        return c - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  // ── QR handling ───────────────────────────────────────────────────
  const handleQR = useCallback(async (qrData) => {
    resumeAudioContext();
    setScanning(false);

    // Parse: gymly://checkin/{memberId}/{gymId}
    if (!qrData.startsWith('gymly://')) {
      setResult({ type: 'error' });
      playKioskSound('alert');
      autoReturn(3);
      return;
    }

    const parts = qrData.replace('gymly://', '').split('/');
    const action = parts[0];
    const memberId = parts[1];
    const qrGymId = parts[2];

    if (action !== 'checkin' || !memberId) {
      setResult({ type: 'error' });
      playKioskSound('alert');
      autoReturn(3);
      return;
    }

    try {
      const memberSnap = await getDoc(doc(db, 'users', memberId));
      if (!memberSnap.exists()) {
        setResult({ type: 'error' });
        playKioskSound('alert');
        autoReturn(3);
        return;
      }

      const member = { id: memberId, ...memberSnap.data() };
      const expectedGym = gymId || qrGymId;

      if (member.gym_id !== expectedGym) {
        setResult({ type: 'error' });
        playKioskSound('alert');
        autoReturn(3);
        return;
      }

      const now = new Date();
      const expiry = member.subscription_expiry?.toDate ? member.subscription_expiry.toDate() : null;
      const isExpired = !expiry || expiry <= now;

      if (isExpired) {
        await createAccessDeniedLog({
          memberId,
          gymId: expectedGym,
          deviceId: deviceId || 'unknown',
          reason: 'expired',
          memberName: member.name,
          memberPhone: member.phone || '',
        });
        setResult({ type: 'expired', member });
        playKioskSound('alert');
        autoReturn(4);
        return;
      }

      const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

      // Check if user is already inside
      const activeSession = await findActiveSession(memberId, expectedGym);

      // Determine action based on mode and session state
      let actionType = 'entry';
      if (mode === 'exit') actionType = 'exit';
      else if (mode === 'both') {
        actionType = activeSession ? 'exit' : 'entry';
      }

      if (actionType === 'exit') {
        if (!activeSession) {
          // Trying to exit but not inside? We'll just show success or create a 0 min session?
          // For now, let's just create a quick entry and immediate exit so it logs.
          const sid = await createAttendanceSession({ memberId, gymId: expectedGym, entryDeviceId: 'manual' });
          await completeAttendanceSession(sid, { exitDeviceId: deviceId, durationMinutes: 1 });
          setResult({ type: 'exit-success', member, durationMinutes: 1 });
        } else {
          const entryMs = activeSession.entryTime?.toDate ? activeSession.entryTime.toDate().getTime() : Date.now();
          const durationMinutes = Math.max(1, Math.round((Date.now() - entryMs) / 60000));
          await completeAttendanceSession(activeSession.id, { exitDeviceId: deviceId, durationMinutes });
          setResult({ type: 'exit-success', member, durationMinutes });
        }
        playKioskSound('exit');
        autoReturn(4);
      } else {
        // Entry
        if (daysLeft <= 15) {
          setResult({ type: 'expiring', member, daysLeft });
          playKioskSound('warning');
        } else {
          setResult({ type: 'success', member, daysLeft });
          playKioskSound('success');
        }
        
        await createAttendanceSession({
          memberId,
          gymId: expectedGym,
          entryDeviceId: deviceId || 'manual',
          memberName: member.name || '',
        });
        
        autoReturn(4);
      }

      // Update device lastSeen & member last_seen
      if (deviceId) {
        updateKioskDevice(deviceId, { lastSeen: serverTimestamp() }).catch(() => {});
      }
      if (actionType === 'entry') {
        const _lsKey = `last_seen_write_${memberId}`;
        const _lastWrite = parseInt(sessionStorage.getItem(_lsKey) || '0', 10);
        if (Date.now() - _lastWrite >= 30 * 60 * 1000) {
          updateDoc(doc(db, 'users', memberId), { last_seen: serverTimestamp() })
            .then(() => sessionStorage.setItem(_lsKey, String(Date.now())))
            .catch(() => {});
        }
      }
    } catch (err) {
      console.error('Kiosk scan error:', err);
      setResult({ type: 'error' });
      playKioskSound('alert');
      autoReturn(3);
    }
  }, [gymId, deviceId, autoReturn]);

  const { videoRef, canvasRef, cameraState, startCamera, stopCamera, toggleCamera, facingMode } = useKioskCamera(handleQR);

  const handleTap = () => {
    resumeAudioContext();
    if (result) return;
    setScanning(true);
    startCamera();
  };

  const handleCancel = () => {
    stopCamera();
    setScanning(false);
  };

  // ── Not paired ────────────────────────────────────────────────────
  if (!isPaired) {
    return (
      <div className="kiosk-root">
        <div className="kiosk-bg">
          <div className="kiosk-bg-blob kiosk-bg-blob-1" />
          <div className="kiosk-bg-blob kiosk-bg-blob-2" />
          <div className="kiosk-bg-overlay" />
        </div>
        <PairingScreen pair={pair} pairing={pairing} pairingError={pairingError} />
      </div>
    );
  }

  return (
    <div className="kiosk-root">
      {/* Ambient background */}
      <div className="kiosk-bg">
        <div className="kiosk-bg-blob kiosk-bg-blob-1" />
        <div className="kiosk-bg-blob kiosk-bg-blob-2" />
        <div className="kiosk-bg-overlay" />
      </div>

      {/* Result overlay */}
      {result && <ResultOverlay result={result} countdown={countdown} />}

      {/* Header */}
      <header className="kiosk-header">
        <div className="kiosk-header-brand">
          <div className="kiosk-header-icon">
            <span className="material-symbols-outlined">qr_code_scanner</span>
          </div>
          <div>
            <div className="kiosk-header-name">GYMLY</div>
            <div className="kiosk-header-gym" style={{ textTransform: 'capitalize' }}>
              {mode === 'both' ? 'Smart' : mode} Kiosk
            </div>
          </div>
        </div>
        <div className="kiosk-header-right">
          <div className="kiosk-clock">{clock}</div>
          <div className="kiosk-connected-badge">
            <span className="kiosk-connected-dot" />
            Connected
          </div>
        </div>
      </header>

      {/* Main area */}
      <main className="kiosk-main" onClick={!scanning && !result ? handleTap : undefined}>
        {/* Mode badge */}
        <div className={`kiosk-mode-badge ${mode}`}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            {mode === 'entry' ? 'login' : mode === 'exit' ? 'logout' : 'sync_alt'}
          </span>
          {mode === 'entry' ? 'Entry Mode' : mode === 'exit' ? 'Exit Mode' : 'Smart Mode (Entry/Exit)'}
        </div>

        {/* Scanner box */}
        <div className="kiosk-scanner-box">
          {scanning ? (
            <>
              <video ref={videoRef} className="kiosk-video" style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }} playsInline muted autoPlay />
              <canvas ref={canvasRef} className="kiosk-canvas" />
              <div className="kiosk-corner tl" />
              <div className="kiosk-corner tr" />
              <div className="kiosk-corner bl" />
              <div className="kiosk-corner br" />
              {cameraState === 'active' && <div className="kiosk-scan-beam" />}
              
              <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 20 }}>
                <button className="kiosk-cancel-btn" style={{ position: 'static' }} onClick={toggleCamera}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>flip_camera_ios</span>
                  Flip
                </button>
              </div>

              <button className="kiosk-cancel-btn" onClick={handleCancel}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                Cancel
              </button>
            </>
          ) : (
            <>
              <div className="kiosk-scanner-glow" />
              <div className="kiosk-corner tl" />
              <div className="kiosk-corner tr" />
              <div className="kiosk-corner bl" />
              <div className="kiosk-corner br" />
              <span className="material-symbols-outlined kiosk-qr-icon">qr_code_2</span>
            </>
          )}
        </div>

        {/* Instructions */}
        {!scanning ? (
          <>
            <div className="kiosk-instruction-title">Scan Membership QR</div>
            <div className="kiosk-instruction-sub">
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>touch_app</span>
              Tap anywhere to start
            </div>
          </>
        ) : (
          <div className="kiosk-instruction-title" style={{ fontSize: 18, color: '#474553' }}>
            Hold QR code steady within the frame
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="kiosk-footer">
        <div className="kiosk-footer-occupancy">
          <div className="kiosk-footer-icon">
            <span className="material-symbols-outlined">group</span>
          </div>
          <div>
            <div className="kiosk-footer-label">Current Occupancy</div>
            <div className="kiosk-footer-count">{occupancy}</div>
          </div>
        </div>
        <div className="kiosk-footer-entries">
          <div className="kiosk-footer-label">Device</div>
          <div style={{ fontSize: 13, color: '#474553', fontWeight: 500, textTransform: 'capitalize' }}>
            {mode === 'both' ? 'Smart' : mode} Kiosk
          </div>
        </div>
      </footer>
    </div>
  );
};

export default EntryKiosk;
