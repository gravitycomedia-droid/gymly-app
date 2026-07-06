"use strict";

// Member multi-gym claims.
//
// A member can belong to several gyms — one `users` document per gym, all
// sharing the member's phone and (after login) their Firebase Auth UID via the
// `auth_uid` field. Because those docs have random IDs (not the UID), the
// onUserWrite trigger can't set the member's role/gym_id claims. This callable
// does it: the member app calls setActiveGymClaim({ membershipId }) after the
// gym picker, and we mint a token scoped to exactly that gym.
//
// v1 firebase-functions to match this codebase (NOT v2).

const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

// Sets the caller's role/gym_id custom claims to the chosen gym membership.
// Verifies ownership two ways: the doc is already linked to this UID, or its
// phone matches the caller's verified phone number (first login for that gym).
exports.setActiveGymClaim = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }
  const uid = context.auth.uid;
  const membershipId = data && data.membershipId;
  if (!membershipId) {
    throw new functions.https.HttpsError("invalid-argument", "membershipId required");
  }

  const db = admin.firestore();
  const ref = db.doc(`users/${membershipId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError("not-found", "Membership not found");
  }
  const m = snap.data();
  if (m.role !== "member") {
    throw new functions.https.HttpsError("failed-precondition", "Not a member record");
  }

  const tokenPhone = context.auth.token.phone_number || null;
  const ownsByUid = m.auth_uid === uid;
  const ownsByPhone = tokenPhone && m.phone === tokenPhone;
  if (!ownsByUid && !ownsByPhone) {
    throw new functions.https.HttpsError("permission-denied", "Not your membership");
  }
  if (!m.gym_id) {
    throw new functions.https.HttpsError("failed-precondition", "Membership has no gym");
  }

  // Heal the link if we authorized by phone (first login for this gym).
  if (!ownsByUid) {
    await ref.update({ auth_uid: uid, linked_at: admin.firestore.FieldValue.serverTimestamp() });
  }

  // Preserve platform-level claims (super_admin) — setCustomUserClaims replaces
  // the whole claims object.
  let preserved = {};
  try {
    const existing = (await admin.auth().getUser(uid)).customClaims || {};
    if (existing.super_admin) preserved.super_admin = existing.super_admin;
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
  }

  await admin.auth().setCustomUserClaims(uid, {
    ...preserved,
    role: "member",
    gym_id: m.gym_id,
    membership_id: membershipId,
  });

  return { gym_id: m.gym_id, membership_id: membershipId };
});
