// src/pages/Admin/BroadcastsPage.jsx
// Full-page broadcast composer + history of all released broadcasts.
// Super-admin only (route-guarded). All writes via audited callables.

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, orderBy, limit, getDocs,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import './SuperAdminDashboard.css';
import './BroadcastsPage.css';

const fmtDate = (ts) => {
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
};

const audienceLabel = (b) => b.audience === 'all' ? 'All gyms'
  : b.audience === 'plan' ? `Plan: ${b.plan_filter}`
  : b.audience === 'status' ? `Status: ${b.status_filter}`
  : `${(b.gym_ids || []).length} gym(s)`;

export default function BroadcastsPage() {
  const navigate = useNavigate();
  const { superAdmin } = useAuth();
  const { showToast } = useToast();

  const [broadcasts, setBroadcasts] = useState([]);
  const [plans, setPlans] = useState([]);
  const [gyms, setGyms] = useState([]);
  const [busy, setBusy] = useState(false);

  // composer state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('all');
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [gymIds, setGymIds] = useState([]);
  const [gymSearch, setGymSearch] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('');

  const loadBroadcasts = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'broadcasts'), orderBy('created_at', 'desc'), limit(100)));
      setBroadcasts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadBroadcasts();
    getDocs(collection(db, 'plans')).then((s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      setPlans(list);
      setPlanFilter(list[0]?.id || '');
    }).catch(() => {});
    getDocs(query(collection(db, 'gyms'), orderBy('created_at', 'desc'), limit(300)))
      .then((s) => setGyms(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch(() => {});
  }, [loadBroadcasts]);

  const call = async (fnName, payload, msg) => {
    setBusy(true);
    try {
      await httpsCallable(functions, fnName)(payload);
      showToast(msg, 'success');
      await loadBroadcasts();
      return true;
    } catch (e) {
      showToast(e?.message || 'Failed', 'error');
      return false;
    } finally { setBusy(false); }
  };

  const publish = async () => {
    if (!title.trim() || !body.trim()) { showToast('Title and message required', 'error'); return; }
    if (audience === 'specific' && gymIds.length === 0) { showToast('Pick at least one gym', 'error'); return; }
    const ok = await call('adminCreateBroadcast', {
      title: title.trim(), body: body.trim(), audience,
      plan_filter: audience === 'plan' ? planFilter : undefined,
      status_filter: audience === 'status' ? statusFilter : undefined,
      gym_ids: audience === 'specific' ? gymIds : undefined,
      expires_in_days: expiresInDays ? Number(expiresInDays) : undefined,
    }, 'Broadcast published');
    if (ok) { setTitle(''); setBody(''); setAudience('all'); setGymIds([]); setGymSearch(''); setExpiresInDays(''); }
  };

  const toggleGym = (id) => setGymIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const visibleGyms = gyms.filter((g) => {
    const t = gymSearch.trim().toLowerCase();
    return !t || [g.name, g.city].filter(Boolean).some((v) => String(v).toLowerCase().includes(t));
  });

  if (!superAdmin) return null;

  return (
    <div className="sa-screen">
      <div className="sa-header">
        <div>
          <button className="bcp-back" onClick={() => navigate('/admin')}>← Back to control plane</button>
          <h1>Broadcasts</h1>
          <p className="sa-header-sub">Compose announcements and review everything released</p>
        </div>
        <span className="admin-badge purple">SUPER ADMIN</span>
      </div>

      <div className="sa-content bcp-grid">
        {/* ── Composer ── */}
        <div className="admin-card bcp-card">
          <p className="admin-section-title">New broadcast</p>

          <label className="sa-modal-label">Title
            <input className="sa-search full" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. New feature is live" />
          </label>
          <label className="sa-modal-label">Message
            <textarea className="sa-search full" rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} placeholder="What do you want to announce?" />
          </label>

          <label className="sa-modal-label">Audience
            <select className="sa-select full" value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option value="all">All gyms</option>
              <option value="plan">By plan</option>
              <option value="status">By subscription status</option>
              <option value="specific">Specific gyms</option>
            </select>
          </label>

          {audience === 'plan' && (
            <label className="sa-modal-label">Plan
              <select className="sa-select full" value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
          {audience === 'status' && (
            <label className="sa-modal-label">Status
              <select className="sa-select full" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                {['active', 'trial', 'past_due', 'suspended', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}
          {audience === 'specific' && (
            <>
              <label className="sa-modal-label">Pick gyms{gymIds.length ? ` · ${gymIds.length} selected` : ''}
                <input className="sa-search full" value={gymSearch} onChange={(e) => setGymSearch(e.target.value)} placeholder="Search gym or city…" />
              </label>
              <div className="sa-gym-picker tall">
                {visibleGyms.length === 0 ? <p className="admin-empty">No gyms.</p> : visibleGyms.map((g) => (
                  <label key={g.id} className="sa-gym-check">
                    <input type="checkbox" checked={gymIds.includes(g.id)} onChange={() => toggleGym(g.id)} />
                    {g.name || g.id}{g.city ? ` · ${g.city}` : ''}
                  </label>
                ))}
              </div>
            </>
          )}

          <label className="sa-modal-label">Auto-expire after (days, optional)
            <input className="sa-search full" type="number" min={1} value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} placeholder="blank = no expiry" />
          </label>

          <button className="sa-primary-btn" onClick={publish} disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Working…' : 'Publish broadcast'}
          </button>
        </div>

        {/* ── All broadcasts released ── */}
        <div className="bcp-history">
          <p className="admin-section-title">All broadcasts released · {broadcasts.length}</p>
          <div className="admin-card">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Title</th><th>Audience</th><th>Status</th><th>Created</th><th>Expires</th><th></th></tr>
                </thead>
                <tbody>
                  {broadcasts.length === 0 ? (
                    <tr><td colSpan={6} className="admin-empty">No broadcasts yet.</td></tr>
                  ) : broadcasts.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <div className="bcp-title">{b.title}</div>
                        <div className="bcp-body">{b.body}</div>
                      </td>
                      <td>{audienceLabel(b)}</td>
                      <td><span className={`admin-badge ${b.active ? 'green' : 'grey'}`}>{b.active ? 'active' : 'off'}</span></td>
                      <td>{fmtDate(b.created_at)}</td>
                      <td>{b.expires_at ? fmtDate(b.expires_at) : '—'}</td>
                      <td className="bcp-actions">
                        <button className="sa-ghost-btn sm" disabled={busy}
                          onClick={() => call('adminSetBroadcastActive', { id: b.id, active: !b.active }, b.active ? 'Turned off' : 'Turned on')}>
                          {b.active ? 'Turn off' : 'Turn on'}
                        </button>
                        <button className="sa-ghost-btn sm" disabled={busy}
                          onClick={() => call('adminDeleteBroadcast', { id: b.id }, 'Deleted')}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
