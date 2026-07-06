"use strict";

// Signed check-in token (Option B — loose, 1-hour HMAC window).
// The member app fetches a short-lived token via refreshCheckinClaim (cheap:
// one call per session + one per hour while the check-in tab stays open) and
// embeds it in the QR. processScan verifies it server-side, so a copied/guessed
// QR is only replayable within the current or previous hour window instead of
// forever.
//
// v1 firebase-functions to match the rest of this codebase (NOT v2).
// The signing secret lives in Secret Manager; declared per-function via
// runWith({ secrets: ["QR_SIGNING_SECRET"] }) and read from process.env.

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");

if (!admin.apps.length) admin.initializeApp();

const HOUR = 60 * 60 * 1000;

// windowStart = the current hour boundary in ms since epoch. Changes on its own
// every hour — no scheduler, no extra reads.
function currentWindowStart() {
  return Math.floor(Date.now() / HOUR) * HOUR;
}

function computeToken(secret, uid, gymId, windowStart) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${uid}:${gymId}:${windowStart}`)
    .digest("base64url");
}

// Verifies a token against the current window AND the previous window, so a
// member who opened the app right before an hour boundary still checks in.
function verifyToken(secret, uid, gymId, windowStart, token) {
  const now = currentWindowStart();
  if (windowStart !== now && windowStart !== now - HOUR) return false;
  const expected = computeToken(secret, uid, gymId, windowStart);
  const a = Buffer.from(expected);
  const b = Buffer.from(token || "");
  // timingSafeEqual throws on length mismatch — guard first.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Called by the member app right after login / token refresh — cheap, infrequent.
// Returns the current signed token for the caller's own uid + gym.
exports.refreshCheckinClaim = functions
  .runWith({ secrets: ["QR_SIGNING_SECRET"] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Login required");
    }
    const uid = context.auth.uid;
    const db = admin.firestore();

    // Resolve the member's active membership. Multi-gym members have their
    // membership under a random doc id (linked via auth_uid), so the QR must be
    // keyed by that membership id — which is what processScan looks up. The
    // active gym comes from the gym_id claim set by setActiveGymClaim.
    const gymId = context.auth.token.gym_id || null;
    let subjectId = uid; // legacy: owners/staff whose doc IS at users/{uid}
    let resolvedGymId = gymId;

    // Prefer the membership doc for this UID + active gym.
    if (gymId) {
      const q = await db.collection("users")
        .where("auth_uid", "==", uid)
        .where("gym_id", "==", gymId)
        .limit(1)
        .get();
      if (!q.empty) {
        subjectId = q.docs[0].id;
        resolvedGymId = q.docs[0].data().gym_id;
      }
    }

    // Fallback for legacy accounts whose profile lives at users/{uid}.
    if (subjectId === uid && !resolvedGymId) {
      const userDoc = await db.doc(`users/${uid}`).get();
      if (userDoc.exists && userDoc.data().gym_id) {
        resolvedGymId = userDoc.data().gym_id;
      }
    }

    if (!resolvedGymId) {
      throw new functions.https.HttpsError("failed-precondition", "No active gym — pick a gym first");
    }

    const windowStart = currentWindowStart();
    const token = computeToken(process.env.QR_SIGNING_SECRET, subjectId, resolvedGymId, windowStart);
    // `uid` in the response is the QR subject (membership id) the scanner resolves.
    return { token, windowStart, gymId: resolvedGymId, uid: subjectId };
  });

exports.computeToken = computeToken;
exports.verifyToken = verifyToken;
exports.currentWindowStart = currentWindowStart;
