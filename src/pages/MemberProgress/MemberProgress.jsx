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
  const [timeRange, setTimeRange] = useState('1m'); // 1m, 3m, 6m, all
  
  // Weight logging modal
  const [showLogWeight, setShowLogWeight] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      if (!user) return;
      try {
        const [wLogs, wOutLogs] = await Promise.all([
          getMemberProgressLogs(user.uid),
          getMemberWorkoutLogs(user.uid, 30) // last 30 workouts
        ]);
        // Sort weight logs oldest to newest for chart
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

  const handleSaveWeight = async () => {
    if (!newWeight || isNaN(newWeight)) { showToast('Invalid weight', 'error'); return; }
    setSavingWeight(true);
    try {
      await createProgressLog({
        member_id: user.uid,
        weight: Number(newWeight),
        type: 'weight',
        notes: ''
      });
      // CRITICAL: Also update the weight on the user document itself!
      const { updateUser } = await import('../../firebase/firestore');
      await updateUser(user.uid, { weight: Number(newWeight) });

      showToast('Weight logged successfully', 'success');
      setShowLogWeight(false);
      setNewWeight('');
      // Optimistic update
      setWeightLogs(prev => [...prev, {
        logged_at: new Date(),
        weight: Number(newWeight)
      }]);
      await refreshUserDoc(user.uid);
    } catch (err) {
      console.error('Weight log error:', err);
      showToast('Failed to log weight', 'error');
    } finally {
      setSavingWeight(false);
    }
  };

  // Chart data filtering
  const getFilteredLogs = () => {
    if (!weightLogs.length) return [];
    if (timeRange === 'all') return weightLogs;
    
    const now = new Date();
    const months = timeRange === '1m' ? 1 : timeRange === '3m' ? 3 : 6;
    const cutoff = new Date(now.setMonth(now.getMonth() - months));
    
    return weightLogs.filter(log => {
      const d = log.logged_at?.toDate ? log.logged_at.toDate() : new Date(log.logged_at);
      return d >= cutoff;
    });
  };

  const chartLogs = getFilteredLogs();
  
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
      pointBackgroundColor: '#534AB7',
      pointRadius: 4,
      pointHoverRadius: 6,
      fill: true,
      tension: 0.4
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false } },
      y: { grid: { color: 'rgba(0,0,0,0.05)' }, border: { display: false } }
    }
  };

  const bmi = calculateBMI(userDoc?.height, userDoc?.weight);
  const streak = userDoc?.streak || 0;

  if (loading) {
    return (
      <div className="screen member-progress-screen">
        <div className="screen-content spinner-center">
          <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="screen member-progress-screen">
      <div className="screen-content">
        <div className="top-bar">
          <h1 className="top-bar-title">Progress</h1>
          <button className="top-bar-action" onClick={() => setShowLogWeight(true)}>+ Log Weight</button>
        </div>

        {/* Chart Section */}
        <div className="glass-card chart-card">
          <div className="chart-header">
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Current Weight</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary)' }}>
                {userDoc?.weight ? `${userDoc.weight} kg` : '—'}
              </div>
            </div>
            <div className="chart-pills">
              <button className={`chart-pill ${timeRange === '1m' ? 'active' : ''}`} onClick={() => setTimeRange('1m')}>1M</button>
              <button className={`chart-pill ${timeRange === '3m' ? 'active' : ''}`} onClick={() => setTimeRange('3m')}>3M</button>
              <button className={`chart-pill ${timeRange === '6m' ? 'active' : ''}`} onClick={() => setTimeRange('6m')}>6M</button>
            </div>
          </div>
          
          <div className="chart-container">
            {chartLogs.length > 0 ? (
              <Line data={chartData} options={chartOptions} />
            ) : (
              <div className="empty-chart">
                Ask your trainer to log your weight or log it yourself to see your progress chart.
              </div>
            )}
          </div>
        </div>

        {/* Stats Row */}
        <div className="stats-row">
          <div className="stat-card glass-card">
            <div className="stat-icon streak-icon">🔥</div>
            <div className="stat-value">{streak}</div>
            <div className="stat-label">Day Streak</div>
          </div>
          <div className="stat-card glass-card">
            <div className="stat-icon workout-icon">💪</div>
            <div className="stat-value">{workoutLogs.length}</div>
            <div className="stat-label">Workouts (30d)</div>
          </div>
        </div>

        {/* Photos grid placeholder */}
        <div className="photos-section glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Progress Photos</span>
            <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>Coming soon</span>
          </div>
          <div className="empty-state" style={{ padding: '20px 0', border: '1px dashed rgba(83,74,183,0.2)' }}>
            <div className="empty-icon-wrapper" style={{ margin: '0 auto 10px', width: 40, height: 40 }}>
               📸
            </div>
            <p className="empty-subtitle">Photo uploads require Firebase Blaze plan.</p>
          </div>
        </div>

      </div>

      {/* Log Weight Modal */}
      {showLogWeight && (
        <div className="modal-overlay" onClick={() => setShowLogWeight(false)}>
          <div className="bottom-sheet glass-card" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h2 className="sheet-title">Log Weight</h2>
            <div className="input-group">
              <label className="input-label">Weight (kg)</label>
              <input 
                type="number" 
                className="input-field" 
                placeholder="e.g. 75" 
                value={newWeight}
                onChange={e => setNewWeight(e.target.value)}
                autoFocus
              />
            </div>
            <button className="btn-primary" onClick={handleSaveWeight} disabled={savingWeight}>
              {savingWeight ? <div className="spinner" /> : 'Save'}
            </button>
          </div>
        </div>
      )}

      <BottomNav activeTab="progress" role="member" />
    </div>
  );
};

export default MemberProgress;
