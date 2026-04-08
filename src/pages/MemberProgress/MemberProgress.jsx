import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getMemberProgressLogs, createProgressLog, getMemberWorkoutLogs } from '../../firebase/firestore';
import { calculateBMI, formatDate } from '../../utils/helpers';
import BottomNav from '../../components/BottomNav';
import './MemberProgress.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler);

const MemberProgress = () => {
  const navigate = useNavigate();
  const { user, userDoc, refreshUserDoc } = useAuth();
  const { showToast } = useToast();

  const [weightLogs, setWeightLogs] = useState([]);
  const [workoutLogs, setWorkoutLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('1m'); 
  
  const [showLogWeight, setShowLogWeight] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      if (!user) return;
      try {
        const [wLogs, wOutLogs] = await Promise.all([
          getMemberProgressLogs(user.uid),
          getMemberWorkoutLogs(user.uid, 50) 
        ]);
        setWeightLogs(wLogs.sort((a, b) => {
          const d1 = a.logged_at?.toDate ? a.logged_at.toDate() : new Date(a.logged_at);
          const d2 = b.logged_at?.toDate ? b.logged_at.toDate() : new Date(b.logged_at);
          return d1 - d2;
        }));
        setWorkoutLogs(wOutLogs);
      } catch (err) {
        console.error('Progress fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [user]);

  // Weekly Comparison Logic
  const getWeeklyStats = () => {
    const now = new Date();
    // Start of this week (Monday)
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
    thisWeekStart.setHours(0,0,0,0);

    // Start of last week
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(thisWeekStart.getDate() - 7);
    
    const logsThisWeek = workoutLogs.filter(l => {
      const d = l.log_date?.toDate ? l.log_date.toDate() : new Date(l.log_date);
      return d >= thisWeekStart;
    });

    const logsLastWeek = workoutLogs.filter(l => {
      const d = l.log_date?.toDate ? l.log_date.toDate() : new Date(l.log_date);
      return d >= lastWeekStart && d < thisWeekStart;
    });

    const calculateSets = (logs) => logs.reduce((sum, l) => {
      let s = 0;
      l.exercises?.forEach(ex => { s += (ex.sets?.length || 0); });
      return sum + s;
    }, 0);

    const calculateCals = (logs) => logs.reduce((sum, l) => sum + (l.total_calories || 0), 0);

    const thisWeekSets = calculateSets(logsThisWeek);
    const lastWeekSets = calculateSets(logsLastWeek);
    const thisWeekCals = calculateCals(logsThisWeek);
    const lastWeekCals = calculateCals(logsLastWeek);

    return {
      workouts: { current: logsThisWeek.length, prev: logsLastWeek.length },
      calories: { current: thisWeekCals, prev: lastWeekCals },
      sets: { current: thisWeekSets, prev: lastWeekSets }
    };
  };

  const weeklyStats = getWeeklyStats();

  const handleSaveWeight = async () => {
    if (!newWeight || isNaN(newWeight)) { showToast('Invalid weight', 'error'); return; }
    setSavingWeight(true);
    try {
      await createProgressLog({
        member_id: user.uid,
        weight: Number(newWeight),
        type: 'weight'
      });
      const { updateMember } = await import('../../firebase/firestore');
      await updateMember(user.uid, { weight: Number(newWeight) });

      showToast('Weight updated! 🔥', 'success');
      setShowLogWeight(false);
      setNewWeight('');
      await refreshUserDoc(user.uid);
    } catch (err) {
      showToast('Failed to log weight', 'error');
    } finally {
      setSavingWeight(false);
    }
  };

  const chartLogs = weightLogs.filter(log => {
    if (timeRange === 'all') return true;
    const now = new Date();
    const months = timeRange === '1m' ? 1 : timeRange === '3m' ? 3 : 6;
    const cutoff = new Date(now.setMonth(now.getMonth() - months));
    const d = log.logged_at?.toDate ? log.logged_at.toDate() : new Date(log.logged_at);
    return d >= cutoff;
  });
  
  const chartData = {
    labels: chartLogs.map(log => {
      const d = log.logged_at?.toDate ? log.logged_at.toDate() : new Date(log.logged_at);
      return `${d.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}`;
    }),
    datasets: [{
      label: 'Weight (kg)',
      data: chartLogs.map(log => log.weight),
      borderColor: '#534AB7',
      backgroundColor: 'rgba(83,74,183,0.1)',
      borderWidth: 3,
      fill: true,
      tension: 0.4
    }]
  };

  const getDeltaStyles = (curr, prev) => {
    if (curr > prev) return { class: 'up', icon: '↑' };
    if (curr < prev) return { class: 'down', icon: '↓' };
    return { class: 'neutral', icon: '-' };
  };

  const getPct = (curr, prev) => {
    if (prev === 0) return curr > 0 ? '+100%' : '0%';
    const pct = Math.round(((curr - prev) / prev) * 100);
    return pct >= 0 ? `+${pct}%` : `${pct}%`;
  };

  return (
    <div className="screen member-progress-screen">
      <div className="screen-content">
        <div className="top-bar">
          <h1 className="top-bar-title">Performance</h1>
          <button className="top-bar-action" onClick={() => setShowLogWeight(true)}>+ Log Weight</button>
        </div>

        {/* Weekly Comparison Card */}
        <div className="weekly-comp-section glass-card">
          <div className="weekly-comp-header">This Week vs Last Week</div>
          <div className="weekly-comp-grid">
            {/* Workouts */}
            <div className="comp-item">
              <div className="comp-info">
                <span className="comp-label">Workouts</span>
                <span className="comp-sub">{weeklyStats.workouts.prev} last week</span>
              </div>
              <div className="comp-delta">
                <span className={`delta-val ${getDeltaStyles(weeklyStats.workouts.current, weeklyStats.workouts.prev).class}`}>
                  {weeklyStats.workouts.current} {getDeltaStyles(weeklyStats.workouts.current, weeklyStats.workouts.prev).icon}
                </span>
                <span className={`delta-pct ${getDeltaStyles(weeklyStats.workouts.current, weeklyStats.workouts.prev).class}`}>
                  {getPct(weeklyStats.workouts.current, weeklyStats.workouts.prev)}
                </span>
              </div>
            </div>
            {/* Calories */}
            <div className="comp-item">
              <div className="comp-info">
                <span className="comp-label">Energy Output</span>
                <span className="comp-sub">{weeklyStats.calories.prev} kcal last week</span>
              </div>
              <div className="comp-delta">
                <span className={`delta-val ${getDeltaStyles(weeklyStats.calories.current, weeklyStats.calories.prev).class}`}>
                  {weeklyStats.calories.current} kcal
                </span>
                <span className={`delta-pct ${getDeltaStyles(weeklyStats.calories.current, weeklyStats.calories.prev).class}`}>
                  {getPct(weeklyStats.calories.current, weeklyStats.calories.prev)}
                </span>
              </div>
            </div>
            {/* Volume/Sets */}
            <div className="comp-item">
              <div className="comp-info">
                <span className="comp-label">Training Volume</span>
                <span className="comp-sub">{weeklyStats.sets.prev} sets last week</span>
              </div>
              <div className="comp-delta">
                <span className={`delta-val ${getDeltaStyles(weeklyStats.sets.current, weeklyStats.sets.prev).class}`}>
                  {weeklyStats.sets.current} sets
                </span>
                <span className={`delta-pct ${getDeltaStyles(weeklyStats.sets.current, weeklyStats.sets.prev).class}`}>
                  {getPct(weeklyStats.sets.current, weeklyStats.sets.prev)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Weights Chart */}
        <div className="glass-card chart-card">
          <div className="chart-header">
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Latest Weight</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#534AB7' }}>
                {userDoc?.weight ? `${userDoc.weight} kg` : '—'}
              </div>
            </div>
            <div className="chart-pills">
              {['1m', '3m', '6m', 'all'].map(r => (
                <button key={r} className={`chart-pill ${timeRange === r ? 'active' : ''}`} onClick={() => setTimeRange(r)}>
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="chart-container">
            {chartLogs.length > 0 ? (
              <Line data={chartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { color: 'rgba(0,0,0,0.05)' } } } }} />
            ) : (
              <div className="empty-chart">Log weight to visualize trend</div>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="stats-row">
            <div className="stat-card glass-card">
                <div className="stat-icon streak-icon">🔥</div>
                <div className="stat-value">{userDoc?.streak || 0}</div>
                <div className="stat-label">Day Streak</div>
            </div>
            <div className="stat-card glass-card">
                <div className="stat-icon workout-icon">💪</div>
                <div className="stat-value">{workoutLogs.length}</div>
                <div className="stat-label">Total Logs</div>
            </div>
        </div>
      </div>

      {/* Log Weight sheet */}
      {showLogWeight && (
        <div className="modal-overlay" onClick={() => setShowLogWeight(false)}>
          <div className="bottom-sheet glass-card" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h2 className="sheet-title">Body Weight</h2>
            <div className="input-group">
              <label className="input-label">Current Weight (kg)</label>
              <input type="number" className="input-field" placeholder="75" value={newWeight} onChange={e => setNewWeight(e.target.value)} autoFocus />
            </div>
            <button className="btn-primary" onClick={handleSaveWeight} disabled={savingWeight}>{savingWeight ? 'Updating...' : 'Save Record'}</button>
          </div>
        </div>
      )}

      <BottomNav activeTab="progress" role="member" />
    </div>
  );
};

export default MemberProgress;
