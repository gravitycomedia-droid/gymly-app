"use strict";

// Server-side plan gating. src/utils/featureCheck.js is client-only and lets
// any active coupon unlock every feature, so anything that controls physical
// hardware is checked here instead.
//
// A missing subscriptions/{gymId} doc means NOT entitled. (The client hook
// useSubscription defaults to PREMIUM; never copy that here.)

const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

// D3: ₹999 PREMIUM and ₹1,499 PREMIUM_PLUS. PREMIUM trials are included on
// purpose. Coupons (gym.subscription_valid_until) deliberately do NOT count.
const BIOMETRIC_PLANS = ["PREMIUM", "PREMIUM_PLUS"];

const SERVER_FEATURES = {
  biometric_attendance: BIOMETRIC_PLANS,
};

async function getGymPlan(gymId, db = admin.firestore()) {
  if (!gymId) return null;
  const snap = await db.doc(`subscriptions/${gymId}`).get();
  if (!snap.exists) return null;
  return snap.data().plan || null;
}

async function hasFeature(gymId, feature, db = admin.firestore()) {
  const allowed = SERVER_FEATURES[feature];
  if (!allowed) return false;
  const plan = await getGymPlan(gymId, db);
  return plan != null && allowed.includes(plan);
}

module.exports = { BIOMETRIC_PLANS, SERVER_FEATURES, getGymPlan, hasFeature };
