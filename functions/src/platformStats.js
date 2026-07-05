"use strict";

const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// Flat monthly price per plan, in RUPEES. Fallback when amount_monthly (paise) absent.
const PLAN_PRICES_INR = {
  FREE: 0, BASIC: 199, PROFESSIONAL: 499, PROFESSIONAL_PLUS: 799, PREMIUM: 999,
};

function monthlyInr(sub) {
  if (!sub) return 0;
  if (typeof sub.amount_monthly === "number" && sub.amount_monthly > 0) {
    return Math.round(sub.amount_monthly / 100);
  }
  return PLAN_PRICES_INR[sub.plan] || 0;
}

// Build the denormalized subscription slice we keep on gym_summaries.
function subSlice(sub) {
  return {
    plan: sub?.plan || "FREE",
    status: sub?.status || "active",
    amount_monthly: sub?.amount_monthly || 0,
    is_trial: sub?.is_trial === true,
    trial_end_date: sub?.trial_end_date || null,
    failed_payment_count: sub?.failed_payment_count || 0,
  };
}

// ── Mirror subscription changes into gym_summaries (SA-3 efficiency) ─────────
// Keeps plan/status/MRR denormalized so the rollup + admin list never read the
// subscriptions collection per-gym.
exports.mirrorSubscriptionToGym = functions.firestore
  .document("subscriptions/{gymId}")
  .onWrite(async (change, context) => {
    const gymId = context.params.gymId;
    if (!change.after.exists) return null; // sub deleted — leave last-known slice
    await db.collection("gym_summaries").doc(gymId).set({
      ...subSlice(change.after.data()),
      updated_at: admin.firestore.Timestamp.now(),
    }, { merge: true });
    return null;
  });

/**
 * Aggregate platform totals from the denormalized gym_summaries collection —
 * N reads, one collection, no per-gym fan-out. Writes platform_stats/global once.
 */
async function recomputePlatformStats() {
  const summariesSnap = await db.collection("gym_summaries").get();

  let totalGyms = 0, activeGyms = 0, trialGyms = 0, pastDueGyms = 0,
      suspendedGyms = 0, totalMembers = 0, totalActiveMembers = 0, mrrInr = 0,
      pastDueInr = 0;

  summariesSnap.forEach((d) => {
    totalGyms++;
    const s = d.data();
    const status = s.status || "active";
    if (status === "active") { activeGyms++; mrrInr += monthlyInr(s); }
    else if (status === "past_due") { pastDueGyms++; pastDueInr += monthlyInr(s); }
    else if (status === "suspended") suspendedGyms++;
    if (s.is_trial) trialGyms++;
    totalMembers += s.member_count || 0;
    totalActiveMembers += s.active_count || 0;
  });

  await db.collection("platform_stats").doc("global").set({
    total_gyms: totalGyms,
    active_gyms: activeGyms,
    trial_gyms: trialGyms,
    past_due_gyms: pastDueGyms,
    suspended_gyms: suspendedGyms,
    total_members: totalMembers,
    total_active_members: totalActiveMembers,
    mrr_inr: mrrInr,
    past_due_inr: pastDueInr,
    updated_at: admin.firestore.Timestamp.now(),
  });

  console.log(`platform_stats/global: ${totalGyms} gyms, ${totalMembers} members, ₹${mrrInr} MRR`);
  return { totalGyms, totalMembers, mrrInr };
}

// Hourly — platform KPIs don't need to-the-second freshness (was every 15 min).
exports.recomputePlatformStats = functions.pubsub
  .schedule("every 60 minutes")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    try {
      await recomputePlatformStats();
    } catch (err) {
      console.error("recomputePlatformStats failed:", err);
      throw err;
    }
    return null;
  });

/**
 * One-off seed/repair: for every gym, read its subscription + stats summary ONCE,
 * write the full gym_summaries doc, then run a rollup. Run after deploy. SA only.
 */
exports.backfillPlatformStats = functions.https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.super_admin !== true) {
    throw new functions.https.HttpsError("permission-denied", "super_admin only");
  }
  const gymsSnap = await db.collection("gyms").get();
  let seeded = 0;
  await Promise.all(gymsSnap.docs.map(async (gymDoc) => {
    const gymId = gymDoc.id;
    const [subSnap, statsSnap] = await Promise.all([
      db.collection("subscriptions").doc(gymId).get(),
      db.collection("gyms").doc(gymId).collection("stats").doc("summary").get(),
    ]);
    const sub = subSnap.exists ? subSnap.data() : null;
    const st = statsSnap.exists ? statsSnap.data() : null;
    await db.collection("gym_summaries").doc(gymId).set({
      ...subSlice(sub || {}),
      member_count: st?.total_members || 0,
      active_count: st?.active_members || 0,
      updated_at: admin.firestore.Timestamp.now(),
    }, { merge: true });
    seeded++;
  }));
  const rollup = await recomputePlatformStats();
  return { ok: true, seeded, ...rollup };
});
