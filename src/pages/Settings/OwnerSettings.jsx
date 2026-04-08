import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGym, updateGym } from '../../firebase/firestore';
import { logout } from '../../firebase/auth';
import { getInitials } from '../../utils/helpers';
import BottomNav from '../../components/BottomNav';
import './Settings.css';

const PLAN_COLORS = ['#534AB7', '#1D9E75', '#EF9F27', '#E24B4A', '#378ADD', '#9333ea', '#f97316'];

const emptyPlan = () => ({
  id: `plan_${Date.now()}`,
  name: '',
  price: '',
  duration_days: 30,
  description: '',
  color: '#534AB7',
  is_active: true,
});

// ── Edit Sheet Wrapper ──
const EditSheet = ({ title, onClose, children }) => (
  <div className="settings-edit-overlay" onClick={onClose}>
    <div className="settings-edit-sheet glass-card" onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingTop: 4 }}>
        <div className="sheet-handle" style={{ position: 'static', marginBottom: 0 }} />
        <h2 className="settings-edit-title" style={{ marginBottom: 0, flex: 1, textAlign: 'center' }}>{title}</h2>
        <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const OwnerSettings = () => {
  const navigate = useNavigate();
  const { user, userDoc } = useAuth();
  const { showToast } = useToast();

  const [gym, setGym] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Active editing sheet
  const [activeSheet, setActiveSheet] = useState(null);

  // Gym info form
  const [gymInfo, setGymInfo] = useState({
    name: '', phone: '', email: '', address: '', city: '', website: '',
    description: '',
  });

  // Working hours form
  const [hours, setHours] = useState({ open: '06:00', close: '22:00' });

  // Plans
  const [plans, setPlans] = useState([]);
  const [editingPlan, setEditingPlan] = useState(null);

  // Social links
  const [social, setSocial] = useState({ instagram: '', facebook: '', google_maps: '' });

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    getGym(userDoc.gym_id).then(g => {
      if (!g) return;
      setGym(g);
      setGymInfo({
        name: g.name || '',
        phone: g.phone || '',
        email: g.email || '',
        address: g.address || '',
        city: g.city || '',
        website: g.website || '',
        description: g.description || '',
      });
      setHours({
        open: g.working_hours?.open || '06:00',
        close: g.working_hours?.close || '22:00',
      });
      setPlans(g.settings?.plans || []);
      setSocial(g.social || { instagram: '', facebook: '', google_maps: '' });
      setLoading(false);
    });
  }, [userDoc?.gym_id]);

  // ── Save gym info ──
  const saveGymInfo = async () => {
    setSaving(true);
    try {
      await updateGym(userDoc.gym_id, gymInfo);
      setGym(prev => ({ ...prev, ...gymInfo }));
      showToast('Gym details updated!', 'success');
      setActiveSheet(null);
    } catch (e) {
      showToast('Failed to save: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Save hours ──
  const saveHours = async () => {
    setSaving(true);
    try {
      await updateGym(userDoc.gym_id, { working_hours: hours });
      setGym(prev => ({ ...prev, working_hours: hours }));
      showToast('Working hours updated!', 'success');
      setActiveSheet(null);
    } catch (e) {
      showToast('Failed to save: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Save plans ──
  const savePlans = async (updatedPlans) => {
    setSaving(true);
    try {
      await updateGym(userDoc.gym_id, { 'settings.plans': updatedPlans });
      setPlans(updatedPlans);
      showToast('Plans updated!', 'success');
    } catch (e) {
      showToast('Failed to save: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePlan = () => {
    if (!editingPlan?.name || !editingPlan?.price) {
      showToast('Plan name and price are required', 'error'); return;
    }
    const exists = plans.find(p => p.id === editingPlan.id);
    const updated = exists
      ? plans.map(p => p.id === editingPlan.id ? editingPlan : p)
      : [...plans, editingPlan];
    savePlans(updated);
    setEditingPlan(null);
    setActiveSheet(null);
  };

  const handleDeletePlan = (planId) => {
    const updated = plans.filter(p => p.id !== planId);
    savePlans(updated);
  };

  const handleTogglePlan = (planId) => {
    const updated = plans.map(p => p.id === planId ? { ...p, is_active: !p.is_active } : p);
    savePlans(updated);
  };

  // ── Save social ──
  const saveSocial = async () => {
    setSaving(true);
    try {
      await updateGym(userDoc.gym_id, { social });
      setGym(prev => ({ ...prev, social }));
      showToast('Social links updated!', 'success');
      setActiveSheet(null);
    } catch (e) {
      showToast('Failed to save: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Logout ──
  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="screen settings-screen">
        <div className="screen-content spinner-center">
          <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  const initials = getInitials(gym?.name || 'G');

  return (
    <div className="screen settings-screen">
      <div className="screen-content">

        {/* Hero */}
        <div className="settings-hero">
          <div className="settings-gym-avatar">{initials}</div>
          <div className="settings-gym-name">{gym?.name || 'My Gym'}</div>
          <div className="settings-gym-id">ID: {userDoc?.gym_id?.slice(0, 12).toUpperCase()}</div>
        </div>

        {/* Gym Details */}
        <div className="settings-section">
          <div className="settings-section-title">Gym Info</div>
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="settings-row" onClick={() => setActiveSheet('info')}>
              <div className="settings-row-icon" style={{ background: 'rgba(83,74,183,0.08)' }}>🏋️</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Gym details</div>
                <div className="settings-row-desc">Name, phone, address, email</div>
              </div>
              <span className="settings-row-arrow">›</span>
            </div>
            <div className="settings-row" onClick={() => setActiveSheet('hours')}>
              <div className="settings-row-icon" style={{ background: 'rgba(29,158,117,0.08)' }}>🕐</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Working hours</div>
                <div className="settings-row-desc">{hours.open} – {hours.close}</div>
              </div>
              <span className="settings-row-arrow">›</span>
            </div>
            <div className="settings-row" onClick={() => setActiveSheet('social')}>
              <div className="settings-row-icon" style={{ background: 'rgba(239,159,39,0.08)' }}>🔗</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Social & Maps</div>
                <div className="settings-row-desc">Instagram, Facebook, Google Maps</div>
              </div>
              <span className="settings-row-arrow">›</span>
            </div>
          </div>
        </div>

        {/* Membership Plans */}
        <div className="settings-section">
          <div className="settings-section-title">Membership Plans</div>
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            {plans.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No plans configured yet
              </div>
            ) : (
              plans.map(plan => (
                <div key={plan.id} className="plan-card-settings">
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: plan.color || '#534AB7', flexShrink: 0
                  }} />
                  <div className="plan-card-settings-info">
                    <div className="plan-card-settings-name">{plan.name}</div>
                    <div className="plan-card-settings-meta">
                      ₹{plan.price} · {plan.duration_days} days
                    </div>
                  </div>
                  <button
                    className={`plan-toggle ${plan.is_active ? 'on' : 'off'}`}
                    onClick={() => handleTogglePlan(plan.id)}
                    title={plan.is_active ? 'Active' : 'Inactive'}
                  />
                  <div className="plan-card-settings-actions">
                    <button className="plan-edit-btn edit" onClick={() => { setEditingPlan({ ...plan }); setActiveSheet('plan'); }}>✏️</button>
                    <button className="plan-edit-btn delete" onClick={() => handleDeletePlan(plan.id)}>🗑️</button>
                  </div>
                </div>
              ))
            )}
            <div
              className="settings-row"
              style={{ borderTop: plans.length > 0 ? '1px solid rgba(0,0,0,0.05)' : undefined }}
              onClick={() => { setEditingPlan(emptyPlan()); setActiveSheet('plan'); }}
            >
              <div className="settings-row-icon" style={{ background: 'rgba(83,74,183,0.08)', fontSize: 20 }}>＋</div>
              <div className="settings-row-label" style={{ color: 'var(--primary)', fontWeight: 600 }}>Add new plan</div>
            </div>
          </div>
        </div>

        {/* Staff & Access */}
        <div className="settings-section">
          <div className="settings-section-title">Team & Access</div>
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="settings-row" onClick={() => navigate('/owner/staff')}>
              <div className="settings-row-icon" style={{ background: 'rgba(55,138,221,0.08)' }}>👥</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Staff & trainers</div>
                <div className="settings-row-desc">Manage your team members</div>
              </div>
              <span className="settings-row-arrow">›</span>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="settings-section">
          <div className="settings-section-title">Quick Links</div>
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="settings-row" onClick={() => navigate('/owner/payments')}>
              <div className="settings-row-icon" style={{ background: 'rgba(83,74,183,0.08)' }}>💳</div>
              <div className="settings-row-label">Payment history</div>
              <span className="settings-row-arrow">›</span>
            </div>
            <div className="settings-row" onClick={() => navigate('/owner/analytics')}>
              <div className="settings-row-icon" style={{ background: 'rgba(29,158,117,0.08)' }}>📊</div>
              <div className="settings-row-label">Analytics</div>
              <span className="settings-row-arrow">›</span>
            </div>
            <div className="settings-row" onClick={() => navigate('/owner/attendance')}>
              <div className="settings-row-icon" style={{ background: 'rgba(239,159,39,0.08)' }}>📋</div>
              <div className="settings-row-label">Attendance logs</div>
              <span className="settings-row-arrow">›</span>
            </div>
            <div className="settings-row" onClick={() => navigate('/owner/whatsapp')}>
              <div className="settings-row-icon" style={{ background: 'rgba(37,211,102,0.08)' }}>💬</div>
              <div className="settings-row-label">WhatsApp logs</div>
              <span className="settings-row-arrow">›</span>
            </div>
            <div className="settings-row" onClick={() => navigate('/scan')}>
              <div className="settings-row-icon" style={{ background: 'rgba(83,74,183,0.08)' }}>📷</div>
              <div className="settings-row-label">QR Scanner</div>
              <span className="settings-row-arrow">›</span>
            </div>
            <div className="settings-row" onClick={() => navigate('/tablet')}>
              <div className="settings-row-icon" style={{ background: 'rgba(83,74,183,0.08)' }}>🖥️</div>
              <div className="settings-row-label">Tablet kiosk mode</div>
              <span className="settings-row-arrow">›</span>
            </div>
          </div>
        </div>

        {/* Account info */}
        <div className="settings-section">
          <div className="settings-section-title">Account</div>
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="settings-row">
              <div className="settings-row-icon" style={{ background: 'rgba(0,0,0,0.04)' }}>📱</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Phone</div>
                <div className="settings-row-desc">{user?.phoneNumber || '—'}</div>
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row-icon" style={{ background: 'rgba(0,0,0,0.04)' }}>🔑</div>
              <div className="settings-row-content">
                <div className="settings-row-label">Role</div>
                <div className="settings-row-desc">Gym Owner</div>
              </div>
            </div>
          </div>
        </div>

        {/* Danger zone */}
        <div className="settings-section settings-danger">
          <div className="settings-section-title">Account</div>
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="settings-row" onClick={handleLogout}>
              <div className="settings-row-icon" style={{ background: 'rgba(226,75,74,0.08)' }}>🚪</div>
              <div className="settings-row-label">Log out</div>
              <span className="settings-row-arrow" style={{ color: '#E24B4A' }}>›</span>
            </div>
          </div>
        </div>

        <div style={{ height: 100 }} />
      </div>

      <BottomNav activeTab="settings" role="owner" />

      {/* ── Edit Sheets ── */}

      {/* Gym Info Sheet */}
      {activeSheet === 'info' && (
        <EditSheet title="Gym Details" onClose={() => setActiveSheet(null)}>
          {[
            ['Gym name', 'name', 'text', 'E.g. Anytime Fitness'],
            ['Phone number', 'phone', 'tel', '+91 XXXXX XXXXX'],
            ['Email', 'email', 'email', 'gym@email.com'],
            ['City', 'city', 'text', 'Mumbai'],
            ['Address', 'address', 'text', 'Full address'],
            ['Website', 'website', 'url', 'https://...'],
          ].map(([label, key, type, placeholder]) => (
            <div key={key} className="input-group">
              <label className="input-label">{label}</label>
              <input
                type={type}
                className="input-field"
                placeholder={placeholder}
                value={gymInfo[key] || ''}
                onChange={e => setGymInfo(prev => ({ ...prev, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="input-group">
            <label className="input-label">Description</label>
            <textarea
              className="input-field"
              placeholder="About your gym..."
              value={gymInfo.description || ''}
              rows={3}
              style={{ resize: 'none' }}
              onChange={e => setGymInfo(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <button className="btn-primary" onClick={saveGymInfo} disabled={saving} style={{ marginTop: 8 }}>
            {saving ? <div className="spinner" /> : 'Save Gym Details'}
          </button>
        </EditSheet>
      )}

      {/* Working Hours Sheet */}
      {activeSheet === 'hours' && (
        <EditSheet title="Working Hours" onClose={() => setActiveSheet(null)}>
          <div className="hours-grid">
            <div className="input-group">
              <label className="input-label">Opens at</label>
              <input
                type="time"
                className="input-field"
                value={hours.open}
                onChange={e => setHours(prev => ({ ...prev, open: e.target.value }))}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Closes at</label>
              <input
                type="time"
                className="input-field"
                value={hours.close}
                onChange={e => setHours(prev => ({ ...prev, close: e.target.value }))}
              />
            </div>
          </div>
          <button className="btn-primary" onClick={saveHours} disabled={saving} style={{ marginTop: 8 }}>
            {saving ? <div className="spinner" /> : 'Save Hours'}
          </button>
        </EditSheet>
      )}

      {/* Plan Edit Sheet */}
      {activeSheet === 'plan' && editingPlan && (
        <EditSheet
          title={plans.find(p => p.id === editingPlan.id) ? 'Edit Plan' : 'Add Plan'}
          onClose={() => { setActiveSheet(null); setEditingPlan(null); }}
        >
          <div className="input-group">
            <label className="input-label">Plan name *</label>
            <input
              type="text"
              className="input-field"
              placeholder="E.g. Monthly Premium"
              value={editingPlan.name}
              onChange={e => setEditingPlan(p => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="input-group">
              <label className="input-label">Price (₹) *</label>
              <input
                type="number"
                className="input-field"
                placeholder="999"
                value={editingPlan.price}
                onChange={e => setEditingPlan(p => ({ ...p, price: Number(e.target.value) }))}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Duration (days)</label>
              <input
                type="number"
                className="input-field"
                placeholder="30"
                value={editingPlan.duration_days}
                onChange={e => setEditingPlan(p => ({ ...p, duration_days: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div className="input-group">
            <label className="input-label">Description</label>
            <input
              type="text"
              className="input-field"
              placeholder="What's included..."
              value={editingPlan.description || ''}
              onChange={e => setEditingPlan(p => ({ ...p, description: e.target.value }))}
            />
          </div>
          <div className="input-group">
            <label className="input-label">Plan colour</label>
            <div className="color-picker-row">
              {PLAN_COLORS.map(c => (
                <button
                  key={c}
                  className={`color-swatch ${editingPlan.color === c ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setEditingPlan(p => ({ ...p, color: c }))}
                  type="button"
                />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="btn-ghost" style={{ flex: 1 }} onClick={() => { setActiveSheet(null); setEditingPlan(null); }}>
              Cancel
            </button>
            <button className="btn-primary" style={{ flex: 2 }} onClick={handleSavePlan} disabled={saving}>
              {saving ? <div className="spinner" /> : 'Save Plan'}
            </button>
          </div>
        </EditSheet>
      )}

      {/* Social Sheet */}
      {activeSheet === 'social' && (
        <EditSheet title="Social & Maps" onClose={() => setActiveSheet(null)}>
          {[
            ['Instagram', 'instagram', 'https://instagram.com/yourgym'],
            ['Facebook', 'facebook', 'https://facebook.com/yourgym'],
            ['Google Maps', 'google_maps', 'Paste Google Maps link'],
          ].map(([label, key, placeholder]) => (
            <div key={key} className="input-group">
              <label className="input-label">{label}</label>
              <input
                type="url"
                className="input-field"
                placeholder={placeholder}
                value={social[key] || ''}
                onChange={e => setSocial(prev => ({ ...prev, [key]: e.target.value }))}
              />
            </div>
          ))}
          <button className="btn-primary" onClick={saveSocial} disabled={saving} style={{ marginTop: 8 }}>
            {saving ? <div className="spinner" /> : 'Save Links'}
          </button>
        </EditSheet>
      )}
    </div>
  );
};

export default OwnerSettings;
