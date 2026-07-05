# Antigravity Prompt — Gymly Super Admin, Phase 1 (Foundation + Read-Only Oversight)

> Paste into Antigravity. Execute **one Part at a time**. Stop at every `🚦 GATE`,
> show diffs, and wait for my review before writing any file. Do not batch Parts.
> Project: `gymly-app-06`. Companion spec: `SUPER_ADMIN_SPEC.md`.

---

## Ground rules (read before touching anything)

1. **Read `AGENTS.md` first.** Follow it for the entire session.
2. Show **exact diffs** for every file before applying. I review, then you write.
3. **Recon before code.** You do not yet know the real schema — Part 0 establishes it.
4. Honor these known Gymly traps:
   - Staff/member docs use `addDoc()` (random IDs ≠ Auth UID). Only owner docs use
     `setDoc(doc(db,'users',uid))`. **Scope by `gym_id`, never by uid matching.**
   - `batch.add()` does not exist. Use `db.collection(...).doc()` then `batch.set(ref,data)`.
   - Rules: run `npx firebase-tools rules:check --project gymly-app-06` before any rules deploy.
     Deploy rules with `firebase deploy --only firestore:rules --project gymly-app-06`.
   - `collectionGroup` queries need indexes deployed `--only firestore:indexes` and
     **green in console BEFORE** dependent code/functions ship.
   - Custom claims require a token refresh (`getIdToken(true)` / re-login) to take effect.
5. Cloud Functions are **CommonJS, no TypeScript**.

---

## PART 0 — Recon (NO WRITES)

Report back, do not modify anything:

1. The real shape of the gym/tenant document — collection name, and current fields
   (name, owner UID field, city, created_at, any existing subscription/plan/status fields).
2. How a gym is created today (file + `addDoc`/`setDoc`), and how `gym_id` is assigned to
   members/staff.
3. The member document: collection name, the field used for member status (active/inactive),
   and the field linking it to its gym.
4. `AuthContext` — how role is currently resolved, and where I'd add a `super_admin` branch.
5. Existing routing/guard pattern (how protected routes are gated by role today).
6. The existing audit-log collection name + document shape (from the soft-delete system).
7. Existing Cloud Functions layout (entry file, how functions are exported/grouped).
8. Whether any `platform_stats`, `plans`, or `stats` denormalization already exists.

Output a short findings table + a list of any field/name mismatches between the spec and
reality. **🚦 GATE 0 — I confirm the schema before you write code.**

---

## PART 1 — Backend foundation (counters + rollup + claim)

After GATE 0, produce diffs for:

1. **`scripts/setSuperAdmin.js`** — Admin SDK script that sets
   `{ super_admin: true }` on an allowlist of UIDs (leave a `// TODO: add my UID` array).
   Local-run only, uses the service account. Not deployed.
2. **Counter triggers** (CommonJS) on the member collection from Part 0:
   - on create → `FieldValue.increment(+1)` on the gym's `stats.member_count`, and
     `active_member_count` when status is active.
   - on delete → decrement.
   - on status change → adjust `active_member_count` only.
   - Always update `stats.updated_at`. Use the correct gym-link field from Part 0.
3. **Scheduled rollup** `recomputePlatformStats` (every 15 min): read all gym docs,
   sum counts + MRR (MRR = sum of `subscription.monthly_amount_inr` where
   `status == "active"`), write `platform_stats/global` once. **No per-member trigger
   touches the global doc** (contention).
4. **One-off backfill** `backfillGymStats` (callable or scripted): for each gym, count its
   members once and seed `stats.*`, then trigger one rollup. This seeds existing gyms.

Deploy functions. Run the backfill. **🚦 GATE 1 — verify `stats.*` populates on a sample
gym and `platform_stats/global` is written.**

---

## PART 2 — Indexes + rules

1. **Indexes:** add composite indexes for the gym-list queries (e.g. order by
   `created_at` desc; filter by `subscription.status`; filter by `subscription.plan_id`).
   Deploy `--only firestore:indexes`. **Confirm green in console before Part 3.**
2. **Rules:** add `isSuperAdmin()` (`request.auth.token.super_admin == true`) and grant it
   read on `gyms`, `plans`, `platform_stats`, and the member collection (for drill-down).
   Do **not** add any client write paths yet — Phase 1 is read-only.
   Run `rules:check`, then deploy `--only firestore:rules`.

**🚦 GATE 2 — verify: a super-admin token reads all gyms; a normal owner token still sees
only their own gym and is denied cross-gym reads.**

---

## PART 3 — Frontend (read-only control plane)

Match the existing Tailwind 3 + Framer Motion design language. No new UI kit.

1. **Route guard + layout:** new top-level route (e.g. `/admin`) gated on the
   `super_admin` claim via `AuthContext`. Non-super-admins are redirected. Sidebar layout
   consistent with the rest of Gymly.
2. **KPI header:** one read of `platform_stats/global` → cards for total gyms, active,
   trials, total members, active members, MRR (₹). No per-gym reads here.
3. **All-gyms table:** single **paginated** query over `gyms` (reuse the paginated-read
   hook from O-5 if present). Columns: gym name, owner, city, plan, status badge,
   member count, active count, MRR contribution, last activity, signup date. Client
   search + sort + status/plan filter. Status as a colored badge
   (trial/active/past_due/suspended).
4. **Per-gym detail (read-only):** click a row → drawer/page showing the gym's
   subscription block, `stats.*`, owner info, and recent members (paginated). Every control
   that will mutate in Phase 2 is rendered **disabled** with a "Phase 2" tag so the layout
   is final.

Deploy to Vercel. **🚦 GATE 3 — visual verification on `gymly.online/admin`.**

---

## Phase 1 done = I can see every gym, its live member counts, plan, and status, safely and
cheaply — with zero ability to mutate yet. Control lands in Phase 2.
