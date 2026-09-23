# PLAN — Register Import (Paper / Excel → Members)

Source spec: `gymloop-register-import-BUILD-PROMPT.md`
Recon date: 2026-09-19 · Branch at recon: `redesign` (== `origin/main` == `origin/redesign`, all at 394cca4)
Status: **GATE 1 recon complete. Decisions made 2026-09-19. Cleomitra/WhatsApp removed (Part F). X-2 and X-3 now resolved — 3 conflicts remain, all mitigated.**

---

## PART A — GATE 1 RECON REPORT

### A.1 Member schema

- **Path:** `src/firebase/firestore_real.js:240` (`createMember`) → `src/firebase/firestore.js:40` (proxy) · UI at `src/owner/screens/Members/AddMember.jsx:126` and legacy `src/pages/Members/AddMember.jsx:227`
- **Current behaviour:** `addDoc(collection(db,'users'), {...})` — random doc ID, **not** an Auth UID.
- **Fields written at creation** (from `AddMember.jsx:111-140`):
  `name, phone, role:'member', gym_id, permissions[], plan_id, plan_name, start_date, subscription_expiry, payment_status, created_by, memberId, memberNumber, send_welcome_whatsapp, qr_attendance_enabled, agreement_status, profile_photo, date_of_birth, gender, height, weight, goal, medical_notes, attendance_count, last_seen, renewal_history[], source_lead_id`
  Later patched on the same doc: `latestEnrollmentNumber`.
  Client-side required: `name` (≥2 chars), `phone` (exactly 10 digits), `plan_id`.
- **Risk / conflict:** 🔴 **There is no `members` collection.** The spec says "live `members` collection" ~15 times. Everything maps to `users` where `role == 'member'`. The Storage path `members/{gymId}/**` is the *profile-photo* path and is unrelated.

### A.2 Phone handling

- **Path:** `getMemberByPhone` (`firestore_real.js:268`), `linkMemberships` (`firestore_real.js:178`), duplicate check at `AddMember.jsx:67-79`
- **Current behaviour:** Stored as `countryCode + cleaned` (e.g. `+919876543210`). Cleaning is inline in the UI: `replace(/\s/g,'').replace(/^0+/,'')`. **No shared normalization helper exists.**
- **Phone is a de-facto identity key** in three live places: `linkMemberships` (member Phone-Auth login fans out across gyms by exact phone match), the `users` firestore rule (`request.auth.token.phone_number == resource.data.phone` grants read + first-login update), and `getMemberByPhone` duplicate detection.
- **Risk:** 🔴 Not unique — enforced nowhere, and multi-gym members intentionally share a phone across docs. But a **wrong** imported phone grants that phone's real owner read/update access to the imported member doc. Phone accuracy is a security boundary here, not just data quality.
- Index exists: `users (gym_id ASC, phone ASC)`.

### A.3 Role & permission helper

- **Path:** `src/utils/permissions.js` — `can(userDoc, action)`, `hasRole()`, `ROLE_PERMISSIONS`. Route gate: `src/components/ProtectedRoute.jsx` via `requiredPermission=` / `allowedRoles=`.
- **Server side:** re-read from Firestore, e.g. `memberLifecycle.js:17-23` — `db.collection('users').doc(context.auth.uid).get()` then check `gym_id` + `role in ['owner','manager']`. This is the canonical callable auth pattern.
- **Claims:** `functions/src/userClaims.js` `onUserWrite` mints `{role, gym_id}` into the JWT for docs at `users/{uid}` (owners only — staff/member docs have random IDs). Staff/managers get claims from `functions/src/staffClaims.js` `resolveStaffLogin`, called at login (`AuthContext.jsx:212`). **So Owner *and* Manager both reliably carry `request.auth.token.gym_id` and `.role`.** T-7 is satisfiable.
- No permission string exists for import. Will add `import_members` to `ROLE_PERMISSIONS.owner` + `.manager` (additive; `can()` falls back to role defaults, so no data migration).

### A.4 Storage

- **Path:** `storage.rules` (root), helpers in `src/firebase/storage.js`.
- **Current buckets:** `agreements/{gymId}/**`, `gyms/{gymId}/invoices/**`, `gyms/{gymId}/logo`, `gyms/{gymId}/photos/**`, `members/{gymId}/**`, `payment_screenshots/{paymentId}`, `profile_photos/{uid}`; final `match /{allPaths=**} { allow read, write: if false; }`.
- **Already uses `request.auth.token.gym_id == gymId`** on every gym path — T-7's required pattern is the house pattern. ✅
- Existing client upload helper `uploadMemberPhoto` compresses via canvas → **WebP**, max 400px. Import needs grayscale JPEG q80 @1500px — new helper, do not modify `compressImage`.
- **Risk:** the catch-all deny is last; `gyms/{gymId}/imports/**` must be inserted *above* it.

### A.5 Secrets

- **Canonical pattern:** `functions.runWith({ secrets: ["NAME"] })` + `process.env.NAME` — Secret Manager. Established in `functions/src/attendanceAuth.js:51` and `functions/src/processScan.js:284` (`QR_SIGNING_SECRET`).
- **Legacy pattern (do not copy):** `functions.config().cleomitra?.apikey` with a **hardcoded fallback key** at `functions/index.js:10` and `functions/src/invoicing.js:183`. Known debt, out of scope.
- Decision: use `runWith({ secrets: [...] })` only. `GEMINI_API_KEY` + `LLM_PROVIDER`.

### A.6 Existing indexes

- `firestore.indexes.json`: 36 indexes, 1 of them COLLECTION_GROUP (`payments`, for the platform rollup). 12 `fieldOverrides` disabling indexing on large text fields.
- Relevant existing: `users(gym_id, role, created_at DESC)`, `users(gym_id, role, subscription_expiry)`, `users(gym_id, phone)`, `users(gym_id, role, is_deleted)`, `users(auth_uid, gym_id)`.
- **No index exists for `legacy_enrollment_no`, `legacy_serial_no`, `import_batch_id` or `source`.**

### A.7 Existing import code

- **None.** No CSV/XLSX parser, no bulk-add, no file-parsing code anywhere in `src/`, `functions/` or `scripts/` (only hit is `scripts/.cache/material-symbols.json`). Greenfield.
- No spreadsheet dependency in `package.json` — SheetJS/PapaParse would be a **new client dependency**.

### A.8 Usage / quota precedent

- **No usage or quota doc pattern exists.** Closest precedents:
  - `serial_counters/{gymId}_{key}` — transactional counter, rules at `firestore.rules` (gymId field in doc body).
  - `gyms/{gymId}/stats/summary` — server-written, client-read-only subcollection under the gym (`allow write: if false`). **This is the shape to copy** for `gyms/{gym_id}/usage/import_quota`.
- `functions/src/gymStats.js` also gives the in-memory debounce pattern (3s) used for recompute fan-out.

### A.9 Retention host (spec 4.6, T-6)

- Existing daily schedulers: `permanentlyDeleteExpired` (`memberLifecycle.js:174`, 02:00 IST), `dailyExpiryReminders` (`index.js:236`, 03:30 IST), `checkTrialExpiry` (`index.js:735`, 06:00 IST).
- **Attach the 30-day image purge to `permanentlyDeleteExpired`** — it is already the "delete things 30 days after an event" daily job, same semantics, same timezone. No new scheduler. ✅ T-6 honoured.

---

## PART B — CONFLICTS & SURPRISES (blocking)

| # | Conflict | Impact | Proposed resolution |
|---|----------|--------|---------------------|
| **X-1** | **No `members` collection.** Members are `users` docs with `role:'member'`. | Every rule, query and commit path in the spec is written against a collection that does not exist. | Global rewrite: `members` → `users` + `role:'member'` + `gym_id`. All new indexes target `users`. **Needs your OK — it changes nothing functionally but invalidates the spec's wording throughout.** |
| **X-2** | ~~`onMemberCreated` WhatsApp blast~~ — **RESOLVED.** All Cleomitra/WhatsApp sending was removed on 2026-09-19 (Part F). `onMemberCreated` no longer exists. | None. | No guard needed; there is nothing left to fire. |
| **X-3** | ~~Imported members have no plan~~ — **RESOLVED by decision D-1.** Imports now carry a real join date and computed expiry, so they are ordinary members. | None. Dashboard counts stay truthful. | See Part G. |
| **X-4** | 🟡 **`statsOnUserWrite` (`gymStats.js:105`) fires on every `users` write**, debounced 3s but only *in-memory per function instance*. | A 300-doc commit spread across instances triggers several full recomputes, each scanning all members + a month of payments + today's attendance. Cost spike, not a correctness bug. | Commit in ≤450-doc batches with a 1.5s gap between batches, so the debounce actually coalesces. No change to `gymStats.js`. |
| **X-5** | 🟠 **One Firebase project (`gymly-app-06`), no staging.** `.firebaserc` has `default` only. | "Test in preview, then push to production" works for the Vercel frontend but **there is no preview environment for Cloud Functions, Firestore rules, indexes or Storage rules** — they deploy straight to live. | Three-layer mitigation in Part D: emulator suite locally → additive-only backend deploy (new function names, new rule blocks, new index entries — nothing existing renamed or removed) → **per-gym feature flag** so production owners never see the feature until you flip it on your own test gym. |

**Non-blocking surprises**

- `AGENTS.md` §8 documents gym scoping as `get(/databases/.../users/$(uid)).data.gym_id`. The live `firestore.rules` no longer does this — it uses `request.auth.token.gym_id` everywhere (the O-2 custom-claims optimisation). **`AGENTS.md` §8 is stale**; follow the live rules file.
- `AGENTS.md` says Node 18; `functions/package.json` says `"node": "20"`. Follow the package.json.
- Functions use the **v1** SDK (`functions.firestore.document(...).onCreate`, `functions.pubsub.schedule`). New code must match — not v2 `onDocumentCreated` as the spec's T-6 wording implies.
- An enrolment-number system already exists (`generateEnrollmentNumber`, `latestEnrollmentNumber`, `numbering_settings`, `serial_counters`). The spec's `legacy_enrollment_no` is a distinct field — no collision, but do not conflate them in the UI.
- CSP in `vercel.json` already permits `https://*.googleapis.com` (connect) and `firebasestorage.googleapis.com` + `blob:` (img). **No CSP change needed.** ✅
- Material Symbols is a **subsetted font** — every new icon must be appended to `icon_names=` in `index.html:35` or it renders as literal text. Run `npm run icons:check` before every build.

---

## PART C — DECISIONS MADE (2026-09-19)

- **D-1 — Membership status:** Imported members get a **real join date and computed expiry** (Part G). They are ordinary members, not a second class. Resolves X-3.
- **D-2 — Automated messaging:** **Removed entirely, silent.** All Cleomitra and Authkey sending is gone (Part F). Resolves X-2.
- **D-3 — Model + budget:** Gemini Flash via `GEMINI_API_KEY` in Secret Manager. Per-gym monthly page cap still to be set (suggest 150).
- **D-4 — Spreadsheet path:** Deferred to v1.1. Register/photo path ships first; staging schema is identical so nothing is wasted.

## PART D — "DON'T BREAK ANYTHING" STRATEGY

### D.1 Files that will NOT be touched

`src/owner/screens/Dashboard.jsx` · `src/owner/OwnerShell.jsx` (nav array untouched — no new tab) · `src/owner/screens/Analytics.jsx` · `src/owner/screens/Settings/**` · `src/owner/screens/Payments/**` · `src/owner/screens/Members/AddMember.jsx` · `EditMember.jsx` · `MemberProfile.jsx` · `src/firebase/firestore_real.js` · `src/firebase/storage.js` (new file instead) · `src/context/AuthContext.jsx` · `functions/src/gymStats.js` · all existing function exports.

### D.2 Files that WILL be touched, and how minimally

| File | Change | Blast radius |
|------|--------|--------------|
| `src/App.jsx` | +3 `lazy()` imports, +3 `<Route>` blocks under `/owner/members/import*` | Additive. Existing routes untouched. |
| `src/owner/screens/Members/MembersList.jsx` | One "Import register" button in the header, rendered **only when the feature flag is on** | Invisible in production until flag flips. |
| `src/utils/permissions.js` | `+'import_members'` on `owner` and `manager` arrays | Additive; `can()` already falls back to role defaults. |
| `index.html` | Append new icon names to `icon_names=` | Font subset only. |
| `functions/index.js` | +1 require/export block at the bottom (per AGENTS.md §2.4), **+3-line guard in `onMemberCreated`** (X-2) | The guard is the only behavioural edit to live code. Gated on a field no existing doc has. |
| `functions/src/memberLifecycle.js` | Append image-retention sweep inside `permanentlyDeleteExpired` (X-4/T-6) | Runs after the existing loop; a throw is caught per-item, existing deletion logic untouched. |
| `firestore.rules` | New `gyms/{gymId}/import_batches/**` + `gyms/{gymId}/usage/{doc}` blocks | New paths only. Nothing currently reads/writes them. |
| `storage.rules` | New `gyms/{gymId}/imports/**` block inserted **above** the catch-all deny | New path only. |
| `firestore.indexes.json` | New entries (Part E.2) | Additive; existing indexes untouched. |
| `package.json` | (only if D-4 = yes) `xlsx`, lazy-imported | Deferred. |

### D.3 Feature flag — the main safety net

`gyms/{gymId}.settings.features.register_import === true`

- Client: the MembersList button and the `/owner/members/import*` routes render nothing without it.
- Server: `createImportBatch` re-reads the gym doc and throws `failed-precondition` without it. Client flag is UX, server flag is enforcement.
- Set manually in the Firebase console on your test gym only. **Every other live gym is unaffected even after a production deploy.**

### D.4 Test → production sequence

**Stage 0 — local, nothing deployed**
`firebase emulators:start --only functions,firestore,storage` against seeded fixture data. Run the whole flow: upload → extract (stub the Gemini call with a recorded fixture response first, then live once) → review → commit. Assert the acceptance criteria that are testable offline.

**Stage 1 — indexes (T-4/T-12)**
`firebase deploy --only firestore:indexes --project gymly-app-06` → wait for **green in console**. Additive, cannot break existing queries.

**Stage 2 — functions, new names only**
`firebase deploy --only functions:createImportBatch,functions:onImportPageCreated,functions:resolveDuplicates,functions:commitImportBatch --project gymly-app-06`
Deploy `onMemberCreated` + `permanentlyDeleteExpired` (the two edited existing functions) in a **separate, explicit** command so the diff is obvious and rollback is one command.

**Stage 3 — rules**
`npx firebase-tools rules:check --project gymly-app-06` (must be zero errors) → `firebase deploy --only firestore:rules` → `firebase deploy --only storage`.

**Stage 4 — localhost**
`npm run dev` against the live backend, feature flag on your test gym only. Full end-to-end on `localhost:5173`. Nothing is pushed until this passes. Production `gymly.online` is untouched throughout.

**Stage 5 — production**
Push the branch, merge to `main` → Vercel production. Flip the flag per gym as you onboard them.

**Rollback**
Frontend: Vercel → redeploy previous. Functions: `firebase functions:delete <name>`. Rules/indexes: revert in git, redeploy. Feature flag off = instant kill switch for the whole feature, no deploy needed.

---

## PART E — BUILD PHASES

### E.0 Prereqs (no code)
Resolve D-1…D-4. Create `GEMINI_API_KEY` in Secret Manager. `gcloud firestore export gs://gymly-app-06-backups/$(date +%Y%m%d)` before first production commit test (AGENTS.md §2.6).

### E.1 Schema + indexes → **GATE 2**
Additive fields on `users` docs, written **only** by `commitImportBatch`:
`legacy_enrollment_no` (string|null) · `legacy_serial_no` (string|null) · `import_batch_id` (string|null) · `source` ('manual'|'import_register'|'import_sheet'; **absent on all existing docs — treat missing as 'manual' in code, no backfill**, per AGENTS.md §2.6).

Staging + quota collections exactly as the spec's Part 3, but under `gyms/{gym_id}/…` (already the house pattern for `stats`).

New indexes:
- `users` (gym_id ASC, legacy_enrollment_no ASC)
- `users` (gym_id ASC, legacy_serial_no ASC)
- `users` (gym_id ASC, import_batch_id ASC, created_at DESC) — powers the post-commit "view imported members" link
- `rows` COLLECTION_GROUP? **No** — rows are always queried within one known batch path, so a plain collection index suffices: `rows` (status ASC, rowIndex ASC) and `rows` (pageId ASC, rowIndex ASC), `queryScope: COLLECTION`.
- `pages` (status ASC) for the concurrency gate; `pages` (imageHash ASC, status ASC) for the cache hit.
- `fieldOverrides`: disable indexing on `rows.raw` and `rows.confidence` (map fields, never queried — mirrors the existing `notes`/`medical_notes` overrides and keeps write cost down).

Deploy indexes, confirm green, **then** proceed.

### E.2 Backend → **GATE 3**
New CommonJS files under `functions/src/import/`:
`visionExtractor.js` (no Firestore writes, `maxRows` 60 guard, `runWith({secrets:['GEMINI_API_KEY','LLM_PROVIDER']})` at the caller) · `normalizeRow.js` (pure, unit-testable: phone → 10 digits starting 6-9 after stripping `+91`/spaces and `O→0 l/I→1 S→5`; dates parsed with the batch's inferred format only) · `importBatch.js` (`createImportBatch`, `commitImportBatch`) · `importPage.js` (`onImportPageCreated`) · `duplicates.js` (`resolveDuplicates`).

Every callable follows the house pattern: `context.auth` check → re-read `users/{context.auth.uid}` → assert `gym_id` + `role in ['owner','manager']` → assert feature flag. Every batched write uses `const ref = db.collection(...).doc(); batch.set(ref, data)` (T-1). Audit entries to the existing `audit_logs/{gymId}/events/{eventId}` path.

`commitImportBatch` writes `send_welcome_whatsapp: false`, `source: 'import_register'`, `qr_attendance_enabled: false`, `agreement_status: 'pending'`, `plan_id: null`, `subscription_expiry: null` — matching the existing member shape so no downstream reader hits an undefined field.

Retention sweep appended to `permanentlyDeleteExpired`.

### E.3 Frontend → **GATE 4**
New folder `src/owner/screens/Members/Import/` — `ImportStart.jsx` (attestation gate + quota), `ImportCapture.jsx` (preprocess: 1500px longest edge, grayscale, JPEG q80, SHA-256 via `crypto.subtle.digest`), `ImportReview.jsx` (split image/rows, flags as chips, bulk approve, duplicate clusters), `ImportSummary.jsx`. New helper `src/firebase/storage-import.js` — do not touch `storage.js`.

**No client write to `users` anywhere in this feature.** Upload goes to Storage; everything else goes through callables.

### E.4 Rules → **GATE 5**
`rules:check` output pasted before any deploy.

### E.5 Verification
Work the spec's §8 checklist, plus three additions this recon forces:
- [ ] Committing a batch sends **zero** WhatsApp messages (`whatsapp_logs` count unchanged; check Cleomitra dashboard).
- [ ] Every other gym on production sees no UI change and no new reads while the flag is off.
- [ ] `npm run build` clean; `npm run icons:check` clean; grep the `dist/` bundle for `GEMINI`, `generativelanguage`, and the API key — zero hits.

---

## PART F — WHATSAPP / CLEOMITRA REMOVAL (done 2026-09-19)

867 lines deleted across 10 files. `npm run build` clean, zero new lint errors.

**Server — `functions/index.js`**
Deleted `sendWhatsAppFromFunction`, `logWhatsApp`, `sendAndLog`, `formatDate` and the `node-fetch` require, plus five functions that existed only to send: `retryFailedMessages`, `dailyExpiryReminders`, `pendingPaymentReminder`, `onMemberCreated`, `onPaymentUpdated`.

**Server — `functions/src/invoicing.js`**
Deleted `sendInvoiceWhatsApp` and the `resendInvoice` callable. Removed step 3 (WhatsApp delivery) from `processNewPayment`. **Zoho invoice generation, the `invoices` doc and the `invoice_pdf_url` payment update all survive untouched** — only the delivery leg is gone.

**Client**
- Deleted `src/utils/whatsapp.js` (the dormant Authkey provider).
- `owner/screens/Payments/PaymentDetail.jsx` — removed `handleSendWhatsApp`, the green WhatsApp button, the "WhatsApp receipt" summary row, and the now-unused `useOwnerGym` hook.
- `owner/screens/Payments/AddPayment.jsx` — removed the "Send WhatsApp receipt" checkbox and its send block.
- `owner/screens/Settings/SettingsHub.jsx` — removed the whole "WhatsApp messaging" settings sheet, its entry row, `messagingConfig` state and `saveMessagingConfig`. Those toggles controlled senders that no longer exist; leaving them would have lied to the owner.
- `components/InquiryModal.jsx` — **a third send path, found only by grepping the built bundle.** It posted to `api.cleomitra.app` from the browser using `VITE_CLEOMITRA_API_KEY`, which Vite inlines into public JS. The live key was shipping in the production bundle. Removed, and the success copy reworded (it claimed the owner had been notified).
- `pages/Payments/*`, `pages/Analytics/Analytics.jsx` — same cleanup on the unrouted legacy screens so no dangling imports remain.

**Deliberately kept**
- `wa.me` deep links on Leads, MemberProfile and the landing pages — user-initiated, no API, no key, no cost.
- The `whatsapp_logs` collection and the read-only `/owner/whatsapp` log screen — history is preserved (AGENTS.md §2.6 forbids dropping collections). It simply stops gaining rows.
- `message_retry_queue`, `message_logs` and their Firestore rules — orphaned but harmless; removing the rules would only break reads of historical data.
- `whatsapp_sent: false` on new payment docs — a dead field, but removing it would be a non-additive schema change for zero gain.

**Verified**
- `cmk_c6e22…`, `api.cleomitra.app`, `messages.authkey.io`, `VITE_CLEOMITRA_API_KEY`, `VITE_AUTHKEY_TOKEN` — **zero hits in `dist/`**.
- All 36 surviving function exports intact.
- Only lint errors remaining in touched files are pre-existing (verified against `HEAD`).

### ⚠️ Deploy steps YOU run (removal is not live until these are done)

```
firebase deploy --only functions:processNewPayment --project gymly-app-06

firebase functions:delete retryFailedMessages   --project gymly-app-06
firebase functions:delete dailyExpiryReminders  --project gymly-app-06
firebase functions:delete pendingPaymentReminder --project gymly-app-06
firebase functions:delete onMemberCreated       --project gymly-app-06
firebase functions:delete onPaymentUpdated      --project gymly-app-06
firebase functions:delete resendInvoice         --project gymly-app-06
```

Deleting the three scheduled ones also removes their Cloud Scheduler jobs — a recurring cost saving.
Optional cleanup once deployed: `firebase functions:config:unset cleomitra`, and drop `VITE_CLEOMITRA_API_KEY` from `.env` and Vercel env.

**Until those deletes run, the old functions stay live on the last deployed source and keep sending.** The frontend changes take effect on the next Vercel deploy.

---

## PART G — IMPORT DATES: JOIN DATE + MONTHS → EXPIRY

Replaces the old "no plan, null expiry" design. Imported members become ordinary members.

The existing form already does this — it just hardcodes today:

```js
// src/owner/screens/Members/AddMember.jsx:55
const calculatedExpiry = selectedPlan ? addDays(new Date(), selectedPlan.duration_days || 30) : null;
```

Import swaps the anchor date:

```js
const joined  = parsedJoinDate;                       // from the register, batch-inferred format
const days    = matchedPlan?.duration_days ?? months * 30;
const expiry  = addDays(joined, days);
// start_date: Timestamp.fromDate(joined)
// subscription_expiry: Timestamp.fromDate(expiry)
```

Everything downstream then works with no special-casing: `getDaysRemaining`, the Active/Expiring/Expired badges, `recomputeStats`, renewals, and the member list filters.

**Review-screen rules**
- The reviewer confirms the join date and the number of months per row; neither may be null to approve (`raw.joinedOn` and `raw.plan` are both often messy on paper).
- Months map to a real plan from `gym.settings.plans` where one matches on duration; otherwise `plan_id: null` with `plan_name` set to the raw register text, so nothing is invented.
- A computed expiry in the past is **correct and expected** for an old register — those members show as Expired, which is the truth, and the owner can renew them normally.

**Payment records — decision D-1, "optional per row"**
- Default off. A row only gets a payment record when the reviewer ticks it (typically where the register shows an amount).
- ⚠️ `processNewPayment` fires on every `payments` create and generates a **real Zoho invoice**. Ticking 300 rows would mint 300 invoices. Before enabling per-row payments, `commitImportBatch` must write payments with a marker (e.g. `source: 'import_register'`) and `processNewPayment` must early-return on it — the same shape as the guard X-2 originally needed. **This is required before the payment tick-box ships; it is not needed for the member-only path.**
