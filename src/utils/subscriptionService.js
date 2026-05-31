// src/utils/subscriptionService.js
// Client-side Firestore helpers for subscription system

import { db } from '../firebase/config';
import {
  doc, getDoc, setDoc, collection, getDocs,
  query, orderBy, serverTimestamp,
} from 'firebase/firestore';

/**
 * Fetch the subscription doc for a gym.
 * @param {string} gymId
 * @returns {Promise<Object|null>}
 */
export async function getGymSubscription(gymId) {
  if (!gymId) return null;
  const snap = await getDoc(doc(db, 'subscriptions', gymId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Fetch billing history for a gym (billing/{gymId}/payments subcollection).
 * @param {string} gymId
 * @returns {Promise<Array>}
 */
export async function getBillingHistory(gymId) {
  if (!gymId) return [];
  try {
    const ref = collection(db, 'billing', gymId, 'payments');
    const q = query(ref, orderBy('payment_date', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

/**
 * Auto-create a FREE subscription for a newly registered gym.
 * Called right after gym doc is created.
 * @param {string} gymId
 */
export async function createFreeSubscription(gymId) {
  if (!gymId) return;
  const ref = doc(db, 'subscriptions', gymId);
  const existing = await getDoc(ref);
  if (existing.exists()) return; // already set
  await setDoc(ref, {
    plan: 'FREE',
    status: 'active',
    is_trial: false,
    amount_monthly: 0,
    auto_renew: false,
    razorpay_subscription_id: null,
    razorpay_customer_id: null,
    payment_method_last4: null,
    payment_method_expiry: null,
    next_billing_date: null,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
}

/**
 * Upgrade an existing gym's subscription to PREMIUM (used for migration of existing gyms).
 * @param {string} gymId
 */
export async function setPremiumSubscription(gymId) {
  if (!gymId) return;
  const ref = doc(db, 'subscriptions', gymId);
  await setDoc(ref, {
    plan: 'PREMIUM',
    status: 'active',
    is_trial: false,
    amount_monthly: 99900,
    auto_renew: true,
    razorpay_subscription_id: null,
    razorpay_customer_id: null,
    payment_method_last4: null,
    payment_method_expiry: null,
    next_billing_date: null,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  }, { merge: true });
}
