import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getAttendanceSessions, getAccessDeniedLogs } from '../../firebase/firestore-kiosk';
import { db } from '../../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { getInitials, getAvatarColor } from '../../utils/helpers';
import useLiveOccupancy from '../../hooks/useLiveOccupancy';
import './AttendanceAnalytics.css';
import './Attendance.css';

// ─── Date range helpers ───────────────────────────────────────────
const getDateRange = (period) => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  switch (period) {
    case '7d': start.setDate(start.getDate() - 6); break;
    case '30d': start.setDate(start.getDate() - 29); break;
    case '90d': start.setDate(start.getDate() - 89); break;
    default: break; // today
  }
  return { start, end };
};

const formatDuration = (mins) => {
  if (!mins) return '—';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

const formatTime = (ts) => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

const formatRelative = (ts) => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
};

// ─── Heatmap calculation ──────────────────────────────────────────
const buildHeatmap = (sessions) => {
  const matrix = Array(7).fill(null).map(() => Array(24).fill(0));
  sessions.forEach((s) => {
    const entry = s.entryTime?.toDate ? s.entryTime.toDate() : null;
    if (!entry) return;
    const exit = s.exitTime?.toDate ? s.exitTime.toDate() : new Date();
    const day = entry.getDay();
    const startHour = entry.getHours();
    const endHour = Math.min(exit.getHours(), 23);
    for (let h = startHour; h <= endHour; h++) matrix[day][h]++;
  });
  return matrix;
};

const heatColor = (val, max) => {
  if (val === 0 || max === 0) return '#f0edef';
  const pct = val / max;
  if (pct < 0.2) return '#d4cffe';
  if (pct < 0.45) return '#9b91e8';
  if (pct < 0.7) return '#6b5fd0';
  return '#534ab7';
};

// ─── Streak calculation ───────────────────────────────────────────
const calcStreak = (sessions, memberId) => {
  const dates = sessions
    .filter((s) => s.memberId === memberId && s.status === 'completed')
    .map((s) => s.entryTime?.toDate ? s.entryTime.toDate().toDateString() : null)
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort();

  if (dates.length === 0) return 0;
  let streak = 1, maxStreak = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = (new Date(dates[i]) - new Date(dates[i - 1])) / 86400000;
    if (diff === 1) { streak++; maxStreak = Math.max(maxStreak, streak); }
    else streak = 1;
  }
  const last = new Date(dates[dates.length - 1]);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const isActive = last.toDateString() === today.toDateString() || last.toDateString() === yesterday.toDateString();
  return isActive ? Math.max(streak, maxStreak) : 0;
};

// ─── Heatmap Component ────────────────────────────────────────────
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const OccupancyHeatmap = ({ sessions }) => {
  const [tooltip, setTooltip] = useState(null);
  const matrix = buildHeatmap(sessions);
  const max = Math.max(...matrix.flat());
  const displayHours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

  const busiest = { day: 0, hour: 0, val: 0 };
  matrix.forEach((row, d) => row.forEach((v, h) => { if (v > busiest.val) { busiest.val = v; busiest.day = d; busiest.hour = h; } }));

  return (
    <div className="aa-heatmap-wrapper">
      <div className="aa-heatmap-grid">
        {/* Hour labels */}
        <div className="aa-heatmap-corner" />
        {displayHours.map((h) => (
          <div key={h} className="aa-heatmap-hour-label">
            {h === 12 ? '12p' : h > 12 ? `${h-12}p` : `${h}a`}
          </div>
        ))}
        {/* Rows */}
        {DAYS.map((day, d) => (
          <>
            <div key={`label-${d}`} className="aa-heatmap-day-label">{day}</div>
            {displayHours.map((h) => (
              <div
                key={`${d}-${h}`}
                className="aa-heatmap-cell"
                style={{ background: heatColor(matrix[d][h], max) }}
                onMouseEnter={(e) => setTooltip({ day, hour: h, val: matrix[d][h], x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setTooltip(null)}
              />
            ))}
          </>
        ))}
      </div>
      {tooltip && (
        <div className="aa-heatmap-tooltip" style={{ top: tooltip.y - 40, left: tooltip.x }}>
          {tooltip.day} {tooltip.hour > 12 ? `${tooltip.hour-12}pm` : `${tooltip.hour}am`}: {tooltip.val} members
        </div>
      )}
      {busiest.val > 0 && (
        <div className="aa-heatmap-insight">
          🔥 Busiest time: <strong>{DAYS[busiest.day]} {busiest.hour > 12 ? `${busiest.hour-12}pm` : `${busiest.hour}am`}</strong>
        </div>
      )}
    </div>
  );
};

// ─── Main Analytics Component ─────────────────────────────────────
const AttendanceLogs = () => {
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
  const { occupancy, activeSessions } = useLiveOccupancy(gymId);
  const searchTimer = useRef(null);
  const LOG_PAGE_SIZE = 25;

  const load = useCallback(async () => {
    if (!gymId) return;
    setLoading(true);
    try {
      const { start, end } = getDateRange(period);
      const [sess, denied] = await Promise.all([
        getAttendanceSessions(gymId, start, end),
        getAccessDeniedLogs(gymId, start, end),
      ]);

      // ── Resolve member names for sessions that don't have one stored ──
      // (Sessions created before we started storing memberName will have '' or undefined)
      const missingIds = [...new Set(
        sess
          .filter(s => !s.memberName)
          .map(s => s.memberId)
          .filter(Boolean)
      )];

      if (missingIds.length > 0) {
        const nameMap = {};
        await Promise.all(
          missingIds.map(async (uid) => {
            try {
              const snap = await getDoc(doc(db, 'users', uid));
              if (snap.exists()) nameMap[uid] = snap.data().name || uid;
              else nameMap[uid] = uid;
            } catch (_) {
              nameMap[uid] = uid;
            }
          })
        );
        const hydrated = sess.map(s =>
          s.memberName ? s : { ...s, memberName: nameMap[s.memberId] || s.memberId }
        );
        setSessions(hydrated);
      } else {
        setSessions(sess);
      }

      setDeniedLogs(denied);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [gymId, period]);

  useEffect(() => { load(); }, [load]);

  // ── Stats ─────────────────────────────────────────────────────────
  const completedSessions = sessions.filter((s) => s.status === 'completed');
  const insideSessions = sessions.filter((s) => s.status === 'inside');
  const uniqueMembers = new Set(sessions.map((s) => s.memberId)).size;
  const totalDuration = completedSessions.reduce((a, s) => a + (s.durationMinutes || 0), 0);
  const avgDuration = completedSessions.length ? Math.round(totalDuration / completedSessions.length) : 0;

  // Most active members
  const memberVisits = {};
  const memberDuration = {};
  const memberNames = {};
  const memberLast = {};
  sessions.forEach((s) => {
    const id = s.memberId;
    memberVisits[id] = (memberVisits[id] || 0) + 1;
    memberDuration[id] = (memberDuration[id] || 0) + (s.durationMinutes || 0);
    if (!memberNames[id]) memberNames[id] = s.memberName || id;
    const t = s.entryTime?.toDate ? s.entryTime.toDate() : null;
    if (t && (!memberLast[id] || t > memberLast[id])) memberLast[id] = t;
  });
  const topMembers = Object.entries(memberVisits)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, visits]) => ({
      id, visits, name: memberNames[id],
      avgDuration: memberVisits[id] ? Math.round(memberDuration[id] / memberVisits[id]) : 0,
      lastVisit: memberLast[id],
    }));
  const maxVisits = topMembers[0]?.visits || 1;

  // Streaks
  const streaks = Object.keys(memberVisits).map((id) => ({
    id, name: memberNames[id],
    streak: calcStreak(sessions, id),
  })).filter((m) => m.streak >= 3).sort((a, b) => b.streak - a.streak).slice(0, 10);
  const maxStreak = streaks[0]?.streak || 1;

  // Log table
  const searchTerm = logSearch.toLowerCase();
  const logRows = [
    ...sessions.map((s) => ({ ...s, _type: 'session' })),
    ...deniedLogs.map((d) => ({ ...d, _type: 'denied', status: 'denied' })),
  ]
    .sort((a, b) => {
      const ta = (a.entryTime || a.attemptTime)?.toDate ? (a.entryTime || a.attemptTime).toDate() : new Date(0);
      const tb = (b.entryTime || b.attemptTime)?.toDate ? (b.entryTime || b.attemptTime).toDate() : new Date(0);
      return tb - ta;
    })
    .filter((r) => {
      if (logFilter === 'Inside') return r.status === 'inside';
      if (logFilter === 'Completed') return r.status === 'completed';
      if (logFilter === 'Denied') return r._type === 'denied';
      return true;
    })
    .filter((r) => {
      if (!searchTerm) return true;
      return (r.memberId || '').toLowerCase().includes(searchTerm) ||
             (r.memberName || r.memberId || '').toLowerCase().includes(searchTerm);
    });

  const totalPages = Math.max(1, Math.ceil(logRows.length / LOG_PAGE_SIZE));
  const paginatedRows = logRows.slice((logPage - 1) * LOG_PAGE_SIZE, logPage * LOG_PAGE_SIZE);

  const handleSearchChange = (val) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setLogSearch(val); setLogPage(1); }, 300);
  };

  return (
    <div className="aa-screen">
      {/* Fixed header */}
      <div className="aa-header">
        <button className="aa-back-btn" onClick={() => navigate(-1)}>
          <span className="material-symbols-outlined">arrow_back_ios</span>
        </button>
        <div className="aa-header-center">
          <h1 className="aa-header-title">Attendance Analytics</h1>
        </div>
        <button className="aa-devices-btn" onClick={() => navigate('/owner/kiosk-devices')}>
          <span className="material-symbols-outlined">point_of_sale</span>
        </button>
      </div>

      <div className="aa-content">
        {/* Period filter */}
        <div className="aa-period-row">
          {['today', '7d', '30d', '90d'].map((p) => (
            <button
              key={p}
              className={`aa-period-btn ${period === p ? 'active' : ''}`}
              onClick={() => { setPeriod(p); setLogPage(1); }}
            >
              {p === 'today' ? 'Today' : p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '3 Months'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="aa-loading"><div className="spinner spinner-primary" /></div>
        ) : (
          <>
            {/* ── Section 1: KPI Cards ─────────────────────────────── */}
            <section className="aa-section">
              <div className="aa-kpi-grid">
                <div className="aa-kpi-card">
                  <div className="aa-kpi-icon" style={{ background: 'rgba(83,74,183,0.1)', color: '#534ab7' }}>
                    <span className="material-symbols-outlined">person_check</span>
                  </div>
                  <div className="aa-kpi-value">{sessions.length}</div>
                  <div className="aa-kpi-label">Total Entries</div>
                </div>
                <div className="aa-kpi-card">
                  <div className="aa-kpi-icon" style={{ background: 'rgba(0,110,40,0.1)', color: '#006e28' }}>
                    <span className="material-symbols-outlined">group</span>
                  </div>
                  <div className="aa-kpi-value">{uniqueMembers}</div>
                  <div className="aa-kpi-label">Unique Members</div>
                </div>
                <div className="aa-kpi-card">
                  <div className="aa-kpi-icon" style={{ background: 'rgba(0,64,139,0.1)', color: '#00408b' }}>
                    <span className="material-symbols-outlined">people</span>
                  </div>
                  <div className="aa-kpi-value">{occupancy}</div>
                  <div className="aa-kpi-label">Live Now</div>
                  <div className="aa-kpi-sub">
                    <span className="aa-live-dot" />real-time
                  </div>
                </div>
                <div className="aa-kpi-card">
                  <div className="aa-kpi-icon" style={{ background: 'rgba(239,159,39,0.1)', color: '#EF9F27' }}>
                    <span className="material-symbols-outlined">timer</span>
                  </div>
                  <div className="aa-kpi-value">{formatDuration(avgDuration)}</div>
                  <div className="aa-kpi-label">Avg Duration</div>
                </div>
                <div className="aa-kpi-card" style={{ borderColor: 'rgba(186,26,26,0.2)' }}>
                  <div className="aa-kpi-icon" style={{ background: 'rgba(186,26,26,0.08)', color: '#ba1a1a' }}>
                    <span className="material-symbols-outlined">block</span>
                  </div>
                  <div className="aa-kpi-value" style={{ color: '#ba1a1a' }}>{deniedLogs.length}</div>
                  <div className="aa-kpi-label">Denied Attempts</div>
                </div>
                <div className="aa-kpi-card">
                  <div className="aa-kpi-icon" style={{ background: 'rgba(83,74,183,0.08)', color: '#534ab7' }}>
                    <span className="material-symbols-outlined">local_fire_department</span>
                  </div>
                  <div className="aa-kpi-value">{streaks[0]?.streak || 0}</div>
                  <div className="aa-kpi-label">Top Streak</div>
                  {streaks[0] && <div className="aa-kpi-sub">{streaks[0].name}</div>}
                </div>
              </div>
            </section>

            {/* ── Section 2: Heatmap ───────────────────────────────── */}
            {sessions.length > 0 && (
              <section className="aa-section">
                <h2 className="aa-section-title">
                  <span className="material-symbols-outlined">grid_view</span>
                  Occupancy Heatmap
                </h2>
                <p className="aa-section-sub">When is your gym busiest?</p>
                <div className="aa-card">
                  <OccupancyHeatmap sessions={sessions} />
                </div>
              </section>
            )}

            {/* ── Section 3: Attendance Log ────────────────────────── */}
            <section className="aa-section">
              <h2 className="aa-section-title">
                <span className="material-symbols-outlined">list_alt</span>
                Attendance Log
              </h2>
              <div className="aa-log-controls">
                <div className="aa-search-box">
                  <span className="material-symbols-outlined aa-search-icon">search</span>
                  <input
                    className="aa-search-input"
                    placeholder="Search member name or ID..."
                    onChange={(e) => handleSearchChange(e.target.value)}
                  />
                </div>
                <div className="aa-filter-pills">
                  {['All', 'Inside', 'Completed', 'Denied'].map((f) => (
                    <button key={f} className={`aa-filter-pill ${logFilter === f ? 'active' : ''}`} onClick={() => { setLogFilter(f); setLogPage(1); }}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="aa-card">
                {paginatedRows.length === 0 ? (
                  <div className="aa-empty">No records found</div>
                ) : (
                  <>
                    <div className="aa-log-header-row">
                      <span>Member</span><span>Entry</span><span>Exit</span><span>Duration</span><span>Status</span>
                    </div>
                    {paginatedRows.map((row, i) => {
                      const name = row.memberName || row.memberId || 'Unknown';
                      const color = getAvatarColor(name);
                      const entryTime = (row.entryTime || row.attemptTime);
                      return (
                        <div key={row.id || i} className="aa-log-row">
                          <div className="aa-log-member">
                            <div className="aa-log-avatar" style={{ background: color.bg, color: color.text }}>
                              {getInitials(name)}
                            </div>
                            <span className="aa-log-name">{name}</span>
                          </div>
                          <span className="aa-log-time">{formatTime(entryTime)}</span>
                          <span className="aa-log-time">{row.exitTime ? formatTime(row.exitTime) : '—'}</span>
                          <span className="aa-log-dur">{formatDuration(row.durationMinutes)}</span>
                          <span className={`aa-status-badge ${row.status === 'inside' ? 'inside' : row.status === 'completed' ? 'completed' : 'denied'}`}>
                            {row.status === 'inside' ? '● Inside' : row.status === 'completed' ? '● Done' : '● Denied'}
                          </span>
                        </div>
                      );
                    })}
                    {totalPages > 1 && (
                      <div className="aa-pagination">
                        <button className="aa-page-btn" disabled={logPage === 1} onClick={() => setLogPage((p) => p - 1)}>←</button>
                        <span>{logPage} / {totalPages}</span>
                        <button className="aa-page-btn" disabled={logPage === totalPages} onClick={() => setLogPage((p) => p + 1)}>→</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>

            {/* ── Section 4: Top Members ───────────────────────────── */}
            {topMembers.length > 0 && (
              <section className="aa-section">
                <h2 className="aa-section-title">
                  <span className="material-symbols-outlined">emoji_events</span>
                  Most Active Members
                </h2>
                <div className="aa-card">
                  {topMembers.map((m, i) => {
                    const color = getAvatarColor(m.name);
                    return (
                      <div key={m.id} className="aa-top-row">
                        <div className="aa-top-rank" style={{ color: i < 3 ? '#534ab7' : '#787584' }}>#{i + 1}</div>
                        <div className="aa-log-avatar" style={{ background: color.bg, color: color.text, width: 36, height: 36, fontSize: 13 }}>
                          {getInitials(m.name)}
                        </div>
                        <div className="aa-top-info">
                          <div className="aa-top-name">{m.name}</div>
                          <div className="aa-top-sub">Avg {formatDuration(m.avgDuration)} · Last {formatRelative(m.lastVisit)}</div>
                          <div className="aa-top-bar-track">
                            <div className="aa-top-bar-fill" style={{ width: `${(m.visits / maxVisits) * 100}%` }} />
                          </div>
                        </div>
                        <div className="aa-top-visits">{m.visits} <span>visits</span></div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── Section 5: Streaks ───────────────────────────────── */}
            {streaks.length > 0 && (
              <section className="aa-section">
                <h2 className="aa-section-title">
                  <span className="material-symbols-outlined">local_fire_department</span>
                  Active Streaks
                </h2>
                <div className="aa-card">
                  {streaks.map((m) => {
                    const color = getAvatarColor(m.name);
                    return (
                      <div key={m.id} className="aa-streak-row">
                        <span className="aa-streak-fire">{m.streak >= 7 ? '🔥' : '⭐'}</span>
                        <div className="aa-log-avatar" style={{ background: color.bg, color: color.text, width: 36, height: 36, fontSize: 13 }}>
                          {getInitials(m.name)}
                        </div>
                        <div className="aa-top-info">
                          <div className="aa-top-name">{m.name}</div>
                          <div className="aa-top-bar-track">
                            <div className="aa-top-bar-fill" style={{ width: `${(m.streak / maxStreak) * 100}%`, background: '#534ab7' }} />
                          </div>
                        </div>
                        <div className="aa-streak-count">{m.streak} <span>days</span></div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Empty state */}
            {sessions.length === 0 && deniedLogs.length === 0 && (
              <div className="aa-full-empty">
                <span className="material-symbols-outlined">sensors_off</span>
                <h3>No attendance data yet</h3>
                <p>Set up kiosk devices so members can scan in and out. Analytics will appear here.</p>
                <button className="aa-setup-btn" onClick={() => navigate('/owner/kiosk-devices')}>
                  <span className="material-symbols-outlined">point_of_sale</span>
                  Set Up Kiosk Devices
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AttendanceLogs;
