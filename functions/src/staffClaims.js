"use strict";

// Staff login resolution.
//
// Staff (manager / receptionist / trainer) are created with addDoc — their
// `users` document has a random id, NOT their Firebase Auth UID, and carries the
// staff member's phone + gym_id. Because the doc id != uid, the onUserWrite
// trigger can never set their role/gym_id claims, and getUser(uid) finds nothing
// on login — which previously stranded them on the owner onboarding flow.
//
// This callable, invoked once after OTP login, finds the staff doc by the
// caller's verified phone number, links auth_uid, and mints the role/gym_id
// custom claims so the app can route them to their dashboard and authorize
// gym-isolated reads. Returns { found: false } for non-staff (e.g. members),
// letting AuthContext fall through to the member flow.
//
// v1 firebase-functions to match this codebase (NOT v2).

const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

const STAFF_ROLES = ["manager", "receptionist", "trainer"];

exports.resolveStaffLogin = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }
  const uid = context.auth.uid;
  const tokenPhone = context.auth.token.phone_number || null;
  if (!tokenPhone) return { found: false };

  const db = admin.firestore();
  const snap = await db.collection("users").where("phone", "==", tokenPhone).get();
  if (snap.empty) return { found: false };

  // Prefer a doc already linked to this UID; otherwise the first staff-role doc.
  let staff = null;
  for (const d of snap.docs) {
    const data2 = d.data();
    if (!STAFF_ROLES.includes(data2.role)) continue;
    if (data2.auth_uid === uid) { staff = { id: d.id, ...data2 }; break; }
    if (!staff) staff = { id: d.id, ...data2 };
  }
  if (!staff) return { found: false };
  if (!staff.gym_id) {
    throw new functions.https.HttpsError("failed-precondition", "Staff record has no gym");
  }

  // Link the Auth UID onto the staff doc on first login (idempotent).
  if (staff.auth_uid !== uid) {
    await db.doc(`users/${staff.id}`).update({
      auth_uid: uid,
      linked_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // Preserve platform-level claims (super_admin) — setCustomUserClaims replaces
  // the entire claims object.
  const preserved = {};
  try {
    const existing = (await admin.auth().getUser(uid)).customClaims || {};
    if (existing.super_admin) preserved.super_admin = existing.super_admin;
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
  }

  await admin.auth().setCustomUserClaims(uid, {
    ...preserved,
    role: staff.role,
    gym_id: staff.gym_id,
    staff_doc_id: staff.id,
  });

  return { found: true, staffDocId: staff.id, role: staff.role, gym_id: staff.gym_id };
});
