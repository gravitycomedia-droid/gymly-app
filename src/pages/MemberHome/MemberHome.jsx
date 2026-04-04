import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGym, getWorkoutPlan, getWorkoutDay, getMemberWorkoutLogs } from '../../firebase/firestore';
import { getExpiryStatus, formatDate, calculateBMI, getInitials, getAvatarColor, getDaysRemaining, getPlanName } from '../../utils/helpers';
import { getTodaysDayNumber } from '../../data/exerciseLibrary';
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
  const [todayDayNumber, setTodayDayNumber] = useState(1);
  const [recentLogs, setRecentLogs] = useState([]);
  const [loading, setLoading] = useState(true);

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

        promises.push(getMemberWorkoutLogs(user.uid, 5));

        const [gymData, planData, logs] = await Promise.all(promises);
        setGym(gymData);
        setWorkoutPlan(planData);
        setRecentLogs(logs);

        if (planData && userDoc.start_date) {
          const dayNum = getTodaysDayNumber(userDoc.start_date, planData.total_days);
          setTodayDayNumber(dayNum);
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

  const { label: statusLabel, type: statusType, daysText } = getExpiryStatus(userDoc?.subscription_expiry);
  const daysRemaining = getDaysRemaining(userDoc?.subscription_expiry);
  const bmi = calculateBMI(userDoc?.height, userDoc?.weight);
  const avatarColor = getAvatarColor(userDoc?.name);

  // Streak
  const streak = userDoc?.streak || 0;
  const workoutsThisMonth = recentLogs.filter(l => {
    const d = l.log_date?.toDate ? l.log_date.toDate() : null;
    return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  // Check if today's workout already logged
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

        {/* Membership card */}
        <div className={`membership-card glass-card status-${statusType}`}>
          <div className="membership-card-top">
            <span className="membership-gym-name">{gym?.name || 'My Gym'}</span>
            <span className={`status-badge-mini ${statusType}`}>{statusLabel}</span>
          </div>
          <div className="membership-plan-name">{getPlanName(gym, userDoc?.plan_id) || 'No plan'}</div>
          <div className="membership-days-pill">
            {daysRemaining > 0 ? `${daysRemaining} days left` : `Expired ${Math.abs(daysRemaining)} days ago`}
          </div>
          <div className="membership-expiry">Valid till {formatDate(userDoc?.subscription_expiry)}</div>
          {daysRemaining <= 7 && (
            <div className="membership-renew-link" style={{ color: daysRemaining <= 0 ? '#E24B4A' : '#EF9F27' }}>
              Contact gym to renew →
            </div>
          )}
        </div>

        {/* Today's workout */}
        <div className="today-workout glass-card" onClick={() => navigate('/member/workout')}>
          <div className="today-workout-header">
            <span style={{ fontSize: 16, fontWeight: 600 }}>Today&apos;s workout</span>
            {todayLogged && <span className="today-completed-badge">✓ Completed</span>}
          </div>
          {todayDay ? (
            <>
              <div className="today-workout-day">{todayDay.name}</div>
              <div className="today-workout-focus">{todayDay.focus}</div>
              {todayDay.is_rest_day ? (
                <div className="today-rest-badge">🌙 Rest day — Recovery</div>
              ) : (
                <div className="today-workout-meta">
                  {todayDay.exercises?.length || 0} exercises • ~{(todayDay.exercises?.length || 0) * 8} min
                </div>
              )}
            </>
          ) : workoutPlan ? (
            <div className="today-workout-focus">Loading day info...</div>
          ) : (
            <div className="today-workout-focus">No workout plan assigned yet</div>
          )}
        </div>

        {/* Quick stats */}
        <div className="quick-stats-row">
          <div className="quick-stat glass-card">
            <span className="quick-stat-icon">🔥</span>
            <span className="quick-stat-value">{streak}</span>
            <span className="quick-stat-label">day streak</span>
          </div>
          <div className="quick-stat glass-card">
            <span className="quick-stat-icon">💪</span>
            <span className="quick-stat-value">{workoutsThisMonth}</span>
            <span className="quick-stat-label">this month</span>
          </div>
          <div className="quick-stat glass-card" onClick={() => navigate('/member/progress')}>
            <span className="quick-stat-icon">⚖️</span>
            <span className="quick-stat-value">{userDoc?.weight ? `${userDoc.weight}kg` : '—'}</span>
            <span className="quick-stat-label">{userDoc?.weight ? 'weight' : 'Log →'}</span>
          </div>
        </div>

        {/* BMI */}
        {bmi && (
          <div className="bmi-section glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>BMI</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: bmi.color }}>{bmi.value}</span>
            </div>
            <div className="bmi-bar">
              <div className="bmi-zone under" />
              <div className="bmi-zone normal" />
              <div className="bmi-zone over" />
              <div className="bmi-zone obese" />
              <div className="bmi-marker" style={{ left: `${Math.min(Math.max((bmi.value - 15) / 25 * 100, 0), 100)}%` }} />
            </div>
            <div className="bmi-labels">
              <span>Under</span><span>Normal</span><span>Over</span><span>Obese</span>
            </div>
            <div style={{ fontSize: 12, color: bmi.color, fontWeight: 600, marginTop: 4 }}>{bmi.category}</div>
          </div>
        )}

        {/* Gym info */}
        {gym && (
          <div className="gym-info-card glass-card">
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{gym.name}</div>
            {gym.address && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{gym.address}</div>}
            {gym.phone && (
              <a href={`tel:${gym.phone}`} style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
                📞 {gym.phone}
              </a>
            )}
          </div>
        )}
      </div>

      <BottomNav activeTab="home" role="member" />
    </div>
  );
};

export default MemberHome;
