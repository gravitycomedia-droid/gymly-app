"use strict";

const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

async function recomputeStats(gymId) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd   = new Date(todayStart.getTime() + 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const in7d       = new Date(todayStart.getTime() + 7 * 86400000);

  // Member counts — query without is_deleted filter (!=  excludes docs without the field)
  // Filter soft-deleted members client-side in the loop instead
  const membersSnap = await db.collection("users")
    .where("gym_id", "==", gymId)
    .where("role", "==", "member")
    .get();

  let totalMembers = 0, activeMembers = 0, expiredMembers = 0,
      expiringToday = 0, expiring7d = 0;

  membersSnap.forEach(d => {
    if (d.data().is_deleted === true) return; // skip soft-deleted
    const expiry = d.data().subscription_expiry?.toDate?.() || null;
    totalMembers++;
    if (expiry && expiry > now) {
      activeMembers++;
      if (expiry >= todayStart && expiry < todayEnd) expiringToday++;
      if (expiry >= todayStart && expiry < in7d)     expiring7d++;
    } else {
      expiredMembers++;
    }
  });

  // Revenue + pending dues (current month only to keep query small)
  const paymentsSnap = await db.collection("payments")
    .where("gym_id", "==", gymId)
    .where("payment_date", ">=", admin.firestore.Timestamp.fromDate(monthStart))
    .get();

  let todayRevenue = 0, monthRevenue = 0, pendingDues = 0;

  paymentsSnap.forEach(d => {
    const data  = d.data();
    const pDate = data.payment_date?.toDate?.() || null;
    if (data.status === "paid") {
      monthRevenue += data.final_amount || 0;
      if (pDate && pDate >= todayStart && pDate < todayEnd) {
        todayRevenue += data.final_amount || 0;
      }
    } else if (data.status === "pending" || data.status === "partial") {
      pendingDues += data.pending_amount || 0;
    }
  });

  // Today's attendance
  const attendanceSnap = await db.collection("attendance_logs")
    .where("gym_id", "==", gymId)
    .where("entry_time", ">=", admin.firestore.Timestamp.fromDate(todayStart))
    .where("entry_time", "<",  admin.firestore.Timestamp.fromDate(todayEnd))
    .get();

  await db.collection("gyms").doc(gymId).collection("stats").doc("summary").set({
    total_members:   totalMembers,
    active_members:  activeMembers,
    expired_members: expiredMembers,
    expiring_today:  expiringToday,
    expiring_7d:     expiring7d,
    today_revenue:   todayRevenue,
    month_revenue:   monthRevenue,
    pending_dues:    pendingDues,
    today_attendance: attendanceSnap.size,
    last_updated:    admin.firestore.Timestamp.now(),
  });

  console.log(`Stats recomputed for ${gymId}: ${totalMembers} members, ₹${monthRevenue} month revenue`);
}

// ── Debounce map (in-memory — sufficient for Cloud Functions) ──────────────
const debounceTimers = {};
const DEBOUNCE_MS = 60000; // 60 seconds

function debounceRecompute(gymId) {
  if (debounceTimers[gymId]) clearTimeout(debounceTimers[gymId]);
  debounceTimers[gymId] = setTimeout(() => {
    recomputeStats(gymId).catch(err =>
      console.error(`gymStats recompute failed for ${gymId}:`, err)
    );
    delete debounceTimers[gymId];
  }, DEBOUNCE_MS);
}

// ── Trigger: member joins, cancels, expires ────────────────────────────────
exports.statsOnUserWrite = functions.firestore
  .document("users/{userId}")
  .onWrite(async (change) => {
    const data = change.after.exists ? change.after.data() : change.before.data();
    if (!data?.gym_id || data?.role !== "member") return null;
    debounceRecompute(data.gym_id);
    return null;
  });

// ── Trigger: payment recorded or updated ──────────────────────────────────
exports.statsOnPaymentWrite = functions.firestore
  .document("payments/{paymentId}")
  .onWrite(async (change) => {
    const data = change.after.exists ? change.after.data() : change.before.data();
    if (!data?.gym_id) return null;
    debounceRecompute(data.gym_id);
    return null;
  });

// ── Trigger: attendance logged ─────────────────────────────────────────────
exports.statsOnAttendanceWrite = functions.firestore
  .document("attendance_logs/{logId}")
  .onWrite(async (change) => {
    const data = change.after.exists ? change.after.data() : change.before.data();
    if (!data?.gym_id) return null;
    debounceRecompute(data.gym_id);
    return null;
  });

// ── Scheduled: recompute all gyms at midnight IST ─────────────────────────
exports.statsResetDaily = functions.pubsub
  .schedule("0 0 * * *")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const gymsSnap = await db.collection("gyms").get();
    await Promise.all(gymsSnap.docs.map(d => recomputeStats(d.id)));
    console.log(`Daily stats reset for ${gymsSnap.size} gyms`);
    return null;
  });
