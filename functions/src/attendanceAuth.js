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
    const userDoc = await admin.firestore().doc(`users/${uid}`).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError("not-found", "User not found");
    }
    const gymId = userDoc.data().gym_id;
    if (!gymId) {
      throw new functions.https.HttpsError("failed-precondition", "No gym on profile");
    }
    const windowStart = currentWindowStart();
    const token = computeToken(process.env.QR_SIGNING_SECRET, uid, gymId, windowStart);
    return { token, windowStart, gymId };
  });

exports.computeToken = computeToken;
exports.verifyToken = verifyToken;
exports.currentWindowStart = currentWindowStart;
