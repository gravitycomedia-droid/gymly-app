import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { getGym, updateGym } from '../../../firebase/firestore';
import { ToggleRow } from '../../components/EditSheet';
import PageSkeleton from '../../primitives/PageSkeleton';
import { getFreezeSettings } from '../../../utils/freeze';

// Owner-only: gym.settings.freeze. Read by the freezeMembership callable
// (durations, limit, fee, entry policy) — the server re-validates every value.
const MAX_DURATIONS = 6;

const ENTRY_OPTIONS = [
  { id: 'unfreeze', title: 'Allow entry and end the freeze', desc: 'If a frozen member checks in, their freeze ends automatically and only the days frozen so far are added back.', recommended: true },
  { id: 'block', title: 'Block entry while frozen', desc: 'Fingerprint, kiosk and QR check-in are denied until staff unfreeze the membership.' },
];

export default function FreezeSettings() {
  const navigate = useNavigate();
  const { userDoc } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(getFreezeSettings(null));
  const [newDuration, setNewDuration] = useState('');

  useEffect(() => {
    if (!userDoc?.gym_id) return;
    getGym(userDoc.gym_id)
      .then((gym) => setForm(getFreezeSettings(gym)))
      .catch(() => showToast('Failed to load freeze settings', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userDoc?.gym_id]);

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const addDuration = () => {
    const d = parseInt(newDuration, 10);
    if (!Number.isInteger(d) || d < 1 || d > 365) { showToast('Enter a number of days between 1 and 365', 'error'); return; }
    if (form.durations.includes(d)) { showToast(`${d} days is already in the list`, 'error'); return; }
    if (form.durations.length >= MAX_DURATIONS) { showToast(`Up to ${MAX_DURATIONS} durations`, 'error'); return; }
    update('durations', [...form.durations, d].sort((a, b) => a - b));
    setNewDuration('');
  };

  const removeDuration = (d) => {
    if (form.durations.length <= 1) { showToast('Keep at least one duration', 'error'); return; }
    update('durations', form.durations.filter((x) => x !== d));
  };

  const save = async () => {
    const max = parseInt(form.max_per_membership, 10);
    const fee = form.fee === '' ? 0 : Number(form.fee);
    if (!Number.isInteger(max) || max < 0 || max > 20) { showToast('Freezes per membership must be between 0 and 20', 'error'); return; }
    if (!Number.isFinite(fee) || fee < 0 || fee > 100000) { showToast('Enter a valid freeze fee', 'error'); return; }
    setSaving(true);
    try {
      await updateGym(userDoc.gym_id, {
        'settings.freeze': {
          enabled: !!form.enabled,
          durations: form.durations,
          max_per_membership: max,
          fee: Math.round(fee),
          entry_policy: form.entry_policy === 'block' ? 'block' : 'unfreeze',
        },
      });
      showToast('Freeze settings saved', 'success');
    } catch (err) {
      console.error('Save freeze settings error:', err);
      showToast('Failed to save freeze settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageSkeleton variant="card" />;

  return (
    <section data-screen-label="Membership freeze">
      <button type="button" className="gl2-back-link" onClick={() => navigate('/owner/settings')}>
        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_back_ios</span>Settings
      </button>
      <div className="gl2-page-header">
        <h1 className="gl2-page-title">Membership freeze</h1>
        <button type="button" className="gl2-btn gl2-btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
      <p className="gl2-page-sub" style={{ marginBottom: 14 }}>
        Let members pause their membership for trips or illness. Days stop counting while frozen and are added back when it ends. Owners and managers can freeze from a member’s profile.
      </p>

      <div className="gl2-card" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <ToggleRow label="Allow membership freeze" description="Turn off to hide freezing for everyone. Members already frozen stay frozen until they’re unfrozen." value={form.enabled} onChange={(v) => update('enabled', v)} />

        <div>
          <p className="gl2-eyebrow" style={{ marginBottom: 8 }}>Freeze durations</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {form.durations.map((d) => (
              <span key={d} className="gl2-filter-chip active" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {d} days
                <button type="button" aria-label={`Remove ${d} days`} onClick={() => removeDuration(d)} style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'flex' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, maxWidth: 280 }}>
            <input className="gl2-input" type="number" inputMode="numeric" min="1" max="365" placeholder="Days, e.g. 21" value={newDuration} onChange={(e) => setNewDuration(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addDuration(); }} />
            <button type="button" className="gl2-btn gl2-btn-secondary" style={{ flex: 'none' }} onClick={addDuration}>Add</button>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--gl2-muted)' }}>Staff pick one of these when freezing. Standard: 7, 14 and 30 days.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <label className="gl2-field">
            <span className="gl2-field-label">Freezes per membership</span>
            <input className="gl2-input" type="number" inputMode="numeric" min="0" max="20" value={form.max_per_membership} onChange={(e) => update('max_per_membership', e.target.value)} />
            <span style={{ fontSize: 12, color: 'var(--gl2-muted)' }}>Resets when the membership is renewed.</span>
          </label>
          <label className="gl2-field">
            <span className="gl2-field-label">Freeze fee (₹)</span>
            <input className="gl2-input" type="number" inputMode="numeric" min="0" placeholder="0" value={form.fee} onChange={(e) => update('fee', e.target.value)} />
            <span style={{ fontSize: 12, color: 'var(--gl2-muted)' }}>0 = free. A fee is recorded as a paid payment with an invoice number.</span>
          </label>
        </div>

        <div>
          <p className="gl2-eyebrow" style={{ marginBottom: 8 }}>When a frozen member checks in</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ENTRY_OPTIONS.map((o) => {
              const selected = form.entry_policy === o.id;
              return (
                <button key={o.id} type="button" onClick={() => update('entry_policy', o.id)} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left', padding: '12px 14px', borderRadius: 14, cursor: 'pointer', font: 'inherit', color: 'inherit', background: selected ? 'var(--gl2-primary-tint-2)' : 'var(--gl2-surface)', border: `1.5px solid ${selected ? 'var(--gl2-primary)' : 'var(--gl2-border)'}` }}>
                  <span style={{ width: 18, height: 18, borderRadius: 9, flex: 'none', marginTop: 2, border: `2px solid ${selected ? 'var(--gl2-primary)' : 'var(--gl2-muted-2)'}`, boxShadow: selected ? 'inset 0 0 0 3px #fff' : 'none', background: selected ? 'var(--gl2-primary)' : 'transparent' }} />
                  <span>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>{o.title}{o.recommended && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: 'var(--gl2-success-fg)' }}>Recommended</span>}</span>
                    <span style={{ display: 'block', marginTop: 2, fontSize: 12.5, color: 'var(--gl2-muted)' }}>{o.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--gl2-muted)' }}>Applies to freezes started after you save.</p>
        </div>
      </div>
    </section>
  );
}
