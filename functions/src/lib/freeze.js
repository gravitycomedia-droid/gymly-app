"use strict";

// Shared membership-freeze rules. One definition used by the freeze/unfreeze
// callables, processScan (check-in ends a freeze), the attendance trigger
// (fingerprint punches end a freeze) and the 02:00 IST auto-unfreeze job.
//
// Model: freezing records when it started; nothing about the expiry changes
// while frozen. Unfreezing adds the whole IST days spent frozen (capped at the
// planned length) to subscription_expiry. Member doc fields (all additive):
//   frozen, frozen_at, frozen_until, freeze_days, freeze_reason,
//   freeze_entry_policy, frozen_by_uid, freeze_fee, freeze_payment_id,
//   freeze_history[] (one entry per completed freeze).

const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

const { toMillis, startOfTodayIST, DAY_MS } = require("./membership");

const DEFAULT_FREEZE_SETTINGS = {
  enabled: true,
  durations: [7, 14, 30],
  max_per_membership: 2,
  fee: 0,
  entry_policy: "unfreeze", // 'unfreeze' = allow entry and end the freeze; 'block' = deny entry
};

// gym.settings.freeze with defaults and sanitising (owner-edited, client-written).
function freezeSettings(gym) {
  const s = (gym && gym.settings && gym.settings.freeze) || {};
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
    entry_policy: s.entry_policy === "block" ? "block" : "unfreeze",
  };
}

// Start of the membership period freezes are counted against: the latest paid
// renewal, else the join date. Typed history entries (extensions) don't start
// a new period.
function periodStartMs(member) {
  let start = toMillis(member.start_date) || toMillis(member.created_at) || 0;
  for (const r of member.renewal_history || []) {
    if (!r || r.type) continue;
    const ms = toMillis(r.renewed_at);
    if (ms && ms > start) start = ms;
  }
  return start;
}

// Freezes used in the current membership period, including one in progress.
function freezesUsed(member) {
  const start = periodStartMs(member);
  const done = (member.freeze_history || []).filter((f) => (toMillis(f && f.frozen_at) || 0) >= start).length;
  return done + (member.frozen === true ? 1 : 0);
}

// Whole IST calendar days from the day the freeze began to `now`.
function frozenDaysSoFar(member, now = new Date()) {
  const startMs = toMillis(member.frozen_at);
  if (startMs == null) return 0;
  const a = startOfTodayIST(new Date(startMs)).getTime();
  const b = startOfTodayIST(now).getTime();
  return Math.max(0, Math.round((b - a) / DAY_MS));
}

// Member-doc update that ends a freeze, plus the history entry. Pure — the
// caller writes it (inside its own transaction).
function buildUnfreeze(member, now, endedBy, endedByUid) {
  const planned = Number.isInteger(member.freeze_days) ? member.freeze_days : null;
  let days = frozenDaysSoFar(member, now);
  if (planned != null) days = Math.min(days, planned);

  const oldMs = toMillis(member.subscription_expiry);
  const newExpiry = oldMs != null ? new Date(oldMs + days * DAY_MS) : null;
  const frozenAtMs = toMillis(member.frozen_at);

  const entry = {
    frozen_at: frozenAtMs != null ? new Date(frozenAtMs).toISOString() : null,
    unfrozen_at: now.toISOString(),
    planned_days: planned,
    actual_days: days,
    reason: member.freeze_reason || null,
    fee: member.freeze_fee || 0,
    payment_id: member.freeze_payment_id || null,
    ended_by: endedBy, // 'staff' | 'auto' | 'checkin'
    ended_by_uid: endedByUid || null,
    old_expiry: oldMs != null ? new Date(oldMs).toISOString() : null,
    new_expiry: newExpiry ? newExpiry.toISOString() : null,
  };

  const update = {
    frozen: false,
    frozen_at: null,
    frozen_until: null,
    freeze_days: null,
    freeze_reason: null,
    freeze_entry_policy: null,
    frozen_by_uid: null,
    freeze_fee: null,
    freeze_payment_id: null,
    freeze_history: admin.firestore.FieldValue.arrayUnion(entry),
  };
  if (newExpiry) update.subscription_expiry = admin.firestore.Timestamp.fromDate(newExpiry);

  return { update, entry, days, newExpiry };
}

// End a member's freeze in its own transaction. Idempotent: a member who is no
// longer frozen is left alone. Returns the result or null.
async function unfreezeMemberById(db, memberId, endedBy, opts = {}) {
  const ref = db.doc(`users/${memberId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const member = snap.data();
    if (member.frozen !== true) return null;
    if (opts.skipIfBlocking && member.freeze_entry_policy === "block") return null;

    const now = new Date();
    const result = buildUnfreeze(member, now, endedBy, opts.byUid || null);
    tx.update(ref, result.update);
    if (member.gym_id) {
      tx.set(db.collection("audit_logs").doc(member.gym_id).collection("events").doc(), {
        action: "membership_unfrozen",
        target_id: memberId,
        target_name: member.name || "",
        days: result.days,
        ended_by: endedBy,
        old_expiry: member.subscription_expiry || null,
        new_expiry: result.newExpiry ? admin.firestore.Timestamp.fromDate(result.newExpiry) : null,
        performed_by: opts.byUid || "system",
        timestamp: admin.firestore.Timestamp.fromDate(now),
      });
    }
    return { memberId, days: result.days, newExpiry: result.newExpiry ? result.newExpiry.toISOString() : null };
  });
}

module.exports = {
  DEFAULT_FREEZE_SETTINGS,
  freezeSettings,
  periodStartMs,
  freezesUsed,
  frozenDaysSoFar,
  buildUnfreeze,
  unfreezeMemberById,
};
