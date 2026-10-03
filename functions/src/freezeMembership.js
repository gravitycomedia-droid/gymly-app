"use strict";

// Freeze / unfreeze a membership from the member profile (owner/manager).
//
// freezeMembership   { memberId, days, reason, method, upiRef }
//   Starts a freeze of one of the gym's allowed durations. Days stop counting:
//   the expiry is untouched until the freeze ends. If the gym charges a freeze
//   fee it is recorded here as a paid payment, priced server-side from
//   gym.settings.freeze.fee (never from the client).
// unfreezeMembership { memberId }
//   Ends it early; the whole days spent frozen are added to the expiry.
//
// Freezes also end automatically — on frozen_until (02:00 IST job, see
// runAutoUnfreeze) and, unless the gym blocks entry while frozen, when the
// member checks in (processScan / onAttendanceLogCreate).

const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

const { startOfTodayIST, toMillis, DAY_MS } = require("./lib/membership");
const { freezeSettings, freezesUsed, unfreezeMemberById } = require("./lib/freeze");

const db = admin.firestore();
const HttpsError = functions.https.HttpsError;
const FEE_METHODS = ["cash", "upi", "online"];

function requireStaff(context) {
  if (!context.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
  const token = context.auth.token || {};
  if (!token.gym_id || !["owner", "manager"].includes(token.role)) {
    throw new HttpsError("permission-denied", "Only owners or managers can freeze a membership.");
  }
  return token;
}

function requireMemberId(data) {
  const memberId = data && data.memberId;
  if (typeof memberId !== "string" || !memberId || memberId.includes("/")) {
    throw new HttpsError("invalid-argument", "memberId is required.");
  }
  return memberId;
}

exports.freezeMembership = functions.https.onCall(async (data, context) => {
  const token = requireStaff(context);
  const gymId = token.gym_id;
  const memberId = requireMemberId(data);
  const days = data && data.days;
  if (!Number.isInteger(days)) throw new HttpsError("invalid-argument", "days must be a whole number.");
  const reason = typeof (data && data.reason) === "string" ? data.reason.trim().slice(0, 200) : "";
  const method = data && data.method;
  const upiRef = typeof (data && data.upiRef) === "string" ? data.upiRef.trim().slice(0, 60) : "";

  const memberRef = db.doc(`users/${memberId}`);
  const gymRef = db.doc(`gyms/${gymId}`);
  const counterRef = db.doc(`invoice_counter/${gymId}`);
  const numberingRef = db.doc(`numbering_settings/${gymId}`);

  return db.runTransaction(async (tx) => {
    // All reads first (Firestore transactions).
    const [memberSnap, gymSnap, counterSnap, numberingSnap] = await Promise.all([
      tx.get(memberRef), tx.get(gymRef), tx.get(counterRef), tx.get(numberingRef),
    ]);
    if (!memberSnap.exists) throw new HttpsError("not-found", "Member not found.");
    const member = memberSnap.data();
    if (member.gym_id !== gymId) throw new HttpsError("permission-denied", "Member belongs to a different gym.");
    if (member.role !== "member") throw new HttpsError("failed-precondition", "Only member records can be frozen.");
    if (member.is_deleted === true) throw new HttpsError("failed-precondition", "Restore this member before freezing.");
    if (member.frozen === true) throw new HttpsError("failed-precondition", "This membership is already frozen.");

    const settings = freezeSettings(gymSnap.exists ? gymSnap.data() : null);
    if (!settings.enabled) throw new HttpsError("failed-precondition", "Membership freeze is turned off in Settings.");
    if (!settings.durations.includes(days)) {
      throw new HttpsError("invalid-argument", `Choose one of the allowed durations: ${settings.durations.join(", ")} days.`);
    }

    const now = new Date();
    const todayStart = startOfTodayIST(now).getTime();
    const expiryMs = toMillis(member.subscription_expiry);
    if (expiryMs == null || expiryMs < todayStart) {
      throw new HttpsError("failed-precondition", "Only an active membership can be frozen.");
    }
    const used = freezesUsed(member);
    if (used >= settings.max_per_membership) {
      throw new HttpsError(
        "failed-precondition",
        settings.max_per_membership === 0
          ? "Freezing is not allowed for this gym."
          : `All ${settings.max_per_membership} freezes for this membership have been used.`
      );
    }

    const fee = settings.fee;
    if (fee > 0 && !FEE_METHODS.includes(method)) {
      throw new HttpsError("invalid-argument", "Choose how the freeze fee was paid.");
    }

    const nowTs = admin.firestore.Timestamp.fromDate(now);
    const frozenUntil = new Date(todayStart + days * DAY_MS);

    // Freeze fee → a paid payment, same shape and invoice series as renewals.
    let paymentId = null;
    if (fee > 0) {
      const next = counterSnap.exists ? (counterSnap.data().last_number || 0) + 1 : 1;
      const prefix = (numberingSnap.exists && numberingSnap.data().gymPrefix)
        || (counterSnap.exists && counterSnap.data().prefix)
        || "GYM";
      tx.set(counterRef, { last_number: next, gym_id: gymId, prefix }, { merge: true });
      const paymentRef = db.collection("payments").doc();
      paymentId = paymentRef.id;
      tx.set(paymentRef, {
        gym_id: gymId,
        member_id: memberId,
        member_name: member.name || "",
        member_phone: member.phone || null,
        plan_id: null,
        plan_name: `Membership freeze (${days} days)`,
        plan_auto_extend: false,
        type: "freeze_fee",
        amount: fee,
        discount: 0,
        final_amount: fee,
        paid_amount: fee,
        pending_amount: 0,
        method,
        upi_ref: method === "upi" ? (upiRef || null) : null,
        status: "paid",
        payment_date: nowTs,
        due_date: null,
        membership_start: null,
        membership_end: null,
        invoice_number: `${prefix}-${now.getFullYear()}-${String(next).padStart(4, "0")}`,
        invoice_url: null,
        whatsapp_sent: false,
        recorded_by: context.auth.uid,
        notes: `Freeze fee (${days} days)`,
        enrollmentNumber: null,
        created_at: nowTs,
      });
    }

    tx.update(memberRef, {
      frozen: true,
      frozen_at: nowTs,
      frozen_until: admin.firestore.Timestamp.fromDate(frozenUntil),
      freeze_days: days,
      freeze_reason: reason || null,
      freeze_entry_policy: settings.entry_policy,
      frozen_by_uid: context.auth.uid,
      freeze_fee: fee,
      freeze_payment_id: paymentId,
    });
    tx.set(db.collection("audit_logs").doc(gymId).collection("events").doc(), {
      action: "membership_frozen",
      target_id: memberId,
      target_name: member.name || "",
      days,
      reason: reason || null,
      fee,
      payment_id: paymentId,
      frozen_until: admin.firestore.Timestamp.fromDate(frozenUntil),
      performed_by: context.auth.uid,
      timestamp: nowTs,
    });

    return {
      memberId,
      days,
      frozenUntil: frozenUntil.toISOString(),
      fee,
      paymentId,
      freezesUsed: used + 1,
      freezesAllowed: settings.max_per_membership,
    };
  });
});

exports.unfreezeMembership = functions.https.onCall(async (data, context) => {
  const token = requireStaff(context);
  const memberId = requireMemberId(data);

  const snap = await db.doc(`users/${memberId}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "Member not found.");
  if (snap.data().gym_id !== token.gym_id) throw new HttpsError("permission-denied", "Member belongs to a different gym.");

  const result = await unfreezeMemberById(db, memberId, "staff", { byUid: context.auth.uid });
  if (!result) throw new HttpsError("failed-precondition", "This membership is not frozen.");
  return result;
});

// Fingerprint punches (bio-gateway) and any other check-in write an
// attendance_logs entry: under the default 'unfreeze' entry policy that ends
// the freeze. processScan already unfreezes inside its own transaction, so for
// QR/kiosk check-ins this finds the member unfrozen and does nothing.
exports.onAttendanceLogCreate = functions.firestore
  .document("attendance_logs/{logId}")
  .onCreate(async (snap) => {
    const log = snap.data() || {};
    if (!log.member_id || typeof log.member_id !== "string") return null;
    try {
      const res = await unfreezeMemberById(db, log.member_id, "checkin", { skipIfBlocking: true });
      if (res) console.log(`Freeze ended by check-in: ${JSON.stringify(res)}`);
    } catch (err) {
      console.error(`onAttendanceLogCreate unfreeze failed for ${log.member_id}:`, err);
    }
    return null;
  });

// 02:00 IST: end every freeze whose frozen_until has arrived. Called from the
// existing daily job (memberLifecycle.permanentlyDeleteExpired).
async function runAutoUnfreeze(now = new Date()) {
  const snap = await db.collection("users").where("frozen", "==", true).get();
  const due = snap.docs.filter((d) => {
    const until = toMillis(d.data().frozen_until);
    return until != null && until <= now.getTime();
  });
  let ended = 0;
  for (const d of due) {
    try {
      if (await unfreezeMemberById(db, d.id, "auto")) ended += 1;
    } catch (err) {
      console.error(`Auto-unfreeze failed for ${d.id}:`, err);
    }
  }
  return { frozen: snap.size, ended };
}

exports.runAutoUnfreeze = runAutoUnfreeze;
