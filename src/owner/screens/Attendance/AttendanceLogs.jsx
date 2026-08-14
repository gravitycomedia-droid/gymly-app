import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { getAttendanceSessions, getAccessDeniedLogs } from '../../../firebase/firestore-kiosk';
import { db } from '../../../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { getInitials } from '../../../utils/helpers';
import { getAvatarColor } from '../../lib/avatarColor';
import useLiveOccupancy from '../../../hooks/useLiveOccupancy';
import EmptyState from '../../primitives/EmptyState';
import PageSkeleton from '../../primitives/PageSkeleton';

const getDateRange = (period) => {
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  if (period === '7d') start.setDate(start.getDate() - 6);
  else if (period === '30d') start.setDate(start.getDate() - 29);
  else if (period === '90d') start.setDate(start.getDate() - 89);
  return { start, end };
};

const formatDuration = (mins) => (!mins ? '—' : mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`);
const formatTime = (ts) => (!ts ? '—' : (ts.toDate ? ts.toDate() : new Date(ts)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
const formatRelative = (ts) => {
  if (!ts) return '—';
  const days = Math.floor((Date.now() - (ts.toDate ? ts.toDate() : new Date(ts)).getTime()) / 86400000);
  return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days}d ago`;
};

const buildHeatmap = (sessions) => {
  const matrix = Array(7).fill(null).map(() => Array(24).fill(0));
  sessions.forEach((s) => {
    const entry = s.entryTime?.toDate ? s.entryTime.toDate() : null;
    if (!entry) return;
    const exit = s.exitTime?.toDate ? s.exitTime.toDate() : new Date();
    const day = entry.getDay();
    for (let h = entry.getHours(); h <= Math.min(exit.getHours(), 23); h++) matrix[day][h]++;
  });
  return matrix;
};
const heatColor = (val, max) => {
  if (val === 0 || max === 0) return '#F0EFFA';
  const pct = val / max;
  return pct < 0.25 ? '#C9C5EC' : pct < 0.5 ? '#9089D8' : pct < 0.75 ? '#6C63C7' : '#4A438F';
};
const calcStreak = (sessions, memberId) => {
  const dates = sessions.filter((s) => s.memberId === memberId && s.status === 'completed')
    .map((s) => s.entryTime?.toDate ? s.entryTime.toDate().toDateString() : null)
    .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).sort();
  if (dates.length === 0) return 0;
  let streak = 1, maxStreak = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = (new Date(dates[i]) - new Date(dates[i - 1])) / 86400000;
    if (diff === 1) { streak++; maxStreak = Math.max(maxStreak, streak); } else streak = 1;
  }
  const last = new Date(dates[dates.length - 1]);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const isActive = last.toDateString() === today.toDateString() || last.toDateString() === yesterday.toDateString();
  return isActive ? Math.max(streak, maxStreak) : 0;
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DISPLAY_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

function OccupancyHeatmap({ sessions }) {
  const [tooltip, setTooltip] = useState(null);
  const matrix = buildHeatmap(sessions);
  const max = Math.max(...matrix.flat());
  const busiest = { day: 0, hour: 0, val: 0 };
  matrix.forEach((row, d) => row.forEach((v, h) => { if (v > busiest.val) { busiest.val = v; busiest.day = d; busiest.hour = h; } }));

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `36px repeat(${DISPLAY_HOURS.length}, 1fr)`, gap: 2, minWidth: 560 }}>
          <div />
          {DISPLAY_HOURS.map((h) => <div key={h} style={{ fontSize: 9, textAlign: 'center', color: 'var(--gl2-muted)' }}>{h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`}</div>)}
          {DAYS.map((day, d) => (
            <Fragment key={day}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gl2-muted)', display: 'flex', alignItems: 'center' }}>{day}</div>
              {DISPLAY_HOURS.map((h) => (
                <div key={`${d}-${h}`} style={{ height: 17, borderRadius: 3, background: heatColor(matrix[d][h], max), cursor: 'default' }}
                  onMouseEnter={(e) => setTooltip({ day, hour: h, val: matrix[d][h], x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setTooltip(null)} />
              ))}
            </Fragment>
          ))}
        </div>
      </div>
      {tooltip && (
        <div style={{ position: 'fixed', top: tooltip.y - 40, left: tooltip.x, background: 'var(--gl2-ink)', color: '#fff', padding: '4px 9px', borderRadius: 8, fontSize: 12, zIndex: 50, pointerEvents: 'none' }}>
          {tooltip.day} {tooltip.hour > 12 ? `${tooltip.hour - 12}pm` : `${tooltip.hour}am`}: {tooltip.val} members
        </div>
      )}
      {busiest.val > 0 && <p style={{ marginTop: 12, fontSize: 13, color: 'var(--gl2-muted)' }}>🔥 Busiest time: <strong style={{ color: 'var(--gl2-ink)' }}>{DAYS[busiest.day]} {busiest.hour > 12 ? `${busiest.hour - 12}pm` : `${busiest.hour}am`}</strong></p>}
    </div>
  );
}

export default function AttendanceLogs() {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const gymId = userDoc?.gym_id;

  const [period, setPeriod] = useState('today');
  const [sessions, setSessions] = useState([]);
  const [deniedLogs, setDeniedLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logSearch, setLogSearch] = useState('');
  const [logFilter, setLogFilter] = useState('All');
  const [logPage, setLogPage] = useState(1);
  const { occupancy } = useLiveOccupancy(gymId);
  const searchTimer = useRef(null);
  const LOG_PAGE_SIZE = 25;

  const load = useCallback(async () => {
    if (!gymId) return;
    setLoading(true);
    try {
      const { start, end } = getDateRange(period);
      const [sess, denied] = await Promise.all([getAttendanceSessions(gymId, start, end), getAccessDeniedLogs(gymId, start, end)]);
      const missingIds = [...new Set(sess.filter((s) => !s.memberName).map((s) => s.memberId).filter(Boolean))];
      if (missingIds.length > 0) {
        const nameMap = {};
        await Promise.all(missingIds.map(async (uid) => {
          try { const snap = await getDoc(doc(db, 'users', uid)); nameMap[uid] = snap.exists() ? (snap.data().name || uid) : uid; } catch { nameMap[uid] = uid; }
        }));
        setSessions(sess.map((s) => (s.memberName ? s : { ...s, memberName: nameMap[s.memberId] || s.memberId })));
      } else {
        setSessions(sess);
      }
      setDeniedLogs(denied);
    } catch (err) {
      console.error('Attendance load error:', err);
    } finally {
      setLoading(false);
    }
  }, [gymId, period]);

  useEffect(() => { load(); }, [load]);

  const completedSessions = sessions.filter((s) => s.status === 'completed');
  const uniqueMembers = new Set(sessions.map((s) => s.memberId)).size;
  const totalDuration = completedSessions.reduce((a, s) => a + (s.durationMinutes || 0), 0);
  const avgDuration = completedSessions.length ? Math.round(totalDuration / completedSessions.length) : 0;

  const memberVisits = {}, memberDuration = {}, memberNames = {}, memberLast = {};
  sessions.forEach((s) => {
    const id = s.memberId;
    memberVisits[id] = (memberVisits[id] || 0) + 1;
    memberDuration[id] = (memberDuration[id] || 0) + (s.durationMinutes || 0);
    if (!memberNames[id]) memberNames[id] = s.memberName || id;
    const t = s.entryTime?.toDate ? s.entryTime.toDate() : null;
    if (t && (!memberLast[id] || t > memberLast[id])) memberLast[id] = t;
  });
  const topMembers = Object.entries(memberVisits).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([id, visits]) => ({ id, visits, name: memberNames[id], avgDuration: Math.round(memberDuration[id] / visits), lastVisit: memberLast[id] }));
  const maxVisits = topMembers[0]?.visits || 1;

  const streaks = Object.keys(memberVisits).map((id) => ({ id, name: memberNames[id], streak: calcStreak(sessions, id) }))
    .filter((m) => m.streak >= 3).sort((a, b) => b.streak - a.streak).slice(0, 10);
  const maxStreak = streaks[0]?.streak || 1;

  const searchTerm = logSearch.toLowerCase();
  const logRows = [...sessions.map((s) => ({ ...s, _type: 'session' })), ...deniedLogs.map((d) => ({ ...d, _type: 'denied', status: 'denied' }))]
    .sort((a, b) => {
      const ta = (a.entryTime || a.attemptTime)?.toDate ? (a.entryTime || a.attemptTime).toDate() : new Date(0);
      const tb = (b.entryTime || b.attemptTime)?.toDate ? (b.entryTime || b.attemptTime).toDate() : new Date(0);
      return tb - ta;
    })
    .filter((r) => (logFilter === 'Inside' ? r.status === 'inside' : logFilter === 'Completed' ? r.status === 'completed' : logFilter === 'Denied' ? r._type === 'denied' : true))
    .filter((r) => !searchTerm || (r.memberName || r.memberId || '').toLowerCase().includes(searchTerm));

  const totalPages = Math.max(1, Math.ceil(logRows.length / LOG_PAGE_SIZE));
  const paginatedRows = logRows.slice((logPage - 1) * LOG_PAGE_SIZE, logPage * LOG_PAGE_SIZE);

  const handleSearchChange = (val) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setLogSearch(val); setLogPage(1); }, 300);
  };

  return (
    <section data-screen-label="Attendance analytics">
      <div className="gl2-page-header">
        <h1 className="gl2-page-title">Attendance analytics</h1>
        <button type="button" className="gl2-btn gl2-btn-secondary" onClick={() => navigate('/owner/kiosk-devices')}>Kiosk devices</button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {['today', '7d', '30d', '90d'].map((p) => (
          <button key={p} type="button" className={`gl2-filter-chip ${period === p ? 'active' : ''}`} onClick={() => { setPeriod(p); setLogPage(1); }}>
            {p === 'today' ? 'Today' : p === '7d' ? '7 days' : p === '30d' ? '30 days' : '3 months'}
          </button>
        ))}
      </div>

      {loading ? (
        <PageSkeleton variant="kpis" rows={5} />
      ) : (
        <>
          <div className="gl2-kpi-grid">
            <div className="gl2-kpi-tile"><p className="gl2-kpi-label">Total entries</p><p className="gl2-kpi-value">{sessions.length}</p></div>
            <div className="gl2-kpi-tile"><p className="gl2-kpi-label">Unique members</p><p className="gl2-kpi-value">{uniqueMembers}</p></div>
            <div className="gl2-kpi-tile"><p className="gl2-kpi-label">Live now</p><p className="gl2-kpi-value" style={{ color: 'var(--gl2-primary-deep)' }}>{occupancy}</p></div>
            <div className="gl2-kpi-tile"><p className="gl2-kpi-label">Avg duration</p><p className="gl2-kpi-value">{formatDuration(avgDuration)}</p></div>
            <div className="gl2-kpi-tile"><p className="gl2-kpi-label">Denied attempts</p><p className="gl2-kpi-value" style={{ color: 'var(--gl2-danger-fg)' }}>{deniedLogs.length}</p></div>
            <div className="gl2-kpi-tile"><p className="gl2-kpi-label">Top streak</p><p className="gl2-kpi-value">{streaks[0]?.streak || 0}</p>{streaks[0] && <p className="gl2-kpi-delta">{streaks[0].name}</p>}</div>
          </div>

          {sessions.length > 0 && (
            <div className="gl2-card" style={{ marginBottom: 14 }}>
              <p className="gl2-card-title" style={{ marginBottom: 4 }}>Occupancy heatmap</p>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--gl2-muted)' }}>When is your gym busiest?</p>
              <OccupancyHeatmap sessions={sessions} />
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <p className="gl2-eyebrow">Attendance log</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <input className="gl2-input" style={{ flex: 1, minWidth: 180 }} placeholder="Search member name…" onChange={(e) => handleSearchChange(e.target.value)} />
              {['All', 'Inside', 'Completed', 'Denied'].map((f) => (
                <button key={f} type="button" className={`gl2-filter-chip ${logFilter === f ? 'active' : ''}`} onClick={() => { setLogFilter(f); setLogPage(1); }}>{f}</button>
              ))}
            </div>
            <div className="gl2-list">
              {paginatedRows.length === 0 ? <EmptyState title="No records found" /> : paginatedRows.map((row, i) => {
                const name = row.memberName || row.memberId || 'Unknown';
                const entryTime = row.entryTime || row.attemptTime;
                return (
                  <div key={row.id || i} className="gl2-row" style={{ flexWrap: 'wrap' }}>
                    <span className="gl2-avatar" style={{ background: getAvatarColor(name) }}>{getInitials(name)}</span>
                    <div style={{ flex: 1, minWidth: 130 }}><p style={{ margin: 0, fontWeight: 700 }}>{name}</p></div>
                    <span style={{ fontSize: 13, color: 'var(--gl2-muted)' }}>In {formatTime(entryTime)}</span>
                    <span style={{ fontSize: 13, color: 'var(--gl2-muted)' }}>Out {row.exitTime ? formatTime(row.exitTime) : '—'}</span>
                    <span style={{ fontSize: 13, color: 'var(--gl2-muted)' }}>{formatDuration(row.durationMinutes)}</span>
                    <span className={`gl2-tag ${row.status === 'inside' ? 'gl2-tag-active' : row.status === 'completed' ? 'gl2-tag-neutral' : 'gl2-tag-expired'}`}>
                      {row.status === 'inside' ? 'Inside' : row.status === 'completed' ? 'Done' : 'Denied'}
                    </span>
                  </div>
                );
              })}
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 12 }}>
                  <button type="button" className="gl2-icon-btn" disabled={logPage === 1} onClick={() => setLogPage((p) => p - 1)}>←</button>
                  <span style={{ fontSize: 13, color: 'var(--gl2-muted)' }}>{logPage} / {totalPages}</span>
                  <button type="button" className="gl2-icon-btn" disabled={logPage === totalPages} onClick={() => setLogPage((p) => p + 1)}>→</button>
                </div>
              )}
            </div>
          </div>

          {topMembers.length > 0 && (
            <div className="gl2-card" style={{ marginBottom: 14 }}>
              <p className="gl2-card-title" style={{ marginBottom: 10 }}>Most active members</p>
              {topMembers.map((m, i) => (
                <div key={m.id} className="gl2-row">
                  <span style={{ width: 24, fontWeight: 800, color: i < 3 ? 'var(--gl2-primary)' : 'var(--gl2-muted)' }}>#{i + 1}</span>
                  <span className="gl2-avatar" style={{ width: 36, height: 36, fontSize: 12, background: getAvatarColor(m.name) }}>{getInitials(m.name)}</span>
                  <div style={{ flex: 1, minWidth: 130 }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{m.name}</p>
                    <p style={{ margin: '2px 0 4px', fontSize: 12, color: 'var(--gl2-muted)' }}>Avg {formatDuration(m.avgDuration)} · Last {formatRelative(m.lastVisit)}</p>
                    <div className="gl2-progress-track"><div className="gl2-progress-fill" style={{ width: `${(m.visits / maxVisits) * 100}%` }} /></div>
                  </div>
                  <span style={{ fontWeight: 800 }}>{m.visits}</span>
                </div>
              ))}
            </div>
          )}

          {streaks.length > 0 && (
            <div className="gl2-card">
              <p className="gl2-card-title" style={{ marginBottom: 10 }}>Active streaks</p>
              {streaks.map((m) => (
                <div key={m.id} className="gl2-row">
                  <span style={{ fontSize: 16 }}>{m.streak >= 7 ? '🔥' : '⭐'}</span>
                  <span className="gl2-avatar" style={{ width: 36, height: 36, fontSize: 12, background: getAvatarColor(m.name) }}>{getInitials(m.name)}</span>
                  <div style={{ flex: 1, minWidth: 130 }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{m.name}</p>
                    <div className="gl2-progress-track" style={{ marginTop: 4 }}><div className="gl2-progress-fill" style={{ width: `${(m.streak / maxStreak) * 100}%` }} /></div>
                  </div>
                  <span style={{ fontWeight: 800 }}>{m.streak}d</span>
                </div>
              ))}
            </div>
          )}

          {sessions.length === 0 && deniedLogs.length === 0 && (
            <EmptyState
              title="No attendance data yet"
              sub="Set up kiosk devices so members can scan in and out. Analytics will appear here."
              action={<button type="button" className="gl2-btn gl2-btn-primary" onClick={() => navigate('/owner/kiosk-devices')}>Set up kiosk devices</button>}
            />
          )}
        </>
      )}
    </section>
  );
}
