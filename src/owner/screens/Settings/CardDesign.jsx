import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { getGym, updateGym } from '../../../firebase/firestore';
import { getExpiryStatus } from '../../../utils/helpers';
import MembershipCard from '../../components/MembershipCard';
import { ToggleRow } from '../../components/EditSheet';
import PageSkeleton from '../../primitives/PageSkeleton';
import { invalidateOwnerGym } from '../../hooks/useOwnerGym';

const DEFAULT_CARD_SETTINGS = {
  card_enabled: true, show_gym_name: true, show_gymly_label: true, show_member_name: true, show_photo: true,
  show_member_id: true, show_enrollment_id: true, show_plan: true, show_expiry: true, show_phone: false, show_qr: true, show_status: true,
};

const TOGGLES = [
  { key: 'show_gym_name', label: 'Gym name', description: 'Display your gym name on the card' },
  { key: 'show_gymly_label', label: '"Gymly Member Card" label', description: 'Show the branding text below the gym name' },
  { key: 'show_member_name', label: 'Member name', description: "Show the member's full name" },
  { key: 'show_photo', label: 'Member photo', description: 'Display profile picture or initials avatar' },
  { key: 'show_member_id', label: 'Member ID', description: 'Show member number (e.g. MEM-001)' },
  { key: 'show_enrollment_id', label: 'Enrollment ID', description: 'Show enrollment/batch code' },
  { key: 'show_plan', label: 'Plan name', description: 'Show active membership plan name' },
  { key: 'show_expiry', label: 'Valid till date', description: 'Show membership expiry date' },
  { key: 'show_phone', label: 'Phone number', description: 'Display member phone number' },
  { key: 'show_qr', label: 'QR code', description: 'Show scannable QR code for check-in' },
  { key: 'show_status', label: 'Status badge', description: 'Show Active / Expiring / Expired badge' },
];

const STATUS_COLORS = {
  active: { bg: 'rgba(15,94,60,0.15)', color: '#0F5E3C', dot: '#0F5E3C' },
  expiring: { bg: 'rgba(138,75,0,0.15)', color: '#8A4B00', dot: '#8A4B00' },
  expired: { bg: 'rgba(166,44,34,0.15)', color: '#A62C22', dot: '#A62C22' },
};

export default function CardDesign() {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();

  const [gym, setGym] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_CARD_SETTINGS);

  useEffect(() => () => { if (userDoc?.gym_id) invalidateOwnerGym(userDoc.gym_id); }, [userDoc?.gym_id]);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    getGym(userDoc.gym_id).then((g) => {
      if (!g) return;
      setGym(g);
      setSettings({ ...DEFAULT_CARD_SETTINGS, ...(g.card_settings || {}) });
      setLoading(false);
    });
  }, [userDoc?.gym_id]);

  const handleToggle = async (key, value) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    setSaving(true);
    try {
      await updateGym(userDoc.gym_id, { card_settings: next });
    } catch (e) {
      showToast(`Failed to save: ${e.message}`, 'error');
      setSettings(settings);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageSkeleton variant="card" />;

  const fakeExpiry = { toDate: () => { const d = new Date(); d.setDate(d.getDate() + 30); return d; } };
  const { label: statusLabel, type: statusType } = getExpiryStatus(fakeExpiry);
  const previewMember = {
    id: 'demo', name: userDoc?.name || gym?.name || 'Sample Member',
    memberNumber: userDoc?.memberNumber || 'MEM-001', latestEnrollmentNumber: userDoc?.latestEnrollmentNumber || 'ENR-2026-001',
    phone: userDoc?.phone || '+91 98765 43210', profile_photo: null, subscription_expiry: fakeExpiry,
  };

  return (
    <section data-screen-label="Membership card design">
      <button type="button" className="gl2-back-link" onClick={() => navigate('/owner/settings')}>
        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_back_ios</span>Settings
      </button>
      <div className="gl2-page-header">
        <div>
          <h1 className="gl2-page-title">Membership card design</h1>
          <p className="gl2-page-sub">Changes apply to all member cards instantly{saving ? ' · saving…' : ''}</p>
        </div>
      </div>

      <div className="gl2-grid-2" style={{ alignItems: 'start' }}>
        <div>
          <p className="gl2-eyebrow">Live preview</p>
          <div style={{ position: 'relative' }}>
            <MembershipCard member={previewMember} gym={gym} cardSettings={settings} statusColor={STATUS_COLORS[statusType] || STATUS_COLORS.active} statusLabel={statusLabel} planName="Premium Plan" publicUrl={`${window.location.origin}/public/member/demo`} />
            {settings.card_enabled === false && (
              <div style={{ position: 'absolute', inset: 0, borderRadius: 20, background: 'rgba(10,5,30,0.78)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#fff' }}>
                <span style={{ fontSize: 32 }}>🚫</span>
                <p style={{ margin: 0, fontWeight: 700 }}>Card disabled</p>
                <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,.65)', textAlign: 'center', padding: '0 20px' }}>Members cannot view their digital ID card</p>
              </div>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--gl2-muted)', textAlign: 'center', marginTop: 10 }}>Preview uses your profile — members see their own data.</p>
        </div>

        <div>
          <div className="gl2-card" style={{ marginBottom: 14 }}>
            <p className="gl2-eyebrow" style={{ marginBottom: 6 }}>Feature</p>
            <ToggleRow label="Member card enabled" description={settings.card_enabled !== false ? 'Members can view their digital ID card' : 'Card disabled — members see a "not available" screen'} value={settings.card_enabled !== false} onChange={(v) => handleToggle('card_enabled', v)} />
          </div>

          <div className="gl2-card" style={{ opacity: settings.card_enabled !== false ? 1 : 0.45, pointerEvents: settings.card_enabled !== false ? 'auto' : 'none' }}>
            <p className="gl2-eyebrow" style={{ marginBottom: 6 }}>Card fields</p>
            {TOGGLES.map(({ key, label, description }) => (
              <ToggleRow key={key} label={label} description={description} value={settings[key] ?? true} onChange={(v) => handleToggle(key, v)} />
            ))}
          </div>

          <div style={{ marginTop: 14, padding: 12, borderRadius: 11, background: 'var(--gl2-primary-tint)', fontSize: 12.5, color: 'var(--gl2-primary-deep)' }}>
            💡 These settings control the digital ID card members see in the app. Changes apply immediately.
          </div>
        </div>
      </div>
    </section>
  );
}
