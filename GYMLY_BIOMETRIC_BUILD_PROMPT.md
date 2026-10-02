# GYMLY — ZKTeco Biometric Integration — BUILD PROMPT (v2, 2026-10-02)

> Paste this whole file as the first message of a new Claude Code chat opened in the repo root.
> It supersedes the "PART 0 Recon" of `GYMLOOP_BIOMETRIC_MASTER_PROMPT.md`. Recon is **done**, and its results are baked in below.
> Execute the parts in order. Stop at every 🚦 GATE and wait for Vishnu's "GO". Never batch two parts.

---

## 0. Read first, then confirm in one short message

1. Read `AGENTS.md` fully. Then read `PLAN-biometric-zkteco.md`, which has the conflicts, decisions and device list. Then read sections **1 (traps T1–T17), 2 (references) and 5 (protocol spec)** of `GYMLOOP_BIOMETRIC_MASTER_PROMPT.md`. Those sections still apply **except where this file overrides them**.
2. **Deploys:** Claude Code's auto-mode classifier blocks production deploys from this session. At every deploy step, **print the exact commands for Vishnu to run** and then verify the result yourself (see §9). Never run a bare `firebase deploy`; always use `--only`.
3. If something in this file conflicts with what you find in the code, stop and report it. Do not silently pick one.

---

## 1. Verified facts about the codebase (recon 2026-10-02 — do not re-research)

| Topic | Fact |
|---|---|
| Production state | Prod == local as of 2026-10-02: 37 functions (all **nodejs22**, v1 API, us-central1), the rules, and 35 indexes are all READY. Firestore is in **asia-south1**. **No TTL policies exist.** |
| Functions | CommonJS, `firebase-functions@5.1.1` (**v1 API**: `functions.https.onCall`, `functions.pubsub.schedule`, `functions.firestore.document().onWrite`), `firebase-admin@12`. No region set, so us-central1; the client uses `getFunctions(app)`. Entry is `functions/index.js`; exports are appended at the bottom. |
| Callable auth pattern | Use **custom claims**: `context.auth.token.role` and `context.auth.token.gym_id`. Roles are `owner`, `manager`, `receptionist`, `trainer`, `member`. Members also carry a `gym_id` claim, so **always check role**. Do NOT re-read `users/{uid}` (staff and member doc IDs are random `addDoc` IDs). |
| Members | Stored in the `users` collection with `role:'member'` and random doc IDs. There is **no `members` collection**. One doc per gym; a multi-gym person has several docs linked by `auth_uid`. Fields: `name`, `phone` (E.164), `gym_id`, `subscription_expiry` (**Timestamp, exact moment, not a date**), `is_deleted` (soft delete), `plan_id`, `plan_name`, `payment_status`, `memberNumber` (string like `YNH-JN26-02`, not numeric), `profile_photo`. There is **no stored active/frozen status.** |
| Renewals / expiry edits | These are **client writes** to `users.subscription_expiry` (RenewModal, AddPayment, PaymentDetail, deletePayment). So a `users` onWrite trigger is the only reliable way to catch renewals. |
| Existing `users` triggers | `onUserWrite` (`functions/src/userClaims.js`) sets claims and only acts when doc id == Auth uid. `statsOnUserWrite` (`functions/src/gymStats.js`) recomputes gym stats. `processScan` writes `current_streak`/`longest_streak`/`last_checkin_date` to `users` on every check-in. **Any new `users` trigger must diff before/after and only react to `name`, `subscription_expiry` or `is_deleted`. It must never write back to `users`.** |
| Soft delete | `functions/src/memberLifecycle.js`: `softDeleteMember`, `restoreMember`, `permanentlyDeleteMember`, `permanentlyDeleteExpired`. The last one is the **only daily member job** (`0 2 * * *` Asia/Kolkata). It **returns early at L185-188 when no bin docs have expired**, so the biometric expiry sweep must run **before** that return. |
| Attendance | **Two collections:**<br>• `attendance_sessions` (camelCase: `memberId, gymId, memberName, entryTime, exitTime, durationMinutes, entryDeviceId, exitDeviceId, status:'inside'\|'completed', createdAt`). Read by live occupancy (`src/hooks/useLiveOccupancy.js`, `src/firebase/firestore-kiosk.js:163`), the receptionist "In gym" view, `/owner/attendance` and the MemberHome overlay.<br>• `attendance_logs` (snake_case: `gym_id, member_id, member_name, member_photo, plan_name, subscription_expiry, exit_time:null, date:'YYYY-MM-DD' IST, scanned_by, scan_mode, entry_time, scanned_by_uid, is_expired`). Read by Analytics, TabletMode and `stats.today_attendance`.<br>Schemas are written in `functions/src/processScan.js` (logs L117-133, sessions L273-284). |
| Rules | `firestore.rules`, hardened 2026-10-02. It has the `isGymOwner(gymId)` and `memberEditableKeys()` helpers. Members cannot write expiry, plan, deletion or numbering fields. Only owner/manager/receptionist can edit members; trainers can only set `workout_plan_id`. **Regression tests:** `node scripts/rules-api-test.cjs firestore.rules` (Rules API, no deploy) must stay at 100%, so add cases for every new rule. |
| Settings UI | The live hub is `src/owner/screens/Settings/SettingsHub.jsx` (the "Kiosk mode" row is at ~L307). `src/pages/Settings/OwnerSettings.jsx` is **dead code; don't touch it.** The closest analog page is `src/owner/screens/Attendance/KioskDevices.jsx`, routed at `src/App.jsx:386-393` (owner-only, `SubscriptionGate feature="kiosk_attendance"`). |
| Plan gating | `src/utils/featureCheck.js` is **client-only**, and any active coupon (`gym.subscription_valid_until`) unlocks all features. Server-side gating must be added for biometrics. SaaS tiers live in `functions/src/adminControl.js` ~L402: FREE 0 / BASIC 199 / PROFESSIONAL 499 / PROFESSIONAL_PLUS 799 / PREMIUM 999. |
| Icons | Material Symbols is a **subset font**. Every new icon name must be added to `icon_names=` in `index.html`, then run `npm run icons:check`. |
| Infra | `gymly.online` DNS is **Vercel DNS** (a wildcard currently resolves `bio.` to Vercel). The site sends HSTS `includeSubDomains; preload`, which only affects browsers, not devices. GCP billing is on. The **Compute Engine API is DISABLED**. The local `gcloud` is logged into an unrelated account; Vishnu must run `gcloud auth login` with his own account before Part 5. |
| Frontend deploy | Vercel git auto-deploy is broken. Deploy from a clean `main` clone with `vercel build --prod && vercel deploy --prebuilt --prod` (see memory). |
| Tests | None exist. There is no `emulators` block in `firebase.json` and no test runner. Part 0 adds them. |

---

## 2. Owner decisions (locked — do not re-ask)

- **D1, attendance mode is exclusive.** Each gym has `attendance_mode: 'qr' | 'biometric'`, stored in a **server-only** doc `gym_settings/{gymId}` (rules: owner/manager read, client write `false`). The only writer is the callable `setAttendanceMode`, which checks the plan server-side.
  - When the mode is `biometric`, `processScan` rejects every scan (`failed-precondition`, "QR attendance is disabled for this gym"), and all QR/kiosk UI is hidden.
  - QR cannot be enabled while biometric is on. Biometric must be turned off first.
  - Both modes write to the existing attendance collections tagged with `source`, so dashboards work unchanged.
- **D2, the expiry date is inclusive.** A membership that expires today works all day and is removed at the **02:00 IST run the next day**. The rule is one shared helper `isMemberActive(member, now)`: `!is_deleted && subscription_expiry >= startOfTodayIST(now)`. Put it in `functions/src/lib/membership.js`. Use it in the trigger, the daily sweep, `syncBioDevice`, and `processScan`. `processScan` currently ignores `is_deleted`; fix that.
- **D2b, extend membership.** Add an "Extend by N days" action on the member profile. It calls a new callable `extendMembership({memberId, days, reason})`:
  - Owner/manager only; `days` must be between 1 and 365.
  - New expiry = `max(current expiry, start of today IST) + days`.
  - Writes `renewal_history` and an `audit_logs/{gymId}/events` entry.
  - The `users` trigger then re-adds the member to devices immediately.
- **D3, biometrics only on the ₹999 and ₹1,499 plans (decided 2026-10-02).**
  - ₹999 = existing `PREMIUM`.
  - ₹1,499 = **a new tier that does not exist yet.** Create it as `PREMIUM_PLUS` ("Premium Plus", ₹1,499, order 5), additively:
    - `functions/src/adminControl.js` default plans (~L402)
    - `src/utils/featureCheck.js` (`PLAN_PRICES`, `PLAN_HIERARCHY`, `FEATURE_MAP`)
    - `validPlans` in `createSubscription` (`functions/index.js` ~L74)
    - the Super Admin plans UI (`src/superadmin/`)
    - **Razorpay:** flag that a Razorpay plan ID must be created in the Razorpay dashboard by Vishnu. Do not invent one.
  - **Server-side check:** `hasFeature(gymId,'biometric_attendance')` reads `subscriptions/{gymId}.plan` and allows only `['PREMIUM','PREMIUM_PLUS']` (constant `BIOMETRIC_PLANS`).
  - **A missing subscription doc means NOT entitled.** Note the trap: `src/hooks/useSubscription.js:57` defaults to `'PREMIUM'` on the client. Don't copy that.
  - **Coupons do NOT unlock biometrics by default** (physical hardware; owner can change this later). `featureCheck.js` gets `biometric_attendance: ['PREMIUM','PREMIUM_PLUS']`.
- **D4, naming.** Use snake_case collections: `bio_devices`, `bio_commands`, `bio_enrollments`, `bio_templates`, `bio_raw_logs`, `bio_unmatched_punches`, `bio_counters`, `gym_settings`. Field names follow master prompt §4.
- **D5, ports.** Caddy serves **80, 443 and 8081** at the same time, with no HTTP→HTTPS redirect. Devices use 80 by default; 8081 is a documented fallback.
- **Plan-downgrade safety.** If a gym loses the biometric plan, **freeze sync** (send no adds or deletes) and show a banner. **Never wipe a device because of billing.**

---

## 3. Overrides to the master prompt

1. **Attendance writes.** Write to *both* collections in one batch, using deterministic IDs:
   - Session doc `bio_{SN}_{bioPin}_{YYYYMMDDHHmmss}` in kiosk shape, with `entryDeviceId:'bio:{SN}'`, `source:'biometric'`, `deviceSN`, `verifyMode` and `rawLine`. Skip it if the member already has an `inside` session younger than 90 minutes, which mirrors kiosk behaviour.
   - Log doc `bio_{memberId}_{YYYY-MM-DD}` (one per member per IST day) with `scanned_by:'biometric'`, `scan_mode:'biometric'`, `is_expired:false` and `source:'biometric'`.
   - `entry_time`/`entryTime` = **device punch time interpreted as IST** (T7), never `serverTimestamp()`.
   - Unknown PIN → `bio_unmatched_punches`.
   - "Live Who's in" is already provided by `useLiveOccupancy`. Do **not** build a new listener; just label the method as "Fingerprint".
2. **`bioPin` / `bioStatus` live on `bio_enrollments/{gymId}_{bioPin}`**, not on the `users` doc. This avoids re-firing three `users` triggers.
   - The PIN counter is `bio_counters/{gymId}.next` (server-only; init 1000). It is **not** on the gym doc, because owners can write the gym doc.
   - Also keep a `bio_enrollments` lookup by `memberId` (field plus index).
3. **Gateway runtime.** Use the current Node **active LTS** (check `nodejs.org/en/about/previous-releases` at build time; Node 24 as of Oct 2026), the latest `express@5`, the latest `firebase-admin`, Caddy 2 (latest), and Debian 12/13. Functions stay on **Node 22** (the max for 1st-gen).
4. **Multi-device support.** Build a **protocol adapter layer** with capability detection. Details in §5.
5. **Remote fingerprint enrollment** (button on the member profile). Details in §6.

---

## 4. Supported devices (from 2026-10 research — full table in `PLAN-biometric-zkteco.md`)

- **Tier 1 (must work in v1; TA PUSH 2.x, fingerprint, lock relay):**
  - ZKTeco **K40 Pro / K40 Pro ID / K40 Pro WiFi** (primary)
  - ZKTeco **K45 Pro**
  - eSSL **K30 Pro (+ID+WiFi)**
  - eSSL/ZK **F22 (+ID+WiFi)**
  - eSSL **X990 (+ID+WiFi)**
  - eSSL **K21 Pro** (Ethernet)
- **Tier 2 (adapter-ready in v1, full support later):**
  - MB160 / MB20 (fingerprint + near-infrared face)
  - SpeedFace-V3L / V5L, SenseFace 2A, MB10-VL (visible-light face, BIODATA Type 9; can switch TA↔AC PUSH)
  - Horus E1-FP
  - uFace 302 / iFace 102 (legacy)
  - **For these devices, v1 must:** accept their handshake and ATTLOG/rtlog punches and fingerprint BIODATA, and log face/palm BIODATA as `unsupported_type` without failing.
- **Tier 3 (never supported):**
  - Any unit **without the ADMS/PUSH firmware SKU** (no "Cloud Server Setting" menu)
  - Devices set to **BEST protocol / ZKBio Zlink**
  - Variants without fingerprint (V3L Lite, V5L-RFID/QR, Horus E1)
  - Turnstile and panel controllers
  - **The claim wizard must tell owners to buy the "/ADMS" SKU** and check for the Menu → Comm → Cloud Server Setting / ADMS menu.

---

## 5. Protocol adapter layer (gateway)

- **Routes.** Accept `/iclock/{cdata,getrequest,devicecmd,registry,push,ping,fdata,querydata}` with an optional `.aspx` suffix and an optional `/d/{token}` prefix. Unknown `/iclock/*` → log and return `OK`.
- **Detect per device and persist** in `bio_devices/{SN}.caps`:
  - `protocol`: `'ta2'`, or `'ac3'` if the device hits `/iclock/registry` or reports `pushver >= 3`
  - `pushver`, `deviceType` (`att` | `acc`), `fwVersion`, `model`
  - `templateTable`: `'FINGERTMP'`, `'BIODATA'` (pushver ≥ 2.4.0 or the device uploaded BIODATA) or `'templatev10'` (ac3)
  - `fpAlgo`: from INFO/options such as `FPVersion=10|12`
  - `userinfoDialect`: `'pri'` | `'privilege'`. Copy whichever key the device itself uses in its USER uploads; default `pri`.
  - `supportsEnroll`: `'unknown'|'ENROLL_FP'|'ENROLL_BIO'|'none'`
  - `supportsDoorOpen`: `'unknown'|'yes'|'no'`
  - `supportsUserValidity`: `'unknown'|'yes'|'no'` (3.x `user.starttime/endtime`)
- **TA 2.x (Tier 1) handshake.** Master §5.1 plus `ServerVer`, `PushProtVer=2.4.1`, `PushOptionsFlag=1`, `TimeZone=330` and `Encrypt=None`. Every value must be overridable per device via `bio_devices/{SN}.handshakeOverrides`.
- **AC 3.x (scaffold only in v1).**
  - `POST /iclock/registry` returns `RegistryCode` and `SessionID`.
  - `POST /iclock/push` returns config.
  - Parse `table=rtlog` punches into the same attendance writer.
  - Users table is `user`, templates are `templatev10`.
  - Unit-test the parsers. Full command support is v2.
- **Templates.**
  - Store in `bio_templates/{gymId}_{bioPin}_{type}_{index}` with `type` (1 = fingerprint), `majorVer`, `minorVer`, `format`, `size`, `tmp`, `sourceSN`. Admin-SDK only; never log `tmp`.
  - **Only push a template to devices whose `fpAlgo` matches its `majorVer`.** On a mismatch, mark the enrollment `needs_reenroll_on:{SN}` and show it in the UI.
  - Command builders exist for both `DATA UPDATE FINGERTMP ...` and `DATA UPDATE BIODATA Pin=..\tNo=..\tIndex=..\tValid=1\tDuress=0\tType=1\tMajorVer=..\tMinorVer=..\tFormat=0\tTmp=..`. Choose by `caps.templateTable`.
- **Commands verified on hardware by others** (T2):
  - `DATA UPDATE USERINFO PIN=..\tName=..\tPri=0` (or `Privilege=0`)
  - `DATA DELETE USERINFO PIN=..` (the full word DELETE)
  - `DATA QUERY USERINFO`
  - `INFO`, `REBOOT`, `SET OPTION k=v`
  - Never use `USER ADD` / `USER DEL` / `DATA DEL`.
- **Device-side validity (defence in depth, only where `supportsUserValidity=='yes'`).** Also send the user's validity window so the device itself refuses an expired member even when offline. The window is `starttime`=today and `endtime`=expiry day 23:59:59 IST. Probe it in Part 6; on TA 2.x leave it off unless the probe proves it.

---

## 6. Fingerprint enrollment flow (what owners and members experience)

1. **Member added or renewed in Gymly.** The `users` trigger allocates a `bioPin` (1000+) and enqueues `USER_UPSERT` to every active device of the gym. The member appears on the device as `{bioPin} {name}` within one poll interval. Use `Delay=10` in the handshake; device polls cost zero Firestore reads.
2. **"Add fingerprint" button on the member profile.** It is shown only if the gym has an active device.
   - It calls the callable `requestBioEnroll({memberId, sn, fingerIndex})`, which enqueues `ENROLL_FP PIN=..\tFID=..\tRETRY=3\tOVERWRITE=1`, or `ENROLL_BIO TYPE=1\tPIN=..\tNO=..\tRETRY=3\tOVERWRITE=1` when `templateTable=='BIODATA'`.
   - The UI shows "Ask {name} to place their finger on the device now…". It switches to "Enrolled ✓" when the template arrives (OPERLOG `FP` / BIODATA upload) and `bio_enrollments.fingers` updates. Watch it with `onSnapshot` on the one enrollment doc.
   - **If the device returns a non-zero code or times out after 90 s:** set `caps.supportsEnroll='none'` and show the **fallback card**: "On the device: Menu → User Mgt → find **{bioPin} {name}** → Enroll fingerprint (2 fingers)."
3. **Templates are copied to Gymly** (server-only) and pushed to the gym's other compatible devices.
4. **Expiry:** at 02:00 IST the day after expiry, `USER_DELETE` is sent. The template stays stored in Gymly.
5. **Renewal or extension:** the trigger immediately sends `USER_UPSERT` plus the stored templates, so access returns **without re-enrolling**.
6. **Gateway or internet down:** the device decides locally, so the door keeps working. Punches queue on the device and sync later with no duplicates.

---

## 7. Parts and gates

### PART 0 — Foundations
- [ ] Confirm you are on branch `feature/biometric-zkteco`. The foundation commit there holds the hardened rules, Node 22, `scripts/rules-api-test.cjs`, the plan and this prompt. Other uncommitted files in the tree (super-admin console, landing) are unrelated WIP: **never stage or commit them**, and always commit with explicit paths.
- [ ] Add an `emulators` block to `firebase.json` (firestore 8080, functions 5001, auth 9099, ui 4000). Add `functions` devDeps `firebase-functions-test` and `@firebase/rules-unit-testing`, plus a `"test": "node --test"` script.
- [ ] `functions/src/lib/membership.js`: `isMemberActive`, `startOfTodayIST`, `istWallClockToTimestamp`. Unit tests must include the IST day boundary.
- [ ] Use `isMemberActive` in `processScan` (this adds the `is_deleted` check). Keep the existing status strings unchanged.
- [ ] `gym_settings` + `setAttendanceMode` callable + `processScan` guard (D1). `extendMembership` callable (D2b).
- **🚦 GATE 0:** show test output, diffs, and the rules-api-test results with new cases.

### PART 1 — Data model, rules, indexes, TTL
- **Rules.** All `bio_*` collections are `allow read, write: if false`. **Exceptions:**
  - `bio_devices`: owner/manager read via `token.gym_id`.
  - `bio_unmatched_punches`: owner/manager read.
  - `bio_enrollments`: owner/manager/receptionist read via `token.gym_id`, so the UI can show badges (template data is never in this collection).
  - `gym_settings`: owner/manager read, write `false`.
- **Tests.** Add rules-api-test cases for each rule.
- **Indexes:**
  - `bio_commands (sn, status, seq)`
  - `bio_enrollments (gym_id, desiredOnDevice)`
  - `bio_enrollments (memberId)`
  - `bio_unmatched_punches (gym_id, at desc)`
- **TTL.** Add `fieldOverrides` with `"ttl": true` for `bio_commands.expireAt` (30 d) and `bio_raw_logs.expireAt` (7 d).
- **Deploy commands for Vishnu.** Run `firestore:indexes`, wait for green, then run `firestore:rules`. Verify with `scripts/rules-api-test.cjs` against the live ruleset.
- **🚦 GATE 1.**

### PART 2 — `bio-gateway/` (CommonJS, local only)
- **Structure.** Follow master prompt Part 2, plus `src/protocol/adapters/{ta2,ac3}.js`, `src/protocol/caps.js` and `src/protocol/biodata.js`.
- **Exclusions.** Add `bio-gateway/` to `.vercelignore` and to the ESLint ignores.
- **Simulator** (`tools/simulate-device.js`) flags: `--proto ta2|ac3`, `--aspx`, `--token`, `--template-table FINGERTMP|BIODATA`, `--fail-code`, `--enroll-supported yes|no`.
- **Unit tests.** Master Part 2 list, plus: BIODATA parse/build, rtlog parse, caps detection, enroll command build, template-algorithm mismatch.
- **Local run.** Run against the Firestore emulator and show the simulator transcript.
- **🚦 GATE 2.**

### PART 3 — Cloud Functions (v1 API, CommonJS, Node 22, append exports to `functions/index.js`)
- **Helpers** in `functions/src/bio/`:
  - `allocateBioPin` (transaction on `bio_counters`)
  - `enqueueForGym` (seq per device via transaction; ordering USER_UPSERT before FP/BIODATA)
- **Callables:**
  - `claimBioDevice`
  - `syncBioDevice`
  - `setBioDeviceStatus`
  - `requestBioEnroll`
  - `queueBioRawCommand` (owner-only, for the Part 6 device console)
  - All check claims, the plan via `hasFeature`, and `attendance_mode == 'biometric'`.
- **`users` onWrite trigger `bioOnMemberWrite`.** Role member only; diff guard; uses `isMemberActive`. Handles became active / became inactive / name changed / soft-deleted.
- **Daily sweep.** Inside `permanentlyDeleteExpired`, **before the early return**. `permanentlyDeleteMember` and the expired purge must also delete `bio_templates`/`bio_enrollments` and enqueue `USER_DELETE`.
- **Emulator tests:**
  - create → commands queued
  - expiry → delete command
  - extend/renew → upsert + templates
  - permanent delete → templates removed
  - plan downgrade → sync frozen
- **🚦 GATE 3.**

### PART 4 — Owner UI
- **Route.** `/owner/biometric-devices` (new `src/owner/screens/Attendance/BiometricDevices.jsx`), wrapped like kiosk-devices.
- **Settings.** Add an "Attendance" group in SettingsHub with a mode switch (QR ↔ Biometric, with plan lock and the "QR is disabled while biometric is on" copy), kiosk and biometric rows.
- **3-step claim wizard** with a live `onSnapshot` on `bio_devices/{sn}`. Include SKU guidance ("must say ADMS") and the device menu path: Menu → Comm → Cloud Server Setting, Server mode ADMS, Domain ON, `bio.gymly.online`, port 80, proxy OFF, then restart.
- **Device cards** show online/offline, last seen, the capability chips (Enroll from app ✓/✗, Door open ✓/✗), "Sync now" and "Disable".
- **Member profile:**
  - Fingerprint badge (Not enrolled / Enrolled / Frozen / Re-enroll needed on X)
  - **Add fingerprint** button with live state (§6)
  - **Extend membership** sheet (D2b)
- **Hide QR/kiosk UI** when the mode is biometric.
- **Unmatched punches** list.
- **Icons.** Any new Material Symbols go into `index.html` `icon_names=`, then run `npm run icons:check`.
- **Checks.** `npm run build` and `npm run lint` must pass.
- **🚦 GATE 4.**

### PART 5 — Gateway VM (Vishnu runs the GCP commands; give them exactly)
- **Prerequisites:**
  - `gcloud auth login` with Vishnu's own account, then `gcloud config set project gymly-app-06`.
  - Enable `compute.googleapis.com`.
- **VM.** e2-small in asia-south1 (Firestore is there too). Static IP. Attached service account with **only** `roles/datastore.user`. No key files. SSH only via IAP or restricted.
- **Runtime.** Caddy with three site blocks (`http://bio.gymly.online`, `https://bio.gymly.online`, `http://bio.gymly.online:8081`) and no redirects. The gateway runs under systemd with `Restart=always`.
- **Monitoring.** Cloud Monitoring uptime check on `/health` with an email alert. Weekly snapshot schedule.
- **DNS.** Add an **A record `bio` in Vercel DNS** (dashboard or `vercel dns add gymly.online bio A <IP>`). It overrides the wildcard.
- **Prove it works:**
  - `curl -i http://bio.gymly.online/iclock/cdata?SN=TEST123456&options=all` returns `200` with no 30x. The same check passes on :8081 and on https.
  - The simulator, run against prod with a test SN under a test gym, does a full round trip. Then disable the test device.
- **Docs.** Update `SECURITY_STATUS.md` (new public surface; also correct the false "H-5 closed" claim, since `device_secret` is never written) and `EFFICIENCY.md`.
- **🚦 GATE 5.**

### PART 6 — Hardware verification (when the device arrives)
- **Probes.** Master prompt Part 6 checklist, **plus:** the ENROLL_FP/ENROLL_BIO probe, the `CONTROL DEVICE` door-open probe, the user validity-window probe, `fpAlgo` capture, and a template push to a second device (if available).
- **Record results.** Write `bio-gateway/HARDWARE_NOTES.md` per model and firmware. Set `caps` and `handshakeOverrides` from what was found.
- **🚦 GATE 6.**

---

## 8. Non-goals (v1)

- Face or palm enrollment and sync. Logging only for those devices.
- AC 3.x command support beyond parsers.
- Turnstiles, anti-passback, access groups.
- ZKBio Zlink, BEST protocol, TCP 4370 SDK, Windows agents.
- Changes to the QR flow beyond the D1 mode guard.
- New Cloud Scheduler jobs.
- Remote door open, unless the Part 6 probe proves a working command.

---

## 9. How to verify production without deploy permission

- **Firebase login.** The firebase-tools login works (`firebase login:list` shows gravity.co.media@gmail.com).
  - Functions: `firebase functions:list --project gymly-app-06`.
  - Rules diff: `node scripts/rules-api-test.cjs firestore.rules`.
- **Live REST reads (read-only):** use the firebase-tools token through its `lib/auth.js` `getAccessToken` and `lib/configstore.js`. Examples:
  - `firebaserules.googleapis.com/v1/projects/gymly-app-06/releases` for the live ruleset; compare it byte-for-byte with the local file.
  - `firestore.googleapis.com/v1/.../collectionGroups/-/indexes` for indexes.
  - `cloudfunctions.googleapis.com/v1/.../functions` for runtimes and update times.
- **Never** use the local `gcloud` until Vishnu has re-logged in with his own account.
