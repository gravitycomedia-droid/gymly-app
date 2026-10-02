# bio-gateway

ADMS ("PUSH") gateway for ZKTeco / eSSL fingerprint devices. It is the only server the devices talk to. It runs on a small GCE VM behind Caddy, which serves plain HTTP on 80 and 8081 and HTTPS on 443, with no redirects. The gateway writes to Firestore `gymly-app-06` using the VM's attached service account. There are no key files.

```
device ──HTTP──► Caddy :80/:443/:8081 ──► bio-gateway 127.0.0.1:8080 ──► Firestore
```

- **Device polls cost zero Firestore reads.** `getrequest` is answered from memory. Three `onSnapshot` listeners feed that memory: `bio_devices`, pending/sent `bio_commands`, and `bio_enrollments`.
- **Cloud Functions decide *what* goes on a device** by queuing `bio_commands`. The gateway delivers those commands and records the device's results.
- **Writes:**
  - Attendance goes to both `attendance_sessions` and `attendance_logs`, with deterministic IDs, so device re-uploads are no-ops.
  - Fingerprint templates go to `bio_templates`. That collection is Admin-SDK only, and templates are never logged.
  - Command results go back to `bio_commands`.

## Layout

| Path | What |
|---|---|
| `src/server.js` | Express app with `/iclock/*` routes (`.aspx` suffix and `/d/{token}` prefix both accepted), plus `main()` |
| `src/protocol/` | Pure parsers and builders: `attlog`, `operlog`, `biodata`, `devicecmd`, `commands`, `handshake`, `caps` |
| `src/protocol/adapters/` | `ta2` (TA PUSH 2.x, Tier 1) and `ac3` (AC PUSH 3.x, scaffold only) |
| `src/store/caches.js` | The three listeners |
| `src/store/writes.js` | Every Firestore write |
| `src/time/ist.js` | Device wall clock → IST (fixed +05:30) |
| `tools/simulate-device.js` | Device simulator |
| `tools/seed-emulator.js` | Seeds a test gym into the **emulator only** |

## Run locally

```bash
npm install
npm test                 # unit + HTTP contract tests (no Firestore needed)
npm run test:emulator    # adds end-to-end tests against the Firestore emulator

# Manual run against the emulator:
firebase emulators:start --only firestore --project demo-gymly-test   # terminal 1
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-gymly-test
node tools/seed-emulator.js                                           # terminal 2
PORT=8090 node src/server.js
node tools/simulate-device.js --url http://127.0.0.1:8090 --sn SIMDEV0001
```

Simulator flags:
- `--proto ta2|ac3`
- `--aspx`
- `--token <t>`
- `--template-table FINGERTMP|BIODATA`
- `--fail-code <n>`
- `--enroll-supported yes|no`
- `--polls <n>`
- `--interval <ms>`
- `--no-replay`

## Environment

| Var | Default | |
|---|---|---|
| `PORT` | `8080` | |
| `HOST` | `127.0.0.1` | Caddy is the only public listener |
| `GCLOUD_PROJECT` | `gymly-app-06` | |
| `FIRESTORE_EMULATOR_HOST` | unset | When set, uses the emulator |
| `LOG_LEVEL` | `info` | |

## Device-facing rules (from the master prompt)

- **T1:** every `/iclock/*` reply is `text/plain`: `OK`, the handshake or config text, or `C:<seq>:<cmd>` lines.
- **T6:** data is acknowledged only after the Firestore commit succeeds.
  - Transient failure → `500`, so the device retries.
  - Unclaimed or inactive SN → `503`, so the device keeps the data.
  - Oversized body → logged and answered `OK`.
- **T14:** PINs 1–999 are on-device admins and are never written or deleted.
- **T7:** device times are read as IST and never replaced with the server's receive time.
