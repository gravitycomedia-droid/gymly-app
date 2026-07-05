// src/pages/Admin/SuperAdminDashboard.jsx
// Platform control plane. Phase 1 = read-only oversight. Phase 2 = control:
// assign plan, extend/expire trial, suspend/reactivate (state-only), plan CRUD —
// all via super-admin-gated callable functions with server-side audit logging.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  collection, query, orderBy, limit, startAfter, getDocs, getDoc, doc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import ViewAsOwner from './ViewAsOwner';
import './SuperAdminDashboard.css';

const PAGE_SIZE = 25;
const PLAN_PRICES_INR = { FREE: 0, BASIC: 199, PROFESSIONAL: 499, PROFESSIONAL_PLUS: 799, PREMIUM: 999 };

const statusBadge = (status) => ({
  active: 'green', trial: 'blue', past_due: 'orange', suspended: 'red', cancelled: 'grey',
}[status] || 'grey');

const monthlyInr = (sub) => {
  if (!sub) return 0;
  if (typeof sub.amount_monthly === 'number' && sub.amount_monthly > 0) return Math.round(sub.amount_monthly / 100);
  return PLAN_PRICES_INR[sub.plan] || 0;
};

const fmtDate = (ts) => {
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
};

const HEALTH_META = {
  healthy: { label: 'Healthy', badge: 'green' },
  watch:   { label: 'Watch',   badge: 'orange' },
  at_risk: { label: 'At risk', badge: 'red' },
};
const HEALTH_ORDER = { healthy: 0, watch: 1, at_risk: 2 };

// Derive a churn-risk level purely from the denormalized gym_summaries fields
// already loaded — no extra reads, no backend. Returns { level, reasons }.
function healthOf(g) {
  const reasons = [];
  let level = 'healthy';
  const escalate = (l) => { if (HEALTH_ORDER[l] > HEALTH_ORDER[level]) level = l; };

  const total = g.memberCount ?? 0;
  const active = g.activeCount ?? 0;
  const ratio = total > 0 ? active / total : 0;
  const status = g.subscription?.status || g.status;
  const isTrial = g.subscription?.is_trial;
  const trialEnd = g.subscription?.trial_end_date?.toDate
    ? g.subscription.trial_end_date.toDate()
    : (g.subscription?.trial_end_date ? new Date(g.subscription.trial_end_date) : null);
  const daysToTrialEnd = trialEnd ? Math.ceil((trialEnd - new Date()) / 86400000) : null;

  if (status === 'past_due')  { escalate('at_risk'); reasons.push('Payment past due'); }
  if (status === 'suspended') { escalate('at_risk'); reasons.push('Suspended'); }
  if (status === 'cancelled') { escalate('at_risk'); reasons.push('Cancelled'); }

  if (total === 0) { escalate('at_risk'); reasons.push('No members onboarded'); }
  else if (ratio < 0.3) { escalate('at_risk'); reasons.push(`Only ${Math.round(ratio * 100)}% of members active`); }
  else if (ratio < 0.6) { escalate('watch'); reasons.push(`${Math.round(ratio * 100)}% of members active`); }

  if (isTrial && daysToTrialEnd != null) {
    if (daysToTrialEnd <= 2)      { escalate('at_risk'); reasons.push(`Trial ends in ${Math.max(daysToTrialEnd, 0)}d`); }
    else if (daysToTrialEnd <= 7) { escalate('watch');   reasons.push(`Trial ends in ${daysToTrialEnd}d`); }
  }

  if (reasons.length === 0) reasons.push('Good activity, no payment issues');
  return { level, reasons };
}

export default function SuperAdminDashboard() {
  const { superAdmin } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [gyms, setGyms] = useState([]);
  const [plans, setPlans] = useState([]);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [action, setAction] = useState(null);   // { type, gym }
  const [viewGym, setViewGym] = useState(null);  // gym opened in View-as-owner
  const [busy, setBusy] = useState(false);

  const refreshStats = useCallback(() => {
    getDoc(doc(db, 'platform_stats', 'global'))
      .then((snap) => setStats(snap.exists() ? snap.data() : null))
      .catch(() => setStats(null));
  }, []);

  const loadPlans = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, 'plans'));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      setPlans(list);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { refreshStats(); loadPlans(); }, [refreshStats, loadPlans]);

  // One read per row: the denormalized gym_summaries doc (SA-3). A subscription-
  // shaped object is synthesized from it so the detail drawer renders unchanged.
  const hydrateOne = useCallback(async (gymDoc) => {
    const gymId = gymDoc.id;
    const sumSnap = await getDoc(doc(db, 'gym_summaries', gymId));
    const sm = sumSnap.exists() ? sumSnap.data() : null;
    const sub = sm ? {
      plan: sm.plan, status: sm.status, amount_monthly: sm.amount_monthly,
      is_trial: sm.is_trial, trial_end_date: sm.trial_end_date,
      failed_payment_count: sm.failed_payment_count || 0,
    } : null;
    return {
      id: gymId,
      ...gymDoc.data(),
      subscription: sub,
      memberCount: sm?.member_count ?? null,
      activeCount: sm?.active_count ?? null,
      status: sm?.is_trial ? 'trial' : (sm?.status || 'active'),
      plan: sm?.plan || 'FREE',
      mrr: (sm && sm.status === 'active') ? monthlyInr(sub) : 0,
      _doc: gymDoc,
    };
  }, []);

  const loadFirst = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'gyms'), orderBy('created_at', 'desc'), limit(PAGE_SIZE));
      const snap = await getDocs(q);
      const rows = await Promise.all(snap.docs.map(hydrateOne));
      setGyms(rows);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (e) {
      if (import.meta.env.DEV) console.error('Gym list load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [hydrateOne]);

  const loadMore = useCallback(async () => {
    if (!lastDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const q = query(collection(db, 'gyms'), orderBy('created_at', 'desc'), startAfter(lastDoc), limit(PAGE_SIZE));
      const snap = await getDocs(q);
      const rows = await Promise.all(snap.docs.map(hydrateOne));
      setGyms((prev) => [...prev, ...rows]);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [lastDoc, loadingMore, hydrateOne]);

  useEffect(() => { loadFirst(); }, [loadFirst]);

  // Re-read one gym after a mutation and patch it into state + the open drawer.
  const refreshGym = useCallback(async (row) => {
    const fresh = await hydrateOne(row._doc);
    setGyms((prev) => prev.map((g) => (g.id === fresh.id ? fresh : g)));
    setSelected((cur) => (cur && cur.id === fresh.id ? fresh : cur));
    refreshStats();
  }, [hydrateOne, refreshStats]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return gyms.filter((g) => {
      if (statusFilter !== 'all' && g.status !== statusFilter) return false;
      if (healthFilter !== 'all' && healthOf(g).level !== healthFilter) return false;
      if (!term) return true;
      return [g.name, g.city, g.owner_name].filter(Boolean).some((v) => String(v).toLowerCase().includes(term));
    });
  }, [gyms, search, statusFilter, healthFilter]);

  const atRiskCount = useMemo(() => gyms.filter((g) => healthOf(g).level === 'at_risk').length, [gyms]);

  // ── Phase 2 action runner ──
  const runAction = useCallback(async (fnName, payload, successMsg) => {
    setBusy(true);
    try {
      await httpsCallable(functions, fnName)(payload);
      showToast(successMsg, 'success');
      if (action?.gym) await refreshGym(action.gym);
      setAction(null);
    } catch (e) {
      showToast(e?.message || 'Action failed', 'error');
    } finally {
      setBusy(false);
    }
  }, [action, refreshGym, showToast]);

  if (!superAdmin) return null;

  return (
    <div className="sa-screen">
      <div className="sa-header">
        <div>
          <h1>Platform Control</h1>
          <p className="sa-header-sub">Oversight & control · Phase 2</p>
        </div>
        <div className="sa-header-actions">
          <button className="sa-ghost-btn" onClick={() => navigate('/admin/broadcasts')}>Broadcasts</button>
          <button className="sa-ghost-btn" onClick={() => navigate('/admin/plans')}>Manage plans</button>
          <span className="admin-badge purple">SUPER ADMIN</span>
        </div>
      </div>

      <div className="sa-content">
        <div className="admin-metrics-grid">
          <Kpi label="Total Gyms" value={stats?.total_gyms} />
          <Kpi label="Active" value={stats?.active_gyms} sub={stats ? `${stats.trial_gyms || 0} on trial` : ''} />
          <Kpi label="Total Members" value={stats?.total_members} />
          <Kpi label="MRR" value={stats != null ? `₹${(stats.mrr_inr || 0).toLocaleString('en-IN')}` : undefined} />
        </div>
        {stats?.past_due_gyms > 0 && (
          <button className="sa-dunning-banner" onClick={() => setStatusFilter('past_due')}>
            ⚠ {stats.past_due_gyms} {stats.past_due_gyms === 1 ? 'gym' : 'gyms'} past due
            {stats.past_due_inr ? ` · ₹${stats.past_due_inr.toLocaleString('en-IN')}/mo at risk` : ''} — review
          </button>
        )}
        {stats?.updated_at && <p className="sa-updated">Rollup updated {fmtDate(stats.updated_at)} · refreshes hourly</p>}
        {!stats && !loading && <p className="sa-updated warn">platform_stats/global not found yet — run the backfill or wait for the first scheduled tick.</p>}

        <div className="sa-controls">
          <input className="sa-search" placeholder="Search gym, city, owner…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="sa-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="past_due">Past due</option>
            <option value="suspended">Suspended</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select className="sa-select" value={healthFilter} onChange={(e) => setHealthFilter(e.target.value)}>
            <option value="all">All health{atRiskCount ? ` · ${atRiskCount} at risk` : ''}</option>
            <option value="at_risk">At risk</option>
            <option value="watch">Watch</option>
            <option value="healthy">Healthy</option>
          </select>
        </div>

        <div className="admin-card">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Gym</th><th>City</th><th>Owner</th><th>Plan</th><th>Status</th><th>Health</th><th>Members</th><th>MRR</th><th>Signed up</th></tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="admin-empty">Loading gyms…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} className="admin-empty">No gyms match.</td></tr>
                ) : filtered.map((g) => {
                  const h = healthOf(g);
                  return (
                  <tr key={g.id} className="sa-row" onClick={() => setSelected(g)}>
                    <td>{g.name || '—'}</td>
                    <td>{g.city || '—'}</td>
                    <td>{g.owner_name || '—'}</td>
                    <td>{g.plan}</td>
                    <td><span className={`admin-badge ${statusBadge(g.status)}`}>{g.status}</span></td>
                    <td><span className={`admin-badge ${HEALTH_META[h.level].badge}`}>{HEALTH_META[h.level].label}</span></td>
                    <td>{g.memberCount ?? '—'}</td>
                    <td>{g.mrr ? `₹${g.mrr.toLocaleString('en-IN')}` : '—'}</td>
                    <td>{fmtDate(g.created_at)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {hasMore && !search && statusFilter === 'all' && (
            <button className="sa-loadmore" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more'}</button>
          )}
        </div>
      </div>

      {/* ── Detail drawer with live Phase 2 controls ── */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div className="sa-drawer-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelected(null)} />
            <motion.div className="sa-drawer" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}>
              <div className="sa-drawer-head">
                <div>
                  <h2>{selected.name || 'Gym'}</h2>
                  <p className="sa-header-sub">{selected.city || '—'} · {selected.id}</p>
                </div>
                <button className="sa-close" onClick={() => setSelected(null)}>✕</button>
              </div>

              <button className="sa-primary-btn" style={{ width: '100%', marginBottom: 18 }} onClick={() => setViewGym(selected)}>
                View as owner
              </button>

              <Section title="Subscription">
                <Field label="Plan" value={selected.plan} />
                <Field label="Status" value={selected.status} />
                <Field label="Monthly" value={`₹${monthlyInr(selected.subscription).toLocaleString('en-IN')}`} />
                <Field label="Trial ends" value={fmtDate(selected.subscription?.trial_end_date)} />
                {selected.subscription?.failed_payment_count > 0 && (
                  <Field label="Failed payments" value={selected.subscription.failed_payment_count} />
                )}
              </Section>

              <Section title="Members">
                <Field label="Total members" value={selected.memberCount ?? '—'} />
                <Field label="Active members" value={selected.activeCount ?? '—'} />
              </Section>

              <Section title="Health">
                {(() => {
                  const h = healthOf(selected);
                  return (
                    <>
                      <div className="sa-field">
                        <span className="sa-field-label">Churn risk</span>
                        <span className={`admin-badge ${HEALTH_META[h.level].badge}`}>{HEALTH_META[h.level].label}</span>
                      </div>
                      <ul className="sa-reasons">
                        {h.reasons.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </>
                  );
                })()}
              </Section>

              <Section title="Owner">
                <Field label="Name" value={selected.owner_name || '—'} />
                <Field label="Owner ID" value={selected.owner_id || '—'} />
                <Field label="Signed up" value={fmtDate(selected.created_at)} />
              </Section>

              <div className="sa-actions">
                <p className="admin-section-title">Controls</p>
                {['past_due', 'suspended', 'cancelled'].includes(selected.subscription?.status) && (
                  <button className="sa-act-btn good" onClick={() => setAction({ type: 'mark_paid', gym: selected })}>Mark as paid</button>
                )}
                <button className="sa-act-btn" onClick={() => setAction({ type: 'assign_plan', gym: selected })}>Change plan</button>
                <button className="sa-act-btn" onClick={() => setAction({ type: 'extend_trial', gym: selected })}>Extend trial</button>
                <button className="sa-act-btn" onClick={() => setAction({ type: 'expire_trial', gym: selected })}>Expire trial</button>
                {selected.subscription?.status === 'suspended' ? (
                  <button className="sa-act-btn good" onClick={() => setAction({ type: 'reactivate', gym: selected })}>Reactivate</button>
                ) : (
                  <button className="sa-act-btn danger" onClick={() => setAction({ type: 'suspend', gym: selected })}>Suspend</button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Action modal ── */}
      <AnimatePresence>
        {action && (
          <ActionModal
            action={action}
            plans={plans}
            busy={busy}
            onClose={() => !busy && setAction(null)}
            onRun={runAction}
          />
        )}
      </AnimatePresence>

      {/* ── View-as-owner panel ── */}
      <AnimatePresence>
        {viewGym && <ViewAsOwner gym={viewGym} onClose={() => setViewGym(null)} />}
      </AnimatePresence>

    </div>
  );
}

// ── Action modal: assign plan / trial / suspend ──
function ActionModal({ action, plans, busy, onClose, onRun }) {
  const { type, gym } = action;
  const activePlans = plans.filter((p) => p.is_active !== false);
  const [planId, setPlanId] = useState(activePlans[0]?.id || '');
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState('');

  const [amount, setAmount] = useState(monthlyInr(gym.subscription) || '');

  const titles = {
    assign_plan: 'Change plan', extend_trial: 'Extend trial', expire_trial: 'Expire trial',
    suspend: 'Suspend gym', reactivate: 'Reactivate gym', mark_paid: 'Mark as paid',
  };

  const submit = () => {
    if (type === 'mark_paid') {
      onRun('adminMarkSubscriptionPaid', { gymId: gym.id, amount: Number(amount) || undefined, reason }, 'Marked as paid & reactivated');
    } else if (type === 'assign_plan') {
      if (!planId) return;
      onRun('adminAssignPlan', { gymId: gym.id, planId, reason }, `Plan changed to ${planId}`);
    } else if (type === 'extend_trial') {
      onRun('adminSetTrial', { gymId: gym.id, days: Number(days), reason }, `Trial extended ${days} days`);
    } else if (type === 'expire_trial') {
      onRun('adminSetTrial', { gymId: gym.id, expire: true, reason }, 'Trial expired');
    } else if (type === 'suspend') {
      onRun('adminSetGymStatus', { gymId: gym.id, status: 'suspended', reason }, 'Gym suspended');
    } else if (type === 'reactivate') {
      onRun('adminSetGymStatus', { gymId: gym.id, status: 'active', reason }, 'Gym reactivated');
    }
  };

  return (
    <>
      <motion.div className="sa-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div className="sa-modal" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}>
        <h3>{titles[type]}</h3>
        <p className="sa-modal-sub">{gym.name}</p>

        {type === 'assign_plan' && (
          <label className="sa-modal-label">Plan
            <select className="sa-select full" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              {activePlans.length === 0 && <option value="">No plans — seed them in Manage plans</option>}
              {activePlans.map((p) => <option key={p.id} value={p.id}>{p.name} · ₹{p.monthly_amount_inr}/mo</option>)}
            </select>
          </label>
        )}
        {type === 'extend_trial' && (
          <label className="sa-modal-label">Days to extend
            <input className="sa-search full" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
          </label>
        )}
        {type === 'mark_paid' && (
          <>
            <p className="sa-modal-confirm">Records a payment, reactivates the subscription, and clears the failed-payment counter.</p>
            <label className="sa-modal-label">Amount received (₹)
              <input className="sa-search full" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
          </>
        )}
        {(type === 'expire_trial' || type === 'reactivate') && (
          <p className="sa-modal-confirm">Confirm: {titles[type].toLowerCase()} for <b>{gym.name}</b>?</p>
        )}
        {type === 'suspend' && (
          <p className="sa-modal-confirm">Suspends the subscription state (owner app is <b>not</b> blocked in this phase).</p>
        )}

        <label className="sa-modal-label">Reason (optional)
          <input className="sa-search full" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Logged in audit trail" />
        </label>

        <div className="sa-modal-btns">
          <button className="sa-ghost-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className={`sa-primary-btn ${type === 'suspend' ? 'danger' : ''}`} onClick={submit} disabled={busy}>
            {busy ? 'Working…' : 'Confirm'}
          </button>
        </div>
      </motion.div>
    </>
  );
}

function Kpi({ label, value, sub }) {
  return (
    <div className="admin-metric-card">
      <div className="admin-metric-label">{label}</div>
      <div className="admin-metric-value">{value ?? '—'}</div>
      {sub ? <div className="admin-metric-sub">{sub}</div> : null}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="sa-drawer-section">
      <p className="admin-section-title">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="sa-field">
      <span className="sa-field-label">{label}</span>
      <span className="sa-field-value">{value}</span>
    </div>
  );
}
