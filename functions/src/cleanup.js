"use strict";

const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ── N-10: Delete WhatsApp logs older than 90 days (weekly Sunday 3AM IST) ────
exports.cleanOldWhatsappLogs = functions.pubsub
  .schedule("0 3 * * 0")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const cutoff = admin.firestore.Timestamp.fromMillis(
      Date.now() - 90 * 24 * 60 * 60 * 1000
    );

    const snap = await db.collection("whatsapp_logs")
      .where("sent_at", "<", cutoff)
      .limit(500)
      .get();

    if (snap.empty) {
      console.log("cleanOldWhatsappLogs: nothing to delete");
      return null;
    }

    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();

    console.log(`cleanOldWhatsappLogs: deleted ${snap.size} logs older than 90 days`);
    return null;
  });

// ── N-11: Archive workout logs older than 6 months (monthly 1st 4AM IST) ─────
exports.archiveOldWorkoutLogs = functions.pubsub
  .schedule("0 4 1 * *")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const cutoff = admin.firestore.Timestamp.fromMillis(
      Date.now() - 6 * 30 * 24 * 60 * 60 * 1000
    );

    const snap = await db.collection("workout_logs")
      .where("log_date", "<", cutoff.toDate().toISOString().split("T")[0])
      .limit(500)
      .get();

    if (snap.empty) {
      console.log("archiveOldWorkoutLogs: nothing to archive");
      return null;
    }

    // Group by memberId + YYYY-MM for compact summaries
    const summaries = {};
    snap.docs.forEach(d => {
      const data = d.data();
      const month = (data.log_date || "").substring(0, 7); // YYYY-MM
      const memberId = data.member_id || "unknown";
      const key = `${memberId}__${month}`;
      if (!summaries[key]) {
        summaries[key] = {
          member_id: memberId,
          gym_id: data.gym_id || null,
          month,
          total_sessions: 0,
          exercises_completed: new Set(),
          archived_at: admin.firestore.Timestamp.now(),
        };
      }
      summaries[key].total_sessions++;
      if (data.exercise_name) summaries[key].exercises_completed.add(data.exercise_name);
    });

    // Write compact monthly summaries + delete individual logs
    const batch = db.batch();

    Object.values(summaries).forEach(s => {
      const ref = db.collection("workout_summaries")
        .doc(`${s.member_id}_${s.month}`);
      batch.set(ref, {
        ...s,
        exercises_completed: [...s.exercises_completed],
      }, { merge: true });
    });

    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();

    console.log(`archiveOldWorkoutLogs: archived ${snap.size} logs into ${Object.keys(summaries).length} monthly summaries`);
    return null;
  });
