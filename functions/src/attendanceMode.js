"use strict";

// D1 — attendance mode is exclusive per gym: 'qr' (default) or 'biometric'.
// Stored in the server-only doc gym_settings/{gymId} (not on the gym doc,
// which the owner can write directly). setAttendanceMode is its only writer.
// When the mode is 'biometric', processScan rejects every QR/kiosk scan.

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { hasFeature } = require("./lib/entitlement");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const HttpsError = functions.https.HttpsError;

const MODES = ["qr", "biometric"];

// Missing doc or unknown value → 'qr', so every existing gym keeps working.
async function getAttendanceMode(gymId, firestore = db) {
  const snap = await firestore.doc(`gym_settings/${gymId}`).get();
  const mode = snap.exists ? snap.data().attendance_mode : null;
  return MODES.includes(mode) ? mode : "qr";
}

exports.getAttendanceMode = getAttendanceMode;

exports.setAttendanceMode = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
  const token = context.auth.token || {};
  const gymId = token.gym_id;
  if (!gymId || token.role !== "owner") {
    throw new HttpsError("permission-denied", "Only the gym owner can change the attendance mode.");
  }

  const mode = data && data.mode;
  if (!MODES.includes(mode)) {
    throw new HttpsError("invalid-argument", "mode must be 'qr' or 'biometric'.");
  }

  // Switching to biometric needs the plan. Switching back to QR is always
  // allowed, so a gym that lost the plan is never stuck without attendance.
  if (mode === "biometric" && !(await hasFeature(gymId, "biometric_attendance"))) {
    throw new HttpsError(
      "permission-denied",
      "Biometric attendance needs the Premium or Premium Plus plan."
    );
  }

  const previous = await getAttendanceMode(gymId);
  if (previous === mode) return { mode, changed: false };

  const now = admin.firestore.Timestamp.now();
  const batch = db.batch();
  batch.set(db.doc(`gym_settings/${gymId}`), {
    gym_id: gymId,
    attendance_mode: mode,
    attendance_mode_updated_at: now,
    attendance_mode_updated_by: context.auth.uid,
  }, { merge: true });
  batch.set(db.collection("audit_logs").doc(gymId).collection("events").doc(), {
    action: "attendance_mode_changed",
    target_id: gymId,
    before: previous,
    after: mode,
    performed_by: context.auth.uid,
    timestamp: now,
  });
  await batch.commit();

  return { mode, changed: true };
});
