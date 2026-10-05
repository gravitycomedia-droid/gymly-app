// src/superadmin/lib/api.js
// Every Firestore read and callable the Super Admin console makes, in one
// place, with the platform's real field names.
//
// FIELD-NAME MAP (handoff README §9 → this repo). The README's model is a
// proposal; these are the collections that actually exist, so the repo wins:
//
//   README                  → actual
//   gyms.ownerName          → gyms.owner_name
//   gyms.ownerPhone         → gyms.phone
//   gyms.status             → gym_summaries.status (+ is_trial)
//   gyms.planId             → gym_summaries.plan  (doc id of plans/)
//   gyms.stats.*            → gyms/{id}/stats/summary.*
//   gyms/{id}/payments      → billing/{gymId}/manual_payments  (paise)
//   platform/stats          → platform_stats/global
//   plans.displayName       → plans.name
//   plans.monthlyAmount     → plans.monthly_amount_inr
//   plans.isActive          → plans.is_active
//   broadcasts.message      → broadcasts.body
//   superAdmin/profile      → platform_settings/super_admin  (new — see notes)

import {
  collection, doc, getDoc, getDocs, orderBy, query, limit,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase/config';
import { monthlyInr } from './status';
import { toDate } from './format';

const docsToMap = (snap) => {
  const m = new Map();
  snap.forEach((d) => m.set(d.id, d.data()));
  return m;
};

/**
 * The gym list. Two collection reads joined in memory rather than one
 * gym_summaries lookup per row — the previous console did N+1 getDoc calls
 * for a 25-row page. Search, the city facet, "12 of 46" counts and sort-by-
 * members all need the whole set anyway.
 *
 * Scaling note: this is fine into the low thousands of gyms. Past that the
 * list needs server-side search (see IMPLEMENTATION_NOTES.md).
 */
export async function fetchGyms() {
  const [gymSnap, sumSnap] = await Promise.all([
    getDocs(query(collection(db, 'gyms'), orderBy('created_at', 'desc'))),
    getDocs(collection(db, 'gym_summaries')),
  ]);
  const summaries = docsToMap(sumSnap);

  return gymSnap.docs.map((d) => {
    const g = d.data();
    const s = summaries.get(d.id) || {};
    const rawStatus = s.status || 'active';
    return {
      id: d.id,
      name: g.name || 'Untitled gym',
      city: g.city || '',
      ownerName: g.owner_name || '',
      ownerPhone: g.phone || '',
      ownerEmail: g.email || '',
      ownerId: g.owner_id || null,
      createdAt: toDate(g.created_at),
      planId: s.plan || 'FREE',
      // `trial` is a presentation status layered over the stored one: the
      // platform keeps status='active' + is_trial=true for a gym on trial.
      status: s.is_trial ? 'trial' : rawStatus,
      rawStatus,
      isTrial: s.is_trial === true,
      trialEndDate: toDate(s.trial_end_date),
      amountMonthly: s.amount_monthly || 0,
      monthlyInr: monthlyInr(s),
      failedPayments: s.failed_payment_count || 0,
      memberCount: s.member_count ?? 0,
      activeCount: s.active_count ?? 0,
    };
  });
}

export async function fetchPlatformStats() {
  const snap = await getDoc(doc(db, 'platform_stats', 'global'));
  return snap.exists() ? snap.data() : null;
}

export async function fetchPlans() {
  const snap = await getDocs(collection(db, 'plans'));
  return snap.docs
    .map((d) => ({
      id: d.id,
      name: d.data().name || d.id,
      monthlyInr: Number(d.data().monthly_amount_inr) || 0,
      isActive: d.data().is_active !== false,
      sortOrder: Number(d.data().sort_order) || 0,
      memberCap: d.data().member_cap ?? null,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export async function fetchGym(gymId) {
  const [gymSnap, sumSnap, subSnap] = await Promise.all([
    getDoc(doc(db, 'gyms', gymId)),
    getDoc(doc(db, 'gym_summaries', gymId)),
    getDoc(doc(db, 'subscriptions', gymId)),
  ]);
  if (!gymSnap.exists()) return null;

  const g = gymSnap.data();
  const s = sumSnap.exists() ? sumSnap.data() : {};
  const sub = subSnap.exists() ? subSnap.data() : {};
  const rawStatus = s.status || sub.status || 'active';

  return {
    id: gymId,
    name: g.name || 'Untitled gym',
    city: g.city || '',
    address: g.address || '',
    ownerName: g.owner_name || '',
    ownerPhone: g.phone || '',
    ownerEmail: g.email || '',
    ownerId: g.owner_id || null,
    createdAt: toDate(g.created_at),
    planId: s.plan || sub.plan || 'FREE',
    status: (s.is_trial ?? sub.is_trial) ? 'trial' : rawStatus,
    rawStatus,
    isTrial: (s.is_trial ?? sub.is_trial) === true,
    trialEndDate: toDate(s.trial_end_date || sub.trial_end_date),
    startAt: toDate(sub.start_date || sub.created_at || g.created_at),
    endAt: toDate(sub.current_period_end || sub.next_billing_date || sub.trial_end_date),
    lastPaymentAt: toDate(sub.last_payment_at),
    failedPayments: s.failed_payment_count || sub.failed_payment_count || 0,
    monthlyInr: monthlyInr({ ...sub, ...s }),
    memberCount: s.member_count ?? 0,
    activeCount: s.active_count ?? 0,
    subscription: sub,
  };
}

/** Aggregates only — the console never reads an individual member document. */
export async function fetchGymMemberStats(gymId) {
  const snap = await getDoc(doc(db, 'gyms', gymId, 'stats', 'summary'));
  if (!snap.exists()) return null;
  const s = snap.data();
  return {
    totalMembers: s.total_members ?? 0,
    activeMembers: s.active_members ?? 0,
    expiredMembers: s.expired_members ?? 0,
    expiringToday: s.expiring_today ?? 0,
    expiring7d: s.expiring_7d ?? 0,
    monthRevenue: s.month_revenue ?? 0,
    pendingDues: s.pending_dues ?? 0,
    // Maintained by the recordMemberHistory function; absent on gyms whose
    // first month hasn't rolled over yet.
    history: Array.isArray(s.member_history) ? s.member_history : null,
    newThisMonth: s.new_members_this_month ?? null,
    lastUpdated: toDate(s.last_updated),
  };
}

/**
 * What this gym has paid Gymly. The platform's billing trail lives at
 * billing/{gymId}/manual_payments and stores PAISE — not the per-gym
 * `payments` collection, which is members paying their gym.
 */
export async function fetchGymBilling(gymId) {
  const snap = await getDocs(query(
    collection(db, 'billing', gymId, 'manual_payments'),
    orderBy('created_at', 'desc'),
    limit(50),
  ));
  return snap.docs.map((d) => {
    const p = d.data();
    return {
      id: d.id,
      amount: Math.round((p.amount || 0) / 100),
      paidAt: toDate(p.created_at),
      method: p.method || 'manual',
      note: p.note || '',
      planName: p.plan_name || null,
      status: p.status || 'paid',
    };
  });
}

export async function fetchBroadcasts() {
  const snap = await getDocs(query(collection(db, 'broadcasts'), orderBy('created_at', 'desc'), limit(200)));
  return snap.docs.map((d) => {
    const b = d.data();
    // Docs written before drafts existed have no `status` — they were all
    // published, so default accordingly.
    const status = b.status || 'published';
    return {
      id: d.id,
      title: b.title || '',
      message: b.body || '',
      status,
      active: b.active !== false,
      audienceType: b.audience || 'all',
      planIds: b.plan_ids || (b.plan_filter ? [b.plan_filter] : []),
      gymIds: b.gym_ids || [],
      statusFilter: b.status_filter || null,
      reachCount: b.reach_count ?? null,
      createdAt: toDate(b.created_at),
      updatedAt: toDate(b.updated_at || b.created_at),
      publishedAt: toDate(b.published_at || (status === 'published' ? b.created_at : null)),
      expiresAt: toDate(b.expires_at),
    };
  });
}

export async function fetchSuperAdminProfile() {
  const snap = await getDoc(doc(db, 'platform_settings', 'super_admin'));
  if (!snap.exists()) return { phone: '', email: '' };
  const d = snap.data();
  return { phone: d.phone || '', email: d.email || '', updatedAt: toDate(d.updated_at) };
}

// ── Callables ──────────────────────────────────────────────────────────────
// Every write in the console goes through an audited super-admin callable;
// the Firestore rules keep all of these collections write:false from a client.
export const call = (name, payload) => httpsCallable(functions, name)(payload).then((r) => r.data);

export const saveBroadcast = (payload) => call('adminCreateBroadcast', payload);
export const deleteBroadcast = (id) => call('adminDeleteBroadcast', { id });
export const setBroadcastActive = (id, active) => call('adminSetBroadcastActive', { id, active });
export const upsertPlan = (payload) => call('adminUpsertPlan', payload);
export const setPlanActive = (planId, isActive) => call('adminSetPlanActive', { planId, is_active: isActive });
export const saveContactDetails = (payload) => call('adminSaveContactDetails', payload);
export const assignPlan = (payload) => call('adminAssignPlan', payload);
export const setTrial = (payload) => call('adminSetTrial', payload);
export const setGymStatus = (payload) => call('adminSetGymStatus', payload);
export const markSubscriptionPaid = (payload) => call('adminMarkSubscriptionPaid', payload);
export const seedDefaultPlans = () => call('adminSeedDefaultPlans', {});
