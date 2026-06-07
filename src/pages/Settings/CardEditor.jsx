import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getGym, updateGym } from '../../firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { formatDate, getExpiryStatus } from '../../utils/helpers';

// ── Default card settings ─────────────────────────────────────────
const DEFAULT_CARD_SETTINGS = {
  card_enabled: true,
  show_gym_name: true,
  show_gymly_label: true,
  show_member_name: true,
  show_photo: true,
  show_member_id: true,
  show_enrollment_id: true,
  show_plan: true,
  show_expiry: true,
  show_phone: false,
  show_qr: true,
  show_status: true,
};

// ── Toggle Row ────────────────────────────────────────────────────
const ToggleRow = ({ label, icon, description, value, onChange }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '14px 0',
    borderBottom: '1px solid rgba(83,74,183,0.07)',
  }}>
    <span style={{ fontSize: 20, width: 28, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1b1b1d' }}>{label}</div>
      {description && <div style={{ fontSize: 12, color: '#787584', marginTop: 2 }}>{description}</div>}
    </div>
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
        background: value ? '#534ab7' : '#c8c4d5',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: value ? 25 : 3,
        width: 20, height: 20, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
      }} />
    </button>
  </div>
);

// ── Live Preview Card ─────────────────────────────────────────────
const PreviewCard = ({ settings, gym, ownerDoc, disabled }) => {
  const name = ownerDoc?.name || gym?.name || 'Sample Member';
  const planName = 'Premium Plan';
  const memberId = ownerDoc?.memberNumber || 'MEM-001';
  const enrollmentId = ownerDoc?.latestEnrollmentNumber || 'ENR-2024-001';
  const phone = ownerDoc?.phone || '+91 98765 43210';
  const publicUrl = `${window.location.origin}/public/member/demo`;

  // Build a fake expiry 30 days from now for preview
  const fakeExpiry = { toDate: () => { const d = new Date(); d.setDate(d.getDate() + 30); return d; } };
  const { label: statusLabel, type: statusType } = getExpiryStatus(fakeExpiry);

  const statusColors = {
    active: { bg: 'rgba(29,158,117,0.15)', color: '#006e28', dot: '#006e28' },
    expiring: { bg: 'rgba(239,159,39,0.15)', color: '#EF9F27', dot: '#EF9F27' },
    expired: { bg: 'rgba(186,26,26,0.15)', color: '#ba1a1a', dot: '#ba1a1a' },
  };
  const sc = statusColors[statusType] || statusColors.active;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1a1040 0%, #2d1b69 50%, #1a2980 100%)',
      borderRadius: 20,
      padding: '20px',
      boxShadow: '0 20px 60px rgba(83,74,183,0.35)',
      position: 'relative',
      overflow: 'hidden',
      minHeight: 200,
    }}>
      {disabled && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 20, zIndex: 10,
          background: 'rgba(10,5,30,0.78)', backdropFilter: 'blur(4px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <div style={{ fontSize: 38 }}>🚫</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Card Disabled</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', textAlign: 'center', padding: '0 24px' }}>Members cannot view their Digital ID card</div>
        </div>
      )}
      {/* Decorative blobs */}
      <div style={{
        position: 'absolute', top: -40, right: -40, width: 140, height: 140,
        borderRadius: '50%', background: 'rgba(83,74,183,0.3)', filter: 'blur(30px)',
      }} />
      <div style={{
        position: 'absolute', bottom: -30, left: -30, width: 100, height: 100,
        borderRadius: '50%', background: 'rgba(55,138,221,0.25)', filter: 'blur(25px)',
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Top row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            {settings.show_gym_name && (
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>
                {gym?.name || 'My Gym'}
              </div>
            )}
            {settings.show_gymly_label !== false && <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.5 }}>GYMLY MEMBER CARD</div>}
          </div>
          {settings.show_status && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: sc.bg, padding: '4px 10px', borderRadius: 99 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: sc.color }}>{statusLabel}</span>
            </div>
          )}
        </div>

        {/* Middle — avatar + info + QR */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          {settings.show_photo && (
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: 'linear-gradient(135deg, #7c6fe8, #378add)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 700, color: '#fff', flexShrink: 0,
              border: '2px solid rgba(255,255,255,0.3)',
            }}>
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {settings.show_member_name && (
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {name}
              </div>
            )}
            {settings.show_plan && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>{planName}</div>
            )}
            {settings.show_member_id && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>#{memberId}</div>
            )}
            {settings.show_enrollment_id && (
              <div style={{ display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 700, color: '#4ade80', background: 'rgba(74,222,128,0.15)', padding: '2px 8px', borderRadius: 6, fontFamily: 'monospace' }}>
                {enrollmentId}
              </div>
            )}
          </div>
          {settings.show_qr && (
            <div style={{ background: '#fff', padding: 6, borderRadius: 10, flexShrink: 0 }}>
              <QRCodeSVG value={publicUrl} size={52} bgColor="transparent" fgColor="#1A1A1A" level="M" />
            </div>
          )}
        </div>

        {/* Bottom row */}
        <div style={{ display: 'flex', gap: 16, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12 }}>
          {settings.show_expiry && (
            <div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Valid Till</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginTop: 1 }}>
                {formatDate(fakeExpiry)}
              </div>
            </div>
          )}
          {settings.show_phone && (
            <div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Phone</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginTop: 1 }}>{phone}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────
const CardEditor = () => {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();

  const [gym, setGym] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_CARD_SETTINGS);

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    getGym(userDoc.gym_id).then(g => {
      if (!g) return;
      setGym(g);
      setSettings({ ...DEFAULT_CARD_SETTINGS, ...(g.card_settings || {}) });
      setLoading(false);
    });
  }, [userDoc?.gym_id]);

  const handleToggle = async (key, value) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    // Auto-save on each toggle
    setSaving(true);
    try {
      await updateGym(userDoc.gym_id, { card_settings: next });
    } catch (e) {
      showToast('Failed to save: ' + e.message, 'error');
      setSettings(settings); // revert
    } finally {
      setSaving(false);
    }
  };

  const TOGGLES = [
    { key: 'show_gym_name',      label: 'Gym Name',            icon: '🏋️', description: 'Display your gym name on the card' },
    { key: 'show_gymly_label',   label: '"Gymly Member Card" Label', icon: '🏷️', description: 'Show "GYMLY MEMBER CARD" branding text below the gym name' },
    { key: 'show_member_name',   label: 'Member Name',    icon: '👤', description: 'Show the member\'s full name' },
    { key: 'show_photo',         label: 'Member Photo',   icon: '📷', description: 'Display profile picture or initials avatar' },
    { key: 'show_member_id',     label: 'Member ID',      icon: '🔢', description: 'Show member number (e.g. MEM-001)' },
    { key: 'show_enrollment_id', label: 'Enrollment ID',  icon: '📋', description: 'Show enrollment/batch code' },
    { key: 'show_plan',          label: 'Plan Name',      icon: '🎟️', description: 'Show active membership plan name' },
    { key: 'show_expiry',        label: 'Valid Till Date', icon: '📅', description: 'Show membership expiry date' },
    { key: 'show_phone',         label: 'Phone Number',   icon: '📱', description: 'Display member phone number' },
    { key: 'show_qr',            label: 'QR Code',        icon: '⬛', description: 'Show scannable QR code for check-in' },
    { key: 'show_status',        label: 'Status Badge',   icon: '✅', description: 'Show Active / Expiring / Expired badge' },
  ];

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner spinner-primary" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--grad-role, #f6f3f5)', paddingBottom: 100 }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(252,248,251,0.9)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(83,74,183,0.1)',
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(200,196,213,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#474553' }}>arrow_back_ios</span>
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1b1b1d' }}>Membership Card Design</h1>
          <div style={{ fontSize: 12, color: '#787584' }}>Changes apply to all member cards instantly</div>
        </div>
        {saving && <div className="spinner spinner-primary" style={{ width: 18, height: 18 }} />}
      </div>

      <div style={{ padding: '24px 20px', maxWidth: 640, margin: '0 auto' }}>
        {/* Live Preview */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#474553', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>preview</span>
            Live Preview
          </div>
          <PreviewCard settings={settings} gym={gym} ownerDoc={userDoc} disabled={settings.card_enabled === false} />
          <div style={{ fontSize: 12, color: '#787584', textAlign: 'center', marginTop: 10 }}>
            Preview uses your gym name and profile. Members will see their own data.
          </div>
        </div>

        {/* Master Toggle: Enable / Disable Member Card */}
        <div style={{
          background: settings.card_enabled !== false ? 'rgba(83,74,183,0.06)' : 'rgba(186,26,26,0.06)',
          border: `1px solid ${settings.card_enabled !== false ? 'rgba(83,74,183,0.18)' : 'rgba(186,26,26,0.22)'}`,
          borderRadius: 20, padding: '4px 20px', marginBottom: 16,
          boxShadow: '0 4px 16px rgba(83,74,183,0.05)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#474553', padding: '16px 0 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Feature
          </div>
          <ToggleRow
            label="Member Card Enabled"
            icon={settings.card_enabled !== false ? '💳' : '🚫'}
            description={
              settings.card_enabled !== false
                ? 'Members can view their Digital ID card in the app'
                : 'Card disabled — members will see a "Not Available" screen'
            }
            value={settings.card_enabled !== false}
            onChange={(v) => handleToggle('card_enabled', v)}
          />
          <div style={{ height: 8 }} />
        </div>

        {/* Toggle Controls */}
        <div style={{
          background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.8)', borderRadius: 20,
          padding: '4px 20px', boxShadow: '0 4px 16px rgba(83,74,183,0.07)',
          opacity: settings.card_enabled !== false ? 1 : 0.45,
          pointerEvents: settings.card_enabled !== false ? 'auto' : 'none',
          transition: 'opacity 0.2s',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#474553', padding: '16px 0 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Card Fields
          </div>
          {TOGGLES.map(({ key, label, icon, description }) => (
            <ToggleRow
              key={key}
              label={label}
              icon={icon}
              description={description}
              value={settings[key] ?? true}
              onChange={(v) => handleToggle(key, v)}
            />
          ))}
          <div style={{ height: 8 }} />
        </div>

        <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(83,74,183,0.06)', borderRadius: 14, border: '1px solid rgba(83,74,183,0.12)' }}>
          <div style={{ fontSize: 12, color: '#534ab7', lineHeight: 1.5 }}>
            💡 <strong>Tip:</strong> These settings control what's shown on the <strong>Digital ID</strong> card your members see in the app. Toggle fields on or off — changes apply immediately to all members.
          </div>
        </div>
      </div>
    </div>
  );
};

export default CardEditor;
