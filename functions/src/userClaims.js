"use strict";

const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

// Fires on every /users/{uid} write.
// Embeds role + gym_id into the Firebase Auth JWT so Firestore rules
// can read request.auth.token.gym_id / request.auth.token.role
// instead of doing a get() read on every operation.
exports.onUserWrite = functions.firestore
  .document("users/{uid}")
  .onWrite(async (change, context) => {
    const uid = context.params.uid;

    // Preserve platform-level claims (super_admin) across every rewrite.
    // setCustomUserClaims REPLACES the whole claims object, so without this a
    // super-admin who is also a gym owner would lose super_admin on any doc write.
    let preserved = {};
    try {
      const existing = (await admin.auth().getUser(uid)).customClaims || {};
      if (existing.super_admin) preserved.super_admin = existing.super_admin;
    } catch (err) {
      if (err.code !== "auth/user-not-found") throw err;
    }

    if (!change.after.exists) {
      try {
        await admin.auth().setCustomUserClaims(uid, preserved);
      } catch (err) {
        if (err.code !== "auth/user-not-found") throw err;
      }
      return null;
    }

    const data = change.after.data();
    const role = data.role || null;
    const gym_id = data.gym_id || null;

    if (!role || !gym_id) {
      console.log(`User ${uid} missing role or gym_id — skipping claims`);
      return null;
    }

    try {
      await admin.auth().setCustomUserClaims(uid, { ...preserved, role, gym_id });
      console.log(`Claims set for ${uid}: role=${role}, gym_id=${gym_id}`);
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        // Expected for addDoc members with no Firebase Auth account
        console.log(`No Auth account for ${uid} — claims skipped`);
      } else {
        throw err;
      }
    }

    return null;
  });
