// src/pages/Admin/PlansPage.jsx
// Full-page plan management: create / edit / activate plans.
// Super-admin only (route-guarded). All writes via audited callables.

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import './SuperAdminDashboard.css';
import './PlansPage.css';

const EMPTY_FORM = { planId: '', name: '', monthly_amount_inr: '', sort_order: '' };

export default function PlansPage() {
  const navigate = useNavigate();
  const { superAdmin } = useAuth();
  const { showToast } = useToast();

  const [plans, setPlans] = useState([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isEditing, setIsEditing] = useState(false); // false = new plan, true = editing existing

  const loadPlans = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, 'plans'));
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      setPlans(list);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  const call = async (fnName, payload, msg) => {
    setBusy(true);
    try {
      await httpsCallable(functions, fnName)(payload);
      showToast(msg, 'success');
      await loadPlans();
      return true;
    } catch (e) {
      showToast(e?.message || 'Failed', 'error');
      return false;
    } finally { setBusy(false); }
  };

  const startEdit = (p) => {
    setForm({ planId: p.id, name: p.name, monthly_amount_inr: String(p.monthly_amount_inr ?? ''), sort_order: String(p.sort_order ?? '') });
    setIsEditing(true);
  };

  const cancelEdit = () => { setForm(EMPTY_FORM); setIsEditing(false); };

  const save = async () => {
    if (!form.planId.trim() || !form.name.trim()) { showToast('Plan ID and name required', 'error'); return; }
    const ok = await call('adminUpsertPlan', {
      planId: form.planId.trim().toUpperCase().replace(/\s+/g, '_'),
      name: form.name.trim(),
      monthly_amount_inr: Number(form.monthly_amount_inr) || 0,
      sort_order: Number(form.sort_order) || 0,
    }, isEditing ? 'Plan updated' : 'Plan created');
    if (ok) cancelEdit();
  };

  if (!superAdmin) return null;

  return (
    <div className="sa-screen">
      <div className="sa-header">
        <div>
          <button className="pp-back" onClick={() => navigate('/admin')}>← Back to control plane</button>
          <h1>Manage Plans</h1>
          <p className="sa-header-sub">Create, edit and activate subscription plans for gyms</p>
        </div>
        <span className="admin-badge purple">SUPER ADMIN</span>
      </div>

      <div className="sa-content pp-grid">

        {/* ── Composer ── */}
        <div className="admin-card pp-card">
          <p className="admin-section-title">{isEditing ? `Editing: ${form.name || form.planId}` : 'New plan'}</p>

          <label className="sa-modal-label">Plan ID{isEditing && <span className="pp-id-note"> (not editable)</span>}
            <input
              className="sa-search full"
              value={form.planId}
              onChange={(e) => !isEditing && setForm({ ...form, planId: e.target.value })}
              readOnly={isEditing}
              placeholder="e.g. PREMIUM"
              style={isEditing ? { opacity: 0.5 } : undefined}
            />
          </label>

          <label className="sa-modal-label">Display name
            <input className="sa-search full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Premium" />
          </label>

          <label className="sa-modal-label">Monthly amount (₹)
            <input className="sa-search full" type="number" min={0} value={form.monthly_amount_inr} onChange={(e) => setForm({ ...form, monthly_amount_inr: e.target.value })} placeholder="0" />
          </label>

          <label className="sa-modal-label">Sort order (lower = first)
            <input className="sa-search full" type="number" min={0} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} placeholder="0" />
          </label>

          <div className="pp-form-btns">
            {isEditing && (
              <button className="sa-ghost-btn" onClick={cancelEdit} disabled={busy}>Cancel</button>
            )}
            <button className="sa-primary-btn" onClick={save} disabled={busy} style={{ flex: 1 }}>
              {busy ? 'Working…' : isEditing ? 'Save changes' : 'Create plan'}
            </button>
          </div>

          {plans.length === 0 && !busy && (
            <button
              className="sa-ghost-btn"
              style={{ width: '100%', marginTop: 12 }}
              onClick={() => call('adminSeedDefaultPlans', {}, 'Default plans seeded')}
            >
              Seed default plans
            </button>
          )}
        </div>

        {/* ── Plans list ── */}
        <div className="pp-list-col">
          <p className="admin-section-title">All plans · {plans.length}</p>

          {plans.length === 0 ? (
            <div className="admin-card" style={{ padding: 28, textAlign: 'center' }}>
              <p className="admin-empty">No plans yet. Create one or seed the defaults.</p>
            </div>
          ) : (
            <div className="pp-cards">
              {plans.map((p) => (
                <div key={p.id} className={`admin-card pp-plan-card ${p.is_active === false ? 'pp-inactive' : ''}`}>
                  <div className="pp-plan-top">
                    <div>
                      <span className="pp-plan-name">{p.name}</span>
                      <span className="pp-plan-id">{p.id}</span>
                    </div>
                    <div className="pp-plan-badges">
                      <span className={`admin-badge ${p.is_active === false ? 'grey' : 'green'}`}>
                        {p.is_active === false ? 'inactive' : 'active'}
                      </span>
                    </div>
                  </div>

                  <div className="pp-plan-meta">
                    <span className="pp-plan-price">₹{(p.monthly_amount_inr || 0).toLocaleString('en-IN')}/mo</span>
                    <span className="pp-plan-order">Sort: {p.sort_order ?? 0}</span>
                  </div>

                  <div className="pp-plan-actions">
                    <button className="sa-ghost-btn sm" onClick={() => startEdit(p)} disabled={busy}>Edit</button>
                    <button
                      className="sa-ghost-btn sm"
                      disabled={busy}
                      onClick={() => call(
                        'adminSetPlanActive',
                        { planId: p.id, is_active: p.is_active === false },
                        p.is_active === false ? 'Plan activated' : 'Plan deactivated',
                      )}
                    >
                      {p.is_active === false ? 'Activate' : 'Deactivate'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
