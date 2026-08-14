import { useState, useEffect, useRef, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getGym, getGymMembersRealtime } from '../../firebase/firestore';
import { getAttendanceRange, formatDateKey } from '../../firebase/firestore-payments';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { getDaysRemaining, getPlanName } from '../../utils/helpers';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

const RANGES = ['This week', 'This month', '3 months', 'This year'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Analytics() {
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
    const unsub = getGymMembersRealtime(userDoc.gym_id, (list) => { setMembers(list); setLoading(false); });
    return () => unsub();
  }, [userDoc?.gym_id]);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    const now = new Date();
    let rangeFrom = new Date(now.getFullYear(), 0, 1);
    if (range === 'This week') { rangeFrom = new Date(now); rangeFrom.setDate(now.getDate() - 7); }
    else if (range === 'This month') { rangeFrom = new Date(now.getFullYear(), now.getMonth(), 1); }
    else if (range === '3 months') { rangeFrom = new Date(now); rangeFrom.setMonth(now.getMonth() - 3); }
    const q = query(collection(db, 'payments'), where('gym_id', '==', userDoc.gym_id), where('payment_date', '>=', Timestamp.fromDate(rangeFrom)), orderBy('payment_date', 'asc'));
    getDocs(q).then((snap) => setPayments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))).catch((err) => console.error(err));
  }, [userDoc?.gym_id, range]);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    getAttendanceRange(userDoc.gym_id, formatDateKey(start), formatDateKey(now)).then(setAttendanceLogs).catch((err) => console.error(err));
  }, [userDoc?.gym_id]);

  useEffect(() => {
    if (!revenueChartRef.current || payments.length === 0) return;
    if (chartInstances.current.revenue) chartInstances.current.revenue.destroy();
    const dateMap = {};
    payments.forEach((p) => {
      const d = p.payment_date?.toDate ? p.payment_date.toDate() : new Date(p.payment_date);
      const key = range === 'This year' ? d.toLocaleString('default', { month: 'short' }) : `${d.getDate()}/${d.getMonth() + 1}`;
      if (!dateMap[key]) dateMap[key] = { paid: 0, pending: 0 };
      if (p.status === 'paid') dateMap[key].paid += p.final_amount || 0; else dateMap[key].pending += p.pending_amount || 0;
    });
    const labels = Object.keys(dateMap);
    chartInstances.current.revenue = new Chart(revenueChartRef.current, {
      type: 'bar',
      data: { labels, datasets: [
        { label: 'Collected', data: labels.map((l) => dateMap[l].paid), backgroundColor: '#6C63C7', borderRadius: 6, borderSkipped: false },
        { label: 'Pending', data: labels.map((l) => dateMap[l].pending), backgroundColor: 'rgba(138,75,0,0.5)', borderRadius: 6, borderSkipped: false },
      ] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 9 } } }, y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 10 } } } } },
    });
  }, [payments, range]);

  useEffect(() => {
    if (!growthChartRef.current || members.length === 0) return;
    if (chartInstances.current.growth) chartInstances.current.growth.destroy();
    const sorted = [...members].sort((a, b) => (a.created_at?.toDate?.()?.getTime() || 0) - (b.created_at?.toDate?.()?.getTime() || 0));
    const dateCountMap = {};
    let cumulative = 0;
    sorted.forEach((m) => {
      const d = m.created_at?.toDate ? m.created_at.toDate() : new Date();
      cumulative++;
      dateCountMap[`${d.getDate()}/${d.getMonth() + 1}`] = cumulative;
    });
    chartInstances.current.growth = new Chart(growthChartRef.current, {
      type: 'line',
      data: { labels: Object.keys(dateCountMap), datasets: [{ label: 'Total members', data: Object.values(dateCountMap), borderColor: '#0F5E3C', backgroundColor: 'rgba(15,94,60,0.08)', fill: true, tension: 0.4, pointRadius: 2, pointHoverRadius: 5 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 9 } } }, y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 10 } } } } },
    });
  }, [members]);

  useEffect(() => {
    if (!planChartRef.current || members.length === 0 || !gym) return;
    if (chartInstances.current.plans) chartInstances.current.plans.destroy();
    const planCounts = {};
    const now = new Date();
    members.forEach((m) => {
      const exp = m.subscription_expiry?.toDate ? m.subscription_expiry.toDate() : null;
      if (exp && exp > now) { const name = getPlanName(gym, m.plan_id); planCounts[name] = (planCounts[name] || 0) + 1; }
    });
    const colors = ['#6C63C7', '#8A83D6', '#3E7CB1', '#2E8B6E', '#B5643C', '#4A438F', '#9089D8'];
    const labels = Object.keys(planCounts);
    const data = Object.values(planCounts);
    const total = data.reduce((s, v) => s + v, 0);
    chartInstances.current.plans = new Chart(planChartRef.current, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors.slice(0, labels.length), borderWidth: 0, hoverOffset: 8 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } },
      plugins: [{
        id: 'centerText',
        beforeDraw: (chart) => {
          const { ctx, width, height } = chart;
          ctx.save();
          ctx.font = '600 18px Manrope, Inter'; ctx.fillStyle = '#14152B'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(`${total}`, width / 2, height / 2 - 6);
          ctx.font = '400 10px Manrope, Inter'; ctx.fillStyle = '#5A5E76';
          ctx.fillText('active', width / 2, height / 2 + 10);
          ctx.restore();
        },
      }],
    });
  }, [members, gym]);

  const now = new Date();
  const totalMembers = members.length;
  const renewedMembers = members.filter((m) => m.renewal_history && m.renewal_history.length > 0).length;
  const retentionRate = totalMembers > 0 ? Math.round((renewedMembers / totalMembers) * 100) : 0;
  const retentionColor = retentionRate > 60 ? 'var(--gl2-success-fg)' : retentionRate > 40 ? 'var(--gl2-warning-fg)' : 'var(--gl2-danger-fg)';

  const churnedThisMonth = members.filter((m) => {
    const exp = m.subscription_expiry?.toDate ? m.subscription_expiry.toDate() : null;
    if (!exp) return false;
    return exp < now && exp.getMonth() === now.getMonth() && exp.getFullYear() === now.getFullYear()
      && (!m.renewal_history || m.renewal_history.length === 0 || !m.renewal_history.some((r) => {
        const rd = new Date(r.renewed_at);
        return rd.getMonth() === now.getMonth() && rd.getFullYear() === now.getFullYear();
      }));
  }).length;

  useEffect(() => {
    if (!retentionChartRef.current) return;
    if (chartInstances.current.retention) chartInstances.current.retention.destroy();
    chartInstances.current.retention = new Chart(retentionChartRef.current, {
      type: 'doughnut',
      data: { labels: ['Renewed', 'Churned'], datasets: [{ data: [renewedMembers, Math.max(0, totalMembers - renewedMembers)], backgroundColor: ['#0F5E3C', '#A62C22'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } },
    });
  }, [renewedMembers, totalMembers]);

  const hours = [];
  for (let h = 5; h <= 22; h++) hours.push(h);
  const heatmapData = {};
  DAYS.forEach((d) => { heatmapData[d] = {}; hours.forEach((h) => { heatmapData[d][h] = 0; }); });
  attendanceLogs.forEach((l) => {
    if (l.is_expired) return;
    const d = l.entry_time?.toDate ? l.entry_time.toDate() : null;
    if (!d) return;
    const dayName = DAY_NAMES[d.getDay()];
    const h = d.getHours();
    if (heatmapData[dayName] && heatmapData[dayName][h] !== undefined) heatmapData[dayName][h]++;
  });
  const getHeatColor = (count) => (count === 0 ? '#F0EFFA' : count <= 3 ? '#C9C5EC' : count <= 7 ? '#9089D8' : '#6C63C7');

  let busiestDay = '', busiestDayCount = 0, quietestDay = '', quietestDayCount = Infinity;
  let busiestHour = '', busiestHourCount = 0;
  DAYS.forEach((d) => {
    const total = hours.reduce((s, h) => s + (heatmapData[d]?.[h] || 0), 0);
    if (total > busiestDayCount) { busiestDayCount = total; busiestDay = d; }
    if (total < quietestDayCount) { quietestDayCount = total; quietestDay = d; }
  });
  hours.forEach((h) => {
    const total = DAYS.reduce((s, d) => s + (heatmapData[d]?.[h] || 0), 0);
    if (total > busiestHourCount) { busiestHourCount = total; busiestHour = `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? 'PM' : 'AM'}`; }
  });

  const expiringMembers = members.filter((m) => { const d = getDaysRemaining(m.subscription_expiry); return d > 0 && d <= 30; })
    .sort((a, b) => getDaysRemaining(a.subscription_expiry) - getDaysRemaining(b.subscription_expiry));

  const totalRevenue = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + (p.final_amount || 0), 0);
  const newThisMonth = members.filter((m) => { const d = m.created_at?.toDate ? m.created_at.toDate() : null; return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;

  useEffect(() => () => { Object.values(chartInstances.current).forEach((c) => c?.destroy()); }, []);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><div className="spinner spinner-primary" style={{ width: 32, height: 32 }} /></div>;

  return (
    <section data-screen-label="Analytics">
      <div className="gl2-page-header">
        <h1 className="gl2-page-title">Analytics</h1>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {RANGES.map((r) => <button key={r} type="button" className={`gl2-filter-chip ${range === r ? 'active' : ''}`} onClick={() => setRange(r)}>{r}</button>)}
      </div>

      <div className="gl2-grid-2">
        <div className="gl2-chart-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <p className="gl2-card-title">Revenue</p>
            <span style={{ fontWeight: 800 }}>₹{totalRevenue.toLocaleString('en-IN')}</span>
          </div>
          <div style={{ height: 220 }}><canvas ref={revenueChartRef} /></div>
        </div>

        <div className="gl2-chart-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <p className="gl2-card-title">Member growth</p>
            <span style={{ fontWeight: 800, color: 'var(--gl2-success-fg)' }}>+{newThisMonth} this month</span>
          </div>
          <div style={{ height: 220 }}><canvas ref={growthChartRef} /></div>
        </div>
      </div>

      <div className="gl2-chart-card" style={{ marginTop: 14 }}>
        <p className="gl2-card-title" style={{ marginBottom: 12 }}>Attendance patterns</p>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `36px repeat(${DAYS.length}, 1fr)`, gap: 2, minWidth: 420 }}>
            <div />
            {DAYS.map((d) => <div key={d} style={{ fontSize: 10, fontWeight: 700, textAlign: 'center', color: 'var(--gl2-muted)' }}>{d}</div>)}
            {hours.map((h) => (
              <Fragment key={h}>
                <div style={{ fontSize: 9, color: 'var(--gl2-muted)', textAlign: 'right', paddingRight: 4 }}>{h > 12 ? h - 12 : h}{h >= 12 ? 'p' : 'a'}</div>
                {DAYS.map((d) => (
                  <div key={`${d}-${h}`} title={`${heatmapData[d]?.[h] || 0} entries on ${d} at ${h}:00`} style={{ height: 15, borderRadius: 3, background: getHeatColor(heatmapData[d]?.[h] || 0) }} />
                ))}
              </Fragment>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20, marginTop: 14, flexWrap: 'wrap' }}>
          <div><p style={{ margin: 0, fontWeight: 800 }}>{busiestDay || '—'}</p><p style={{ margin: 0, fontSize: 12, color: 'var(--gl2-muted)' }}>Busiest day</p></div>
          <div><p style={{ margin: 0, fontWeight: 800 }}>{busiestHour || '—'}</p><p style={{ margin: 0, fontSize: 12, color: 'var(--gl2-muted)' }}>Busiest hour</p></div>
          <div><p style={{ margin: 0, fontWeight: 800 }}>{quietestDay || '—'}</p><p style={{ margin: 0, fontSize: 12, color: 'var(--gl2-muted)' }}>Quietest day</p></div>
        </div>
      </div>

      <div className="gl2-grid-2" style={{ marginTop: 14 }}>
        <div className="gl2-chart-card">
          <p className="gl2-card-title" style={{ marginBottom: 8 }}>Plan distribution</p>
          <div style={{ height: 200 }}><canvas ref={planChartRef} /></div>
        </div>

        <div className="gl2-chart-card">
          <p className="gl2-card-title" style={{ marginBottom: 8 }}>Member retention</p>
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 30, fontWeight: 800, color: retentionColor }}>{retentionRate}%</p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--gl2-muted)' }}>retention rate</p>
          </div>
          <div style={{ height: 130 }}><canvas ref={retentionChartRef} /></div>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
            <div><p style={{ margin: 0, fontWeight: 800 }}>{renewedMembers}</p><p style={{ margin: 0, fontSize: 12, color: 'var(--gl2-muted)' }}>Renewed</p></div>
            <div><p style={{ margin: 0, fontWeight: 800 }}>{churnedThisMonth}</p><p style={{ margin: 0, fontSize: 12, color: 'var(--gl2-muted)' }}>Churned this month</p></div>
          </div>
        </div>
      </div>

      <div className="gl2-card" style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <p className="gl2-card-title">Expiring soon</p>
          <span style={{ fontWeight: 800 }}>{expiringMembers.length} members</span>
        </div>
        {expiringMembers.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 20, color: 'var(--gl2-muted)', fontSize: 13.5 }}>No members expiring in the next 30 days 🎉</p>
        ) : (
          <div className="gl2-list">
            {expiringMembers.map((m) => {
              const daysLeft = getDaysRemaining(m.subscription_expiry);
              const color = daysLeft <= 3 ? 'var(--gl2-danger-fg)' : daysLeft <= 7 ? 'var(--gl2-warning-fg)' : 'var(--gl2-muted)';
              return (
                <div key={m.id} className="gl2-row">
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{m.name}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--gl2-muted)' }}>{getPlanName(gym, m.plan_id)}</p>
                  </div>
                  <span style={{ fontWeight: 800, color }}>{daysLeft}d</span>
                  <button type="button" className="gl2-btn gl2-btn-secondary" onClick={() => navigate(`/owner/members/${m.id}`)}>Renew</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
