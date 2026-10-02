# PLAN — ZKTeco Biometric (ADMS Push) Integration

Source spec: `GYMLOOP_BIOMETRIC_MASTER_PROMPT.md` (442 lines, untracked).
Recon date: 2026-10-02. Recon was read-only (no code, rules or deploys touched).
Status (updated 2026-10-02 evening):
- Phase 0 security and runtime work is **done and live**:
  - `/users` rules hardened, verified 28/28 against prod.
  - All 37 functions are on nodejs22.
  - C3 audit: prod == local.
- **The build continues in a new chat from `GYMLY_BIOMETRIC_BUILD_PROMPT.md`.**
- Device list: §3. Research findings: §4.

---

## 0. Owner decisions (2026-10-02)

| # | Decision | How it is implemented |
|---|---|---|
| D1 | **QR and Biometric are mutually exclusive attendance modes, each unlocked by its own plan.** If biometric is on, QR is off and cannot be turned on. | New server-managed `gym_settings/{gymId}.attendance_mode: 'qr' \| 'biometric'`, written only by the callable `setAttendanceMode`. It is not on the gym doc, because the owner can write the gym doc. The callable checks the plan server-side. `processScan` rejects every scan when the mode is `biometric`, and all QR/kiosk UI hides. To return to QR, biometric must be turned off first. Both modes write into the existing attendance collections, tagged `source`. A gym only ever has one source, so records never mix and every dashboard keeps working. This resolves C1. |
| D2 | **Expiry date is inclusive.** A membership that expires today works all day and is removed tomorrow. | `isMemberActive = !is_deleted && expiry >= start of today (IST)`. The 02:00 IST daily job removes yesterday's expiries. The same helper is used across the app. |
| D2b | **"Extend membership by N days"** on the member page | New callable `extendMembership({memberId, days, reason})`. Owner and manager only. Writes an audit log. The member trigger re-adds the member to the device immediately. |
| D3 | **Biometric goes to plans above ₹999.** No such plan exists today (Premium = ₹999 is the top tier). | **Open.** Either add a new tier (e.g. "Premium Biometric" ₹1,499), or treat it as "₹999 and up" = Premium. The server must enforce this, because `featureCheck.js` is client-only and coupons unlock everything. |
| D4 | Naming is my call | snake_case collections: `bio_devices`, `bio_commands`, `bio_enrollments`, `bio_templates`, `bio_raw_logs`, `bio_unmatched_punches`, `bio_counters`. Resolves C12. |
| D5 | Fallback port is my call; must be fail-safe | Caddy listens on 80, 443 **and** 8081 at the same time, and the gateway on 8081 also responds `OK`. The device uses 80; 8081 is only a troubleshooting fallback. See §3 for availability. |

**Plan-downgrade safety:** if a gym loses the biometric plan, **freeze sync** (no adds or removes are sent) instead of wiping the device. A lapsed bill must never lock every member out of the building. The owner sees a banner.

---

## 1. Blocking conflicts (fix or decide before any biometric code)

### C1 — There is no "unified attendance collection" — there are two  ✅ resolved by D1
Spec §4 says to write into "the EXISTING unified attendance collection". There are two collections, with different casing and different readers:

| Collection | Written by | Read by |
|---|---|---|
| `attendance_sessions` (camelCase: `gymId`, `memberId`, `entryTime`, `status:'inside'`) | `processScan` kiosk path (`functions/src/processScan.js:273-284`) | Live occupancy / `useLiveOccupancy` (owner dashboard, receptionist "In gym"), `/owner/attendance` page, MemberHome welcome overlay |
| `attendance_logs` (snake_case: `gym_id`, `member_id`, `date`, `entry_time`, `scanned_by`, `is_expired`) | `processScan` staff/manual path (`processScan.js:117-133`) | Analytics, TabletMode, `gyms/{id}/stats/summary.today_attendance` (via the `statsOnAttendanceWrite` trigger) |

**Recommendation:** have the gateway write **both** in one batch, each with a deterministic ID:
- session doc `bio_{SN}_{bioPin}_{YYYYMMDDHHmmss}`. Skip it if the member already has an `inside` session under 90 minutes old, which mirrors the kiosk toggle.
- log doc `bio_{memberId}_{YYYY-MM-DD}`. That gives one per member per IST day, matching processScan's dedup.

With this, the spec's Part 4 "Live Who's in" already works through `useLiveOccupancy`, so no new listener or EFFICIENCY.md exception is needed.
The spec's `source:'biometric'` field doesn't exist in either schema. Map it to `scanned_by:'biometric'` / `scan_mode:'biometric'` on logs and `entryDeviceId:'bio:{SN}'` on sessions, and add `source`, `deviceSN`, `verifyMode` and `rawLine` as additive fields.

### C2 — A member can extend their own membership; with biometrics that opens a physical door  🔴 security
`firestore.rules:47-75`: the `/users` update rule only blocks `role` and `gym_id`.
- **Members:** the `auth_uid == request.auth.uid` branch lets a logged-in member write `subscription_expiry` and `is_deleted` on their own doc. A new `bioPin`/`bioStatus` field would be writable the same way.
- **Staff:** any same-gym staff member (including a receptionist) can do the same.

Today this means free QR check-ins. Once the planned member trigger enqueues `USER_UPSERT` on an expiry change, it means **door access**.

Related hole: `allow create: if request.auth != null` (L45) lets any signed-in user create a `users` doc with **any** `gym_id`. That doc would trigger enqueues to another gym's device, filling up its user capacity.

**Fix first (separate rules change, needs a diff and confirmation per AGENTS.md §7):**
- The member branch may only touch profile fields.
- No client may write `bioPin` or `bioStatus`.
- `create` requires `request.resource.data.gym_id == request.auth.token.gym_id` and a staff role.

Before changing these rules, check which fields EditProfile, MemberAgreement and MemberProgress actually write.

### C3 — Production deploy state is unknown, and rules deploy as one file  🔴 blocker
Several things are built locally but are not deployed, or their deploy state is unknown:
- `processScan` / `setActiveGymClaim` / `resolveStaffLogin` / `pinAuth`
- the super-admin console callables
- the WhatsApp function deletions
- the uncommitted `platform_settings` rule

Spec Part 1 runs `firebase deploy --only firestore:rules`, which pushes **the whole local `firestore.rules`**, including every pending branch. You cannot ship only the biometric rules.

**Do first:**
1. Run `firebase functions:list` and compare the live rules (Console → Rules) with the local file.
2. Clear or consciously ship the backlog.
3. Then layer the biometric rules on top.

(The Firebase MCP connection was down during recon, so I couldn't check this live.)

### C4 — The Functions runtime is close to decommission  🟠 blocker for new deploys
- `functions/package.json` has `engines.node: "20"`. AGENTS.md:17 still says Node 18, which is out of date.
- Node 20 reached end-of-life in April 2026. My understanding is that Cloud Functions decommissions it around **2026-10-30**, after which deploys fail. **Check the date on Google's runtime-support page.**
- Upgrade to Node 22 (and do a smoke-test deploy) before Part 3.
- The spec's gateway says "Node 20". Use 22 LTS on the VM instead.
- `firebase-functions` stays on v5 (v1 API). Moving to v6+ would mean changing every require to `firebase-functions/v1`, so don't combine that with this work.

### C5 — "Active member" is defined differently from the spec  ✅ resolved by D2
- No stored status, no freeze feature, no `members` collection. Members are `users` docs with `role:'member'` and random `addDoc` IDs.
- Expiry is `users.subscription_expiry`, a Timestamp. It is an **exact moment** (the creation time of day plus `duration_days`), not a date.
- The app checks `expiry > now`, with small differences: processScan staff uses `<`, kiosk uses `<=`.
- The spec says "end of the expiry day in IST". That disagrees with every screen in the app, so the door would open when the QR scanner says "expired".

**Recommendation:** define one shared helper `isMemberActive(m) = !m.is_deleted && expiry > now`, with an optional end-of-day grace if you want it. Use it in the trigger, the daily hook and `processScan`.
`processScan` ignores `is_deleted` today (soft-deleted members can still check in). Fix that in the same change.

### C6 — Where the daily expiry hook lives  🟡 constraint
The only daily member job is `permanentlyDeleteExpired` (`functions/src/memberLifecycle.js:173`, 02:00 IST). It **returns early** (L185-188) when no bin docs have expired, which is most days.
Restructure it so the biometric expiry sweep runs before that return.
- Run the sweep as a query on `bio_enrollments where desiredOnDevice == true` joined to member expiry, not a full `users` scan.
- Running at 02:00 means a membership that expires at 14:00 keeps door access until 02:00 the next day, up to about 12 hours of grace. Accept that, or also check expiry at punch time (the gateway knows the expiry from its cache, but the device decides locally, so the check could only log, not deny).

### C7 — The `bioPinCounter` location is client-writable  🟡 fix in design
The spec puts `bioPinCounter` on the gym doc. The owner can update any field on `gyms/{id}` (`firestore.rules:91-92`).
Put it in a server-only doc instead: `bio_counters/{gymId}` with `allow read, write: if false`.
No existing per-gym numeric ID can be reused as the device PIN:
- `memberNumber` is a string like `"YNH-JN26-02"` and restarts every year.
- `memberId` is `MEM_xxxxxx`.

### C8 — There is no test or emulator infrastructure  🟡 prerequisite
- `firebase.json` has no `emulators` block.
- Neither package has a test runner, `firebase-functions-test` or `@firebase/rules-unit-testing`.
- There is no staging project, only `gymly-app-06`.

Spec Parts 2, 3 and 5 assume emulator tests and a "test gym". Add the emulator config and a `node:test` setup, and create a test gym in prod for Part 5.

### C9 — Spec and AGENTS.md disagree on server-side auth checks  ⚪ resolve on paper
- AGENTS.md §2.4 and §8 say "re-read caller's gym_id and role from Firestore" (`users/{uid}`). That only works for owners; staff and member docs use random IDs.
- The spec says to use `token.gym_id` and `token.role` claims, which is what the code actually does (processScan, attendanceAuth, rules).
- **Use claims.** Update AGENTS.md §8 and the Node version line so the next agent isn't misled.

### C10 — Infrastructure and DNS  ⚪ owner action
- `gymly.online` uses **Vercel DNS** (ns1/ns2.vercel-dns.com). `bio.gymly.online` currently resolves to a Vercel IP, probably through a wildcard record.
- The `A bio → VM IP` record must be added in Vercel DNS, where an explicit record overrides the wildcard. It is not added "at the DNS provider" as the spec says.
- The Vercel MCP needs `/mcp` authorization in an interactive session.
- HSTS `includeSubDomains; preload` means **browsers** will force HTTPS on `bio.`. ZKTeco firmware ignores HSTS, so plain-HTTP device traffic still works, but browser testing over `http://` will not.
- GCE VM: about $13/month (e2-small plus a static IP). `gcloud` and Application Default Credentials (ADC) are present locally.

### C11 — Spec references that don't exist  ⚪ informational
- The "13-route Settings restructure plan" doesn't exist.
- `src/pages/Settings/OwnerSettings.jsx` (1079 lines) is **dead code**; nothing imports or routes it.
- The live hub is `src/owner/screens/Settings/SettingsHub.jsx`.
- **Placement:** new screen `src/owner/screens/Attendance/BiometricDevices.jsx` at `/owner/biometric-devices`, wrapped like `/owner/kiosk-devices` (`src/App.jsx:386-393`, owner-only, `SubscriptionGate`). Add a row next to "Kiosk mode" (SettingsHub.jsx:307).
- **Decision:** which subscription tier gets `biometric_attendance`.

### C12 — Naming convention  ✅ resolved by D4
Codebase collections are snake_case (`kiosk_devices`, `attendance_logs`). The spec uses `bioDevices`, `bioCommands`, and so on.
Recommend `bio_devices`, `bio_commands`, `bio_enrollments`, `bio_templates`, `bio_raw_logs`, `bio_unmatched_punches`, keeping the spec's field names. Decide once, before Part 1.

### Found outside scope (report, don't fix here)
- `functions/index.js:255` `addManualPayment` and `:67` `createSubscription` are **unauthenticated** `onRequest` endpoints. Anyone can write billing records or set a gym's plan.
- `razorpayWebhook` skips signature verification when the secret is unset, and signs `JSON.stringify(req.body)` instead of `rawBody`.
- H-5 is not actually done: `device_secret` is never written by any code, so the `kiosk_devices` update rule's secret check always passes. `SECURITY_STATUS.md` reports 16/16 closed.
- `firestore.rules:97-103` `/leads` read/write references an undefined `gymId`.

---

## 2. Implementation plan

### Phase 0 — Unblock (no biometric code)
| # | Task | Resolves |
|---|---|---|
| 0.1 | Deploy-state audit: `firebase functions:list`, diff live vs local rules, decide what in the backlog ships | C3 |
| 0.2 | `/users` rules hardening: member branch limited to profile fields; block `bio*` and `subscription_expiry` writes by members; tighten `create`. Show the diff and get confirmation, then `rules:check`, then deploy | C2 |
| 0.3 | Functions runtime → Node 22; smoke-deploy one function; fix AGENTS.md Node/§8 | C4, C9 |
| 0.4 | Add an `emulators` block plus a `node:test` harness (functions plus rules tests) | C8 |
| 0.5 | Shared `isMemberActive` helper in `functions/src/lib/`; use it in processScan, including the `is_deleted` check | C5 |
| 0.6 | Owner decisions: C1 dual-write, C5 grace rule, C11 tier, C12 naming, fallback port 8081 yes/no | — |

### Phase 1 — Data model, rules, indexes, TTL (spec Part 1, adjusted)
- New collections (snake_case per C12) plus `bio_counters/{gymId}` (C7). Templates, commands, raw logs, enrollments and counters get `allow read, write: if false`. `bio_devices` and `bio_unmatched_punches` get owner/manager read via `token.gym_id`.
- **TTL:** none exist today. Add `fieldOverrides` with `ttl: true` for `bio_commands.expireAt` and `bio_raw_logs.expireAt`, or configure them with `gcloud firestore fields ttls update`.
- **Indexes:** `bio_commands(sn, status, seq)`, `bio_enrollments(gym_id)`, `bio_enrollments(desiredOnDevice)`. The attendance indexes already cover today's queries.
- **Deploy order:** indexes, then wait for green, then rules.

### Phase 2 — `bio-gateway/` (spec Part 2, mostly as written)
- The protocol spec (T1–T17, §5) is sound. Keep it.
- **Changes from the spec:**
  - Node 22.
  - Write both attendance collections (C1).
  - Resolve PIN → member from the `bio_enrollments` cache, which needs `memberName` and `subscription_expiry` denormalised for sessions and logs.
- Add `bio-gateway/` to `.vercelignore` and to the ESLint ignore list so the frontend build is unaffected.

### Phase 3 — Cloud Functions (spec Part 3, adjusted)
- **Member trigger:** `users/{id}` onWrite with `role == 'member'`.
  - Only react when `name`, `subscription_expiry` or `is_deleted` change. processScan writes the streak to `users` on every check-in, so the diff guard is mandatory.
  - Writes go only to `bio_*` collections, never back to `users` (`bioPin`/`bioStatus` live on `bio_enrollments`, and the UI reads them there). This avoids re-firing `onUserWrite`, `statsOnUserWrite` and itself.
  - **This differs from spec §4.** I recommend it to avoid trigger fan-out.
- **Daily hook:** inside `permanentlyDeleteExpired`, before its early return (C6).
- **Permanent delete:** `permanentlyDeleteMember` and `permanentlyDeleteExpired` also delete `bio_templates` and `bio_enrollments` and enqueue `USER_DELETE`.
- **Callables** (`claimBioDevice`, `syncBioDevice`, `setBioDeviceStatus`):
  - Use v1 `functions.https.onCall` and the default region (us-central1, matching the client's `getFunctions(app)`).
  - Auth via `context.auth.token.role` and `gym_id`.

### Phase 4 — Owner UI (spec Part 4, reduced)
- `/owner/biometric-devices`: a 3-step claim wizard with a live `bio_devices/{sn}` onSnapshot, device cards, an unmatched-punches list.
- Fingerprint badge on member profile and list, read from `bio_enrollments`.
- "Who's in": no new build needed. Bio sessions appear in the existing `useLiveOccupancy`. At most, add a "via fingerprint" method label.
- New Material Symbols icons must be added to `icon_names=` in `index.html` (then run `npm run icons:check`).

### Phase 5 — VM deploy (spec Part 5)
- **Changes from the spec:**
  - Node 22.
  - DNS record in **Vercel DNS** (C10).
  - The VM service account needs `roles/datastore.user` only.
  - Confirm the Firestore database location: `gcloud firestore databases describe`.
- Update SECURITY_STATUS.md with the new `/iclock/*` public surface and the plain-HTTP risk, and correct its H-5 claim.

### Phase 6 — Hardware verification (spec Part 6, unchanged)
- Before buying, confirm the K40/K45 unit ships with **ADMS/PUSH** firmware, not standalone/TCP-only.
- Write the results to `bio-gateway/HARDWARE_NOTES.md`.

### Fingerprint enrollment ("Add fingerprint" button)
- **Primary:** remote enrollment. The profile button queues `ENROLL_FP PIN=…\tFID=…\tRETRY=3\tOVERWRITE=1`. The device beeps, shows the member's name and asks for the finger 3 times. The template uploads through OPERLOG and the profile shows "Enrolled ✓".
  - `ENROLL_FP` is in ZKTeco's PUSH protocol, but **K40/K45 firmware support is unverified**. Add it to the Part 6 hardware probes.
- **Fallback** (if the firmware rejects it): the member is already on the device, because Gymly pushed their name and number. Staff go to Menu → User Mgt → find **{bioPin} {name}** → Enroll FP.
- **Either way:** the person must be at the device. The finger is read by the device's sensor; phones and browsers cannot capture it.
- **Polling interval:** `Delay=` in the handshake controls how fast queued commands arrive. Tune it to about 10 s; device polls cost no Firestore reads.

### Availability (D5)
The door decision is made **on the device**. If the gateway or internet is down, active members still get in, punches queue on the device and sync later, and expired members stay locked out.
Server downtime therefore only delays syncing. Mitigations:
- systemd `Restart=always`
- a free Cloud Monitoring uptime check on `/health` with email alert
- a static IP
- a weekly VM snapshot
- the queued `bio_commands` survive restarts

### Ordering and gates
Phase 0 (all) → Gate → Phase 1 → Gate → Phase 2 (local, emulator) → Gate → Phase 3 → Gate → Phase 4 → Gate → Phase 5 → Gate → Phase 6 (when the hardware arrives). Each gate requires an explicit GO from the owner.

---

## 3. Usable devices (research 2026-10; buy only the **ADMS** firmware SKU)

### Tier 1: works with the v1 code (fingerprint, TA PUSH 2.x, lock relay)

| Model | Biometrics | Capacity (FP / cards / logs) | Network | Door | ~₹ |
|---|---|---|---|---|---|
| **ZKTeco K40 Pro / K40 Pro ID / K40 Pro WiFi** (primary) | FP, ID card optional | 2,000 / 1,000 / 100k | LAN; Wi-Fi/GPRS optional SKU | Lock and exit button | 6.6k–12.5k |
| ZKTeco K45 Pro | FP, ID | 800 / 800 / 80k | LAN; Wi-Fi SKU | Lock and exit button | — |
| eSSL K30 Pro (+ID+WiFi) | FP, card | 2,000 / 2,000 / 200k | LAN; Wi-Fi SKU | 12 V relay and exit button | 5k–8k |
| eSSL/ZK F22 (+ID+WiFi) | FP (SilkID), card | 3,000 / 5,000 / 30k | LAN, Wi-Fi | Lock, door sensor, exit button, alarm | 8k–10k |
| eSSL X990 (+ID+WiFi) | FP, card | 3k–10k / 10k / 100k | LAN; Wi-Fi/GPRS optional | Relay, door sensor | 8.5k–18.5k |
| eSSL K21 Pro | FP, RFID | 800 / 800 / 80k | LAN only | Basic | ~5k |

**Notes:**
- ADMS is an **optional SKU** on the K40 Pro, K45 Pro and F22. Order e.g. "K40 Pro/ID/ADMS + WiFi".
- Before going to site, check that the device has **Menu → Comm → Cloud Server Setting / ADMS**.
- I couldn't confirm ADMS on a K45 Pro datasheet (the official page returned 404).

### Tier 2: the adapter accepts them in v1; full support (face, AC PUSH 3.x) comes later

| Device | Biometrics | Note |
|---|---|---|
| MB160, MB20 | FP + NIR face | Fingerprint works through the same protocol |
| SpeedFace-V3L / V5L, SenseFace 2A, MB10-VL | FP + visible-light face | Can switch between TA and AC PUSH. Must **not** be in BEST/Zlink mode |
| Horus E1-FP | FP + face | 4G-capable; needs an add-on module for the door relay |
| uFace 302, iFace 102 | FP + NIR face | Legacy |

### Tier 3: do not buy

- Any unit **without ADMS firmware** (pull-only on port 4370).
- Devices sold or set to **ZKBio Zlink / BEST protocol**, e.g. SenseFace 3A/4A/7A in BEST mode, or the F34 by default.
- Variants without fingerprint: SpeedFace-V3L Lite, V5L-RFID/QR, Horus E1.
- eSSL AiFace (face only).
- Turnstile and panel controllers.

## 4. Research findings that shaped v2 (sources in the research reports, 2026-10)

- **Protocol families.** There are two: TA PUSH 2.x (`/iclock/cdata`, ATTLOG, USERINFO, FINGERTMP/BIODATA) and Security/AC PUSH 3.1.x (`/iclock/registry`, `/iclock/push`, rtlog, `user`, `templatev10`). Newer face terminals switch between them via *Device Type Setting*.
- **BEST / Zlink.** This is ZKTeco's own cloud mode (MQTT/TLS). It is a selectable alternative and does **not** remove PUSH. There is no evidence of new firmware blocking third-party ADMS.
- **Remote enrollment.** `ENROLL_FP PIN=\tFID=\tRETRY=\tOVERWRITE=` (2.x) and `ENROLL_BIO TYPE=1\t…` (BIODATA firmware) exist in protocol notes. There is **no public report of them working on a K40**, so the plan probes for them and falls back to enrollment on the keypad.
- **Template formats.** `DATA UPDATE BIODATA Pin=\tNo=\tIndex=\tValid=\tDuress=\tType=1\tMajorVer=\tMinorVer=\tFormat=\tTmp=` is used when pushver ≥ 2.4.0. ZKFinger **VX10 and VX12 templates are not confirmed compatible**, so templates are only pushed to devices with the same algorithm version.
- **Device-side validity.** 3.x `user.starttime/endtime` exists, which would let the device refuse expired members even offline. On 2.x it is unverified, so probe it on hardware.
- **Remote door open.** `CONTROL DEVICE 01010105` comes from a search snippet only and is unverified. Probe it.
- **Network and time.**
  - eSSL firmware calls `.aspx` paths and is plain-HTTP only, and it cannot follow redirects. This confirms the VM-plus-Caddy design and the no-redirect rule.
  - Some newer firmware supports HTTPS.
  - `TimeZone=330` is used for IST.
- **Reference implementations:**
  - s0x90/zkteco-adms (Go): its commands are verified on hardware.
  - skylinebiz/adms (Node): 503-for-unknown policy and per-device secrets.
  - NzeStan/django-fingerprint-attendance (Python, v0.1.0, 2026-09): the broadest command list, including ENROLL_FP/BIO and BIODATA, but unproven.

## 5. What blocks starting the build (2026-10-02)

| Item | Blocks | Who |
|---|---|---|
| Commit the security fix, the Node 22 change, `scripts/rules-api-test.cjs`, this plan and the build prompt. Delete `firestore.rules.backup-20261002` (it is the old, vulnerable version) | Clean start of the new chat | Vishnu |
| ~~D3~~ DECIDED: ₹999 PREMIUM + new ₹1,499 PREMIUM_PLUS; Razorpay plan ID for ₹1,499 still to be created | Part 3 (Razorpay ID only for live billing) | Vishnu |
| Compute Engine API disabled; local `gcloud` is logged into an unrelated account | Part 5 only | Vishnu |
| `bio` A record in Vercel DNS | Part 5 only | Vishnu |
| Buy one Tier-1 device with the **ADMS SKU** (recommended: K40 Pro ID ADMS WiFi, or eSSL K30 Pro WiFi as a backup) | Part 6 only | Vishnu |
| Auto-mode blocks Claude from deploying to production | Every deploy step: Vishnu runs the printed commands | Vishnu (optionally add a permission rule) |

**Nothing blocks Parts 0–4.** They are all local code and emulator work.
