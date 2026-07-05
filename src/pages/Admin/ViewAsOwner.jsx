// src/pages/Admin/ViewAsOwner.jsx
// Super-admin "View as owner" — READ-ONLY for overview/members/payments, with
// EDIT limited to gym Settings (via the whitelisted adminUpdateGymSettings
// callable). No impersonation: this uses the super-admin's own session +
// cross-gym read rules. Members and payments cannot be mutated here.

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  collection, query, where, orderBy, limit, startAfter, getDocs, getDoc, doc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase/config';
import { useToast } from '../../context/ToastContext';

const PAGE = 20;

const fmtDate = (ts) => {
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
};
const rupees = (paise) => `₹${Math.round((paise || 0) / 100).toLocaleString('en-IN')}`;

export default function ViewAsOwner({ gym, onClose }) {
  const { showToast } = useToast();
  const [tab, setTab] = useState('overview');

  return (
    <>
      <motion.div className="sa-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div className="vao-panel" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}>
        <div className="vao-head">
          <div>
            <h2>{gym.name || 'Gym'}</h2>
            <p className="sa-header-sub">Viewing as owner · read-only · {gym.city || '—'}</p>
          </div>
          <button className="sa-close" onClick={onClose}>✕</button>
        </div>

        <div className="vao-tabs">
          {['overview', 'members', 'payments', 'settings'].map((t) => (
            <button key={t} className={`vao-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="vao-body">
          {tab === 'overview' && <Overview gymId={gym.id} />}
          {tab === 'members' && <Members gymId={gym.id} />}
          {tab === 'payments' && <Payments gymId={gym.id} />}
          {tab === 'settings' && <Settings gym={gym} showToast={showToast} />}
        </div>
      </motion.div>
    </>
  );
}

function Overview({ gymId }) {
  const [s, setS] = useState(undefined);
  useEffect(() => {
    getDoc(doc(db, 'gyms', gymId, 'stats', 'summary'))
      .then((snap) => setS(snap.exists() ? snap.data() : null))
      .catch(() => setS(null));
  }, [gymId]);

  if (s === undefined) return <p className="admin-empty">Loading…</p>;
  if (s === null) return <p className="admin-empty">No stats computed for this gym yet.</p>;

  const cards = [
    ['Total members', s.total_members], ['Active members', s.active_members],
    ['Expiring (7d)', s.expiring_7d], ['Month revenue', `₹${(s.month_revenue || 0).toLocaleString('en-IN')}`],
    ['Pending dues', `₹${(s.pending_dues || 0).toLocaleString('en-IN')}`], ['Today attendance', s.today_attendance],
  ];
  return (
    <div className="admin-metrics-grid">
      {cards.map(([label, value]) => (
        <div className="admin-metric-card" key={label}>
          <div className="admin-metric-label">{label}</div>
          <div className="admin-metric-value">{value ?? '—'}</div>
        </div>
      ))}
    </div>
  );
}

function Members({ gymId }) {
  const [rows, setRows] = useState([]);
  const [last, setLast] = useState(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (after = null) => {
    const cons = [where('gym_id', '==', gymId), where('role', '==', 'member'), orderBy('created_at', 'desc'), limit(PAGE)];
    if (after) cons.push(startAfter(after));
    const snap = await getDocs(query(collection(db, 'users'), ...cons));
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setRows((prev) => after ? [...prev, ...data] : data);
    setLast(snap.docs[snap.docs.length - 1] || null);
    setMore(snap.docs.length === PAGE);
    setLoading(false);
  }, [gymId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="admin-empty">Loading members…</p>;
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr><th>Name</th><th>Phone</th><th>Expires</th><th>Status</th></tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={4} className="admin-empty">No members.</td></tr> : rows.map((m) => {
            const exp = m.subscription_expiry?.toDate ? m.subscription_expiry.toDate() : null;
            const active = exp && exp > new Date();
            return (
              <tr key={m.id}>
                <td>{m.name || '—'}</td>
                <td>{m.phone || '—'}</td>
                <td>{fmtDate(m.subscription_expiry)}</td>
                <td><span className={`admin-badge ${active ? 'green' : 'red'}`}>{active ? 'active' : 'expired'}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {more && <button className="sa-loadmore" onClick={() => load(last)}>Load more</button>}
    </div>
  );
}

function Payments({ gymId }) {
  const [rows, setRows] = useState([]);
  const [last, setLast] = useState(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (after = null) => {
    const cons = [where('gym_id', '==', gymId), orderBy('payment_date', 'desc'), limit(PAGE)];
    if (after) cons.push(startAfter(after));
    const snap = await getDocs(query(collection(db, 'payments'), ...cons));
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setRows((prev) => after ? [...prev, ...data] : data);
    setLast(snap.docs[snap.docs.length - 1] || null);
    setMore(snap.docs.length === PAGE);
    setLoading(false);
  }, [gymId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="admin-empty">Loading payments…</p>;
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr><th>Member</th><th>Amount</th><th>Date</th><th>Status</th></tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={4} className="admin-empty">No payments.</td></tr> : rows.map((p) => (
            <tr key={p.id}>
              <td>{p.member_name || p.member_id || '—'}</td>
              <td>₹{((p.final_amount ?? p.amount) || 0).toLocaleString('en-IN')}</td>
              <td>{fmtDate(p.payment_date)}</td>
              <td><span className={`admin-badge ${p.status === 'paid' ? 'green' : p.status === 'pending' ? 'orange' : 'grey'}`}>{p.status || '—'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {more && <button className="sa-loadmore" onClick={() => load(last)}>Load more</button>}
    </div>
  );
}

function Settings({ gym, showToast }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'gyms', gym.id)).then((snap) => {
      const g = snap.exists() ? snap.data() : {};
      setForm({
        name: g.name || '', phone: g.phone || '', email: g.email || '',
        address: g.address || '', city: g.city || '', website: g.website || '',
        open: g.working_hours?.open || '', close: g.working_hours?.close || '',
        instagram: g.social?.instagram || '', facebook: g.social?.facebook || '',
        google_maps: g.social?.google_maps || '',
      });
    });
  }, [gym.id]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      const settings = {
        name: form.name, phone: form.phone, email: form.email,
        address: form.address, city: form.city, website: form.website,
        working_hours: { open: form.open, close: form.close },
        social: { instagram: form.instagram, facebook: form.facebook, google_maps: form.google_maps },
      };
      await httpsCallable(functions, 'adminUpdateGymSettings')({ gymId: gym.id, settings });
      showToast('Settings saved', 'success');
    } catch (e) {
      showToast(e?.message || 'Save failed', 'error');
    } finally { setSaving(false); }
  };

  if (!form) return <p className="admin-empty">Loading settings…</p>;

  const field = (label, k) => (
    <label className="sa-modal-label" key={k}>{label}
      <input className="sa-search full" value={form[k]} onChange={set(k)} />
    </label>
  );

  return (
    <div className="vao-settings">
      <p className="vao-note">Editing is limited to gym settings. Members and payments are read-only.</p>
      {field('Gym name', 'name')}
      {field('Phone', 'phone')}
      {field('Email', 'email')}
      {field('Address', 'address')}
      {field('City', 'city')}
      {field('Website', 'website')}
      <div className="vao-row">
        {field('Opens', 'open')}
        {field('Closes', 'close')}
      </div>
      {field('Instagram', 'instagram')}
      {field('Facebook', 'facebook')}
      {field('Google Maps', 'google_maps')}
      <button className="sa-primary-btn" onClick={save} disabled={saving} style={{ marginTop: 8 }}>
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </div>
  );
}
