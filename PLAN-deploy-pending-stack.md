# PLAN-deploy-pending-stack — Deploy the three built-but-undeployed features

## Goal
Deploy the backend for three features already merged to `main`: attendance QR security (signed token + `processScan`), multi-gym member login, and staff login + receptionist Front Desk. **This is urgent, not just important:** all commits are pushed to `origin/main`, and Vercel auto-deploys `main`, so the LIVE frontend is already calling Cloud Functions that do not exist yet. Until this plan runs, staff login, member login, member QR check-in, and all scanning (kiosk/tablet/reception) are broken in production.

## Files to touch
None (code is done). This is a deploy + verify plan. Everything below is CLI / Firebase console work from the repo root.

## Implementation order

### Step 1 — Confirm you're on the right project
```bash
firebase use          # must show gymly-app-06
git status            # must be clean, on main, in sync with origin/main
```

### Step 2 — Ensure the QR signing secret exists BEFORE deploying functions
`processScan` and `refreshCheckinClaim` use `runWith({ secrets: ["QR_SIGNING_SECRET"] })`. Deploy fails if the secret doesn't exist in Secret Manager.
```bash
firebase functions:secrets:access QR_SIGNING_SECRET
```
- If it prints a value → done, go to Step 3. **Do not rotate it** — rotating invalidates any tokens minted during testing, harmless but confusing.
- If it errors (not found):
```bash
openssl rand -hex 32   # copy the output
firebase functions:secrets:set QR_SIGNING_SECRET   # paste when prompted
```

### Step 3 — Deploy ONLY the four new callables
```bash
firebase deploy --only functions:resolveStaffLogin,functions:setActiveGymClaim,functions:refreshCheckinClaim,functions:processScan
```
Deploy these by name. **Do NOT run `firebase deploy --only functions`** (wholesale) — the codebase has many scheduled/triggered functions and legacy `functions.config()` fallbacks; a wholesale deploy risks touching things this plan doesn't cover.

Edge cases a weaker model would miss:
- These are **v1 API functions** (`firebase-functions@5`, `functions.https.onCall`, `runWith`). If deploy errors suggest upgrading to v2 or bumping the SDK — **do not**. The whole codebase is v1; mixing versions breaks it.
- Even a named-function deploy loads all of `functions/index.js` during analysis. If deploy fails with a `functions.config()` error (the config API is being decommissioned), that failure comes from OTHER functions' code paths — report it, don't refactor here (that's PLAN-secrets-rotation-cleomitra).
- Deploy from repo root; `functions/` has its own `package.json` — if modules are missing run `npm --prefix functions install` first.

### Step 4 — Deploy Firestore rules and indexes
```bash
firebase deploy --only firestore:rules,firestore:indexes
```
- The local `firestore.rules` contains the member-linking branches (`auth_uid`, `phone_number` match) that prod is missing — this is the root cause of "not registered, ask your owner". Rules deploys are near-instant.
- The composite index `users(auth_uid ASC, gym_id ASC)` **builds asynchronously** — can take minutes. `refreshCheckinClaim` (member QR) will throw `failed-precondition` until it's READY. Check state in Firebase console → Firestore → Indexes before testing member QR. Do not treat that error during the build window as a code bug.

### Step 5 — Verify in production (in this order — later items depend on earlier ones)
1. **Staff login**: log in as a receptionist by phone. `resolveStaffLogin` finds the staff doc by phone, links `auth_uid`, mints claims. Must land on `/receptionist` Front Desk (NOT owner onboarding — landing on onboarding means the callable isn't reachable).
2. **Member login, single gym**: member with one membership → auto-activates, lands on member home.
3. **Member login, multi-gym** (if a test member with 2 gyms exists): gym picker appears, Active badge on live subscription, selection loads that gym's data.
4. **Member QR**: MemberHome renders a QR encoding `gymly://checkin/{uid}/{gymId}/{windowStart}/{token}` (5 parts). If it errors, check index state (Step 4).
5. **Kiosk scan**: entry kiosk scans the member QR → success + streak screen. Kiosks auth **anonymously with NO gym_id claim** — `processScan` resolves gym+mode from `kiosk_devices/{deviceId}`. If it fails with permission errors, verify the kiosk passes its `deviceId`; do not try to add claims to kiosks.
6. **Receptionist scan**: Front Desk tap-to-scan camera → scan member QR → check-in result + streak.
7. **Owner regression**: owner login, dashboard occupancy, AttendanceLogs page — all unchanged (processScan writes identical field shapes).
8. **Date sanity** (if testing near midnight): server date key uses `Asia/Kolkata`; a check-in at 00:30 IST must appear under today's IST date, not yesterday's UTC date.

## Acceptance criteria
- [ ] `firebase functions:list` (or console) shows `resolveStaffLogin`, `setActiveGymClaim`, `refreshCheckinClaim`, `processScan` deployed, us-central1, v1.
- [ ] `users(auth_uid, gym_id)` composite index state = READY.
- [ ] Staff phone login reaches the Front Desk dashboard.
- [ ] Member phone login succeeds (no "not registered" for an owner-created member).
- [ ] Member QR renders and a kiosk + receptionist scan both check in successfully with streak shown.
- [ ] Owner dashboard and AttendanceLogs look unchanged.
- [ ] No rules regression: owner can still add/edit members and record payments.

## After completion
Do **PLAN-attendance-rules-lockdown** next — it is explicitly gated on this plan being verified in production.
