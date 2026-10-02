# GYMLOOP — ZKTeco Biometric Integration (ADMS Push) — Master Build Prompt

> Paste this whole file into Antigravity as one task. Execute parts in order. Stop at every 🚦 GATE and wait for Vishnu's "GO".
> Target hardware: **ZKTeco K40 Pro (Wi-Fi) or K45 Pro (Ethernet)** — fingerprint, "simple access control" (lock relay + exit button), **attendance (TA) PUSH / ADMS** firmware.
> Firebase project: `gymly-app-06`. Frontend: React 19 + Vite + Tailwind (Vercel). Functions: **CommonJS only**.

---

## 0. READ FIRST (non-negotiable)

1. Read `AGENTS.md` completely before touching any file. Then read `SECURITY_STATUS.md` and `EFFICIENCY.md`.
2. Do not write code until **Part 0 (Recon)** is reported and Vishnu replies GO.
3. Every part ends with a diff summary + 🚦 GATE. Never batch two parts without a GO.
4. Never run a bare `firebase deploy`. Always `--only <target>`.
5. If something in this prompt conflicts with what Recon finds in the codebase, **stop and report the conflict** — do not silently pick one.

---

## 1. NAMED TRAPS (pinned — each one has burned real ADMS implementers)

**T1 — Responses must be exactly `OK`, `text/plain`.** Every device-facing endpoint (except the handshake config text) must return the literal body `OK` with `Content-Type: text/plain`. Anything else (JSON, HTML error page, redirect, empty body) makes firmware back off and retry. No compression middleware, no HTTP→HTTPS redirects, no HTML 404s on `/iclock/*`. Unknown `/iclock/*` paths (`/iclock/ping`, `/iclock/fdata`, `/iclock/registry`, `/iclock/push`, `/iclock/test`) → log + `OK`.

**T2 — The datasheet command names are wrong on real devices.** `USER ADD` / `USER DEL` are rejected with `-1002`. Use `DATA UPDATE USERINFO ...` and `DATA DELETE USERINFO PIN=...`. The full word `DELETE` is required (`DATA DEL USERINFO` fails). (Source: s0x90/zkteco-adms, verified on real hardware.)

**T3 — Command wire format.** One command per line: `C:<ID>:<COMMAND>\n`. Fields inside a command are **TAB-separated** `key=value` pairs (`\t`), never spaces. Strip `\t`, `\r`, `\n` from every user-supplied value (member names!) before building a command — an unescaped tab/newline in a name is a command-injection bug.

**T4 — Device confirmations can be batched.** `POST /iclock/devicecmd` may contain several lines like `ID=12&Return=0&CMD=DATA`. Parse every line. Return codes seen on real firmware: `0` success, `-1` unsupported/no data, `-2` file op failed, `-1002` bad syntax, `-1004` table/feature unsupported.

**T5 — `DATA QUERY ...` results do NOT come back on `/devicecmd`.** The device pushes the data separately via `POST /iclock/cdata?table=USERINFO` (or OPERLOG/FINGERTMP). The devicecmd ack only says it ran.

**T6 — Ack only after the data is safely stored.** For data-bearing requests (`POST cdata`, `POST devicecmd`): return `OK` **only after** the Firestore write commits. On transient failure return HTTP `500` so the device keeps the data and retries. For data from an SN that is not claimed/active, return `503` (device retains data and retries) — never ack-and-drop. Handshake and `getrequest` always return `200`. One malformed ATTLOG line must never drop or block the rest of the batch — isolate it, log it, store the rest. A body over the size limit: log and ack `OK` (retrying an identical oversized body would wedge the device forever). (Source: skylinebiz/adms.)

**T7 — Device timestamps have no timezone.** ATTLOG times are the device's wall clock (`YYYY-MM-DD HH:mm:ss`). Interpret them as **Asia/Kolkata (IST, +05:30)** explicitly. Never use server receive time as the punch time. Never let a date library treat the string as UTC or as the VM's local time.

**T8 — `TimeZone=` only reaches the device on a fresh handshake.** Many firmwares do the full `GET /iclock/cdata?options=all` handshake only on boot, then live in the `getrequest` loop. Putting `TimeZone=` in a getrequest response has no effect. IST has been verified on real hardware as `TimeZone=330` (total minutes for fractional offsets). Must be re-verified on our K40/K45 in Part 6. After claiming a device, the owner flow must say "Restart the device now".

**T9 — eSSL firmware appends `.aspx`.** Some devices call `/iclock/cdata.aspx`, `/iclock/getrequest.aspx`, `/iclock/devicecmd.aspx`. Route both forms to the same handlers.

**T10 — A wrong server address fails silently on the device.** No error is shown on the device. The only way to know it connected is server-side: the owner UI must show live "Waiting for device… / Connected ✓" based on `lastSeenAt`.

**T11 — Devices re-upload data.** After reboots, network drops, or Stamp mismatches, the device resends logs it already sent. Every attendance write must be **idempotent** via a deterministic document ID (see §4). Persist the last `Stamp` value per table per device and echo it in the handshake (`ATTLOGStamp=`, `OPERLOGStamp=`).

**T12 — Plain HTTP only on older firmware.** Cloud Functions, Cloud Run and Vercel force HTTPS. K40/K45 firmware may only speak HTTP. That's why the device-facing gateway runs on a small VM (Part 2/5) serving **both** `http://` and `https://` with **no redirect**.

**T13 — Staff/member doc IDs are random `addDoc()` IDs, not Auth UIDs** (existing Gymloop fact). Device PINs must be **numeric**, so every member gets a gym-scoped numeric `bioPin`. Firestore rules use `gym_id` scoping + custom JWT claims, never UID matching for members.

**T14 — Never touch device users Gymloop didn't create.** PINs `1–999` are reserved for local device admins/staff created on the device keypad. Gymloop allocates member PINs from `1000` upward. Sync/reconcile code must never delete a PIN `< 1000`. The device admin password is set by the installer on the keypad, never pushed by us.

**T15 — Cloud Scheduler jobs cost money by existence.** Do **not** add a new scheduled function. Hook the expiry-freeze logic into the **existing daily job** found in Recon.

**T16 — Indexes before functions.** Deploy Firestore indexes, wait until they show **green** in the console, then deploy dependent functions. Otherwise queries fail silently with `FAILED_PRECONDITION`.

**T17 — Biometric templates are sensitive personal data.** Templates live only in `bioTemplates`, readable/writable **only by the Admin SDK** (rules: deny all client access). Never log template strings. Never return them to the frontend. Delete them when a member is permanently removed.

---

## 2. REFERENCE MATERIAL (read the relevant parts before writing protocol code)

Use these as protocol references only — do **not** add them as dependencies.

| Resource | What to take from it |
|---|---|
| github.com/s0x90/zkteco-adms (Go, MIT) — README "Protocol Details" | Endpoint list, `C:<ID>:<CMD>` format, batched devicecmd parsing, return codes, **commands verified on real hardware** (T2), `DATA QUERY` behaviour (T5), ATTLOG field order, verify-mode table, `cmd/probe` idea |
| github.com/skylinebiz/adms (Node/TS) — README sections "ADMS response codes", "Device timezone", "Telling the device its own timezone" | Ack/503/500 policy (T6), `.aspx` variant (T9), `TimeZone=330` for IST (T8), silent-failure behaviour (T10), malformed-line isolation, curl simulation commands |
| github.com/saifulcoder/adms-server-ZKTeco (PHP) — `iclockController.php` | Minimal handshake response the above projects mirror (`ErrorDelay`, `Delay`, `TransInterval`, `TransFlag=1111000000`, `Realtime`, `Encrypt`) |
| ZKTeco "Attendance PUSH Communication Protocol" (2020-03-25 PDF, mirrored on Scribd) | `FP PIN=..\tFID=..\tSize=..\tValid=..\tTMP=..` OPERLOG format; `DATA UPDATE FINGERTMP PIN=..\tFID=..\tSize=..\tValid=..\tTMP=..`; `DATA UPDATE USERINFO PIN=..\tName=..\tPasswd=..\tCard=..\tGrp=..\tTZ=..\tPri=..` |
| packagist `msaied/zkteco`, `tanemrahman/zkteco-adms`, `shadow046/zkteco-adms` READMEs | Template ingestion, roster updated only after device confirms, K40 compatibility, plain-HTTP nginx examples |

**Known contradiction to resolve on hardware (Part 6):** the 2020 PDF uses `Pri=` for privilege; s0x90 (verified on SpeedFace firmware) uses `Privilege=`. Implement the command builder with a per-device `userinfoDialect` setting (`"pri"` default, `"privilege"` alternative). The parser for incoming `USER`/`USERINFO` lines must accept both.

---

## 3. ARCHITECTURE (decision locked)

```
ZKTeco K40/K45 ──HTTP/HTTPS──► bio.gymly.online (Caddy on a small GCE VM)
                                    │ reverse_proxy :8080
                                    ▼
                         bio-gateway (Node 20, CommonJS, firebase-admin)
                           • /iclock/* protocol handlers
                           • in-memory command cache fed by ONE Firestore listener
                           • writes attendance / templates / acks
                                    │
                                    ▼
                         Firestore (gymly-app-06)  ◄── Cloud Functions (CommonJS)
                                    ▲                    • claimBioDevice (callable)
                                    │                    • syncBioDevice (callable)
                         React Owner portal              • member write trigger → enqueue
                         (Settings → Biometric,          • daily expiry hook (existing job)
                          Live "Who's in")
```

- **Gateway is the only thing the device talks to.** It never calls Cloud Functions on the hot path.
- **Cloud Functions decide *what* the device should contain** (enqueue commands). **The gateway delivers** them.
- **Polling cost:** the gateway serves `getrequest` from memory (fed by a single Firestore `onSnapshot` on pending commands), so device polls cost **zero Firestore reads**. Throttle `lastSeenAt` writes to at most once per 60 s per device.
- The VM runs in the same GCP project and uses its **attached service account** via Application Default Credentials. **No service-account JSON key files anywhere.** Service account needs Firestore read/write (Cloud Datastore User role).

---

## 4. DATA MODEL (adjust names only if Recon finds existing equivalents — report first)

### `bioDevices/{SN}` (doc ID = device serial number)
```
gym_id: string
status: 'pending_claim' | 'active' | 'disabled'
claimExpiresAt: Timestamp           // now + 30 min at claim time
claimedBy: string                   // owner uid
label: string                       // e.g. "Main door"
model, fwVersion, pushver: string   // from handshake/INFO
userinfoDialect: 'pri' | 'privilege'
timezone: 'Asia/Kolkata'
attlogStamp, operlogStamp: string   // last Stamp seen per table (T11)
cmdSeq: number                      // monotonically increasing command ID counter
lastSeenAt: Timestamp               // throttled
lastIp: string
userCount, fpCount: number          // from INFO / GET OPTION when available
createdAt, updatedAt
```

### `bioCommands/{autoId}` (top-level, so ONE listener serves all devices)
```
sn, gym_id: string
seq: number                         // the <ID> in C:<ID>:..., unique per SN
type: 'USER_UPSERT' | 'USER_DELETE' | 'FP_UPSERT' | 'INFO' | 'QUERY_USERS' | 'RAW'
memberId: string | null
bioPin: number | null
cmd: string                         // final wire string WITHOUT "C:<ID>:" prefix
status: 'pending' | 'sent' | 'acked' | 'failed'
returnCode: number | null
attempts: number
createdAt, sentAt, ackedAt: Timestamp
expireAt: Timestamp                 // TTL field, 30 days — add TTL policy
```
Command `seq` is allocated in a transaction on `bioDevices/{SN}.cmdSeq`. FP_UPSERT commands contain template data in `cmd` — this collection is also **Admin-SDK-only** (rules deny all).

### `bioEnrollments/{gym_id}_{bioPin}`
```
gym_id, memberId: string
bioPin: number
fingers: number[]                   // FIDs with stored templates
desiredOnDevice: boolean            // true = active member, false = frozen
enrolledAt, updatedAt
```

### `bioTemplates/{gym_id}_{bioPin}_{fid}` — Admin SDK only, never logged
```
gym_id: string, bioPin: number, fid: number
tmp: string (base64), size: number, valid: number
sourceSN: string, capturedAt: Timestamp
```

### Member doc additions (existing members collection — Recon confirms path/field names)
```
bioPin: number | null
bioStatus: 'not_enrolled' | 'enrolled' | 'frozen'
```

### Gym doc addition
```
bioPinCounter: number               // starts at 999; first allocation = 1000 (T14)
```

### Attendance — **write into the EXISTING unified attendance collection** (Recon finds it)
- Doc ID: `bio_{SN}_{bioPin}_{YYYYMMDDHHmmss}` (deterministic → idempotent, T11).
- Match the existing schema exactly (same field names the QR `processScan` path writes), plus: `source: 'biometric'`, `deviceSN`, `verifyMode`, `rawLine`.
- Punch with an unknown PIN → `bioUnmatchedPunches/{same id}` instead (with `gym_id` from the device). Never drop it.

### `bioRawLogs/{autoId}` (debug firehose, TTL 7 days)
`sn, path, query, bodyPreview (first 2,000 chars, template TMP values redacted), status, at`. Write only for non-heartbeat requests and errors.

---

## 5. PROTOCOL SPEC THE GATEWAY MUST IMPLEMENT

All routes also accept the `.aspx` suffix (T9). Optional path prefix `/d/{deviceToken}` before `/iclock/` must also route correctly (see Part 6 for why).

### 5.1 Handshake — `GET /iclock/cdata?SN=...&options=all[&pushver=..&language=..]`
- Unknown SN → `200` with the config below anyway (keeps the device looping) + write a `bioRawLogs` entry.
- SN with `status: 'pending_claim'` and `claimExpiresAt > now` → set `status: 'active'`, record `pushver`, `lastIp`, queue an `INFO` command.
- `pending_claim` but expired → treat as unknown.
- Response body (`text/plain`, lines joined with `\n`):
```
GET OPTION FROM: {SN}
ATTLOGStamp={device.attlogStamp || 0}
OPERLOGStamp={device.operlogStamp || 0}
ATTPHOTOStamp=0
ErrorDelay=30
Delay=30
TransTimes=00:00;14:05
TransInterval=1
TransFlag=1111000000
TimeZone=330
Realtime=1
Encrypt=0
```
`TimeZone` comes from the device timezone (IST → 330). Make every value configurable per device so Part 6 can adjust without a redeploy.

### 5.2 Data upload — `POST /iclock/cdata?SN=...&table=<TABLE>&Stamp=<n>`
Read the **raw body** as a string (no JSON/urlencoded parsers on these routes). Lines may be `\r\n` or `\n` separated.

- `table=ATTLOG` → each line: `PIN\tYYYY-MM-DD HH:mm:ss\tStatus\tVerify\tWorkcode\t...`. Map PIN → `bioEnrollments` (in-memory cache, see 5.5), convert time as IST (T7), batch-write attendance (≤ 400 ops per batch). Then update `attlogStamp`. Then respond `OK`.
- `table=OPERLOG` → each line starts with a keyword:
  - `FP PIN=..\tFID=..\tSize=..\tValid=..\tTMP=..` → upsert `bioTemplates`, add FID to `bioEnrollments.fingers`, set member `bioStatus: 'enrolled'`.
  - `USER PIN=..\tName=..\t...` → log only (roster mirror optional).
  - `OPLOG ...` → log only.
  - Unknown prefix → log to `bioRawLogs`, continue.
  Then update `operlogStamp`, respond `OK`.
- `table=USERINFO` / `FINGERTMP` (responses to `DATA QUERY`) → parse the same way as the matching OPERLOG lines.
- `table=options` or any other table → log, respond `OK`.
- Device not `active` → `503` (T6). Firestore failure → `500` (T6).

### 5.3 Command poll — `GET /iclock/getrequest?SN=...`
- Not active → `OK`.
- Otherwise return up to **10** commands for this SN from the in-memory cache where `status == 'pending'` OR (`status == 'sent'` AND `sentAt` older than 5 min AND `attempts < 5`), ordered by `seq`, formatted `C:{seq}:{cmd}` joined with `\n`. Mark them `sent` (`attempts += 1`, `sentAt = now`) **before** responding. No commands → `OK`.
- Ordering rule: for one member, `USER_UPSERT` must be delivered before that member's `FP_UPSERT` commands (lower `seq`).
- Throttled `lastSeenAt` update.

### 5.4 Command result — `POST /iclock/devicecmd?SN=...`
Parse every line (`ID=..&Return=..&CMD=..`, T4). For each: find `bioCommands` by `(sn, seq)`. `Return == 0` → `acked` + side effects:
- `USER_DELETE` acked → member `bioStatus: 'frozen'`.
- `USER_UPSERT` acked → if member has templates and FP_UPSERTs are acked, `bioStatus: 'enrolled'`.
- `INFO` → store device info fields.
Non-zero → `failed` with `returnCode` (never auto-retry `-1002`/`-1004`; log loudly). Respond `OK` after writes commit.

### 5.5 In-memory caches (gateway)
- One `onSnapshot` on `bioCommands where status in ['pending','sent']` → `Map<sn, Command[]>`.
- One `onSnapshot` on `bioEnrollments` → `Map<gym_id, Map<bioPin, memberId>>`.
- One `onSnapshot` on `bioDevices` → `Map<sn, device>`.
- On listener error: log, back off, resubscribe. On process restart the caches rebuild from Firestore.

### 5.6 Command builders (pure functions, unit-tested)
```
userUpsert(pin, name, dialect):
  dialect 'pri'       → "DATA UPDATE USERINFO PIN={pin}\tName={name}\tPri=0"
  dialect 'privilege' → "DATA UPDATE USERINFO PIN={pin}\tName={name}\tPrivilege=0"
userDelete(pin)       → "DATA DELETE USERINFO PIN={pin}"
fpUpsert(pin, fid, tmp) → "DATA UPDATE FINGERTMP PIN={pin}\tFID={fid}\tSize={tmp.length}\tValid=1\tTMP={tmp}"
info()                → "INFO"
queryUsers()          → "DATA QUERY USERINFO"
```
`name`: strip `\t\r\n`, transliterate to ASCII, collapse spaces, max 24 chars. `pin`: integer ≥ 1000 only (T14).

### 5.7 Hardening
- Max body 10 MB. Per-IP rate limit on `/iclock/*` (e.g. 120 req/min) — exceeding → `503`, never HTML.
- Validate SN: `^[A-Za-z0-9]{6,32}$`; otherwise `OK` + log, no Firestore lookup.
- If a request arrives with a `/d/{deviceToken}` prefix and the device has a token, they must match, else `401`.
- `/health` endpoint (not under `/iclock`) doing a real Firestore read.
- Structured JSON logs to stdout; never log `TMP=` values.

---

## PART 0 — RECON (read-only, no edits)

Report, with file paths and line numbers:

1. **Members:** collection path, how membership expiry is stored (field name, type, timezone semantics), what "active" means in code, where members are created/renewed/deleted (client writes vs functions).
2. **Attendance:** the unified attendance collection path and **exact schema** written by `processScan`; existing indexes on it; how the Owner/Receptionist UI reads today's attendance.
3. **Gyms:** gym doc path, existing counters, where `gym_id` custom claims are set, role claim names.
4. **Scheduled jobs:** list every `onSchedule` function. Identify the daily job the expiry hook should live in (T15).
5. **Owner Settings:** current Settings route structure (note the 1079-line monolith + the 13-route restructure plan). Propose where "Biometric devices" lives without making the monolith bigger.
6. **Rules & indexes:** current `firestore.rules` structure, helper functions, `firestore.indexes.json`, TTL policies already configured.
7. **Functions layout:** entry file, how callables check auth/claims, region, Node version.
8. **AGENTS.md / SECURITY_STATUS.md / EFFICIENCY.md** constraints that affect this work.
9. Any existing code mentioning `biometric`, `zkteco`, `iclock`, `bioPin`.

Capture format: a table per item. Flag every conflict with §4.

**🚦 GATE 0 — stop. Wait for GO.**

---

## PART 1 — Data model, rules, indexes, TTL

1. Add rules: `bioTemplates`, `bioCommands`, `bioRawLogs`, `bioEnrollments` → **deny all client access**. `bioDevices` → read allowed for Owner/Manager where `resource.data.gym_id == request.auth.token.gym_id`; client writes denied. `bioUnmatchedPunches` → Owner/Manager read, same gym scoping.
2. Attendance: biometric docs follow existing attendance rules — confirm client cannot create `source: 'biometric'` docs.
3. Indexes needed by Part 3/4 queries (attendance for today by gym; `bioCommands (sn, status, seq)`; `bioEnrollments (gym_id)`).
4. TTL policies: `bioCommands.expireAt` (30 d), `bioRawLogs.expireAt` (7 d).
5. Run `npx firebase-tools rules:check`. Show the full rules diff.

Deploy order: `--only firestore:indexes` → confirm green → `--only firestore:rules`.

**🚦 GATE 1 — show diffs + rules:check output. Wait for GO before deploying.**

---

## PART 2 — `bio-gateway` service (new folder `bio-gateway/`, CommonJS)

Structure:
```
bio-gateway/
  package.json          // node >=20, deps: express, firebase-admin, (nothing else unless justified)
  src/server.js         // express app, raw text body on /iclock/*, routes incl. .aspx + /d/:token prefix
  src/protocol/handshake.js
  src/protocol/attlog.js        // pure parser
  src/protocol/operlog.js       // pure parser (FP, USER, OPLOG)
  src/protocol/devicecmd.js     // pure parser (batched)
  src/protocol/commands.js      // pure builders (5.6)
  src/time/ist.js               // wall-clock IST → Timestamp (no external tz lib needed: fixed +05:30)
  src/store/caches.js           // the 3 listeners (5.5)
  src/store/writes.js           // attendance/template/ack writes, batching
  src/health.js
  tools/simulate-device.js      // full device simulator (see below)
  test/*.test.js                // node:test
```

**Device simulator (`tools/simulate-device.js`)** must reproduce a real device end-to-end against the local gateway + Firestore emulator:
- handshake with `options=all`
- ATTLOG batch with: 3 valid lines, 1 malformed line, 1 duplicate of a previous line, `\r\n` and `\n` mixed
- OPERLOG with `FP PIN=1000\tFID=0\tSize=..\tValid=1\tTMP=<fake base64>`
- getrequest loop every 2 s, parse `C:<id>:<cmd>`, reply on devicecmd with `Return=0` (flag `--fail-code -1002` to simulate rejection), batched acks
- `.aspx` mode flag, `/d/<token>` prefix flag

**Unit tests (must pass):**
- [ ] ATTLOG parser: valid, malformed isolated, extra trailing fields, `\r\n`/`\n`
- [ ] IST conversion: `2026-10-03 06:15:00` → `2026-10-03T00:45:00Z`
- [ ] OPERLOG: FP line, USER line, OPLOG line, unknown prefix
- [ ] devicecmd: single, batched, with `Content=` multiline
- [ ] command builders: tab separation, name sanitising (tab/newline/emoji/Telugu input), PIN < 1000 rejected, both dialects
- [ ] handshake text exact match (snapshot)
- [ ] every `/iclock/*` response is `text/plain` with body `OK` or the config text

Run locally against the Firestore emulator (`FIRESTORE_EMULATOR_HOST`) with the simulator. Show the simulator transcript.

**🚦 GATE 2 — show test output + simulator transcript + diff. Wait for GO.**

---

## PART 3 — Cloud Functions (CommonJS, existing functions codebase)

1. **`allocateBioPin(gymId, memberId)`** (internal helper): transaction on gym `bioPinCounter` (init 999) → returns next ≥ 1000; writes member `bioPin`, creates `bioEnrollments` doc. Idempotent: if member already has `bioPin`, return it.
2. **`enqueueForGym(gymId, buildFn)`** (internal): for every `bioDevices` where `gym_id == gymId && status == 'active'`, allocate `seq` via transaction on the device doc and create `bioCommands`.
3. **Callable `claimBioDevice({ sn, label })`** — Owner/Manager of the gym only (custom claims). Validates SN format. If `bioDevices/{sn}` exists for another gym → error "already registered". Creates/updates doc with `pending_claim`, `claimExpiresAt = now + 30 min`. Returns server address, port, and the on-device steps.
4. **Callable `syncBioDevice({ sn })`** — for every active member of the gym: ensure `bioPin`, enqueue `USER_UPSERT`, then `FP_UPSERT` per stored template. For members not active: ensure absent (enqueue `USER_DELETE` only if they have a `bioPin`). Returns counts.
5. **Member write trigger** (on the members collection found in Recon): compute `isActive` with the same logic the app uses. If `isActive` changed, or member was created active, or name changed → set `bioEnrollments.desiredOnDevice` and enqueue:
   - became active → `USER_UPSERT` + `FP_UPSERT`s (renewal → instant re-access)
   - became inactive → `USER_DELETE`
   - permanently deleted → `USER_DELETE` + delete `bioTemplates` + `bioEnrollments`
   Guard against trigger loops: ignore writes that only touch `bio*` fields.
6. **Daily expiry hook** — add to the **existing** daily scheduled function (T15): find members whose expiry passed since the last run and who still have `desiredOnDevice == true` → same path as "became inactive". Expiry boundary = end of the expiry day in IST.
7. **Callable `setBioDeviceStatus({ sn, status })`** — disable/re-enable a device (Owner only).

Every callable: verify `request.auth.token.gym_id` and role; never trust a gymId from the client.

Test with the emulator suite: member created → commands appear; expiry → delete command; renewal → upsert + fp commands; deleted member → templates removed.

**🚦 GATE 3 — show diff + emulator test transcript. Wait for GO.**

---

## PART 4 — Owner UI (React)

Follow the existing design system and nav. No new Settings monolith growth — use the location agreed in Recon.

1. **Settings → Biometric devices**
   - "Add device" wizard, **3 steps**:
     1. Enter serial number (+ label). Helper text: "Find it on the sticker behind the device or in Menu → System Info."
     2. Show on-device steps with the exact values: Menu → Comm → **Cloud Server Setting**: Server mode **ADMS**, Enable Domain Name **ON**, Server address **bio.gymly.online**, Port **80**, Proxy **OFF**. Then **restart the device**.
     3. Live status from `bioDevices/{sn}` (`onSnapshot`): "Waiting for device…" → "Connected ✓" (`status == 'active'` and `lastSeenAt` < 2 min). After 10 min without contact: show the troubleshooting checklist (internet at the door, address typed exactly, ADMS menu present, try port 8081 fallback if configured).
   - Device card: label, online/offline (`lastSeenAt` < 3 min), last seen, members on device, "Sync members now" (calls `syncBioDevice`), Disable.
2. **Member profile / list:** badge `Fingerprint: Not enrolled / Enrolled / Frozen`. For "Not enrolled" show: "On the device: Menu → User Mgt → find user **{bioPin} {name}** → Enroll fingerprint (2 fingers)."
3. **Live "Who's in"** (Owner dashboard + Receptionist): today's attendance for the gym where `source == 'biometric'` merged with existing QR attendance, newest first, member name + time + method. Real-time `onSnapshot` limited to today (justified exception to the one-time-read rule; note it in `EFFICIENCY.md`).
4. **Unmatched punches** list (small, in device settings): PIN + time, for debugging.

Never display or request template data in the UI.

**🚦 GATE 4 — screenshots/description of each screen + diff. Wait for GO.**

---

## PART 5 — Deploy gateway (VM)

1. GCE VM in `asia-south1` (Mumbai), e2-small, Debian/Ubuntu LTS, attached service account with Firestore access, **no key files**.
2. Firewall: allow TCP 80 and 443 (and 8081 if Vishnu approves a fallback port). SSH restricted.
3. Install Node 20 + Caddy. Run `bio-gateway` under systemd (`Restart=always`), port 8080 on localhost only.
4. Caddyfile — **two explicit site blocks so Caddy does NOT redirect HTTP→HTTPS** (T12):
```
http://bio.gymly.online {
    reverse_proxy 127.0.0.1:8080
}
https://bio.gymly.online {
    reverse_proxy 127.0.0.1:8080
}
```
   Verify with `curl -i http://bio.gymly.online/iclock/cdata?SN=TEST123456&options=all` → `200`, no `301/308`.
5. DNS: `A bio.gymly.online → VM static external IP` (Vishnu does this at the DNS provider). Reserve a static IP.
6. Deploy functions: `--only functions:<names>` (after indexes are green).
7. Run the simulator against production URL with a **test SN** claimed under a test gym; confirm attendance doc + command round-trip; then disable the test device.
8. Update `SECURITY_STATUS.md` (new public surface `/iclock/*`, plain-HTTP risk, mitigations) and `EFFICIENCY.md`.

**🚦 GATE 5 — show curl outputs + simulator-against-prod transcript. Wait for GO.**

---

## PART 6 — Real-hardware verification script (run when the device arrives)

Gateway must expose an Owner-only "Device console" (or a CLI in `bio-gateway/tools/`) to queue a RAW command and view `bioRawLogs` for one SN. Then, in order:

- [ ] **Connect:** claim SN, set Cloud Server Setting on device, restart. Device turns Connected ✓. Record `pushver`, firmware, the exact handshake query string. If the address field accepts a path, also test `bio.gymly.online/d/<token>`.
- [ ] **Clock:** after restart, device clock shows correct IST. If not, try `TimeZone=5.5`, then `TimeZone=5`, record what works, store per device.
- [ ] **INFO:** command acked; capture user/FP capacity.
- [ ] **User add:** push PIN 1000 "Test User" with dialect `pri`. If `-1002`, switch to `privilege` and retry. Record which works.
- [ ] **Query:** `DATA QUERY USERINFO` → confirm data arrives on `cdata` (T5); confirm field names.
- [ ] **Enroll:** enroll 2 fingers on the device under PIN 1000 → confirm `FP PIN=1000 FID=..` lines arrive in OPERLOG and templates are stored. If they don't arrive, try `TransFlag` variants and record.
- [ ] **Punch:** scan finger → door relay clicks, attendance doc appears with correct IST time within seconds, Live "Who's in" updates.
- [ ] **Freeze:** mark membership expired → `DATA DELETE USERINFO` acked within ~30 s → finger is rejected, door stays shut.
- [ ] **Renew:** renew membership → USERINFO + FINGERTMP acked → **same finger works without re-enrolling**.
- [ ] **Offline:** unplug internet, scan 3 times (door must still open for active member), reconnect → 3 punches arrive, no duplicates.
- [ ] **Reboot:** power-cycle → count duplicate uploads (should be 0 new attendance docs thanks to deterministic IDs).
- [ ] **Staff PIN safety:** create a local admin user (PIN 1) on keypad → run Sync → PIN 1 untouched.
- [ ] **Remote unlock (probe only):** test candidate door-open commands via RAW; if none returns `0` and opens the relay, the "Let in now" feature stays out of scope.

Write all findings to `bio-gateway/HARDWARE_NOTES.md` and set per-device config (dialect, TimeZone value, TransFlag) accordingly.

**🚦 GATE 6 — hardware report. Wait for GO.**

---

## NON-GOALS (do not build)

- Face templates, palm, cards/RFID enrollment from the portal
- Remote fingerprint enrollment (enrollment happens on the device keypad)
- Pull/TCP 4370 SDK, Windows agents, ZKBio/ZKTeco cloud software
- Access-control push protocol (`PUSH AC`) devices — F22/F09 not in scope
- Turnstiles, anti-passback, time zones/access groups
- "Let in now" remote unlock — unless Part 6 probe proves a working command
- Multi-gym chain-wide device sharing
- Any new Cloud Scheduler job
- Changing the QR attendance flow

---

## FINAL ACCEPTANCE CRITERIA

- [ ] Owner connects a new device in ≤ 3 portal steps + on-device settings, sees Connected ✓ without page refresh
- [ ] Active member's fingerprint opens the door; punch appears in Live "Who's in" with correct IST time
- [ ] Expired member is removed from the device automatically (daily hook or status change) and cannot enter
- [ ] Renewal restores access automatically without re-enrollment
- [ ] Device offline → door keeps working for active members; punches sync on reconnect, zero duplicates
- [ ] No client can read templates, commands, or raw logs (verified with rules tests)
- [ ] Device polls cause zero Firestore reads; no new Scheduler job exists
- [ ] All unit tests + simulator pass; `rules:check` clean; deploys used `--only`
- [ ] `HARDWARE_NOTES.md`, `SECURITY_STATUS.md`, `EFFICIENCY.md` updated
