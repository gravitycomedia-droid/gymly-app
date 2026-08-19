"use strict";

// PIN sign-in.
//
// A returning owner/staff member can sign in with a 4-digit PIN instead of an
// OTP (Gymloop redesign, handoff/AUTH-ONBOARDING.md). The PIN is set once
// (right after signup — see setPin) and verified from a signed-out device
// (verifyPin), which is why verifyPin does NOT require context.auth: that's
// exactly the flow that gets a signed-out client signed in.
//
// The hash is stored in a dedicated `pins/{uid}` collection that is entirely
// server-only (firestore.rules: `allow read, write: if false`) — never on the
// `users/{uid}` doc, which other same-gym staff can read.
//
// v1 firebase-functions to match this codebase (NOT v2).

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");

if (!admin.apps.length) admin.initializeApp();

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

function hashPin(pin, salt) {
  return crypto.scryptSync(pin, salt, 64).toString("hex");
}

// Sets (or replaces) the caller's own PIN. Requires an active session — the
// PIN screen is offered right after OTP verification during signup.
exports.setPin = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in required");
  }
  const pin = data && data.pin;
  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    throw new functions.https.HttpsError("invalid-argument", "PIN must be 4 digits");
  }

  const uid = context.auth.uid;
  const phone = context.auth.token.phone_number || null;
  if (!phone) {
    throw new functions.https.HttpsError("failed-precondition", "No verified phone on this account");
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPin(pin, salt);

  await admin.firestore().doc(`pins/${uid}`).set({
    phone,
    salt,
    hash,
    fail_count: 0,
    locked_until: null,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

// Verifies a phone + PIN pair for a signed-out device and, on success, mints
// a custom token so the client can call signInWithCustomToken — re-entering
// the exact same onAuthStateChanged path a normal OTP sign-in takes.
exports.verifyPin = functions.https.onCall(async (data) => {
  const phone = data && data.phone;
  const pin = data && data.pin;
  if (typeof phone !== "string" || !phone.trim()) {
    throw new functions.https.HttpsError("invalid-argument", "Phone required");
  }
  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    throw new functions.https.HttpsError("invalid-argument", "PIN must be 4 digits");
  }

  const db = admin.firestore();
  const snap = await db.collection("pins").where("phone", "==", phone).limit(1).get();
  if (snap.empty) {
    throw new functions.https.HttpsError("not-found", "no_pin");
  }
  const ref = snap.docs[0].ref;
  const rec = snap.docs[0].data();
  const uid = ref.id;

  const now = Date.now();
  const lockedUntil = rec.locked_until && rec.locked_until.toMillis ? rec.locked_until.toMillis() : null;
  if (lockedUntil && lockedUntil > now) {
    throw new functions.https.HttpsError("resource-exhausted", "locked", {
      lockedUntilMs: lockedUntil,
    });
  }

  const candidate = hashPin(pin, rec.salt);
  const match = crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(rec.hash, "hex"));

  if (!match) {
    const failCount = (rec.fail_count || 0) + 1;
    const update = { fail_count: failCount };
    if (failCount >= MAX_ATTEMPTS) {
      update.locked_until = admin.firestore.Timestamp.fromMillis(now + LOCK_MS);
    }
    await ref.update(update);
    throw new functions.https.HttpsError("permission-denied", "wrong_pin", {
      attemptsLeft: Math.max(0, MAX_ATTEMPTS - failCount),
    });
  }

  await ref.update({ fail_count: 0, locked_until: null });

  const token = await admin.auth().createCustomToken(uid);
  return { token };
});
