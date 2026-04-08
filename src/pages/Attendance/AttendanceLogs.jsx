import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getAttendanceLogsRealtime, getTodayActiveMembers, formatDateKey } from '../../firebase/firestore-payments';
import { getInitials, getAvatarColor } from '../../utils/helpers';
import { Chart, registerables } from 'chart.js';
import BottomNav from '../../components/BottomNav';
import './Attendance.css';

Chart.register(...registerables);

const DATE_FILTERS = ['Today', 'Yesterday', 'This week'];

const AttendanceLogs = () => {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  const [logs, setLogs] = useState([]);
  const [activeMembers, setActiveMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('Today');

  const getDateForFilter = (filter) => {
    const now = new Date();
    if (filter === 'Yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return formatDateKey(y);
    }
    return formatDateKey(now);
  };

  // Live active members
  useEffect(() => {
    if (!userDoc?.gym_id) return;
    const unsub = getTodayActiveMembers(userDoc.gym_id, setActiveMembers);
    return () => unsub();
  }, [userDoc?.gym_id]);

  // Attendance logs for selected date
  useEffect(() => {
    if (!userDoc?.gym_id) return;
    const date = getDateForFilter(dateFilter);
    setLoading(true);
    const unsub = getAttendanceLogsRealtime(userDoc.gym_id, date, (list) => {
      setLogs(list);
      setLoading(false);
    });
    return () => unsub();
  }, [userDoc?.gym_id, dateFilter]);

  // Chart
  useEffect(() => {
    if (!chartRef.current || logs.length === 0) return;

    const hourCounts = {};
    for (let h = 5; h <= 23; h++) hourCounts[h] = 0;

    logs.forEach(l => {
      if (l.is_expired) return;
      const d = l.entry_time?.toDate ? l.entry_time.toDate() : null;
      if (d) {
        const h = d.getHours();
        if (hourCounts[h] !== undefined) hourCounts[h]++;
      }
    });

    const labels = Object.keys(hourCounts).map(h => `${h > 12 ? h - 12 : h}${h >= 12 ? 'PM' : 'AM'}`);
    const data = Object.values(hourCounts);

    if (chartInstance.current) chartInstance.current.destroy();

    chartInstance.current = new Chart(chartRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Entries',
          data,
          backgroundColor: 'rgba(83, 74, 183, 0.6)',
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 9 } } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { stepSize: 1, font: { size: 10 } } },
        },
      },
    });

    return () => { if (chartInstance.current) chartInstance.current.destroy(); };
  }, [logs]);

  const validLogs = logs.filter(l => !l.is_expired);
  const uniqueMembers = new Set(validLogs.map(l => l.member_id)).size;

  // Peak hour
  const hourMap = {};
  validLogs.forEach(l => {
    const d = l.entry_time?.toDate ? l.entry_time.toDate() : null;
    if (d) {
      const h = d.getHours();
      hourMap[h] = (hourMap[h] || 0) + 1;
    }
  });
  const peakHour = Object.entries(hourMap).sort((a, b) => b[1] - a[1])[0];
  const peakLabel = peakHour ? `${peakHour[0] > 12 ? peakHour[0] - 12 : peakHour[0]}${peakHour[0] >= 12 ? ' PM' : ' AM'}` : '—';

  return (
    <div className="screen attendance-screen">
      <div className="screen-content">
        {/* Top bar */}
        <div className="top-bar">
          <h1 className="top-bar-title">Attendance</h1>
          <button className="top-bar-action" onClick={() => navigate('/scan')} id="scan-qr-btn">
            📷 Scan
          </button>
        </div>

        {/* Live count */}
        <div className="attendance-live-card glass-card">
          <div className="attendance-live-label">Currently inside</div>
          <div className="attendance-live-count">{activeMembers.length}</div>
          <div className="attendance-live-avatars">
            {activeMembers.slice(0, 5).map((m, i) => {
              const color = getAvatarColor(m.member_name);
              return (
                <div key={m.id || i} className="attendance-live-avatar" style={{ background: color.bg, color: color.text }}>
                  {getInitials(m.member_name)}
                </div>
              );
            })}
          </div>
        </div>

        {/* Date filter */}
        <div className="filter-row">
          {DATE_FILTERS.map(f => (
            <button key={f} className={`filter-pill ${dateFilter === f ? 'active' : ''}`} onClick={() => setDateFilter(f)}>
              {f}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="attendance-stats-row">
          <div className="attendance-stat-card glass-card">
            <div className="attendance-stat-value">{validLogs.length}</div>
            <div className="attendance-stat-label">Total entries</div>
          </div>
          <div className="attendance-stat-card glass-card">
            <div className="attendance-stat-value">{uniqueMembers}</div>
            <div className="attendance-stat-label">Unique members</div>
          </div>
          <div className="attendance-stat-card glass-card">
            <div className="attendance-stat-value">{peakLabel}</div>
            <div className="attendance-stat-label">Peak hour</div>
          </div>
        </div>

        {/* Chart */}
        <div className="attendance-chart-wrapper glass-card">
          <div className="attendance-chart-title">Entries per hour</div>
          <div style={{ height: 200 }}>
            <canvas ref={chartRef} />
          </div>
        </div>

        {/* Logs */}
        {loading ? (
          <div className="spinner-center"><div className="spinner spinner-primary" /></div>
        ) : logs.length === 0 ? (
          <div className="payment-empty">
            <div className="payment-empty-icon"><span style={{ fontSize: 20 }}>📋</span></div>
            <h3>No entries yet</h3>
            <p>Attendance logs will appear here as members scan their QR codes</p>
          </div>
        ) : (
          logs.map(l => {
            const color = getAvatarColor(l.member_name);
            const time = l.entry_time?.toDate ? l.entry_time.toDate() : null;
            return (
              <div key={l.id} className={`attendance-log-row glass-card ${l.is_expired ? 'expired-entry' : ''}`}>
                <div className="attendance-log-avatar" style={{ background: color.bg, color: color.text }}>
                  {getInitials(l.member_name)}
                </div>
                <div className="attendance-log-info">
                  <div className="attendance-log-name">
                    {l.member_name}
                    {l.is_expired && <span className="attendance-expired-badge">Expired</span>}
                  </div>
                  <div className="attendance-log-plan">{l.plan_name || '—'}</div>
                </div>
                <div className="attendance-log-time">
                  {time ? time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                </div>
              </div>
            );
          })
        )}
      </div>
      <BottomNav role="owner" />
    </div>
  );
};

export default AttendanceLogs;
