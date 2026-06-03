import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { db } from '../../firebase/config';
import { onSnapshot, collection, query, where } from 'firebase/firestore';
import { 
  getGym, 
  getWorkoutPlan, 
  getWorkoutDay,
  getMemberWorkoutLogs,
  getRecentMuscleSoreness,
  saveSorenessLog
} from '../../firebase/firestore';
import { getMemberPaymentsRealtime, updatePayment, formatDateKey } from '../../firebase/firestore-payments';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase/config';
import { 
  getInitials, 
  getAvatarColor, 
  getExpiryStatus, 
  getDaysRemaining, 
  formatDate,
  getPlanName,
  calculateBMI,
  playHapticSound
} from '../../utils/helpers';
import { getTodaysDayNumber } from '../../data/exerciseLibrary';
import { GYMLY_EXERCISE_DB } from '../../data/gymlyExerciseDb';
import { QRCodeSVG } from 'qrcode.react';
import BottomNav from '../../components/BottomNav';
import './MemberHome.css';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Default card settings ────────────────────────────────────
const DEFAULT_CS = {
  show_gym_name: true, show_member_name: true, show_photo: true,
  show_member_id: true, show_enrollment_id: true, show_plan: true,
  show_expiry: true, show_phone: false, show_qr: true, show_status: true,
};

const MemberHome = () => {
  const navigate = useNavigate();
  const { user, userDoc } = useAuth();
  const { showToast } = useToast();

  const [gym, setGym] = useState(null);
  const [workoutPlan, setWorkoutPlan] = useState(null);
  const [todayDay, setTodayDay] = useState(null);
  const [recentLogs, setRecentLogs] = useState([]);
  const [caloriesToday, setCaloriesToday] = useState(0);
  const [totalSetsToday, setTotalSetsToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [uploadingPaymentId, setUploadingPaymentId] = useState(null);
  const [showAgreementPending, setShowAgreementPending] = useState(false);
  const screenshotInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState(0);
  const [cardExpanded, setCardExpanded] = useState(false);

  const prevAttendanceCount = useRef(null);
  const [kioskMessage, setKioskMessage] = useState(null);

  // Soreness logic
  const [showSorenessCheck, setShowSorenessCheck] = useState(false);
  const [yesterdayMuscles, setYesterdayMuscles] = useState([]);
  const [sorenessLevels, setSorenessLevels] = useState({});

  const now = new Date();
  const firstName = userDoc?.name?.split(' ')[0] || 'Member';
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = `${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`;

  useEffect(() => {
    const fetchAll = async () => {
      if (!userDoc) { setLoading(false); return; }
      try {
        const promises = [];
        if (userDoc.gym_id) promises.push(getGym(userDoc.gym_id));
        else promises.push(Promise.resolve(null));

        if (userDoc.workout_plan_id) promises.push(getWorkoutPlan(userDoc.workout_plan_id));
        else promises.push(Promise.resolve(null));

        promises.push(getMemberWorkoutLogs(user.uid, 10));
        promises.push(getRecentMuscleSoreness(user.uid));

        const [gymData, planData, logs, recentSoreness] = await Promise.all(promises);
        setGym(gymData);
        setWorkoutPlan(planData);
        setRecentLogs(logs);

        // Agreement — show inline card only if required and not yet agreed
        const requireAgreement = gymData?.settings?.require_agreement !== false;
        if (requireAgreement && userDoc.agreement_status !== 'agreed') {
          setShowAgreementPending(true);
        }

        // Caloric summary
        const todayAtZero = new Date();
        todayAtZero.setHours(0, 0, 0, 0);
        const logsToday = logs.filter(l => {
          const d = l.log_date?.toDate ? l.log_date.toDate() : null;
          const cd = l.client_date ? new Date(l.client_date) : null;
          const dateToUse = d || cd;
          return dateToUse && dateToUse.getTime() >= todayAtZero.getTime();
        });
        let setsCount = 0, calsCount = 0;
        logsToday.forEach(log => {
          calsCount += (log.total_calories || 0);
          log.exercises?.forEach(ex => { setsCount += (ex.sets?.length || 0); });
        });
        setTotalSetsToday(setsCount);
        setCaloriesToday(calsCount || (setsCount * 15));

        // Soreness check
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yestStr = yesterday.toDateString();
        const yestLog = logs.find(l => {
          const d = l.log_date?.toDate ? l.log_date.toDate() : null;
          return d && d.toDateString() === yestStr;
        });
        const alreadyLoggedSoreness = recentSoreness &&
          recentSoreness.logged_at?.toDate().toDateString() === new Date().toDateString();
        if (yestLog && !alreadyLoggedSoreness) {
          const muscles = new Set();
          yestLog.exercises?.forEach(ex => {
            const dbEx = GYMLY_EXERCISE_DB[ex.id];
            if (dbEx) muscles.add(dbEx.muscle_group);
          });
          if (muscles.size > 0) {
            setYesterdayMuscles(Array.from(muscles));
            setShowSorenessCheck(true);
            const initialSoreness = {};
            muscles.forEach(m => { initialSoreness[m] = 1; });
            setSorenessLevels(initialSoreness);
          }
        }

        if (planData && userDoc.start_date) {
          const dayNum = getTodaysDayNumber(userDoc.start_date, planData.total_days);
          const dayData = await getWorkoutDay(planData.id, dayNum);
          setTodayDay(dayData);
        }
      } catch (err) {
        console.error('MemberHome fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [userDoc, user?.uid]);

  // Realtime Kiosk Scanning Feedback (Haptic + Overlay)
  useEffect(() => {
    if (!user?.uid || !userDoc?.gym_id) return;
    if (localStorage.getItem('mockRole')) return;

    const qSession = query(
      collection(db, 'attendance_sessions'),
      where('memberId', '==', user.uid),
      where('gymId', '==', userDoc.gym_id),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    let isInitialLoad = true;

    const unsub = onSnapshot(qSession, (snap) => {
      if (snap.empty) {
        isInitialLoad = false;
        return;
      }

      const doc = snap.docs[0];
      const data = doc.data();

      if (isInitialLoad) {
        prevAttendanceCount.current = { id: doc.id, status: data.status, duration: data.durationMinutes };
        isInitialLoad = false;
        return;
      }

      const prev = prevAttendanceCount.current;

      // New Entry (Welcome)
      if (!prev || (prev.id !== doc.id && data.status === 'inside')) {
        try { playHapticSound('success'); } catch (e) {}
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        setKioskMessage({
          type: 'success',
          icon: '👋',
          title: `Welcome, ${firstName}!`,
          subtitle: 'Your entry was successfully logged.'
        });
        setTimeout(() => setKioskMessage(null), 5000);
      }
      // Exit (Goodbye)
      else if (prev && prev.id === doc.id && prev.status === 'inside' && data.status === 'completed') {
        try { playHapticSound('exit'); } catch (e) {}
        if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 100]);
        setKioskMessage({
          type: 'exit-success',
          icon: '👋',
          title: `Goodbye, ${firstName}!`,
          subtitle: `You worked out for ${data.durationMinutes || 0} minutes.`
        });
        setTimeout(() => setKioskMessage(null), 5000);
      }

      prevAttendanceCount.current = { id: doc.id, status: data.status, duration: data.durationMinutes };
    });

    return () => unsub();
  }, [user?.uid, userDoc?.gym_id, firstName]);

  const handleSorenessSubmit = async () => {
    try {
      const payload = {
        member_id: user.uid,
        muscle_sorenesses: Object.entries(sorenessLevels).map(([m, level]) => ({ muscle: m, level }))
      };
      await saveSorenessLog(payload);
      setShowSorenessCheck(false);
      showToast('Feedback saved! We will adjust your next session.', 'success');
    } catch (err) {
      showToast('Failed to save feedback', 'error');
    }
  };

  const [allPayments, setAllPayments] = useState([]);
  useEffect(() => {
    if (!userDoc?.gym_id || !user?.uid) return;
    const unsub = getMemberPaymentsRealtime(userDoc.gym_id, user.uid, (payments) => {
      setAllPayments(payments);
      setPendingPayments(payments.filter(p => p.status === 'pending' || p.status === 'partial'));
    });
    return () => unsub();
  }, [userDoc?.gym_id, user?.uid]);

  const handleScreenshotUpload = async (paymentId, file) => {
    if (!file) return;
    setUploadingPaymentId(paymentId);
    try {
      const path = `payment_screenshots/${userDoc.gym_id}/${paymentId}/${Date.now()}_${file.name}`;
      const sRef = storageRef(storage, path);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);
      await updatePayment(paymentId, { screenshot_url: url, screenshot_uploaded_at: new Date().toISOString() });
      showToast('Screenshot uploaded!', 'success');
    } catch (e) {
      showToast('Upload failed: ' + e.message, 'error');
    } finally {
      setUploadingPaymentId(null);
    }
  };

  const { label: statusLabel, type: statusType } = getExpiryStatus(userDoc?.subscription_expiry);
  const daysRemaining = getDaysRemaining(userDoc?.subscription_expiry);
  const bmi = calculateBMI(userDoc?.height, userDoc?.weight);
  const avatarColor = getAvatarColor(userDoc?.name);
  const streak = userDoc?.streak || 0;
  const workoutsThisMonth = recentLogs.filter(l => {
    const d = l.log_date?.toDate ? l.log_date.toDate() : null;
    return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const todayLogged = recentLogs.some(l => {
    const d = l.log_date?.toDate ? l.log_date.toDate() : null;
    return d && d.toDateString() === now.toDateString();
  });

  const cs = { ...DEFAULT_CS, ...(gym?.card_settings || {}) };
  const sc = { active: { bg: 'rgba(29,158,117,0.15)', color: '#006e28', dot: '#006e28' }, expiring: { bg: 'rgba(239,159,39,0.15)', color: '#EF9F27', dot: '#EF9F27' }, expired: { bg: 'rgba(186,26,26,0.15)', color: '#ba1a1a', dot: '#ba1a1a' } }[statusType] || { bg: 'rgba(29,158,117,0.15)', color: '#006e28', dot: '#006e28' };
  const publicUrl = `${window.location.origin}/public/member/${user?.uid}`;

  if (loading) {
    return (
      <div className="screen member-home-screen">
        <div className="screen-content spinner-center">
          <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="screen member-home-screen">
      {/* Kiosk Scan Feedback Overlay */}
      {kioskMessage && (
        <div 
          onClick={() => setKioskMessage(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: kioskMessage.type === 'success' ? 'rgba(10, 42, 26, 0.95)' : 'rgba(0, 26, 20, 0.95)',
            backdropFilter: 'blur(12px)', color: '#fff',
            animation: 'kiosk-fade-in 0.3s ease', cursor: 'pointer'
          }}
        >
          <div style={{
            width: 100, height: 100, borderRadius: '50%',
            background: kioskMessage.type === 'success' ? 'rgba(29, 158, 117, 0.25)' : 'rgba(0, 64, 139, 0.25)',
            color: kioskMessage.type === 'success' ? '#1D9E75' : '#adc6ff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 50, marginBottom: 24,
            animation: 'kiosk-scale-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}>
            {kioskMessage.icon}
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12, textAlign: 'center', padding: '0 20px' }}>
            {kioskMessage.title}
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.7)', textAlign: 'center', padding: '0 30px' }}>
            {kioskMessage.subtitle}
          </p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 40 }}>
            Tap anywhere to dismiss
          </p>
        </div>
      )}

      <div className="screen-content">
        {/* Greeting */}
        <div className="member-greeting">
          <div>
            <h1 className="member-greeting-text">{greeting}, {firstName}</h1>
            <p className="member-greeting-date">{dateStr}</p>
          </div>
          <div className="member-greeting-avatar" style={{ background: avatarColor.bg, color: avatarColor.text }}
            onClick={() => navigate('/member/profile')}>
            {userDoc?.profile_photo
              ? <img src={userDoc.profile_photo} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              : getInitials(userDoc?.name)
            }
          </div>
        </div>

        {/* ── Agreement Pending inline card ── */}
        {showAgreementPending && userDoc?.agreement_status !== 'agreed' && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(83,74,183,0.1), rgba(55,138,221,0.08))',
            border: '1.5px solid rgba(83,74,183,0.25)',
            borderRadius: 16, padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4,
          }}>
            <span style={{ fontSize: 22 }}>📝</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#534ab7', marginBottom: 2 }}>Agreement Pending</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>Sign your membership agreement to unlock full access.</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                onClick={() => navigate('/member/agreement')}
                style={{ background: '#534ab7', color: '#fff', border: 'none', padding: '7px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Sign →
              </button>
              <button
                onClick={() => setShowAgreementPending(false)}
                style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', padding: '3px', fontSize: 11, cursor: 'pointer' }}
              >
                Later
              </button>
            </div>
          </div>
        )}

        {/* Soreness check */}
        {showSorenessCheck && (
          <div className="soreness-check-card glass-card">
            <div className="soreness-header">📋 Quick Recovery Check</div>
            <p className="soreness-question">How are you feeling from yesterday's session?</p>
            <div className="soreness-muscles">
              {yesterdayMuscles.map(m => (
                <div key={m} className="soreness-muscle-item">
                  <span className="soreness-muscle-name">{m}</span>
                  <div className="soreness-levels">
                    {['Not sore', 'A little', 'Very sore'].map((lbl, idx) => (
                      <button
                        key={idx}
                        className={`soreness-btn ${sorenessLevels[m] === idx ? `active-${idx}` : ''}`}
                        onClick={() => setSorenessLevels({...sorenessLevels, [m]: idx})}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button className="soreness-submit" onClick={handleSorenessSubmit}>Save Feedback</button>
          </div>
        )}

        {/* ── QR / Card Tab Strip ── */}
        <div style={{
          display: 'flex', background: 'rgba(255,255,255,0.35)', backdropFilter: 'blur(12px)',
          borderRadius: 14, padding: 4, marginBottom: 4, border: '1px solid rgba(255,255,255,0.5)',
          boxShadow: '0 2px 8px rgba(83,74,183,0.06)',
        }}>
          {[{ icon: '⬛', label: 'QR Check-in' }, { icon: '🪪', label: 'Digital ID' }].map((t, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 11, border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: 13, transition: 'all 0.2s',
                background: activeTab === i ? '#fff' : 'transparent',
                color: activeTab === i ? '#534ab7' : '#787584',
                boxShadow: activeTab === i ? '0 2px 8px rgba(83,74,183,0.12)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <span style={{ fontSize: 14 }}>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab 0: QR Check-in ── */}
        {activeTab === 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #1a1040 0%, #2d1b69 50%, #1a2980 100%)',
            borderRadius: 20, padding: '20px 20px 24px',
            position: 'relative', overflow: 'hidden', marginBottom: 16,
            boxShadow: '0 8px 32px rgba(83,74,183,0.25)',
          }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(83,74,183,0.25)', filter: 'blur(25px)' }} />
            <div style={{ position: 'absolute', bottom: -20, left: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(55,138,221,0.2)', filter: 'blur(20px)' }} />
            <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 14 }}>
                Gym Check-in
              </div>
              {daysRemaining <= 0 ? (
                <div style={{ padding: '20px 0' }}>
                  <div style={{ fontSize: 48, marginBottom: 10 }}>🚫</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#ff6b6b', marginBottom: 6 }}>Membership Expired</div>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
                    Expired {Math.abs(daysRemaining)} days ago. Renew to use check-in.
                  </p>
                </div>
              ) : (
                <>
                  <div style={{ background: '#fff', padding: 14, borderRadius: 18, display: 'inline-block', marginBottom: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
                    <QRCodeSVG
                      value={`gymly://checkin/${user?.uid}/${userDoc?.gym_id}`}
                      size={160}
                      bgColor="transparent"
                      fgColor="#1A1A1A"
                      level="M"
                    />
                  </div>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, marginBottom: 10 }}>
                    Show this QR at reception to log your attendance
                  </p>
                </>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: sc.color }}>{statusLabel}</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>•</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                  {daysRemaining > 0 ? `${daysRemaining} days left` : `Expired ${Math.abs(daysRemaining)}d ago`}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab 1: Digital Membership Card ── */}
        {activeTab === 1 && (
          <div>
            {/* Collapsed preview / expand button */}
            {!cardExpanded ? (
              <div
                onClick={() => setCardExpanded(true)}
                style={{
                  background: 'linear-gradient(135deg, #1a1040 0%, #2d1b69 50%, #1a2980 100%)',
                  borderRadius: 20, padding: '16px 20px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  boxShadow: '0 8px 32px rgba(83,74,183,0.25)', marginBottom: 4,
                  position: 'relative', overflow: 'hidden',
                }}
              >
                <div style={{ position: 'absolute', top: -20, right: -20, width: 90, height: 90, borderRadius: '50%', background: 'rgba(83,74,183,0.3)', filter: 'blur(20px)' }} />
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
                  {cs.show_photo && (
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: `linear-gradient(135deg, ${avatarColor.bg}, #378add)`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(255,255,255,0.3)', flexShrink: 0 }}>
                      {userDoc?.profile_photo
                        ? <img src={userDoc.profile_photo} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: 16, fontWeight: 700, color: avatarColor.text }}>{getInitials(userDoc?.name)}</span>
                      }
                    </div>
                  )}
                  <div>
                    {cs.show_gym_name && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>{gym?.name || 'My Gym'}</div>}
                    {cs.show_member_name && <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{userDoc?.name}</div>}
                    {cs.show_plan && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{getPlanName(gym, userDoc?.plan_id)}</div>}
                  </div>
                </div>
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
                  {cs.show_qr && (
                    <div style={{ background: 'rgba(255,255,255,0.15)', padding: 6, borderRadius: 8 }}>
                      <QRCodeSVG value={publicUrl} size={32} bgColor="transparent" fgColor="#ffffff" level="M" />
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Tap to expand</div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2 }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>
                </div>
              </div>
            ) : (
              /* Expanded full card */
              <div style={{
                background: 'linear-gradient(135deg, #1a1040 0%, #2d1b69 50%, #1a2980 100%)',
                borderRadius: 20, padding: 20, position: 'relative', overflow: 'hidden', marginBottom: 4,
                boxShadow: '0 12px 48px rgba(83,74,183,0.35)',
              }}>
                <div style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: '50%', background: 'rgba(83,74,183,0.3)', filter: 'blur(30px)' }} />
                <div style={{ position: 'absolute', bottom: -30, left: -30, width: 100, height: 100, borderRadius: '50%', background: 'rgba(55,138,221,0.25)', filter: 'blur(25px)' }} />

                <div style={{ position: 'relative', zIndex: 1 }}>
                  {/* Top row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div>
                      {cs.show_gym_name && <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>{gym?.name || 'My Gym'}</div>}
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.5 }}>GYMLY MEMBER CARD</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {cs.show_status && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: sc.bg, padding: '4px 10px', borderRadius: 99 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot }} />
                          <span style={{ fontSize: 10, fontWeight: 700, color: sc.color }}>{statusLabel}</span>
                        </div>
                      )}
                      <button onClick={() => setCardExpanded(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.6)', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                      </button>
                    </div>
                  </div>

                  {/* Middle row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                    {cs.show_photo && (
                      <div style={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0, border: '2px solid rgba(255,255,255,0.3)', overflow: 'hidden', background: `linear-gradient(135deg, ${avatarColor.bg}, #378add)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {userDoc?.profile_photo
                          ? <img src={userDoc.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ fontSize: 18, fontWeight: 700, color: avatarColor.text }}>{getInitials(userDoc?.name)}</span>
                        }
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {cs.show_member_name && <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userDoc?.name}</div>}
                      {cs.show_plan && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>{getPlanName(gym, userDoc?.plan_id)}</div>}
                      {cs.show_member_id && (userDoc?.memberNumber || userDoc?.id) && (
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
                          #{userDoc?.memberNumber || `MEM-${userDoc?.id?.substring(0, 6)}`}
                        </div>
                      )}
                      {cs.show_enrollment_id && userDoc?.latestEnrollmentNumber && (
                        <div style={{ display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 700, color: '#4ade80', background: 'rgba(74,222,128,0.15)', padding: '2px 8px', borderRadius: 6, fontFamily: 'monospace' }}>
                          {userDoc.latestEnrollmentNumber}
                        </div>
                      )}
                    </div>
                    {cs.show_qr && (
                      <div style={{ background: '#fff', padding: 6, borderRadius: 10, flexShrink: 0 }}>
                        <QRCodeSVG value={publicUrl} size={52} bgColor="transparent" fgColor="#1A1A1A" level="M" />
                      </div>
                    )}
                  </div>

                  {/* Bottom row */}
                  {(cs.show_expiry || cs.show_phone) && (
                    <div style={{ display: 'flex', gap: 20, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12 }}>
                      {cs.show_expiry && (
                        <div>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Valid Till</div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginTop: 1 }}>{formatDate(userDoc?.subscription_expiry)}</div>
                        </div>
                      )}
                      {cs.show_phone && userDoc?.phone && (
                        <div>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Phone</div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginTop: 1 }}>{userDoc.phone}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            <button
              onClick={() => navigate('/member/card')}
              style={{ width: '100%', marginTop: 8, marginBottom: 8, padding: '12px', borderRadius: 12, background: 'rgba(83,74,183,0.08)', border: '1px solid rgba(83,74,183,0.15)', color: '#534ab7', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              View Full Digital ID →
            </button>
            <div style={{ height: 8 }} />
          </div>
        )}

        {/* Pending payments */}
        {pendingPayments.map(p => (
          <div key={p.id} style={{
            background: 'linear-gradient(135deg, rgba(239,159,39,0.12), rgba(226,75,74,0.08))',
            border: '1.5px solid rgba(239,159,39,0.3)',
            borderRadius: 16, padding: '14px 16px', marginBottom: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#EF9F27' }}>Payment Due</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  ₹{(p.pending_amount || p.final_amount || 0).toLocaleString('en-IN')} pending · {p.plan_name}
                </div>
              </div>
            </div>
            {p.method === 'upi' && (
              <div>
                {p.screenshot_url ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ color: '#1D9E75', fontWeight: 600 }}>✓ Screenshot submitted</span>
                    <a href={p.screenshot_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontSize: 11 }}>View →</a>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                      Upload your UPI payment screenshot so the gym can verify and clear your due.
                    </p>
                    <input type="file" accept="image/*" style={{ display: 'none' }} id={`screenshot-${p.id}`}
                      onChange={(e) => { const file = e.target.files?.[0]; if (file) handleScreenshotUpload(p.id, file); }}
                    />
                    <label htmlFor={`screenshot-${p.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, cursor: 'pointer', background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 600, fontSize: 13, border: '1.5px solid var(--primary-border)' }}>
                      {uploadingPaymentId === p.id ? <span>Uploading...</span> : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>Upload UPI Screenshot</>}
                    </label>
                  </div>
                )}
              </div>
            )}
            {p.method !== 'upi' && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Please pay at the gym counter to clear this due.</p>}
          </div>
        ))}

        {/* ── Membership Status Tracker ── */}
        {(() => {
          const expDate = userDoc?.subscription_expiry?.toDate ? userDoc.subscription_expiry.toDate() : (userDoc?.subscription_expiry ? new Date(userDoc.subscription_expiry) : null);
          const totalDays = 30; // approximate default
          const daysLeft = Math.max(0, daysRemaining);
          const daysUsed = Math.max(0, totalDays - daysLeft);
          const progress = Math.min(100, Math.max(0, (daysUsed / totalDays) * 100));
          const circumference = 2 * Math.PI * 38;
          const strokeDash = circumference - (progress / 100) * circumference;
          const trackColor = statusType === 'expired' ? '#ba1a1a' : statusType === 'expiring' ? '#EF9F27' : '#1D9E75';
          const gradStart = statusType === 'expired' ? '#E24B4A' : statusType === 'expiring' ? '#EF9F27' : '#1D9E75';
          const gradEnd = statusType === 'expired' ? '#ba1a1a' : statusType === 'expiring' ? '#B06000' : '#006e28';
          return (
            <div style={{
              background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.7)', borderRadius: 20,
              padding: '16px 18px', marginBottom: 12,
              boxShadow: '0 2px 12px rgba(83,74,183,0.06)',
              display: 'flex', alignItems: 'center', gap: 16,
            }}>
              {/* Circular progress */}
              <div style={{ position: 'relative', width: 84, height: 84, flexShrink: 0 }}>
                <svg width="84" height="84" style={{ transform: 'rotate(-90deg)' }}>
                  <defs>
                    <linearGradient id="memberProgressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor={gradStart} />
                      <stop offset="100%" stopColor={gradEnd} />
                    </linearGradient>
                  </defs>
                  {/* Track */}
                  <circle cx="42" cy="42" r="38" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="7" />
                  {/* Progress */}
                  <circle
                    cx="42" cy="42" r="38" fill="none"
                    stroke="url(#memberProgressGrad)" strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDash}
                    style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                  />
                </svg>
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: trackColor, lineHeight: 1 }}>
                    {daysRemaining > 0 ? daysLeft : '0'}
                  </div>
                  <div style={{ fontSize: 8, color: '#9BA3B5', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>days</div>
                </div>
              </div>
              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: '#9BA3B5', fontWeight: 600, marginBottom: 4 }}>Membership Status</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#1b1b1d', marginBottom: 2 }}>
                  {daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Membership Expired'}
                </div>
                <div style={{ fontSize: 11, color: '#9BA3B5', marginBottom: 8 }}>
                  {expDate ? `Valid till ${expDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : 'No active plan'}
                </div>
                {/* Mini progress bar */}
                <div style={{ height: 5, background: 'rgba(0,0,0,0.07)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress}%`, borderRadius: 99, background: `linear-gradient(90deg, ${gradStart}, ${gradEnd})`, transition: 'width 0.8s ease' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontSize: 9.5, color: '#9BA3B5' }}>Start</span>
                  <span style={{ fontSize: 9.5, color: '#9BA3B5' }}>Expiry</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Today's workout */}
        <div className="today-workout glass-card" onClick={() => navigate('/member/workout')}>
          <div className="today-workout-header">
            <span style={{ fontSize: 16, fontWeight: 600 }}>Today&apos;s workout</span>
            {todayLogged && <span className="today-completed-badge">✓ Completed</span>}
          </div>
          {todayDay && (
            <>
              <div className="today-workout-day">{todayDay.name}</div>
              <div className="today-workout-focus">{todayDay.focus}</div>
              <div className="today-workout-meta">{todayDay.exercises?.length || 0} exercises • ~{(todayDay.exercises?.length || 0) * 8} min</div>
            </>
          )}
          {!todayDay && <div className="today-workout-focus">Pick your session for today →</div>}
        </div>

        <div className="calorie-summary-calm glass-card">
          <div className="csc-header">
            <div className="csc-icon">🔥</div>
            <div className="csc-title">Energy Burned Today</div>
          </div>
          <div className="csc-metrics">
            <div className="csc-metric">
              <span className="csc-val">{caloriesToday}</span>
              <span className="csc-lbl">kcal burned</span>
            </div>
            <div className="csc-divider" />
            <div className="csc-metric">
              <span className="csc-val">{totalSetsToday}</span>
              <span className="csc-lbl">sets logged</span>
            </div>
          </div>
          <div className="csc-progress-track">
            <div className="csc-progress-bar" style={{ width: `${Math.min((caloriesToday / 500) * 100, 100)}%` }} />
          </div>
        </div>

        <div className="quick-stats-row">
          <div className="quick-stat glass-card">
            <span className="quick-stat-icon">🔥</span>
            <span className="quick-stat-value">{streak}</span>
            <span className="quick-stat-label">streak</span>
          </div>
          <div className="quick-stat glass-card">
            <span className="quick-stat-icon">💪</span>
            <span className="quick-stat-value">{workoutsThisMonth}</span>
            <span className="quick-stat-label">workouts</span>
          </div>
          <div className="quick-stat glass-card" onClick={() => navigate('/member/progress')}>
            <span className="quick-stat-icon">⚖️</span>
            <span className="quick-stat-value">{userDoc?.weight ? `${userDoc.weight}kg` : '—'}</span>
            <span className="quick-stat-label">weight</span>
          </div>
        </div>

        {bmi && (
          <div className="bmi-section glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>BMI Status</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: bmi.color }}>{bmi.value}</span>
            </div>
            <div className="bmi-bar">
              <div className="bmi-zone under" /><div className="bmi-zone normal" /><div className="bmi-zone over" /><div className="bmi-zone obese" />
              <div className="bmi-marker" style={{ left: `${Math.min(Math.max((bmi.value - 15) / 25 * 100, 0), 100)}%` }} />
            </div>
            <div style={{ fontSize: 12, color: bmi.color, fontWeight: 600, marginTop: 4 }}>{bmi.category}</div>
          </div>
        )}
      </div>

      <BottomNav activeTab="home" role="member" />
    </div>
  );
};

export default MemberHome;
