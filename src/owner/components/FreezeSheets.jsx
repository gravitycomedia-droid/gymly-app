// Freeze / unfreeze a membership (owner & manager). Both go through callables
// (freezeMembership / unfreezeMembership) that re-check role, gym, limits and
// price the freeze fee server-side. Also used by the staff profile page
// (src/pages/Members/MemberProfile.jsx) inside <Gl2Scope>.

import { useState } from 'react';
import EditSheet from './EditSheet';
import { freezeMembership, unfreezeMembership } from '../../firebase/firestore-bio';
import { formatDate } from '../../utils/helpers';
import {
  getFreezeSettings, freezesUsed, frozenDaysSoFar, expiryIfUnfrozenNow, toDate,
} from '../../utils/freeze';
import '../theme.css';

const DAY_MS = 86400000;
const FEE_METHODS = [{ id: 'cash', label: 'Cash' }, { id: 'upi', label: 'UPI' }, { id: 'online', label: 'Card / online' }];

/** Owner design-system scope for pages outside the owner shell. */
export function Gl2Scope({ children }) {
  return <div className="gl2-app" style={{ display: 'contents' }}>{children}</div>;
}

const note = { margin: '0 0 12px', fontSize: 13, color: 'var(--gl2-muted)', lineHeight: 1.45 };
const infoBox = { padding: '10px 12px', borderRadius: 12, background: 'var(--gl2-primary-tint-2)', border: '1px solid var(--gl2-primary-border)', fontSize: 13.5, marginBottom: 12, lineHeight: 1.5 };

export function FreezeMembershipSheet({ member, gym, onClose, onDone, showToast }) {
  const settings = getFreezeSettings(gym);
  const used = freezesUsed(member);
  const limitReached = used >= settings.max_per_membership;
  const [days, setDays] = useState(settings.durations[0]);
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState('cash');
  const [upiRef, setUpiRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [openedAt] = useState(() => Date.now());

  const expiry = toDate(member.subscription_expiry);
  const daysLeft = expiry ? Math.max(0, Math.ceil((expiry.getTime() - openedAt) / DAY_MS)) : 0;
  const unfreezeOn = new Date(openedAt + days * DAY_MS);
  const expiryAfter = expiry ? new Date(expiry.getTime() + days * DAY_MS) : null;
  const blocked = !settings.enabled || limitReached || !expiry || daysLeft <= 0;

  const submit = async () => {
    if (blocked) return;
    setSaving(true);
    try {
      const res = await freezeMembership({
        memberId: member.id, days, reason: reason.trim(),
        ...(settings.fee > 0 ? { method, upiRef: method === 'upi' ? upiRef.trim() : '' } : {}),
      });
      showToast(`Membership frozen for ${days} days — unfreezes on ${formatDate(new Date(res.frozenUntil))}${res.fee ? ` · ₹${res.fee} fee recorded` : ''}`, 'success');
      onDone?.();
      onClose();
    } catch (err) {
      showToast(err?.message || 'Could not freeze membership', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditSheet title="Freeze membership" onClose={onClose}>
      <p style={note}>
        Days stop counting while the membership is frozen — useful for trips or illness. When the freeze ends, the frozen days are added back to the expiry.
      </p>

      {!settings.enabled ? (
        <div style={infoBox}>Membership freeze is turned off for this gym. The owner can turn it on in <strong>Settings → Membership freeze</strong>.</div>
      ) : !expiry || daysLeft <= 0 ? (
        <div style={infoBox}>Only an active membership can be frozen. Renew it first.</div>
      ) : limitReached ? (
        <div style={infoBox}>All <strong>{settings.max_per_membership}</strong> freeze{settings.max_per_membership === 1 ? '' : 's'} for this membership have been used. The count resets on the next renewal.</div>
      ) : (
        <>
          <div style={infoBox}>
            Valid till <strong>{formatDate(expiry)}</strong> · {daysLeft} day{daysLeft === 1 ? '' : 's'} left<br />
            Freezes used: <strong>{used} of {settings.max_per_membership}</strong> this membership
          </div>

          <p className="gl2-field-label" style={{ margin: '0 0 6px' }}>Freeze for</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {settings.durations.map((d) => (
              <button key={d} type="button" className={`gl2-filter-chip ${days === d ? 'active' : ''}`} style={{ flex: '1 0 70px' }} onClick={() => setDays(d)}>{d} days</button>
            ))}
          </div>

          <label className="gl2-field" style={{ marginBottom: 12 }}>
            <span className="gl2-field-label">Reason (optional)</span>
            <input type="text" className="gl2-input" maxLength={200} placeholder="e.g. Travelling to Goa" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>

          {settings.fee > 0 && (
            <div style={{ marginBottom: 12 }}>
              <p className="gl2-field-label" style={{ margin: '0 0 6px' }}>Freeze fee · ₹{settings.fee.toLocaleString('en-IN')} — paid by</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {FEE_METHODS.map((m) => (
                  <button key={m.id} type="button" className={`gl2-filter-chip ${method === m.id ? 'active' : ''}`} onClick={() => setMethod(m.id)}>{m.label}</button>
                ))}
              </div>
              {method === 'upi' && (
                <input type="text" className="gl2-input" style={{ marginTop: 8 }} maxLength={60} placeholder="UPI reference (optional)" value={upiRef} onChange={(e) => setUpiRef(e.target.value)} />
              )}
            </div>
          )}

          <p style={{ margin: '0 0 6px', fontSize: 13.5 }}>Unfreezes automatically on <strong>{formatDate(unfreezeOn)}</strong>{expiryAfter && <> · new expiry <strong>{formatDate(expiryAfter)}</strong></>}</p>
          <p style={note}>
            {settings.entry_policy === 'block'
              ? 'They can’t check in while frozen. You can unfreeze early from their profile — only the days frozen so far are added.'
              : 'If they check in during the freeze, it ends automatically and only the days frozen so far are added. You can also unfreeze early from their profile.'}
          </p>
        </>
      )}

      <button type="button" className="gl2-btn gl2-btn-primary gl2-btn-lg" style={{ width: '100%' }} onClick={submit} disabled={saving || blocked}>
        {saving ? 'Freezing…' : `Freeze for ${days} days${settings.fee > 0 && !blocked ? ` · ₹${settings.fee.toLocaleString('en-IN')}` : ''}`}
      </button>
    </EditSheet>
  );
}

export function UnfreezeMembershipSheet({ member, onClose, onDone, showToast, notice }) {
  const [saving, setSaving] = useState(false);
  const soFar = frozenDaysSoFar(member);
  const newExpiry = expiryIfUnfrozenNow(member);
  const frozenAt = toDate(member.frozen_at);
  const until = toDate(member.frozen_until);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await unfreezeMembership({ memberId: member.id });
      showToast(
        res.days > 0
          ? `Unfrozen — ${res.days} day${res.days === 1 ? '' : 's'} added, valid till ${formatDate(new Date(res.newExpiry))}`
          : 'Unfrozen — no days added (frozen today)',
        'success'
      );
      onDone?.(res);
      onClose();
    } catch (err) {
      showToast(err?.message || 'Could not unfreeze membership', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditSheet title="Unfreeze membership" onClose={onClose}>
      {notice && <div style={{ ...infoBox, background: 'var(--gl2-warning-bg)', borderColor: '#F3DDBF' }}>{notice}</div>}
      <div style={infoBox}>
        Frozen since <strong>{frozenAt ? formatDate(frozenAt) : '—'}</strong> · {soFar} day{soFar === 1 ? '' : 's'} so far
        {until && <><br />Planned to unfreeze on <strong>{formatDate(until)}</strong></>}
        {member.freeze_reason && <><br />Reason: {member.freeze_reason}</>}
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 13.5 }}>
        {soFar > 0
          ? <>Unfreezing now adds <strong>{soFar} day{soFar === 1 ? '' : 's'}</strong> — valid till <strong>{newExpiry ? formatDate(newExpiry) : '—'}</strong>.</>
          : <>It was frozen today, so no days are added.</>}
      </p>
      <button type="button" className="gl2-btn gl2-btn-primary gl2-btn-lg" style={{ width: '100%' }} onClick={submit} disabled={saving}>
        {saving ? 'Unfreezing…' : 'Unfreeze now'}
      </button>
    </EditSheet>
  );
}
