# PLAN-secrets-rotation-cleomitra — Remove hardcoded API key, rotate it, migrate off functions.config()

## Goal
The Cleomitra (WhatsApp) API key is **hardcoded in source** as a fallback in two places and is therefore burned — it lives in git history and in every clone of this repo. Remove the hardcoded fallbacks, move the key to Firebase Secret Manager (the same v1 `runWith({secrets})` pattern already used for `QR_SIGNING_SECRET`), **rotate the key**, and migrate the remaining `functions.config()` reads (Razorpay) to secrets too — the `functions.config()` API is deprecated/being decommissioned, so those fallbacks are a deploy-failure time bomb.

## Files to touch
- `functions/index.js` — line ~10 (`sendWhatsAppFromFunction` token), lines ~417-418 and ~553 (Razorpay `functions.config()` fallbacks), plus `runWith` on every exported function that reaches these helpers
- `functions/src/invoicing.js` — line ~183 (same hardcoded Cleomitra token)
- Vercel/local env files — remove `VITE_CLEOMITRA_API_KEY` if present (see Step 5)

## Implementation order

### Step 1 — Rotate the key FIRST (out-of-band, user action)
Ask the owner to generate a new API key in the Cleomitra dashboard and revoke `cmk_c6e22d2cd37d7e9f861459879fa388f8`. Removing it from code without rotating fixes nothing — it's in git history forever. **Do not do a git-history rewrite**; rotation makes the leaked value worthless, which is the correct fix.

### Step 2 — Store secrets in Secret Manager
```bash
firebase functions:secrets:set CLEOMITRA_API_KEY      # paste the NEW key
firebase functions:secrets:set RAZORPAY_KEY_ID
firebase functions:secrets:set RAZORPAY_KEY_SECRET
firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET
```
For the Razorpay values: read the current values with `firebase functions:config:get` before migrating (they may only exist in the old config store).

### Step 3 — Update code
In `functions/index.js` (~line 10) and `functions/src/invoicing.js` (~line 183) replace:
```js
const token = functions.config().cleomitra?.apikey || process.env.VITE_CLEOMITRA_API_KEY || "cmk_...";
```
with:
```js
const token = process.env.CLEOMITRA_API_KEY;
```
Keep the existing `if (!token) { warn + return {success:false, error:"no_token"} }` guard — it becomes the real safety net.

Same pattern for Razorpay (~lines 417-418, 553): `process.env.RAZORPAY_KEY_ID` etc., delete the `functions.config()` fallbacks.

**The step a weaker model will miss:** `process.env.CLEOMITRA_API_KEY` is only populated in a function's runtime if that function declares the secret. Find every **exported** function whose call graph reaches `sendWhatsAppFromFunction` or the invoicing sender:
```bash
grep -n "sendWhatsAppFromFunction\|exports\." functions/index.js
grep -n "cleomitra\|token" functions/src/invoicing.js
```
Add `.runWith({ secrets: ["CLEOMITRA_API_KEY"] })` to each of those exports (scheduled reminder functions, retry-queue processor, invoicing trigger, etc.), and `.runWith({ secrets: ["RAZORPAY_KEY_ID","RAZORPAY_KEY_SECRET"] })` / `["RAZORPAY_WEBHOOK_SECRET"]` to the Razorpay order/webhook functions. If a function already has a `runWith({...})` (e.g. `memory`/`timeoutSeconds`), merge the `secrets` array into the existing object — don't add a second `runWith`. This codebase is **v1 firebase-functions** — do not convert anything to `defineSecret`/v2.

### Step 4 — Deploy and clean old config
```bash
firebase deploy --only functions        # wholesale is REQUIRED here: runWith changed on many functions
firebase functions:config:unset cleomitra razorpay    # only AFTER the deploy verifies
```
Note: this plan is the one place a wholesale functions deploy is appropriate. Do it AFTER PLAN-deploy-pending-stack so you're not entangling two changes. Watch the deploy output — scheduled (pub/sub) functions redeploying is expected.

### Step 5 — Purge the client-side env leftover
The old fallback read `process.env.VITE_CLEOMITRA_API_KEY`. The `VITE_` prefix means Vite would inline it into the **public browser bundle** if any client code referenced it. Verified during exploration: no `src/` code references it today — but the variable may still exist in `.env` files and Vercel project env. Remove `VITE_CLEOMITRA_API_KEY` from local `.env*` and from Vercel env vars so nobody can reintroduce the leak by referencing it. If the functions runtime genuinely needs an env-var (non-secret) form, name it WITHOUT the `VITE_` prefix.

## Edge cases found while exploring
- The hardcoded key exists in **two** files (`functions/index.js:10`, `functions/src/invoicing.js:183`) — fixing only index.js leaves the leak live.
- `functions.config()` may already return `undefined` on newer deploys (API decommission), which is why the hardcoded fallback was "working" — meaning production is likely running on the leaked key right now. Rotation is not optional.
- The WhatsApp dedup logic queries `whatsapp_logs` before sending — unrelated to the token change; don't touch it.
- `seedCoupons.js` and other scripts under `functions/src/` may read config too — `grep -rn "functions.config()" functions/` and migrate every hit.

## Acceptance criteria
- [ ] `grep -rn "cmk_" functions/ src/` → zero matches.
- [ ] `grep -rn "functions.config()" functions/` → zero matches.
- [ ] `grep -rn "VITE_CLEOMITRA" . --exclude-dir=node_modules --exclude-dir=dist` → zero matches (and removed from Vercel env).
- [ ] Old key revoked in Cleomitra; new key set via `firebase functions:secrets:access CLEOMITRA_API_KEY`.
- [ ] A real WhatsApp send succeeds post-deploy (trigger an expiry reminder or use whatever test path exists; check `whatsapp_logs` for `status: sent`).
- [ ] Razorpay checkout still opens and the webhook still validates (check function logs for one payment).
