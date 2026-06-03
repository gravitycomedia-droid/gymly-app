import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../../firebase/config';
import { getDoc, doc } from 'firebase/firestore';
import useKioskCamera from '../../hooks/useKioskCamera';
import useKioskAuth from '../../hooks/useKioskAuth';
import useLiveOccupancy from '../../hooks/useLiveOccupancy';
import {
  findActiveSession,
  completeAttendanceSession,
  createAccessDeniedLog,
  updateKioskDevice,
} from '../../firebase/firestore-kiosk';
import { playKioskSound, resumeAudioContext } from '../../utils/kioskSounds';
import './Kiosk.css';

// ─── Pairing screen (reuse same component style) ──────────────────
const PairingScreen = ({ pair, pairing, pairingError }) => {
  const [digits, setDigits] = useState([]);
  const press = (d) => { if (digits.length < 6) setDigits((p) => [...p, d]); };
  const del = () => setDigits((p) => p.slice(0, -1));
  const submit = async () => {
    if (digits.length !== 6) return;
    const ok = await pair(digits.join(''));
    if (ok) window.location.reload();
  };
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'];
  return (
    <div className="kiosk-setup">
      <div className="kiosk-setup-logo">GYMLY</div>
      <div className="kiosk-setup-title">Connect Exit Kiosk</div>
      <div className="kiosk-setup-sub">Enter the 6-digit pairing code from the owner dashboard.</div>
      <div className="kiosk-pin-row">
        {[0,1,2,3,4,5].map((i) => (
          <div key={i} className={`kiosk-pin-cell ${digits[i] !== undefined ? 'filled' : ''}`}>{digits[i] ?? ''}</div>
        ))}
      </div>
      {pairingError && <div className="kiosk-setup-error">{pairingError}</div>}
      <div className="kiosk-numpad">
        {keys.map((k, idx) =>
          k === null ? <div key={idx} /> :
          k === 'del' ? <button key="del" className="kiosk-numpad-btn delete" onClick={del}>⌫</button> :
          <button key={k} className="kiosk-numpad-btn" onClick={() => press(k)}>{k}</button>
        )}
        <button className="kiosk-numpad-btn connect" onClick={submit} disabled={digits.length !== 6 || pairing}>
          {pairing ? 'Connecting...' : 'Connect This Kiosk →'}
        </button>
      </div>
    </div>
  );
};

// ─── Result overlay ───────────────────────────────────────────────
const ExitResultOverlay = ({ result, countdown }) => {
  const config = {
    'exit-success': {
      icon: '👋',
      title: `Goodbye, ${result.member?.name || 'Member'}!`,
      subtitle: result.durationMinutes
        ? `Workout duration: ${result.durationMinutes >= 60
            ? `${Math.floor(result.durationMinutes / 60)}h ${result.durationMinutes % 60}m`
            : `${result.durationMinutes}m`}\n\nSee you next time!`
        : 'See you next time!',
    },
    'no-session': {
      icon: '?',
      title: 'Not Checked In',
      subtitle: `${result.member?.name ? result.member.name + ' is' : 'You are'} not currently checked in at this gym.`,
    },
    'error': {
      icon: '?',
      title: 'Unknown QR Code',
      subtitle: 'This QR code is not a valid Gymly membership card.',
    },
  };
  const c = config[result.type] || config['error'];
  return (
    <div className={`kiosk-result ${result.type}`}>
      <div className="kiosk-result-icon-circle" style={{ fontSize: 56 }}>{c.icon}</div>
      <div className="kiosk-result-name">{c.title}</div>
      <div className="kiosk-result-subtitle" style={{ whiteSpace: 'pre-line' }}>{c.subtitle}</div>
      <div className="kiosk-result-timer">Returning to idle in <span>{countdown}</span>...</div>
    </div>
  );
};

// ─── Main Exit Kiosk ──────────────────────────────────────────────
const ExitKiosk = () => {
  const { isPaired, deviceId, gymId, pairing, pairingError, pair } = useKioskAuth();
  const { occupancy } = useLiveOccupancy(gymId);
  const [result, setResult] = useState(null);
  const [countdown, setCountdown] = useState(3);
  const [clock, setClock] = useState('');
  const [scanning, setScanning] = useState(false);
  const countdownRef = useRef(null);

  // Clock
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

  // Wake Lock
  useEffect(() => {
    if (!isPaired) return;
    let wl = null;
    const req = async () => { try { if ('wakeLock' in navigator) wl = await navigator.wakeLock.request('screen'); } catch (_) {} };
    req();
    const onVis = () => { if (document.visibilityState === 'visible') req(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { if (wl) wl.release(); document.removeEventListener('visibilitychange', onVis); };
  }, [isPaired]);

  const autoReturn = useCallback((seconds = 3) => {
    setCountdown(seconds);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(countdownRef.current); setResult(null); setScanning(false); return 3; }
        return c - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  const handleQR = useCallback(async (qrData) => {
    resumeAudioContext();
    setScanning(false);

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

    if ((action !== 'checkin' && action !== 'member') || !memberId) {
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

      // Find active session
      const session = await findActiveSession(memberId, expectedGym);
      if (!session) {
        setResult({ type: 'no-session', member });
        playKioskSound('alert');
        autoReturn(3);
        return;
      }

      // Calculate duration
      const entryTime = session.entryTime?.toDate ? session.entryTime.toDate() : new Date();
      const exitTime = new Date();
      const durationMinutes = Math.max(1, Math.round((exitTime - entryTime) / 60000));

      await completeAttendanceSession(session.id, {
        exitDeviceId: deviceId || 'manual',
        durationMinutes,
      });

      if (deviceId) updateKioskDevice(deviceId, { lastSeen: new Date() }).catch(() => {});

      setResult({ type: 'exit-success', member, durationMinutes });
      playKioskSound('exit');
      autoReturn(3);
    } catch (err) {
      console.error('Exit kiosk error:', err);
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

  if (!isPaired) {
    return (
      <div className="kiosk-root">
        <div className="kiosk-bg"><div className="kiosk-bg-blob kiosk-bg-blob-1" /><div className="kiosk-bg-blob kiosk-bg-blob-2" /><div className="kiosk-bg-overlay" /></div>
        <PairingScreen pair={pair} pairing={pairing} pairingError={pairingError} />
      </div>
    );
  }

  return (
    <div className="kiosk-root">
      <div className="kiosk-bg">
        <div className="kiosk-bg-blob kiosk-bg-blob-1" style={{ background: '#d8e2ff' }} />
        <div className="kiosk-bg-blob kiosk-bg-blob-2" style={{ background: '#adc6ff' }} />
        <div className="kiosk-bg-overlay" />
      </div>

      {result && <ExitResultOverlay result={result} countdown={countdown} />}

      <header className="kiosk-header">
        <div className="kiosk-header-brand">
          <div className="kiosk-header-icon" style={{ background: '#0056b8' }}>
            <span className="material-symbols-outlined">logout</span>
          </div>
          <div>
            <div className="kiosk-header-name" style={{ color: '#00408b' }}>GYMLY</div>
            <div className="kiosk-header-gym">Exit Kiosk</div>
          </div>
        </div>
        <div className="kiosk-header-right">
          <div className="kiosk-clock">{clock}</div>
          <div className="kiosk-connected-badge"><span className="kiosk-connected-dot" />Connected</div>
        </div>
      </header>

      <main className="kiosk-main" onClick={!scanning && !result ? handleTap : undefined}>
        <div className="kiosk-mode-badge exit">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
          Exit Mode
        </div>

        <div className="kiosk-scanner-box" style={{ borderColor: 'rgba(0,86,184,0.3)' }}>
          {scanning ? (
            <>
              <video ref={videoRef} className="kiosk-video" style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }} playsInline muted autoPlay />
              <canvas ref={canvasRef} className="kiosk-canvas" />
              <div className="kiosk-corner tl" style={{ borderColor: 'rgba(0,86,184,0.7)' }} />
              <div className="kiosk-corner tr" style={{ borderColor: 'rgba(0,86,184,0.7)' }} />
              <div className="kiosk-corner bl" style={{ borderColor: 'rgba(0,86,184,0.7)' }} />
              <div className="kiosk-corner br" style={{ borderColor: 'rgba(0,86,184,0.7)' }} />
              {cameraState === 'active' && <div className="kiosk-scan-beam" style={{ background: 'linear-gradient(to right, transparent, #007aff, transparent)' }} />}
              
              <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 20 }}>
                <button className="kiosk-cancel-btn" style={{ position: 'static' }} onClick={toggleCamera}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>flip_camera_ios</span>
                  Flip
                </button>
              </div>

              <button className="kiosk-cancel-btn" onClick={(e) => { e.stopPropagation(); stopCamera(); setScanning(false); }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>Cancel
              </button>
            </>
          ) : (
            <>
              <div className="kiosk-scanner-glow" style={{ background: 'rgba(0,86,184,0.04)' }} />
              <div className="kiosk-corner tl" style={{ borderColor: 'rgba(0,86,184,0.7)' }} />
              <div className="kiosk-corner tr" style={{ borderColor: 'rgba(0,86,184,0.7)' }} />
              <div className="kiosk-corner bl" style={{ borderColor: 'rgba(0,86,184,0.7)' }} />
              <div className="kiosk-corner br" style={{ borderColor: 'rgba(0,86,184,0.7)' }} />
              <span className="material-symbols-outlined kiosk-qr-icon" style={{ color: 'rgba(0,86,184,0.25)' }}>qr_code_2</span>
            </>
          )}
        </div>

        {!scanning ? (
          <>
            <div className="kiosk-instruction-title">Check Out</div>
            <div className="kiosk-instruction-sub" style={{ color: '#00408b' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>touch_app</span>
              Scan your QR to log exit
            </div>
          </>
        ) : (
          <div className="kiosk-instruction-title" style={{ fontSize: 18, color: '#474553' }}>
            Hold QR code steady within the frame
          </div>
        )}
      </main>

      <footer className="kiosk-footer">
        <div className="kiosk-footer-occupancy">
          <div className="kiosk-footer-icon" style={{ background: 'rgba(0,86,184,0.1)', borderColor: 'rgba(0,86,184,0.15)' }}>
            <span className="material-symbols-outlined" style={{ color: '#00408b' }}>group</span>
          </div>
          <div>
            <div className="kiosk-footer-label">Currently Inside</div>
            <div className="kiosk-footer-count">{occupancy}</div>
          </div>
        </div>
        <div className="kiosk-footer-entries">
          <div className="kiosk-footer-label">Device</div>
          <div style={{ fontSize: 13, color: '#474553', fontWeight: 500 }}>Exit Kiosk</div>
        </div>
      </footer>
    </div>
  );
};

export default ExitKiosk;
