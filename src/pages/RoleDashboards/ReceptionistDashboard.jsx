import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import jsQR from 'jsqr';
import { functions } from '../../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { getGym, getGymMembersRealtime } from '../../firebase/firestore';
import { getPaymentsRealtime, updatePayment } from '../../firebase/firestore-payments';
import useLiveOccupancy from '../../hooks/useLiveOccupancy';
import { logout } from '../../firebase/auth';
import { playHapticSound, getInitials, getAvatarColor } from '../../utils/helpers';
import BottomNav from '../../components/BottomNav';

// ── Front Desk design tokens ───────────────────────────────────
const C = {
  primary: '#0058bc', secondary: '#6d36d4',
  green: '#1D9E75', greenDeep: '#0f7a56', greenBright: '#35d29a',
  amber: '#EF9F27', amberDeep: '#a86a10',
  red: '#E24B4A', redDeep: '#c22f28',
  ink: '#1b1b1d', muted: '#717786', mutedSoft: '#8b90a0',
};
const EXPIRING_WINDOW_DAYS = 7;
const CAMERA_AUTO_OFF_MS = 20000; // camera auto-closes after 20s of inactivity
const DIR_PAGE_SIZE = 10; // directory renders 10 members at a time

// Counts up from its previous value to `value` (eased) — used for the
// Active and live-occupancy figures so they animate as data loads/changes.
const CountUp = ({ value, duration = 900 }) => {
  const [display, setDisplay] = useState(0);
  const displayRef = useRef(0);
  useEffect(() => {
    const to = Number(value);
    if (!Number.isFinite(to)) return;          // ignore non-numeric values
    const from = displayRef.current;
    if (from === to) return;                    // already showing the target
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const cur = Math.round(from + (to - from) * eased);
      displayRef.current = cur;
      setDisplay(cur);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{display}</>;
};
const glassCard = {
  borderRadius: 22,
  background: 'rgba(255,255,255,.62)',
  border: '1px solid rgba(255,255,255,.85)',
  backdropFilter: 'blur(24px)',
  boxShadow: '0 8px 30px -8px rgba(20,20,45,.10)',
};
const sym = { fontFamily: "'Material Symbols Outlined'" };
const hanken = { fontFamily: "'Hanken Grotesk',sans-serif" };
const geist = { fontFamily: "'Geist',monospace" };

const memberDays = (m) => {
  const exp = m.subscription_expiry?.toDate ? m.subscription_expiry.toDate() : null;
  if (!exp) return -9999;
  return Math.ceil((exp.getTime() - Date.now()) / 86400000);
};

const chipFor = (days) => {
  if (days < 0) return { bg: 'rgba(226,75,74,.12)', text: C.redDeep, icon: 'cancel', label: 'Expired', sub: `${Math.min(-days, 9999)}d ago` };
  if (days <= EXPIRING_WINDOW_DAYS) return { bg: 'rgba(239,159,39,.14)', text: C.amberDeep, icon: 'schedule', label: 'Expiring', sub: `${days}d left` };
  return { bg: 'rgba(29,158,117,.12)', text: C.greenDeep, icon: 'check_circle', label: 'Active', sub: `in ${days}d` };
};

const ReceptionistDashboard = () => {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanningRef = useRef(true);
  const searchRef = useRef(null);
  const autoOffRef = useRef(null);

  const [gymName, setGymName] = useState('');
  const [cameraActive, setCameraActive] = useState(false); // camera off until tapped
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [result, setResult] = useState(null); // { type, member, streak, isNewRecord }

  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [payments, setPayments] = useState([]);

  const [filter, setFilter] = useState('all'); // all | active | expiring | expired | ingym
  const [search, setSearch] = useState('');
  const [dirCount, setDirCount] = useState(DIR_PAGE_SIZE);
  const [clock, setClock] = useState('');
  const [online, setOnline] = useState(navigator.onLine);

  const { occupancy, activeSessions } = useLiveOccupancy(userDoc?.gym_id);

  // Partial payment clear modal
  const [clearModalPayment, setClearModalPayment] = useState(null);
  const [clearAmount, setClearAmount] = useState('');
  const [clearingId, setClearingId] = useState(null);

  // ── Data subscriptions ──────────────────────────────────────
  useEffect(() => {
    if (!userDoc?.gym_id) return;
    getGym(userDoc.gym_id).then((g) => setGymName(g?.name || 'My Gym')).catch(() => {});
  }, [userDoc?.gym_id]);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    const unsub = getGymMembersRealtime(userDoc.gym_id, (list) => {
      setMembers(list.filter((m) => !m.is_deleted));
      setLoadingMembers(false);
    }, () => setLoadingMembers(false));
    return () => unsub();
  }, [userDoc?.gym_id]);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    const unsub = getPaymentsRealtime(userDoc.gym_id, (list) => {
      setPayments(list.filter((p) => p.status === 'pending' || p.status === 'partial'));
    });
    return () => unsub();
  }, [userDoc?.gym_id]);

  // ── Clock + connectivity ────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const h = d.getHours() % 12 || 12;
      const m = String(d.getMinutes()).padStart(2, '0');
      setClock(`${h}:${m} ${d.getHours() < 12 ? 'AM' : 'PM'}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ── Camera + scanning ───────────────────────────────────────
  // Camera stays OFF until the receptionist taps the viewport, and auto-closes
  // after 20s of inactivity (re-armed on each scan) to save battery / privacy.
  const stopScanning = useCallback(() => {
    if (autoOffRef.current) { clearTimeout(autoOffRef.current); autoOffRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
    setCameraActive(false);
    setResult(null);
    scanningRef.current = true;
  }, []);

  const armAutoOff = useCallback(() => {
    if (autoOffRef.current) clearTimeout(autoOffRef.current);
    autoOffRef.current = setTimeout(() => stopScanning(), CAMERA_AUTO_OFF_MS);
  }, [stopScanning]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCameraReady(true);
        setCameraError(null);
      }
    } catch (err) {
      setCameraError(err.message);
    }
  };

  // Turn the camera on (tap-to-scan) and start the inactivity timer.
  const startScanning = async () => {
    setResult(null);
    scanningRef.current = true;
    setCameraActive(true);
    armAutoOff();
    await startCamera();
  };

  const resetScan = useCallback(() => {
    setResult(null);
    scanningRef.current = true;
  }, []);

  // Server-side validation (expiry / duplicate / gym-match / signed token).
  const handleCheckin = useCallback(async (qrPayload) => {
    if (!scanningRef.current) return;
    scanningRef.current = false;
    armAutoOff(); // a scan counts as activity — keep the camera alive
    try {
      const processScan = httpsCallable(functions, 'processScan');
      const { data } = await processScan({ qrPayload });
      const member = { id: data.memberId, name: data.memberName, profile_photo: data.memberPhoto, plan_name: data.planName };
      if (data.status === 'success') {
        playHapticSound('success');
        setResult({ type: 'success', member, streak: data.currentStreak, isNewRecord: data.isNewRecord });
      } else if (data.status === 'expired') {
        playHapticSound('error');
        setResult({ type: 'expired', member, daysAgo: data.daysAgo });
      } else if (data.status === 'duplicate') {
        playHapticSound('error');
        setResult({ type: 'duplicate', member });
      } else {
        playHapticSound('error');
        setResult({ type: 'error', message: data.message || 'Check-in failed' });
      }
    } catch (err) {
      playHapticSound('error');
      const msg = (err?.message?.includes('Expired or invalid') || err?.message?.includes('Outdated'))
        ? 'Ask the member to reopen the app to refresh their QR'
        : err?.message?.includes('different gym') ? 'This QR is for another branch' : 'QR could not be read';
      setResult({ type: 'error', message: msg });
    }
    setTimeout(resetScan, 3500);
  }, [armAutoOff, resetScan]);

  // Camera does not auto-start — only clean up on unmount.
  useEffect(() => {
    return () => {
      if (autoOffRef.current) clearTimeout(autoOffRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!cameraReady) return;
    let animFrame;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });

    const scan = () => {
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
          const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
          if (code && code.data.startsWith('gymly://checkin/')) handleCheckin(code.data);
        } catch { /* ignore per-frame decode errors */ }
      }
      animFrame = requestAnimationFrame(scan);
    };
    scan();
    return () => cancelAnimationFrame(animFrame);
  }, [cameraReady, handleCheckin]);

  // ── Derived member stats + list ─────────────────────────────
  const inGymIds = useMemo(
    () => new Set(activeSessions.map((s) => s.memberId)),
    [activeSessions]
  );

  const stats = useMemo(() => {
    let active = 0, expiring = 0, expired = 0;
    for (const m of members) {
      const d = memberDays(m);
      if (d < 0) expired++;
      else { active++; if (d <= EXPIRING_WINDOW_DAYS) expiring++; }
    }
    return { total: members.length, active, expiring, expired };
  }, [members]);

  const visibleList = useMemo(() => {
    let list = members.map((m) => ({ ...m, _days: memberDays(m), _in: inGymIds.has(m.id) }));
    if (filter === 'active') list = list.filter((m) => m._days >= 0);
    else if (filter === 'expiring') list = list.filter((m) => m._days >= 0 && m._days <= EXPIRING_WINDOW_DAYS);
    else if (filter === 'expired') list = list.filter((m) => m._days < 0);
    else if (filter === 'ingym') list = list.filter((m) => m._in);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((m) => (m.name || '').toLowerCase().includes(q) || (m.phone || '').replace(/\s/g, '').includes(q.replace(/\s/g, '')));
    return list.sort((a, b) => a._days - b._days);
  }, [members, filter, search, inGymIds]);

  // Reset directory paging when the filter/search changes
  useEffect(() => { setDirCount(DIR_PAGE_SIZE); }, [filter, search]);

  // ── Pending payment clear ───────────────────────────────────
  const handleConfirmClear = async () => {
    if (!clearAmount || isNaN(clearAmount) || Number(clearAmount) <= 0) { showToast('Enter a valid amount', 'error'); return; }
    const paying = Math.floor(Number(clearAmount));
    const currentPending = clearModalPayment.pending_amount || clearModalPayment.final_amount;
    if (paying > currentPending) { showToast('Amount exceeds pending due', 'error'); return; }
    setClearingId(clearModalPayment.id);
    try {
      const newPaid = (clearModalPayment.paid_amount || 0) + paying;
      const newPending = currentPending - paying;
      await updatePayment(clearModalPayment.id, {
        status: newPending === 0 ? 'paid' : 'partial',
        paid_amount: newPaid,
        pending_amount: newPending,
      });
      showToast(`₹${paying} collected from ${clearModalPayment.member_name}`, 'success');
    } catch {
      showToast('Failed to update due', 'error');
    } finally {
      setClearingId(null);
      setClearModalPayment(null);
      setClearAmount('');
    }
  };

  const handleLogout = async () => {
    try { await logout(); } finally { navigate('/select-role'); }
  };

  const focusSearch = () => {
    searchRef.current?.focus();
    searchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // ── Scan result view model ──────────────────────────────────
  const res = (() => {
    if (!result) return null;
    const m = result.member;
    if (result.type === 'success') return {
      bg: 'linear-gradient(160deg,#0f6b4c,#0a4d37)', accent: C.greenBright, soft: 'rgba(53,210,154,.18)',
      icon: 'check', name: m?.name, status: `Checked in · ${clock}`, detail: m?.plan_name || 'Active member',
      hasMember: true, streak: result.streak ? `${result.streak}-day streak${result.isNewRecord ? ' · new record!' : ''}` : null,
    };
    if (result.type === 'expired') return {
      bg: 'linear-gradient(160deg,#8f221c,#5f1712)', accent: '#ff7a72', soft: 'rgba(255,122,114,.2)',
      icon: 'block', name: m?.name, status: 'Membership expired',
      detail: result.daysAgo ? `Ended ${result.daysAgo} days ago — renew before entry` : 'Renew before entry', hasMember: true,
    };
    if (result.type === 'duplicate') return {
      bg: 'linear-gradient(160deg,#9a6410,#6b440a)', accent: '#ffc266', soft: 'rgba(255,194,102,.2)',
      icon: 'event_available', name: m?.name, status: 'Already checked in today', detail: 'This member has already scanned in', hasMember: true,
    };
    return {
      bg: 'linear-gradient(160deg,#34404f,#1c2530)', accent: '#9fb2c9', soft: 'rgba(159,178,201,.2)',
      icon: 'error', name: 'Check-in failed', status: result.message || 'QR could not be read', detail: '', hasMember: false,
    };
  })();

  // ── Filter tab styling helper ───────────────────────────────
  const tab = (key, base, tint, border) => ({
    padding: '8px 14px', borderRadius: 11, cursor: 'pointer', fontSize: 13, fontWeight: 600,
    display: 'flex', alignItems: 'center', gap: 6,
    border: `1px solid ${filter === key ? border : 'rgba(27,27,29,.1)'}`,
    background: filter === key ? tint : 'transparent',
    color: filter === key ? base : C.muted,
  });

  const initials = getInitials(userDoc?.name || 'Front Desk');

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(at 12% 8%,rgba(0,88,188,.10) 0,transparent 46%),radial-gradient(at 88% 4%,rgba(109,54,212,.10) 0,transparent 44%),radial-gradient(at 50% 100%,rgba(29,158,117,.08) 0,transparent 52%),#f4f2f7',
      padding: '22px 16px 96px', color: C.ink,
    }}>
      <div style={{ maxWidth: 1480, margin: '0 auto' }}>

        {/* OFFLINE BANNER */}
        {!online && (
          <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', marginBottom: 14, borderRadius: 14, background: 'rgba(239,159,39,.12)', border: '1px solid rgba(239,159,39,.34)' }}>
            <span style={{ ...sym, fontSize: 20, color: C.amberDeep }}>wifi_off</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#8a5a0c' }}>You&apos;re offline — showing last synced data</div>
              <div style={{ fontSize: 12, color: C.amberDeep }}>Check-ins are paused until the connection returns.</div>
            </div>
          </div>
        )}

        {/* HEADER */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, background: `linear-gradient(135deg,${C.primary},${C.secondary})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', boxShadow: '0 6px 16px rgba(0,88,188,.28)' }}>
            <span style={{ ...sym, fontSize: 24, color: '#fff', fontVariationSettings: "'FILL' 1" }}>fitness_center</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...geist, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: C.muted, fontWeight: 600 }}>Front Desk</div>
            <div style={{ ...hanken, fontSize: 21, fontWeight: 700, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{gymName || '—'}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 13px', borderRadius: 12, background: 'rgba(255,255,255,.6)', border: '1px solid rgba(255,255,255,.85)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: online ? C.green : C.amber }} />
            <span style={{ ...geist, fontSize: 12, fontWeight: 600, color: online ? C.greenDeep : C.amberDeep }}>{online ? 'Live' : 'Offline'}</span>
          </div>
          <div style={{ textAlign: 'right', padding: '0 4px' }}>
            <div style={{ ...geist, fontSize: 19, fontWeight: 600, lineHeight: 1 }}>{clock}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 6px 6px 6px', borderRadius: 40, background: 'rgba(255,255,255,.6)', border: '1px solid rgba(255,255,255,.85)' }}>
            <span style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg,${C.primary},${C.secondary})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flex: 'none' }}>{initials}</span>
            <div style={{ lineHeight: 1.15 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{userDoc?.name || 'Receptionist'}</div>
              <div style={{ fontSize: 10.5, color: C.muted }}>Receptionist</div>
            </div>
            <button onClick={handleLogout} title="Log out" style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(27,27,29,.05)', color: C.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ ...sym, fontSize: 19 }}>logout</span>
            </button>
          </div>
        </div>

        {/* STATUS STRIP */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
          {/* Total */}
          <button onClick={() => setFilter('all')} style={{ textAlign: 'left', cursor: 'pointer', padding: '16px 17px', borderRadius: 18, background: 'rgba(255,255,255,.55)', border: `1px solid ${filter === 'all' ? 'rgba(27,27,29,.25)' : 'rgba(255,255,255,.8)'}`, backdropFilter: 'blur(20px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ ...sym, fontSize: 19, color: C.mutedSoft }}>groups</span>
              <span style={{ ...geist, fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase', color: C.muted, fontWeight: 600 }}>Total members</span>
            </div>
            <div style={{ ...hanken, fontSize: 34, fontWeight: 800, lineHeight: 1, color: '#414755' }}>{loadingMembers ? '—' : stats.total}</div>
            <div style={{ fontSize: 11.5, color: C.mutedSoft, marginTop: 6 }}>On the roster</div>
          </button>
          {/* Active */}
          <button onClick={() => navigate('/receptionist/members?filter=active')} style={{ position: 'relative', textAlign: 'left', cursor: 'pointer', padding: '16px 17px', borderRadius: 18, background: 'rgba(231,248,241,.7)', border: '1px solid rgba(29,158,117,.28)', backdropFilter: 'blur(20px)', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: C.green }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ ...sym, fontSize: 19, color: C.greenDeep, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              <span style={{ ...geist, fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase', color: C.greenDeep, fontWeight: 700 }}>Active</span>
            </div>
            <div style={{ ...hanken, fontSize: 34, fontWeight: 800, lineHeight: 1, color: '#0d5e42' }}>{loadingMembers ? '—' : <CountUp value={stats.active} />}</div>
            <div style={{ fontSize: 11.5, color: C.greenDeep, marginTop: 6 }}>Memberships valid</div>
          </button>
          {/* Expiring */}
          <button onClick={() => navigate('/receptionist/members?filter=expiring')} style={{ position: 'relative', textAlign: 'left', cursor: 'pointer', padding: '16px 17px', borderRadius: 18, background: 'rgba(255,241,220,.75)', border: '1px solid rgba(239,159,39,.3)', backdropFilter: 'blur(20px)', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: C.amber }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ ...sym, fontSize: 19, color: C.amberDeep }}>schedule</span>
              <span style={{ ...geist, fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase', color: C.amberDeep, fontWeight: 700 }}>Expiring soon</span>
            </div>
            <div style={{ ...hanken, fontSize: 34, fontWeight: 800, lineHeight: 1, color: '#8a5a0c' }}>{loadingMembers ? '—' : stats.expiring}</div>
            <div style={{ fontSize: 11.5, color: C.amberDeep, marginTop: 6 }}>Within {EXPIRING_WINDOW_DAYS} days · tap to follow up</div>
          </button>
          {/* Expired */}
          <button onClick={() => navigate('/receptionist/members?filter=expired')} style={{ textAlign: 'left', cursor: 'pointer', padding: '16px 17px', borderRadius: 18, background: 'rgba(226,75,74,.11)', border: '1px solid rgba(226,75,74,.28)', borderLeft: `4px solid ${C.red}`, backdropFilter: 'blur(20px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ ...sym, fontSize: 19, color: C.redDeep, fontVariationSettings: "'FILL' 1" }}>cancel</span>
              <span style={{ ...geist, fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase', color: C.redDeep, fontWeight: 700 }}>Expired</span>
            </div>
            <div style={{ ...hanken, fontSize: 34, fontWeight: 800, lineHeight: 1, color: '#b3261e' }}>{loadingMembers ? '—' : stats.expired}</div>
            <div style={{ fontSize: 11.5, color: C.redDeep, marginTop: 6, fontWeight: 600 }}>Need renewal · tap to view</div>
          </button>
        </div>

        {/* MAIN */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>

          {/* LEFT: CHECK-IN */}
          <div style={{ flex: '1 1 340px', minWidth: 300, padding: 18, ...glassCard }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ ...geist, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: C.muted, fontWeight: 600 }}>Check-in</div>
                <div style={{ ...hanken, fontSize: 18, fontWeight: 700 }}>Scan a member in</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: cameraActive && cameraReady ? C.greenDeep : C.muted }}>
                <span style={{ ...sym, fontSize: 16 }}>{cameraActive ? 'photo_camera' : 'photo_camera_front'}</span>{!cameraActive ? 'Tap to scan' : cameraReady ? 'Scanning…' : 'Starting…'}
              </div>
            </div>

            {/* Viewport — camera is off until tapped, auto-closes after 20s */}
            <div
              role={!cameraActive ? 'button' : undefined}
              tabIndex={!cameraActive ? 0 : undefined}
              onClick={!cameraActive && !cameraError ? startScanning : undefined}
              onKeyDown={!cameraActive && !cameraError ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startScanning(); } } : undefined}
              style={{ position: 'relative', height: 300, borderRadius: 18, overflow: 'hidden', background: 'radial-gradient(circle at 50% 42%,#1b2028,#0c0e12)', border: '1px solid #23282f', cursor: !cameraActive && !cameraError ? 'pointer' : 'default' }}
            >
              <video ref={videoRef} playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: cameraActive && !result ? 0.9 : 0 }} />
              <canvas ref={canvasRef} style={{ display: 'none' }} />

              {/* Off / scanning guides */}
              {!result && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, pointerEvents: 'none' }}>
                  <div style={{ position: 'relative', width: 150, height: 150 }}>
                    {(() => {
                      const cc = cameraActive && cameraReady ? C.greenBright : '#4a5563';
                      const b = `3px solid ${cc}`;
                      return (
                        <>
                          <div style={{ position: 'absolute', left: 0, top: 0, width: 30, height: 30, borderTop: b, borderLeft: b, borderRadius: '8px 0 0 0' }} />
                          <div style={{ position: 'absolute', right: 0, top: 0, width: 30, height: 30, borderTop: b, borderRight: b, borderRadius: '0 8px 0 0' }} />
                          <div style={{ position: 'absolute', left: 0, bottom: 0, width: 30, height: 30, borderBottom: b, borderLeft: b, borderRadius: '0 0 0 8px' }} />
                          <div style={{ position: 'absolute', right: 0, bottom: 0, width: 30, height: 30, borderBottom: b, borderRight: b, borderRadius: '0 0 8px 0' }} />
                          {!cameraActive && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ ...sym, fontSize: 54, color: '#3a424e' }}>qr_code_scanner</span></div>
                          )}
                          {cameraActive && (
                            <div style={{ position: 'absolute', left: 6, right: 6, top: '50%', height: 2, background: `linear-gradient(90deg,transparent,${C.greenBright},transparent)`, boxShadow: `0 0 12px ${C.greenBright}` }} />
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#c7ccd4', fontSize: 14, fontWeight: 600 }}>{cameraError ? 'Camera unavailable' : !cameraActive ? 'Tap to start camera' : cameraReady ? 'Ready to scan' : 'Starting camera…'}</div>
                    <div style={{ color: '#6f7681', fontSize: 12, marginTop: 3, maxWidth: 240 }}>{cameraError ? cameraError : !cameraActive ? 'Camera stays off until you tap · auto-closes after 20s' : "Point the member's QR at the camera"}</div>
                  </div>
                  {cameraError && (
                    <button onClick={startScanning} style={{ pointerEvents: 'auto', background: '#fff', color: '#000', padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 600 }}>Try Again</button>
                  )}
                </div>
              )}

              {/* Result */}
              {res && (
                <div aria-live="assertive" style={{ position: 'absolute', inset: 0, background: res.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 22, textAlign: 'center' }}>
                  <div style={{ position: 'relative', marginBottom: 14 }}>
                    {res.hasMember ? (
                      <div style={{ width: 76, height: 76, borderRadius: '50%', background: getAvatarColor(res.name).bg, color: getAvatarColor(res.name).text, display: 'flex', alignItems: 'center', justifyContent: 'center', ...hanken, fontSize: 26, fontWeight: 700 }}>{getInitials(res.name)}</div>
                    ) : (
                      <div style={{ width: 76, height: 76, borderRadius: '50%', background: res.soft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ ...sym, fontSize: 40, color: res.accent, fontVariationSettings: "'FILL' 1" }}>{res.icon}</span></div>
                    )}
                    {res.hasMember && (
                      <div style={{ position: 'absolute', right: -6, bottom: -6, width: 30, height: 30, borderRadius: '50%', background: res.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid #fff' }}><span style={{ ...sym, fontSize: 18, color: '#fff', fontVariationSettings: "'FILL' 1" }}>{res.icon}</span></div>
                    )}
                  </div>
                  <div style={{ ...hanken, fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1.15 }}>{res.name}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: res.accent, marginTop: 4 }}>{res.status}</div>
                  {res.detail && <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.72)', marginTop: 5, maxWidth: 250 }}>{res.detail}</div>}
                  {res.streak && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, padding: '6px 12px', borderRadius: 20, background: 'rgba(255,255,255,.14)' }}>
                      <span style={{ ...sym, fontSize: 16, color: '#ffb454', fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{res.streak}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={() => navigate('/receptionist/members/add')} style={{ flex: 1, height: 52, borderRadius: 14, border: 'none', background: `linear-gradient(90deg,${C.primary},${C.secondary})`, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 8px 22px -4px rgba(0,88,188,.42)' }}>
                <span style={{ ...sym, fontSize: 22 }}>person_add</span>Add Member
              </button>
              <button onClick={focusSearch} title="Look up a member manually" style={{ flex: 'none', height: 52, padding: '0 16px', borderRadius: 14, border: '1.5px solid rgba(27,27,29,.12)', background: 'transparent', color: '#414755', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                <span style={{ ...sym, fontSize: 19 }}>badge</span>Manual
              </button>
            </div>
          </div>

          {/* RIGHT: DIRECTORY */}
          <div style={{ flex: '2 1 520px', minWidth: 300, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: 18, ...glassCard }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ ...hanken, fontSize: 18, fontWeight: 700 }}>Members</span>
                  <span style={{ ...geist, fontSize: 12, fontWeight: 600, color: C.muted, padding: '2px 9px', borderRadius: 20, background: 'rgba(27,27,29,.05)' }}>{visibleList.length}</span>
                </div>
                <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', ...sym, fontSize: 19, color: C.mutedSoft, pointerEvents: 'none' }}>search</span>
                  <input ref={searchRef} type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or phone…" aria-label="Search members" style={{ width: '100%', height: 42, padding: '0 14px 0 38px', borderRadius: 12, border: '1px solid rgba(27,27,29,.1)', background: 'rgba(255,255,255,.7)', fontSize: 14, color: C.ink, outline: 'none', fontFamily: 'inherit' }} />
                </div>
              </div>

              {/* Filter tabs */}
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
                <button onClick={() => setFilter('all')} style={tab('all', C.primary, 'rgba(0,88,188,.1)', 'rgba(0,88,188,.3)')}>All <span style={{ opacity: .65, ...geist, fontSize: 11 }}>{stats.total}</span></button>
                <button onClick={() => setFilter('active')} style={tab('active', C.greenDeep, 'rgba(29,158,117,.12)', 'rgba(29,158,117,.35)')}><span style={{ ...sym, fontSize: 16 }}>check_circle</span>Active <span style={{ opacity: .65, ...geist, fontSize: 11 }}>{stats.active}</span></button>
                <button onClick={() => setFilter('expiring')} style={tab('expiring', C.amberDeep, 'rgba(239,159,39,.14)', 'rgba(239,159,39,.4)')}><span style={{ ...sym, fontSize: 16 }}>schedule</span>Expiring <span style={{ opacity: .65, ...geist, fontSize: 11 }}>{stats.expiring}</span></button>
                <button onClick={() => setFilter('expired')} style={tab('expired', C.redDeep, 'rgba(226,75,74,.12)', 'rgba(226,75,74,.35)')}><span style={{ ...sym, fontSize: 16 }}>cancel</span>Expired <span style={{ opacity: .65, ...geist, fontSize: 11 }}>{stats.expired}</span></button>
                <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(27,27,29,.1)', margin: '2px 3px' }} />
                <button onClick={() => setFilter('ingym')} style={tab('ingym', C.greenDeep, 'rgba(29,158,117,.14)', 'rgba(29,158,117,.4)')}><span style={{ width: 7, height: 7, borderRadius: '50%', background: C.greenBright }} />In gym <span style={{ opacity: .7, ...geist, fontSize: 11 }}><CountUp value={occupancy} /></span></button>
              </div>

              {/* List */}
              <div style={{ maxHeight: 460, overflowY: 'auto', margin: '0 -4px', padding: '0 4px' }}>
                {filter === 'ingym' && (
                  <div aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 17px', marginBottom: 12, borderRadius: 16, background: 'linear-gradient(155deg,#181b20,#101216)', border: '1px solid #262a31' }}>
                    <span style={{ ...sym, fontSize: 26, color: C.greenBright, flex: 'none' }}>sensors</span>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}><span style={{ ...hanken, fontSize: 32, fontWeight: 800, lineHeight: 1, color: '#fff' }}><CountUp value={occupancy} /></span><span style={{ fontSize: 12, color: '#6f7681' }}>members inside</span></div>
                      <span style={{ fontSize: 11, color: '#6f7681', ...geist, marginTop: 4 }}>live occupancy</span>
                    </div>
                  </div>
                )}

                {loadingMembers ? (
                  <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner spinner-primary" style={{ margin: '0 auto' }} /></div>
                ) : visibleList.length === 0 ? (
                  <div style={{ padding: '34px 20px', textAlign: 'center' }}>
                    <span style={{ ...sym, fontSize: 36, color: filter === 'expired' || filter === 'expiring' ? C.green : C.mutedSoft, fontVariationSettings: "'FILL' 1" }}>
                      {search.trim() ? 'search_off' : filter === 'expired' ? 'task_alt' : filter === 'expiring' ? 'verified' : filter === 'ingym' ? 'nights_stay' : 'group'}
                    </span>
                    <div style={{ ...hanken, fontSize: 16, fontWeight: 700, marginTop: 8, color: filter === 'expired' || filter === 'expiring' ? C.greenDeep : C.ink }}>
                      {search.trim() ? `No members match "${search}"` : filter === 'expired' ? 'Nothing expired right now' : filter === 'expiring' ? 'No renewals due this week' : filter === 'ingym' ? "Nobody's checked in yet" : 'No members yet'}
                    </div>
                    {search.trim() && <button onClick={() => setSearch('')} style={{ marginTop: 8, background: 'none', border: 'none', color: C.primary, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Clear search</button>}
                  </div>
                ) : (
                  visibleList.slice(0, dirCount).map((m) => {
                    const c = chipFor(m._days);
                    const av = getAvatarColor(m.name || '');
                    return (
                      <div key={m.id} onClick={() => navigate(`/receptionist/members/${m.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 6px', borderRadius: 14, cursor: 'pointer' }}>
                        <div style={{ width: 44, height: 44, borderRadius: '50%', background: av.bg, color: av.text, display: 'flex', alignItems: 'center', justifyContent: 'center', ...hanken, fontSize: 15, fontWeight: 700, flex: 'none' }}>{getInitials(m.name || '?')}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 14.5, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
                            {m._in && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 7px', borderRadius: 20, background: 'rgba(29,158,117,.12)', flex: 'none' }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: C.green }} /><span style={{ fontSize: 9.5, fontWeight: 700, color: C.greenDeep, ...geist }}>IN</span></span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: C.muted, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.plan_name || 'No plan'} · {m.phone || '—'}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flex: 'none' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, background: c.bg }}><span style={{ ...sym, fontSize: 14, color: c.text, fontVariationSettings: "'FILL' 1" }}>{c.icon}</span><span style={{ fontSize: 11, fontWeight: 700, color: c.text }}>{c.label}</span></span>
                          <span style={{ fontSize: 11, color: c.text, ...geist }}>{m._days > -9990 ? c.sub : 'no expiry'}</span>
                        </div>
                        <span style={{ ...sym, fontSize: 22, color: C.mutedSoft, flex: 'none' }}>chevron_right</span>
                      </div>
                    );
                  })
                )}

                {!loadingMembers && visibleList.length > dirCount && (
                  <button
                    onClick={() => setDirCount((c) => c + DIR_PAGE_SIZE)}
                    style={{ width: '100%', marginTop: 10, padding: '10px', borderRadius: 12, border: '1px solid rgba(0,88,188,.2)', background: 'rgba(0,88,188,.05)', color: C.primary, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                  >
                    Load {Math.min(DIR_PAGE_SIZE, visibleList.length - dirCount)} more · showing {Math.min(dirCount, visibleList.length)} of {visibleList.length}
                  </button>
                )}
              </div>
            </div>

            {/* Pending dues */}
            <div style={{ padding: '16px 18px', ...glassCard }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
                <span style={{ ...sym, fontSize: 19, color: C.amberDeep }}>account_balance_wallet</span>
                <span style={{ ...hanken, fontSize: 15, fontWeight: 700 }}>Pending dues</span>
                <span style={{ ...geist, fontSize: 11, fontWeight: 700, color: C.amberDeep, padding: '2px 8px', borderRadius: 20, background: 'rgba(239,159,39,.14)' }}>{payments.length}</span>
              </div>
              {payments.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 2px', color: C.greenDeep, fontSize: 13, fontWeight: 600 }}><span style={{ ...sym, fontSize: 20, fontVariationSettings: "'FILL' 1" }}>check_circle</span>All dues cleared — nothing pending.</div>
              ) : (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {payments.map((p) => {
                    const av = getAvatarColor(p.member_name || '');
                    const due = p.pending_amount || p.final_amount || 0;
                    return (
                      <div key={p.id} style={{ flex: '1 1 220px', minWidth: 200, display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 14, border: '1px solid rgba(239,159,39,.22)', background: 'rgba(239,159,39,.05)' }}>
                        <div style={{ width: 38, height: 38, borderRadius: '50%', background: av.bg, color: av.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flex: 'none', ...hanken }}>{getInitials(p.member_name || '?')}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.member_name}</div>
                          <div style={{ fontSize: 11, color: C.muted }}>{p.plan_name || 'Renewal'} · <span style={{ color: C.redDeep, fontWeight: 700 }}>₹{due.toLocaleString('en-IN')}</span></div>
                        </div>
                        <button onClick={() => { setClearModalPayment(p); setClearAmount(String(due)); }} style={{ flex: 'none', padding: '7px 11px', borderRadius: 10, border: '1px solid rgba(29,158,117,.32)', background: 'rgba(29,158,117,.09)', color: C.greenDeep, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Clear</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Clear-due modal */}
      {clearModalPayment && (
        <div onClick={() => setClearModalPayment(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,15,25,.42)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 22, padding: 22, boxShadow: '0 24px 60px rgba(0,0,0,.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ ...hanken, fontSize: 18, fontWeight: 700, margin: 0 }}>Clear payment</h2>
              <button onClick={() => setClearModalPayment(null)} style={{ border: 'none', background: 'rgba(27,27,29,.05)', width: 32, height: 32, borderRadius: 10, fontSize: 18, cursor: 'pointer', color: C.muted }}>✕</button>
            </div>
            <p style={{ textAlign: 'center', fontSize: 14, color: C.muted, marginBottom: 18 }}>
              {clearModalPayment.member_name} currently owes<br />
              <strong style={{ fontSize: 24, color: C.redDeep, display: 'block', marginTop: 8 }}>₹{(clearModalPayment.pending_amount || clearModalPayment.final_amount || 0).toLocaleString('en-IN')}</strong>
            </p>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em', color: C.muted, marginBottom: 6 }}>Amount collected today (₹)</label>
            <input type="number" value={clearAmount} onChange={(e) => setClearAmount(e.target.value)} placeholder="0" autoFocus style={{ width: '100%', height: 46, padding: '0 14px', borderRadius: 12, border: '1px solid rgba(27,27,29,.12)', background: '#fafafc', fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
            <button onClick={handleConfirmClear} disabled={clearingId === clearModalPayment.id} style={{ width: '100%', height: 50, marginTop: 20, border: 'none', borderRadius: 14, background: `linear-gradient(90deg,${C.primary},${C.secondary})`, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: clearingId === clearModalPayment.id ? 0.6 : 1 }}>
              {clearingId === clearModalPayment.id ? 'Saving…' : 'Confirm payment'}
            </button>
          </div>
        </div>
      )}

      <BottomNav activeTab="home" role="receptionist" />
    </div>
  );
};

export default ReceptionistDashboard;
