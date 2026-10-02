// "Extend membership by N days" (D2b). Owner/manager only — the
// extendMembership callable re-checks role and gym server-side, writes the
// renewal_history entry and an audit log, and the biometric trigger puts the
// member back on the door devices if they had lapsed.

import { useState } from 'react';
import EditSheet from './EditSheet';
import { extendMembership } from '../../firebase/firestore-bio';
import { formatDate } from '../../utils/helpers';

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 86400000;
const PRESETS = [3, 7, 15, 30];

// Same rule as the server: max(current expiry, start of today IST) + days.
function previewExpiry(currentExpiry, days) {
  const current = currentExpiry?.toMillis ? currentExpiry.toMillis() : currentExpiry ? new Date(currentExpiry).getTime() : 0;
  const ist = Date.now() + IST_OFFSET_MS;
  const startOfTodayIst = ist - (ist % DAY_MS) - IST_OFFSET_MS;
  return new Date(Math.max(current, startOfTodayIst) + days * DAY_MS);
}

export default function ExtendMembershipSheet({ member, onClose, onDone, showToast }) {
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const valid = Number.isInteger(days) && days >= 1 && days <= 365;

  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const res = await extendMembership({ memberId: member.id, days, reason: reason.trim() });
      showToast(`Extended by ${days} day${days > 1 ? 's' : ''} — now valid till ${formatDate(new Date(res.newExpiry))}`, 'success');
      onDone?.();
      onClose();
    } catch (err) {
      showToast(err?.message || 'Could not extend membership', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditSheet title="Extend membership" onClose={onClose}>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--gl2-muted)' }}>
        Adds free days without recording a payment — for closures, holidays or goodwill. Currently valid till <strong>{member.subscription_expiry ? formatDate(member.subscription_expiry) : '—'}</strong>.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {PRESETS.map((d) => (
          <button key={d} type="button" className={`gl2-filter-chip ${days === d ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => setDays(d)}>{d} days</button>
        ))}
      </div>
      <label className="gl2-field" style={{ marginBottom: 12 }}>
        <span className="gl2-field-label">Days (1–365)</span>
        <input type="number" className="gl2-input" min="1" max="365" value={Number.isNaN(days) ? '' : days} onChange={(e) => setDays(parseInt(e.target.value, 10))} />
      </label>
      <label className="gl2-field" style={{ marginBottom: 12 }}>
        <span className="gl2-field-label">Reason (optional)</span>
        <input type="text" className="gl2-input" maxLength={200} placeholder="e.g. Gym closed for Diwali" value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {valid && (
        <p style={{ margin: '0 0 12px', fontSize: 13.5 }}>New expiry: <strong>{formatDate(previewExpiry(member.subscription_expiry, days))}</strong></p>
      )}
      <button type="button" className="gl2-btn gl2-btn-primary gl2-btn-lg" style={{ width: '100%' }} onClick={submit} disabled={saving || !valid}>
        {saving ? 'Extending…' : `Extend by ${valid ? days : '…'} day${days === 1 ? '' : 's'}`}
      </button>
    </EditSheet>
  );
}
