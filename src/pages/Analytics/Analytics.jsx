import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getGym, getGymMembersRealtime } from '../../firebase/firestore';
import { getPaymentsRealtime, getAttendanceRange, formatDateKey } from '../../firebase/firestore-payments';
import { sendWhatsApp } from '../../utils/whatsapp';
import { formatDate, getDaysRemaining, getPlanName } from '../../utils/helpers';
import { Chart, registerables } from 'chart.js';
import BottomNav from '../../components/BottomNav';
import './Analytics.css';

Chart.register(...registerables);

const RANGES = ['This week', 'This month', '3 months', 'This year'];

const Analytics = () => {
  const navigate = useNavigate();
  const { userDoc } = useAuth();

  const [gym, setGym] = useState(null);
  const [members, setMembers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [range, setRange] = useState('This month');
  const [loading, setLoading] = useState(true);
  const [attendanceLogs, setAttendanceLogs] = useState([]);

  const revenueChartRef = useRef(null);
  const growthChartRef = useRef(null);
  const planChartRef = useRef(null);
  const retentionChartRef = useRef(null);
  const chartInstances = useRef({});

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    getGym(userDoc.gym_id).then(setGym);
    const unsub1 = getGymMembersRealtime(userDoc.gym_id, (list) => {
      setMembers(list);
      setLoading(false);
    });
    const unsub2 = getPaymentsRealtime(userDoc.gym_id, setPayments);
    return () => { unsub1(); unsub2(); };
  }, [userDoc?.gym_id]);

  // Fetch attendance data for heatmap
  useEffect(() => {
    if (!userDoc?.gym_id) return;
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    getAttendanceRange(userDoc.gym_id, formatDateKey(start), formatDateKey(now))
      .then(setAttendanceLogs)
      .catch(console.error);
  }, [userDoc?.gym_id]);

  // Range helpers
  const getRangeStart = () => {
    const now = new Date();
    if (range === 'This week') { const d = new Date(now); d.setDate(d.getDate() - 7); return d; }
    if (range === 'This month') { return new Date(now.getFullYear(), now.getMonth(), 1); }
    if (range === '3 months') { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d; }
    return new Date(now.getFullYear(), 0, 1);
  };

  const rangeStart = getRangeStart();
  const filteredPayments = payments.filter(p => {
    const d = p.payment_date?.toDate ? p.payment_date.toDate() : new Date(p.payment_date);
    return d >= rangeStart;
  });

  // ── CHART 1: Revenue ──
  useEffect(() => {
    if (!revenueChartRef.current || filteredPayments.length === 0) return;
    if (chartInstances.current.revenue) chartInstances.current.revenue.destroy();

    const dateMap = {};
    filteredPayments.forEach(p => {
      const d = p.payment_date?.toDate ? p.payment_date.toDate() : new Date(p.payment_date);
      const key = range === 'This year'
        ? d.toLocaleString('default', { month: 'short' })
        : `${d.getDate()}/${d.getMonth() + 1}`;
      if (!dateMap[key]) dateMap[key] = { paid: 0, pending: 0 };
      if (p.status === 'paid') dateMap[key].paid += p.final_amount || 0;
      else dateMap[key].pending += p.pending_amount || 0;
    });

    const labels = Object.keys(dateMap);
    chartInstances.current.revenue = new Chart(revenueChartRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Collected', data: labels.map(l => dateMap[l].paid), backgroundColor: 'rgba(83, 74, 183, 0.7)', borderRadius: 6, borderSkipped: false },
          { label: 'Pending', data: labels.map(l => dateMap[l].pending), backgroundColor: 'rgba(239, 159, 39, 0.6)', borderRadius: 6, borderSkipped: false },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 9 } } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 10 } } },
        },
      },
    });
  }, [filteredPayments, range]);

  // ── CHART 2: Member Growth ──
  useEffect(() => {
    if (!growthChartRef.current || members.length === 0) return;
    if (chartInstances.current.growth) chartInstances.current.growth.destroy();

    const sorted = [...members].sort((a, b) => {
      const aT = a.created_at?.toDate ? a.created_at.toDate().getTime() : 0;
      const bT = b.created_at?.toDate ? b.created_at.toDate().getTime() : 0;
      return aT - bT;
    });

    const dateCountMap = {};
    let cumulative = 0;
    sorted.forEach(m => {
      const d = m.created_at?.toDate ? m.created_at.toDate() : new Date();
      const key = `${d.getDate()}/${d.getMonth() + 1}`;
      cumulative++;
      dateCountMap[key] = cumulative;
    });

    const labels = Object.keys(dateCountMap);
    const data = Object.values(dateCountMap);

    chartInstances.current.growth = new Chart(growthChartRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Total members',
          data,
          borderColor: '#1D9E75',
          backgroundColor: 'rgba(29, 158, 117, 0.08)',
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointHoverRadius: 5,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 9 } } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 10 } } },
        },
      },
    });
  }, [members]);

  // ── CHART 4: Plan Popularity ──
  useEffect(() => {
    if (!planChartRef.current || members.length === 0 || !gym) return;
    if (chartInstances.current.plans) chartInstances.current.plans.destroy();

    const planCounts = {};
    const now = new Date();
    members.forEach(m => {
      const exp = m.subscription_expiry?.toDate ? m.subscription_expiry.toDate() : null;
      if (exp && exp > now) {
        const name = getPlanName(gym, m.plan_id);
        planCounts[name] = (planCounts[name] || 0) + 1;
      }
    });

    const colors = ['#534AB7', '#1D9E75', '#EF9F27', '#E24B4A', '#378ADD', '#9333ea', '#f97316'];
    const labels = Object.keys(planCounts);
    const data = Object.values(planCounts);
    const total = data.reduce((s, v) => s + v, 0);

    chartInstances.current.plans = new Chart(planChartRef.current, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors.slice(0, labels.length),
          borderWidth: 0,
          hoverOffset: 8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
        },
      },
      plugins: [{
        id: 'centerText',
        beforeDraw: (chart) => {
          const { ctx, width, height } = chart;
          ctx.save();
          ctx.font = '600 18px Inter';
          ctx.fillStyle = '#1a1a2e';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${total}`, width / 2, height / 2 - 6);
          ctx.font = '400 10px Inter';
          ctx.fillStyle = '#7a7a9a';
          ctx.fillText('active', width / 2, height / 2 + 10);
          ctx.restore();
        },
      }],
    });
  }, [members, gym]);

  // ── CHART 5: Retention ──
  const now = new Date();
  const totalMembers = members.length;
  const renewedMembers = members.filter(m => m.renewal_history && m.renewal_history.length > 0).length;
  const retentionRate = totalMembers > 0 ? Math.round((renewedMembers / totalMembers) * 100) : 0;
  const retentionClass = retentionRate > 60 ? 'good' : retentionRate > 40 ? 'medium' : 'bad';

  const churnedThisMonth = members.filter(m => {
    const exp = m.subscription_expiry?.toDate ? m.subscription_expiry.toDate() : null;
    if (!exp) return false;
    return exp < now && exp.getMonth() === now.getMonth() && exp.getFullYear() === now.getFullYear()
      && (!m.renewal_history || m.renewal_history.length === 0 || !m.renewal_history.some(r => {
        const rd = new Date(r.renewed_at);
        return rd.getMonth() === now.getMonth() && rd.getFullYear() === now.getFullYear();
      }));
  }).length;

  useEffect(() => {
    if (!retentionChartRef.current) return;
    if (chartInstances.current.retention) chartInstances.current.retention.destroy();

    chartInstances.current.retention = new Chart(retentionChartRef.current, {
      type: 'doughnut',
      data: {
        labels: ['Renewed', 'Churned'],
        datasets: [{
          data: [renewedMembers, Math.max(0, totalMembers - renewedMembers)],
          backgroundColor: ['#1D9E75', '#E24B4A'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: { legend: { display: false } },
      },
    });
  }, [renewedMembers, totalMembers]);

  // ── CHART 3: Attendance Heatmap ──
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hours = [];
  for (let h = 5; h <= 22; h++) hours.push(h);

  const heatmapData = {};
  days.forEach(d => { heatmapData[d] = {}; hours.forEach(h => { heatmapData[d][h] = 0; }); });

  attendanceLogs.forEach(l => {
    if (l.is_expired) return;
    const d = l.entry_time?.toDate ? l.entry_time.toDate() : null;
    if (!d) return;
    const dayIdx = d.getDay();
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayIdx];
    const h = d.getHours();
    if (heatmapData[dayName] && heatmapData[dayName][h] !== undefined) {
      heatmapData[dayName][h]++;
    }
  });

  const getHeatColor = (count) => {
    if (count === 0) return 'rgba(83, 74, 183, 0.05)';
    if (count <= 3) return 'rgba(83, 74, 183, 0.2)';
    if (count <= 7) return 'rgba(83, 74, 183, 0.5)';
    return 'rgba(83, 74, 183, 0.9)';
  };

  // Busiest/quietest
  let busiestDay = '', busiestDayCount = 0, quietestDay = '', quietestDayCount = Infinity;
  let busiestHour = '', busiestHourCount = 0;
  days.forEach(d => {
    const total = hours.reduce((s, h) => s + (heatmapData[d]?.[h] || 0), 0);
    if (total > busiestDayCount) { busiestDayCount = total; busiestDay = d; }
    if (total < quietestDayCount) { quietestDayCount = total; quietestDay = d; }
  });
  hours.forEach(h => {
    const total = days.reduce((s, d) => s + (heatmapData[d]?.[h] || 0), 0);
    if (total > busiestHourCount) { busiestHourCount = total; busiestHour = `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? 'PM' : 'AM'}`; }
  });

  // ── CHART 6: Expiring Soon ──
  const expiringMembers = members
    .filter(m => {
      const days = getDaysRemaining(m.subscription_expiry);
      return days > 0 && days <= 30;
    })
    .sort((a, b) => getDaysRemaining(a.subscription_expiry) - getDaysRemaining(b.subscription_expiry));

  // Revenue summary
  const totalRevenue = filteredPayments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.final_amount || 0), 0);
  const newThisMonth = members.filter(m => {
    const d = m.created_at?.toDate ? m.created_at.toDate() : null;
    return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  // Cleanup chart instances on unmount
  useEffect(() => {
    return () => {
      Object.values(chartInstances.current).forEach(c => { if (c) c.destroy(); });
    };
  }, []);

  if (loading) {
    return (
      <div className="screen analytics-screen">
        <div className="screen-content spinner-center">
          <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="screen analytics-screen">
      <div className="screen-content">
        <div className="top-bar">
          <h1 className="top-bar-title">Analytics</h1>
          <div style={{ width: 40 }} />
        </div>

        {/* Range selector */}
        <div className="analytics-range-row">
          {RANGES.map(r => (
            <button key={r} className={`analytics-range-pill ${range === r ? 'active' : ''}`} onClick={() => setRange(r)}>
              {r}
            </button>
          ))}
        </div>

        {/* CHART 1: Revenue */}
        <div className="analytics-card glass-card">
          <div className="analytics-card-header">
            <span className="analytics-card-title">Revenue</span>
            <span className="analytics-card-total">₹{totalRevenue.toLocaleString('en-IN')}</span>
          </div>
          <div className="analytics-chart-container">
            <canvas ref={revenueChartRef} />
          </div>
        </div>

        {/* CHART 2: Member Growth */}
        <div className="analytics-card glass-card">
          <div className="analytics-card-header">
            <span className="analytics-card-title">Member growth</span>
            <span className="analytics-card-total">+{newThisMonth} this month</span>
          </div>
          <div className="analytics-chart-container">
            <canvas ref={growthChartRef} />
          </div>
        </div>

        {/* CHART 3: Attendance Heatmap */}
        <div className="analytics-card glass-card">
          <div className="analytics-card-header">
            <span className="analytics-card-title">Attendance patterns</span>
          </div>
          <div className="heatmap-container">
            <div style={{ display: 'grid', gridTemplateColumns: `40px repeat(${days.length}, 1fr)`, gap: 2 }}>
              {/* Header row */}
              <div />
              {days.map(d => <div key={d} className="heatmap-label">{d}</div>)}

              {/* Data rows */}
              {hours.filter(h => h >= 5 && h <= 22).map(h => (
                <React.Fragment key={h}>
                  <div className="heatmap-row-label">{h > 12 ? h - 12 : h}{h >= 12 ? 'p' : 'a'}</div>
                  {days.map(d => (
                    <div
                      key={`${d}-${h}`}
                      className="heatmap-cell"
                      style={{ background: getHeatColor(heatmapData[d]?.[h] || 0) }}
                      title={`${heatmapData[d]?.[h] || 0} entries on ${d} at ${h}:00`}
                    />
                  ))}
                </React.Fragment>
              ))}
            </div>
            <div className="heatmap-legend">
              <div className="heatmap-legend-item"><div className="heatmap-legend-box" style={{ background: 'rgba(83,74,183,0.05)' }} />0</div>
              <div className="heatmap-legend-item"><div className="heatmap-legend-box" style={{ background: 'rgba(83,74,183,0.2)' }} />1-3</div>
              <div className="heatmap-legend-item"><div className="heatmap-legend-box" style={{ background: 'rgba(83,74,183,0.5)' }} />4-7</div>
              <div className="heatmap-legend-item"><div className="heatmap-legend-box" style={{ background: 'rgba(83,74,183,0.9)' }} />8+</div>
            </div>
          </div>
          <div className="analytics-stats-below">
            <div className="analytics-stat-item">
              <div className="analytics-stat-item-value">{busiestDay || '—'}</div>
              <div className="analytics-stat-item-label">Busiest day</div>
            </div>
            <div className="analytics-stat-item">
              <div className="analytics-stat-item-value">{busiestHour || '—'}</div>
              <div className="analytics-stat-item-label">Busiest hour</div>
            </div>
            <div className="analytics-stat-item">
              <div className="analytics-stat-item-value">{quietestDay || '—'}</div>
              <div className="analytics-stat-item-label">Quietest day</div>
            </div>
          </div>
        </div>

        {/* CHART 4: Plan Popularity */}
        <div className="analytics-card glass-card">
          <div className="analytics-card-header">
            <span className="analytics-card-title">Plan distribution</span>
          </div>
          <div className="analytics-chart-container" style={{ height: 200 }}>
            <canvas ref={planChartRef} />
          </div>
        </div>

        {/* CHART 5: Retention Rate */}
        <div className="analytics-card glass-card">
          <div className="analytics-card-header">
            <span className="analytics-card-title">Member retention</span>
          </div>
          <div className="retention-center">
            <div className={`retention-rate ${retentionClass}`}>{retentionRate}%</div>
            <div className="retention-label">retention rate</div>
          </div>
          <div className="analytics-chart-container" style={{ height: 150 }}>
            <canvas ref={retentionChartRef} />
          </div>
          <div className="analytics-stats-below">
            <div className="analytics-stat-item">
              <div className="analytics-stat-item-value">{renewedMembers}</div>
              <div className="analytics-stat-item-label">Renewed</div>
            </div>
            <div className="analytics-stat-item">
              <div className="analytics-stat-item-value">{churnedThisMonth}</div>
              <div className="analytics-stat-item-label">Churned this month</div>
            </div>
          </div>
        </div>

        {/* CHART 6: Expiring Soon */}
        <div className="analytics-card glass-card">
          <div className="analytics-card-header">
            <span className="analytics-card-title">Expiring soon</span>
            <span className="analytics-card-total">{expiringMembers.length} members</span>
          </div>
          {expiringMembers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
              No members expiring in the next 30 days 🎉
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="expiring-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Plan</th>
                    <th>Days</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringMembers.map(m => {
                    const daysLeft = getDaysRemaining(m.subscription_expiry);
                    const rowClass = daysLeft <= 3 ? 'expiring-row-urgent' : daysLeft <= 7 ? 'expiring-row-warning' : '';
                    const badgeClass = daysLeft <= 3 ? 'urgent' : daysLeft <= 7 ? 'warning' : 'normal';
                    return (
                      <tr key={m.id} className={rowClass}>
                        <td style={{ fontWeight: 500 }}>{m.name}</td>
                        <td>{getPlanName(gym, m.plan_id)}</td>
                        <td><span className={`expiring-days-badge ${badgeClass}`}>{daysLeft}d</span></td>
                        <td>
                          <button
                            className="expiring-action-btn renew"
                            onClick={() => navigate(`/owner/members/${m.id}`)}
                          >
                            Renew
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <BottomNav activeTab="analytics" role="owner" />
    </div>
  );
};



export default Analytics;
