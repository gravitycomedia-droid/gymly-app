# Gymly — Super Admin (Platform Control Plane) Spec

> Reference document for Antigravity / Claude Code sessions. Companion to
> `AGENTS.md`, `EFFICIENCY.md`, and `SECURITY_STATUS.md`.
> Firebase project: `gymly-app-06`.

---

## 1. What this is (and what it is not)

The Super Admin is **not** a gym dashboard. It is the **platform control plane** —
the back-office that Linq Tech (you) uses to oversee *every gym tenant* on Gymly and
to manage each gym's subscription to Gymly itself.

| | Gym Owner dashboard | Super Admin control plane |
|---|---|---|
| Scope | One gym (`gym_id` scoped) | **All** gyms (scoping bypassed) |
| Reads | One gym's members/staff | Aggregates across all tenants |
| Subscription | Their own Razorpay member plans | **Each gym's plan to Gymly** |
| Audience | Owner/Manager/Trainer/Reception | Linq Tech only |

This distinction drives the data model, the security rules, and — most importantly for
Gymly — the **Firestore cost profile**.

---

## 2. Non-negotiable architectural principles

These exist because a control plane that reads all tenants naively is a cost bomb that
gets worse with every gym you sign.

1. **Never live-count member collections.** The gym list must never iterate gyms and
   count each `members` collection. Member counts are **denormalized** onto the gym
   document (or a parallel summary doc) and maintained by Cloud Function triggers — this
   is the same principle as your O-3 pre-computed stats work.
2. **One read renders the KPI header.** Platform totals (gym count, member count, MRR,
   trials) come from a single `platform_stats/global` document, not from scanning gyms.
3. **The gym list is a single paginated query** over the `gyms` collection with all
   display fields already denormalized inline. N gym docs for N rows — nothing more.
4. **Super Admin bypasses `gym_id` scoping via a custom claim**, never by loosening the
   existing tenant rules. Ties into your O-2 JWT-claims work.
5. **Every privileged action is audit-logged** using the existing audit infrastructure
   from the soft-delete system (actor UID, target `gym_id`, action, before/after, reason,
   timestamp).

---

## 3. Data model

### 3.1 `gyms/{gymId}` — subscription + denormalized counters

Building fresh, so the gym document gains a `subscription` block and denormalized
counters. **Part 0 of the Phase 1 prompt reconciles this against the real current
schema** — do not assume field names below are already present.

```
gyms/{gymId} {
  // ...existing gym fields (name, owner_uid, city, created_at, ...)

  subscription: {
    plan_id: string,            // -> plans/{planId}
    status: "trial" | "active" | "past_due" | "suspended" | "cancelled",
    monthly_amount_inr: number, // snapshot of plan price at assignment
    trial_ends_at: timestamp | null,
    current_period_end: timestamp | null,
    suspended_at: timestamp | null,
    suspended_reason: string | null
  },

  // Denormalized counters — written ONLY by Cloud Functions, never the client
  stats: {
    member_count: number,        // total members
    active_member_count: number, // status == active
    last_activity_at: timestamp, // last check-in/write seen for this gym
    updated_at: timestamp
  }
}
```

### 3.2 `plans/{planId}` — flat monthly tiers

Billing is **flat monthly** (no per-member metering). Member caps, if used, are an
*entitlement*, not a billing input.

```
plans/{planId} {
  name: string,                 // "Starter", "Growth", "Pro"
  monthly_amount_inr: number,   // flat price
  member_cap: number | null,    // entitlement limit, null = unlimited
  features: {                   // per-plan feature flags (see 3.4)
    whatsapp_automation: boolean,
    live_crowd: boolean,
    branded_app: boolean,
    advanced_analytics: boolean
    // ...
  },
  is_active: boolean,           // available for new assignment
  sort_order: number
}
```

MRR = sum of `monthly_amount_inr` over gyms where `subscription.status == "active"`.

### 3.3 `platform_stats/global` — single-doc KPI rollup

```
platform_stats/global {
  total_gyms: number,
  active_gyms: number,
  trial_gyms: number,
  past_due_gyms: number,
  suspended_gyms: number,
  total_members: number,
  total_active_members: number,
  mrr_inr: number,
  updated_at: timestamp
}
```

Maintained by a **scheduled** function (see 5.2) to avoid single-doc write contention.

### 3.4 Feature flags / entitlements

Effective entitlement for a gym = `plans/{plan_id}.features` with optional per-gym
overrides on the gym doc (`gyms/{gymId}.feature_overrides`). Phase 2 wires the
override UI; the schema is defined now so the data shape is stable.

### 3.5 Audit log

Reuse the existing audit collection. Privileged Super Admin actions append:
`{ actor_uid, actor_role: "super_admin", target_gym_id, action, before, after, reason, created_at }`.

---

## 4. Security model

### 4.1 The `super_admin` custom claim

A user is a platform admin iff their Auth token carries `super_admin: true`.

- **Bootstrap (Phase 1):** a one-off Admin SDK script (`scripts/setSuperAdmin.js`) sets
  the claim on a hardcoded allowlist of UIDs (yours). No UI grants super admin — a
  "grant super admin" button is itself an attack surface. Re-run to add admins.
- The claim is set with `admin.auth().setCustomUserClaims(uid, { super_admin: true })`.
  The user must refresh their token (re-login or `getIdToken(true)`) before it takes
  effect — the same token-refresh caveat that bit you on Storage rules.

### 4.2 Firestore rules pattern

```
function isSuperAdmin() {
  return request.auth != null && request.auth.token.super_admin == true;
}

// gyms, plans, platform_stats, members (drill-down):
allow read: if isSuperAdmin() || <existing gym_id-scoped condition>;

// subscription writes happen via Cloud Functions only; lock client writes:
allow write: if isSuperAdmin() && <field whitelist>;  // Phase 2
```

**Guardrails (your known traps):**
- Run `npx firebase-tools rules:check --project gymly-app-06` before **every** rules deploy.
- Deploy with `firebase deploy --only firestore:rules --project gymly-app-06` (the `--only`
  guard so Functions/Hosting/Storage aren't silently touched).
- Cross-gym list/aggregate queries that use `collectionGroup` need composite indexes
  deployed with `--only firestore:indexes` and **confirmed green in console BEFORE** any
  dependent function/code ships, or you get silent `FAILED_PRECONDITION`.

### 4.3 Things to keep behind the audit log
Plan changes, trial extension, suspend/reactivate, feature-flag overrides, and (Phase 3)
impersonation. None of these is a regular action.

---

## 5. Cloud Functions design (CommonJS, no TS)

### 5.1 Per-gym counter triggers (incremental)
- `onMemberCreate` / `onMemberDelete` / `onMemberStatusChange` → increment/decrement
  `gyms/{gymId}.stats.member_count` / `active_member_count` with `FieldValue.increment()`.
- Spread across many gym docs, so contention is low. If a single high-volume gym ever
  approaches the ~1 write/sec/doc ceiling, shard that gym's counter — not needed for v1.
- **Reminder:** `batch.add()` does not exist. Use `db.collection(...).doc()` to mint a
  ref, then `batch.set(ref, data)`.

### 5.2 Platform rollup (scheduled, not triggered)
- A single `platform_stats/global` updated on every member change = guaranteed write
  contention. Instead, a **scheduled** function (e.g. every 10–15 min) reads the
  lightweight `gyms` docs, sums counters + MRR, and writes `platform_stats/global` once.
- Platform KPIs don't need to-the-second freshness; this trades trivial latency for zero
  contention and predictable cost.

### 5.3 Bootstrap script
`scripts/setSuperAdmin.js` — Admin SDK, run locally with the service account, sets the
claim on allowlisted UIDs. Not deployed.

---

## 6. Phased roadmap

### Phase 1 — Foundation + read-only oversight  *(this delivery)*
Claim + bootstrap, route guard, layout, counter triggers, scheduled rollup, rules +
indexes, KPI header, **all-gyms table** (name, owner, city, plan, status, member
count, active count, MRR, last activity, signup date — sortable/searchable/paginated),
and a **read-only per-gym detail** view. Goal: *see everything safely.*

### Phase 2 — Control
Change plan, extend/expire trial, suspend/reactivate, per-gym feature overrides — all
writing via callable functions + audit log. Plan CRUD (`plans` collection). Goal:
*operate every tenant.*

### Phase 3 — Growth & ops
Dunning / failed-payment surfacing (Razorpay), tenant health scoring + churn-risk
flags, **impersonation** ("log in as owner") behind audit, platform broadcast/announce,
support-ticket visibility, GST invoicing for what you bill gyms.

### Phase 4 — Intelligence & polish
Platform-wide retention analytics, real-time occupancy ("Live Gym Crowd") aggregation,
CSV/PDF exports, cohort and conversion-funnel charts.

---

## 7. Phase 1 deploy order (must hold)

1. Cloud Functions (counters + scheduled rollup) + bootstrap claim → backfill counts.
2. Firestore **indexes** → confirm green in console.
3. Firestore **rules** (after `rules:check`).
4. Frontend (route guard, layout, KPIs, table, detail) → Vercel.

Verification gate between each step. Never ship 3 before 2 is green.
