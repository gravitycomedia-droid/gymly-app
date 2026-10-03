// Client mirror of functions/src/lib/freeze.js — for display only. Every
// freeze/unfreeze goes through the freezeMembership / unfreezeMembership
// callables, which re-check all of this server-side.

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 86400000;

export const DEFAULT_FREEZE_SETTINGS = {
  enabled: true,
  durations: [7, 14, 30],
  max_per_membership: 2,
  fee: 0,
  entry_policy: 'unfreeze', // 'unfreeze' = allow entry and end the freeze; 'block' = deny entry
};

const toMillis = (v) => {
  if (v == null) return null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  const ms = typeof v === 'number' ? v : Date.parse(v);
  return Number.isNaN(ms) ? null : ms;
};

const startOfDayIST = (ms) => {
  const ist = ms + IST_OFFSET_MS;
  return ist - (((ist % DAY_MS) + DAY_MS) % DAY_MS) - IST_OFFSET_MS;
};

export const toDate = (v) => {
  const ms = toMillis(v);
  return ms == null ? null : new Date(ms);
};

export function getFreezeSettings(gym) {
  const s = gym?.settings?.freeze || {};
  const durations = Array.isArray(s.durations)
    ? [...new Set(s.durations.filter((d) => Number.isInteger(d) && d >= 1 && d <= 365))].sort((a, b) => a - b)
    : [];
  return {
    enabled: s.enabled !== false,
    durations: durations.length ? durations : DEFAULT_FREEZE_SETTINGS.durations,
    max_per_membership: Number.isInteger(s.max_per_membership) && s.max_per_membership >= 0 && s.max_per_membership <= 20
      ? s.max_per_membership
      : DEFAULT_FREEZE_SETTINGS.max_per_membership,
    fee: Number.isFinite(s.fee) && s.fee > 0 ? Math.round(s.fee) : 0,
    entry_policy: s.entry_policy === 'block' ? 'block' : 'unfreeze',
  };
}

export const isFrozen = (member) => member?.frozen === true;

export function freezesUsed(member) {
  let start = toMillis(member?.start_date) || toMillis(member?.created_at) || 0;
  for (const r of member?.renewal_history || []) {
    if (!r || r.type) continue;
    const ms = toMillis(r.renewed_at);
    if (ms && ms > start) start = ms;
  }
  const done = (member?.freeze_history || []).filter((f) => (toMillis(f?.frozen_at) || 0) >= start).length;
  return done + (isFrozen(member) ? 1 : 0);
}

/** Whole IST days the member has been frozen so far (capped at the planned length). */
export function frozenDaysSoFar(member, now = Date.now()) {
  const start = toMillis(member?.frozen_at);
  if (start == null) return 0;
  const days = Math.max(0, Math.round((startOfDayIST(now) - startOfDayIST(start)) / DAY_MS));
  return Number.isInteger(member?.freeze_days) ? Math.min(days, member.freeze_days) : days;
}

/** Days left on the membership, frozen at the value it had when the freeze began. */
export function remainingDaysAtFreeze(member) {
  const exp = toMillis(member?.subscription_expiry);
  const start = toMillis(member?.frozen_at);
  if (exp == null || start == null) return 0;
  return Math.max(0, Math.ceil((exp - start) / DAY_MS));
}

/** Expiry the member would get if unfrozen now. */
export function expiryIfUnfrozenNow(member, now = Date.now()) {
  const exp = toMillis(member?.subscription_expiry);
  return exp == null ? null : new Date(exp + frozenDaysSoFar(member, now) * DAY_MS);
}
