import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { 
  getGym, 
  getWorkoutPlan, 
  getWorkoutDay, 
  getMemberWorkoutLogs,
  getRecentMuscleSoreness,
  saveSorenessLog
} from '../../firebase/firestore';
import { getMemberPaymentsRealtime, updatePayment } from '../../firebase/firestore-payments';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase/config';
import { 
  getExpiryStatus, 
  formatDate, 
  calculateBMI, 
  getInitials, 
  getAvatarColor, 
  getDaysRemaining, 
  getPlanName 
} from '../../utils/helpers';
import { getTodaysDayNumber } from '../../data/exerciseLibrary';
import { GYMLY_EXERCISE_DB } from '../../data/gymlyExerciseDb';
import { logout } from '../../firebase/auth';
import BottomNav from '../../components/BottomNav';
import './MemberHome.css';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
  const [showQRCode, setShowQRCode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [uploadingPaymentId, setUploadingPaymentId] = useState(null);
  const screenshotInputRef = useRef(null);

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

        // 1. Calculate today's caloric summary
        const todayAtZero = new Date();
        todayAtZero.setHours(0,0,0,0);
        
        const logsToday = logs.filter(l => {
          const d = l.log_date?.toDate ? l.log_date.toDate() : null;
          const cd = l.client_date ? new Date(l.client_date) : null;
          // Use client_date as a fallback for the home page status
          const dateToUse = d || cd;
          return dateToUse && dateToUse.getTime() >= todayAtZero.getTime();
        });

        let setsCount = 0;
        let calsCount = 0;
        logsToday.forEach(log => {
          calsCount += (log.total_calories || 0);
          log.exercises?.forEach(ex => {
            setsCount += (ex.sets?.length || 0);
          });
        });
        setTotalSetsToday(setsCount);
        setCaloriesToday(calsCount || (setsCount * 15));

        // 2. Soreness Check Logic
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
            muscles.forEach(m => { initialSoreness[m] = 1; }); // Default to 'A little'
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

  const handleSorenessSubmit = async () => {
    try {
      const payload = {
        member_id: user.uid,
        muscle_sorenesses: Object.entries(sorenessLevels).map(([m, level]) => ({
          muscle: m,
          level
        }))
      };
      await saveSorenessLog(payload);
      setShowSorenessCheck(false);
      showToast('Feedback saved! We will adjust your next session.', 'success');
    } catch (err) {
      showToast('Failed to save feedback', 'error');
    }
  };

  // Real-time pending payments for this member
  useEffect(() => {
    if (!userDoc?.gym_id || !user?.uid) return;
    const unsub = getMemberPaymentsRealtime(userDoc.gym_id, user.uid, (payments) => {
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

        {/* Soreness Check Card */}
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

        {/* Membership card */}
        <div className={`membership-card glass-card status-${statusType}`}>
          <div className="membership-card-top">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="membership-gym-name">{gym?.name || 'My Gym'}</span>
              <button className="qr-mini-btn" onClick={() => setShowQRCode(true)}>
                <span>QR</span>
              </button>
            </div>
            <span className={`status-badge-mini ${statusType}`}>{statusLabel}</span>
          </div>
          <div className="membership-plan-name">{getPlanName(gym, userDoc?.plan_id) || 'No plan'}</div>
          <div className="membership-days-pill">
            {daysRemaining > 0 ? `${daysRemaining} days left` : `Expired ${Math.abs(daysRemaining)} days ago`}
          </div>
          <div className="membership-expiry">Valid till {formatDate(userDoc?.subscription_expiry)}</div>
        </div>

        {/* Pending Payment Banner */}
        {pendingPayments.map(p => (
          <div key={p.id} style={{
            background: 'linear-gradient(135deg, rgba(239,159,39,0.12), rgba(226,75,74,0.08))',
            border: '1.5px solid rgba(239,159,39,0.3)',
            borderRadius: 16,
            padding: '14px 16px',
            marginBottom: 12,
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
            {/* UPI Screenshot upload — only for UPI method */}
            {p.method === 'upi' && (
              <div>
                {p.screenshot_url ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ color: '#1D9E75', fontWeight: 600 }}>✓ Screenshot submitted</span>
                    <a href={p.screenshot_url} target="_blank" rel="noreferrer"
                      style={{ color: 'var(--primary)', fontSize: 11 }}>View →</a>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                      Upload your UPI payment screenshot so the gym can verify and clear your due.
                    </p>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      id={`screenshot-${p.id}`}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleScreenshotUpload(p.id, file);
                      }}
                    />
                    <label htmlFor={`screenshot-${p.id}`} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '8px 16px', borderRadius: 10, cursor: 'pointer',
                      background: uploadingPaymentId === p.id ? 'rgba(83,74,183,0.05)' : 'rgba(83,74,183,0.1)',
                      color: 'var(--primary)', fontWeight: 600, fontSize: 13,
                      border: '1.5px solid rgba(83,74,183,0.2)',
                    }}>
                      {uploadingPaymentId === p.id ? (
                        <span>Uploading...</span>
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"
                              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Upload UPI Screenshot
                        </>
                      )}
                    </label>
                  </div>
                )}
              </div>
            )}
            {p.method !== 'upi' && (
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                Please pay at the gym counter to clear this due.
              </p>
            )}
          </div>
        ))}

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
              <div className="today-workout-meta">
                {todayDay.exercises?.length || 0} exercises • ~{(todayDay.exercises?.length || 0) * 8} min
              </div>
            </>
          )}
          {!todayDay && <div className="today-workout-focus">Pick your session for today →</div>}
        </div>

        {/* Calorie Tracking Widget */}
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

        {/* Quick stats */}
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

        {/* BMI */}
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

      {/* QR Code Modal */}
      {showQRCode && (
        <div className="modal-overlay" onClick={() => setShowQRCode(false)}>
          <div className="qr-modal glass-card" onClick={e => e.stopPropagation()}>
            <div className="qr-modal-header">
              <h3>Gym Check-in</h3>
              <button className="qr-close" onClick={() => setShowQRCode(false)}>×</button>
            </div>
            <div className="qr-container">
              <div className="qr-placeholder" style={{ background: '#fff', padding: 10, borderRadius: 12 }}>
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=gymly://checkin/${user?.uid}/${userDoc?.gym_id}`} 
                  alt="Check-in QR" 
                />
              </div>
              <p className="qr-help">Show this code at the reception to log your attendance</p>
            </div>
          </div>
        </div>
      )}

      <BottomNav activeTab="home" role="member" />
    </div>
  );
};

export default MemberHome;
