"use strict";

// D2b — "Extend membership by N days" from the member profile.
// Owner/manager only. New expiry = max(current expiry, start of today IST) + N days.
// Writes a renewal_history entry and an audit event. The biometric member
// trigger then sees the subscription_expiry change and re-adds the member to
// the gym's devices.

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { startOfTodayIST, toMillis, DAY_MS } = require("./lib/membership");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const HttpsError = functions.https.HttpsError;

function computeExtendedExpiry(currentExpiry, days, now = new Date()) {
  const currentMs = toMillis(currentExpiry);
  const floorMs = startOfTodayIST(now).getTime();
  const baseMs = currentMs != null && currentMs > floorMs ? currentMs : floorMs;
  return new Date(baseMs + days * DAY_MS);
}

exports.computeExtendedExpiry = computeExtendedExpiry;

exports.extendMembership = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
  const token = context.auth.token || {};
  const gymId = token.gym_id;
  if (!gymId || !["owner", "manager"].includes(token.role)) {
    throw new HttpsError("permission-denied", "Only owners or managers can extend a membership.");
  }

  const memberId = data && data.memberId;
  const days = data && data.days;
  if (typeof memberId !== "string" || !memberId || memberId.includes("/")) {
    throw new HttpsError("invalid-argument", "memberId is required.");
  }
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new HttpsError("invalid-argument", "days must be a whole number between 1 and 365.");
  }
  const reason = typeof (data && data.reason) === "string"
    ? data.reason.trim().slice(0, 200)
    : "";

  const memberRef = db.doc(`users/${memberId}`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(memberRef);
    if (!snap.exists) throw new HttpsError("not-found", "Member not found.");
    const member = snap.data();
    if (member.gym_id !== gymId) {
      throw new HttpsError("permission-denied", "Member belongs to a different gym.");
    }
    if (member.role !== "member") {
      throw new HttpsError("failed-precondition", "Only member records can be extended.");
    }
    if (member.is_deleted === true) {
      throw new HttpsError("failed-precondition", "Restore this member before extending.");
    }

    const now = new Date();
    const oldMs = toMillis(member.subscription_expiry);
    const newExpiry = computeExtendedExpiry(member.subscription_expiry, days, now);
    const nowTs = admin.firestore.Timestamp.fromDate(now);

    tx.update(memberRef, {
      subscription_expiry: admin.firestore.Timestamp.fromDate(newExpiry),
      renewal_history: admin.firestore.FieldValue.arrayUnion({
        type: "extension",
        renewed_at: now.toISOString(),
        renewed_by: token.role,
        renewed_by_uid: context.auth.uid,
        plan_id: member.plan_id || null,
        days,
        reason: reason || null,
        old_expiry: oldMs != null ? new Date(oldMs).toISOString() : null,
        new_expiry: newExpiry.toISOString(),
      }),
    });
    tx.set(db.collection("audit_logs").doc(gymId).collection("events").doc(), {
      action: "membership_extended",
      target_id: memberId,
      target_name: member.name || "",
      days,
      reason: reason || null,
      old_expiry: member.subscription_expiry || null,
      new_expiry: admin.firestore.Timestamp.fromDate(newExpiry),
      performed_by: context.auth.uid,
      timestamp: nowTs,
    });

    return { memberId, newExpiry: newExpiry.toISOString(), days };
  });
});
