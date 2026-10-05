"use strict";

// Phase 2 — Super Admin control plane mutations.
// Every function is gated on the super_admin claim and writes an audit entry.
// Suspend is STATE-ONLY in this phase (no owner-app enforcement yet).

const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const VALID_STATUS = ["active", "suspended", "past_due", "cancelled", "trial"];

function assertSuperAdmin(context) {
  if (!context.auth || context.auth.token.super_admin !== true) {
    throw new functions.https.HttpsError("permission-denied", "super_admin only");
  }
}

function requireString(val, name) {
  if (typeof val !== "string" || !val.trim()) {
    throw new functions.https.HttpsError("invalid-argument", `${name} is required`);
  }
  return val.trim();
}

// Audit every privileged action into the existing admin_logs collection.
async function audit(context, { gymId, action, before, after, reason }) {
  await db.collection("admin_logs").add({
    gym_id: gymId || null,
    actor_uid: context.auth.uid,
    actor_role: "super_admin",
    action,
    details: {
      before: before || null,
      after: after || null,
      reason: reason || null,
    },
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ── Assign a plan to a gym ─────────────────────────────────────────────────
// Reads plans/{planId}, snapshots its price onto subscriptions/{gymId}.
exports.adminAssignPlan = functions.https.onCall(async (data, context) => {
  assertSuperAdmin(context);
  const gymId = requireString(data.gymId, "gymId");
  const planId = requireString(data.planId, "planId");

  const planSnap = await db.collection("plans").doc(planId).get();
  if (!planSnap.exists) {
    throw new functions.https.HttpsError("not-found", `plan ${planId} not found`);
  }
  const plan = planSnap.data();
  const inr = Number(plan.monthly_amount_inr) || 0;

  const subRef = db.collection("subscriptions").doc(gymId);
  const before = (await subRef.get()).data() || null;

  const after = {
    plan: planId,
    plan_id: planId,
    monthly_amount_inr: inr,
    amount_monthly: Math.round(inr * 100), // paise — matches existing convention
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };
  await subRef.set(after, { merge: true });

  await audit(context, { gymId, action: "admin_assign_plan", before, after, reason: data.reason });
  return { ok: true };
});

// ── Extend or expire a gym's trial ─────────────────────────────────────────
exports.adminSetTrial = functions.https.onCall(async (data, context) => {
  assertSuperAdmin(context);
  const gymId = requireString(data.gymId, "gymId");
  const expire = data.expire === true;
  const days = Number(data.days);

  const subRef = db.collection("subscriptions").doc(gymId);
  const before = (await subRef.get()).data() || null;

  let after;
  if (expire) {
    after = {
      is_trial: false,
      trial_end_date: admin.firestore.Timestamp.now(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };
  } else {
    if (!Number.isFinite(days) || days <= 0 || days > 365) {
      throw new functions.https.HttpsError("invalid-argument", "days must be 1–365");
    }
    const end = new Date(Date.now() + days * 86400000);
    after = {
      is_trial: true,
      trial_end_date: admin.firestore.Timestamp.fromDate(end),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };
  }
  await subRef.set(after, { merge: true });

  await audit(context, {
    gymId,
    action: expire ? "admin_expire_trial" : "admin_extend_trial",
    before, after, reason: data.reason,
  });
  return { ok: true };
});

// ── Set gym subscription status (suspend / reactivate) — STATE ONLY ────────
exports.adminSetGymStatus = functions.https.onCall(async (data, context) => {
  assertSuperAdmin(context);
  const gymId = requireString(data.gymId, "gymId");
  const status = requireString(data.status, "status");
  if (!VALID_STATUS.includes(status)) {
    throw new functions.https.HttpsError("invalid-argument", `status must be one of ${VALID_STATUS.join(", ")}`);
  }

  const subRef = db.collection("subscriptions").doc(gymId);
  const before = (await subRef.get()).data() || null;

  const after = {
    status,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (status === "suspended") {
    after.suspended_at = admin.firestore.Timestamp.now();
    after.suspended_reason = data.reason || null;
  } else {
    after.suspended_at = null;
    after.suspended_reason = null;
  }
  await subRef.set(after, { merge: true });

  await audit(context, { gymId, action: `admin_status_${status}`, before, after, reason: data.reason });
  return { ok: true };
});

// ── Dunning recovery: mark a past-due/suspended gym as paid ────────────────
// Reactivates the subscription, clears the failure counter, and records a
// manual payment for the books. Audited.
exports.adminMarkSubscriptionPaid = functions.https.onCall(async (data, context) => {
  assertSuperAdmin(context);
  const gymId = requireString(data.gymId, "gymId");

  const subRef = db.collection("subscriptions").doc(gymId);
  const before = (await subRef.get()).data() || null;

  const inr = Number(data.amount);
  const amountPaise = Number.isFinite(inr) && inr > 0
    ? Math.round(inr * 100)
    : (before?.amount_monthly || 0);

  const after = {
    status: "active",
    failed_payment_count: 0,
    last_payment_at: admin.firestore.Timestamp.now(),
    suspended_at: null,
    suspended_reason: null,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };
  await subRef.set(after, { merge: true });

  // Record the manual payment for the billing trail.
  await db.collection("billing").doc(gymId).collection("manual_payments").add({
    amount: amountPaise,
    method: data.method || "manual",
    recorded_by: context.auth.uid,
    note: data.reason || null,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  await audit(context, {
    gymId,
    action: "admin_mark_paid",
    before,
    after: { ...after, amount_paise: amountPaise },
    reason: data.reason,
  });
  return { ok: true };
});

// ── View-as-owner: edit gym SETTINGS only ──────────────────────────────────
// Whitelisted gym-doc fields only. Members (users) and payments live in other
// collections and are structurally unreachable through this callable.
const GYM_SETTINGS_ALLOWLIST = [
  "name", "phone", "email", "address", "city", "website",
  "working_hours", "social",
];

exports.adminUpdateGymSettings = functions.https.onCall(async (data, context) => {
  assertSuperAdmin(context);
  const gymId = requireString(data.gymId, "gymId");
  const settings = data.settings;
  if (!settings || typeof settings !== "object") {
    throw new functions.https.HttpsError("invalid-argument", "settings object required");
  }

  const update = {};
  for (const key of Object.keys(settings)) {
    if (GYM_SETTINGS_ALLOWLIST.includes(key)) update[key] = settings[key];
  }
  if (Object.keys(update).length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "no editable settings fields provided");
  }

  const gymRef = db.collection("gyms").doc(gymId);
  const beforeDoc = (await gymRef.get()).data() || {};
  const before = {};
  for (const key of Object.keys(update)) before[key] = beforeDoc[key] ?? null;

  update.updated_at = admin.firestore.FieldValue.serverTimestamp();
  await gymRef.set(update, { merge: true });

  await audit(context, { gymId, action: "admin_update_settings", before, after: update, reason: data.reason });
  return { ok: true, updated: Object.keys(update).filter((k) => k !== "updated_at") };
});

// ── Plan CRUD ──────────────────────────────────────────────────────────────
exports.adminUpsertPlan = functions.https.onCall(async (data, context) => {
  assertSuperAdmin(context);
  const planId = requireString(data.planId, "planId");
  const name = requireString(data.name, "name");
  const inr = Number(data.monthly_amount_inr);
  if (!Number.isFinite(inr) || inr < 0) {
    throw new functions.https.HttpsError("invalid-argument", "monthly_amount_inr must be ≥ 0");
  }

  const planRef = db.collection("plans").doc(planId);
  const before = (await planRef.get()).data() || null;

  const after = {
    name,
    monthly_amount_inr: inr,
    member_cap: data.member_cap == null ? null : Number(data.member_cap),
    features: (data.features && typeof data.features === "object") ? data.features : (before?.features || {}),
    is_active: data.is_active !== false,
    sort_order: Number.isFinite(Number(data.sort_order)) ? Number(data.sort_order) : (before?.sort_order || 0),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };
  await planRef.set(after, { merge: true });

  await audit(context, { gymId: null, action: "admin_upsert_plan", before, after, reason: data.reason });
  return { ok: true, planId };
});

exports.adminSetPlanActive = functions.https.onCall(async (data, context) => {
  assertSuperAdmin(context);
  const planId = requireString(data.planId, "planId");
  const isActive = data.is_active === true;

  const planRef = db.collection("plans").doc(planId);
  if (!(await planRef.get()).exists) {
    throw new functions.https.HttpsError("not-found", `plan ${planId} not found`);
  }
  await planRef.set({ is_active: isActive, updated_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

  await audit(context, { gymId: null, action: "admin_set_plan_active", after: { planId, is_active: isActive } });
  return { ok: true };
});

// ── Platform broadcasts (in-app banner to gyms) ────────────────────────────
// `plan` / `status` / `specific` are the legacy audience names the first
// console wrote. The new console sends `plans` (multi-select) and `gyms`;
// both spellings are accepted and normalised on write so historic documents
// and the owner app's reader keep working.
const BROADCAST_AUDIENCES = ["all", "plan", "plans", "status", "specific", "gyms"];
const BROADCAST_STATUSES = ["draft", "published"];

const normaliseAudience = (a) => (a === "plans" ? "plan" : a === "gyms" ? "specific" : a);

/**
 * Create OR update a broadcast.
 *
 * Adds two things the redesigned console needs:
 *  - `status`: a draft is stored with active:false, so the owner-app rule
 *    (`resource.data.active == true`) cannot surface it. Publishing flips both.
 *  - `id`: passing one updates that document instead of adding a new one,
 *    which is how "save draft" then "publish" reuses the same doc.
 *
 * A published broadcast is immutable — the console says so in its confirm
 * dialog, and this enforces it.
 */
exports.adminCreateBroadcast = functions.https.onCall(async (data, context) => {
  assertSuperAdmin(context);
  const status = data.status == null ? "published" : requireString(data.status, "status");
  if (!BROADCAST_STATUSES.includes(status)) {
    throw new functions.https.HttpsError("invalid-argument", `status must be one of ${BROADCAST_STATUSES.join(", ")}`);
  }
  const isDraft = status === "draft";

  const title = requireString(data.title, "title");
  // A draft only needs a title; a published broadcast needs a message too.
  const body = isDraft ? String(data.body || "") : requireString(data.body, "body");
  const rawAudience = requireString(data.audience, "audience");
  if (!BROADCAST_AUDIENCES.includes(rawAudience)) {
    throw new functions.https.HttpsError("invalid-argument", `audience must be one of ${BROADCAST_AUDIENCES.join(", ")}`);
  }
  const audience = normaliseAudience(rawAudience);

  const asStringArray = (v, cap) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, cap) : []);

  // Targeting fields are null (never undefined) when unused, so a Firestore
  // update clears them rather than leaving stale values behind.
  let planIds = null;
  let planFilter = null;
  if (audience === "plan") {
    planIds = asStringArray(data.plan_ids, 50);
    if (planIds.length === 0 && typeof data.plan_filter === "string") planIds = [data.plan_filter];
    if (!isDraft && planIds.length === 0) {
      throw new functions.https.HttpsError("invalid-argument", "plan_ids required for a plan audience");
    }
    // Kept so the existing owner-app reader, which matches on a single
    // plan_filter, still works for single-plan broadcasts.
    planFilter = planIds[0] || null;
  }

  let gymIds = null;
  if (audience === "specific") {
    gymIds = asStringArray(data.gym_ids, 500);
    if (!isDraft && gymIds.length === 0) {
      throw new functions.https.HttpsError("invalid-argument", "gym_ids required for specific audience");
    }
  }

  const statusFilter = audience === "status" ? requireString(data.status_filter, "status_filter") : null;

  const days = Number(data.expires_in_days);
  const expiresAt = Number.isFinite(days) && days > 0
    ? admin.firestore.Timestamp.fromDate(new Date(Date.now() + days * 86400000))
    : null;

  const reachCount = Number.isFinite(Number(data.reach_count)) ? Number(data.reach_count) : null;

  const payload = {
    title: title.slice(0, 120),
    body: body.slice(0, 1000),
    status,
    audience,
    plan_filter: planFilter,
    plan_ids: planIds,
    status_filter: statusFilter,
    gym_ids: gymIds,
    reach_count: reachCount,
    // Drafts must never satisfy the owner-app read rule.
    active: !isDraft,
    expires_at: expiresAt,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };

  const id = typeof data.id === "string" && data.id.trim() ? data.id.trim() : null;

  if (id) {
    const ref = db.collection("broadcasts").doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new functions.https.HttpsError("not-found", "broadcast not found");
    if ((snap.data().status || "published") === "published") {
      throw new functions.https.HttpsError("failed-precondition", "published broadcasts can't be edited");
    }
    if (!isDraft) payload.published_at = admin.firestore.FieldValue.serverTimestamp();
    await ref.set(payload, { merge: true });
    await audit(context, { gymId: null, action: `admin_update_broadcast_${status}`, after: { id, audience, title } });
    return { ok: true, id };
  }

  const ref = await db.collection("broadcasts").add({
    ...payload,
    published_at: isDraft ? null : admin.firestore.FieldValue.serverTimestamp(),
    created_by: context.auth.uid,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  await audit(context, { gymId: null, action: `admin_create_broadcast_${status}`, after: { id: ref.id, audience, title } });
  return { ok: true, id: ref.id };
});

exports.adminSetBroadcastActive = functions.https.onCall(async (data, context) => {
  assertSuperAdmin(context);
  const id = requireString(data.id, "id");
  const isActive = data.active === true;
  const ref = db.collection("broadcasts").doc(id);
  if (!(await ref.get()).exists) throw new functions.https.HttpsError("not-found", "broadcast not found");
  await ref.set({ active: isActive }, { merge: true });
  await audit(context, { gymId: null, action: "admin_set_broadcast_active", after: { id, active: isActive } });
  return { ok: true };
});

exports.adminDeleteBroadcast = functions.https.onCall(async (data, context) => {
  assertSuperAdmin(context);
  const id = requireString(data.id, "id");
  await db.collection("broadcasts").doc(id).delete();
  await audit(context, { gymId: null, action: "admin_delete_broadcast", after: { id } });
  return { ok: true };
});

// ── Convenience: seed the 5 default tiers (no-op for plans that already exist) ─
exports.adminSeedDefaultPlans = functions.https.onCall(async (data, context) => {
  assertSuperAdmin(context);
  const DEFAULTS = [
    { id: "FREE",              name: "Free",              inr: 0,   order: 0 },
    { id: "BASIC",             name: "Basic",             inr: 199, order: 1 },
    { id: "PROFESSIONAL",      name: "Professional",      inr: 499, order: 2 },
    { id: "PROFESSIONAL_PLUS", name: "Professional Plus", inr: 799, order: 3 },
    { id: "PREMIUM",           name: "Premium",           inr: 999, order: 4 },
    { id: "PREMIUM_PLUS",      name: "Premium Plus",      inr: 1499, order: 5 },
  ];
  let created = 0;
  for (const p of DEFAULTS) {
    const ref = db.collection("plans").doc(p.id);
    if ((await ref.get()).exists) continue;
    await ref.set({
      name: p.name,
      monthly_amount_inr: p.inr,
      member_cap: null,
      features: {},
      is_active: true,
      sort_order: p.order,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    created++;
  }
  await audit(context, { gymId: null, action: "admin_seed_default_plans", after: { created } });
  return { ok: true, created };
});


// ── Super Admin contact details ────────────────────────────────────────────
// Backs the console's Settings screen. Stored at platform_settings/super_admin,
// which is super-admin-read / server-write-only in firestore.rules.
exports.adminSaveContactDetails = functions.https.onCall(async (data, context) => {
  assertSuperAdmin(context);

  const phone = String(data.phone || "").replace(/\D/g, "");
  if (!/^[6-9]\d{9}$/.test(phone)) {
    throw new functions.https.HttpsError("invalid-argument", "phone must be a 10-digit Indian mobile number");
  }

  const email = String(data.email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new functions.https.HttpsError("invalid-argument", "email is not a valid address");
  }

  const ref = db.collection("platform_settings").doc("super_admin");
  const before = (await ref.get()).data() || null;
  const after = {
    phone,
    email,
    updated_by: context.auth.uid,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };
  await ref.set(after, { merge: true });

  await audit(context, { gymId: null, action: "admin_save_contact_details", before, after });
  return { ok: true };
});
