# GA4 Analytics — operation and removal

Product-analytics instrumentation added for the MSc Product Analytics review
(September 2026). It is built to be switched off in one step and removed
without a trace. Both procedures are below.

GA4 property: Firebase Analytics on `gymly-app-06`, measurement ID
`G-6XXNPM9R3Y`. Firebase Analytics **is** GA4 — there is no gtag.js snippet,
no `react-ga4`, and no second analytics script anywhere in this app.

---

## 1. Turn it off (30 seconds, no code change)

In the Vercel dashboard → Project → Settings → Environment Variables, set:

```
VITE_ANALYTICS_ENABLED=false
```

Redeploy. That is the whole procedure.

Deleting `VITE_GA_MEASUREMENT_ID` has the same effect, but the explicit flag is
preferred because it reads as a deliberate decision rather than a missing value.

**What "off" means:** every export in `src/lib/analytics.js` becomes a no-op.
The Analytics SDK is never initialised, no network request is made, no event is
sent, no user property is set, no cookie is written. The call sites scattered
through the app stay where they are and do nothing. Nothing else changes.

Analytics is **already off** in every dev build (`npm run dev`), unconditionally
— see the `import.meta.env.PROD` guard. Turning the flag on locally will not
make it send.

---

## 2. Remove it completely (about 10 minutes)

Do this only if you want the code gone rather than dormant. The integration was
written so every touchpoint is a single import line plus a single call.

### Step 1 — delete the module

```
rm src/lib/analytics.js
rm ANALYTICS.md
```

### Step 2 — find every touchpoint

```
grep -rn "lib/analytics\|trackEvent\|trackPageView\|setAnalyticsUser\|clearAnalyticsUser\|setKioskSession\|initAnalytics\|toBucket\|AnalyticsTracker" src/
```

Delete each `import ... from '.../lib/analytics'` line and each call. Every call
is standalone — nothing else depends on its return value, so deleting a call
never leaves a dangling reference. The files, as of this writing:

| file | what to remove |
|---|---|
| `src/App.jsx` | the `AnalyticsTracker` component, its import block, `useEffect` from the react import, `useAuth` from the AuthContext import, and `<AnalyticsTracker />` in the tree |
| `src/firebase/auth.js` | import + `clearAnalyticsUser()` in `logout()` |
| `src/hooks/useKioskAuth.js` | import + the `setKioskSession` effect |
| `src/hooks/useSubscription.js` | import + the `plan_tier` effect and its `const plan` line |
| `src/components/SubscriptionGate.jsx` | import, the `useEffect` import, the `accessGranted`/`gymId` lines and the effect. Revert `{ gymDoc, userDoc }` to `{ gymDoc }` |
| `src/pages/Signup/Signup.jsx` | import + `trackEvent('sign_up', …)` |
| `src/pages/Login/OwnerLogin.jsx` | import + two `trackEvent('login', …)` calls |
| `src/pages/Login/MemberLogin.jsx` | import + `trackEvent('login', …)` |
| `src/pages/Onboarding/Onboarding.jsx` | import + `trackEvent('gym_setup_completed', …)` |
| `src/owner/screens/Members/AddMember.jsx` | import + the `member_added` block. Revert `getDoc` from the firestore import |
| `src/pages/Members/AddMember.jsx` | import + the `member_added` block. Revert `getDoc` from the firestore import |
| `src/owner/screens/Subscription.jsx` | import + `trackEvent('checkout_started', …)` |
| `src/owner/screens/Payments/AddPayment.jsx` | import + `checkout_started` and `dues_recorded` calls |

### Step 3 — revert the config

`src/firebase/config.js` — drop the `measurementId` line and its comment.

`.env`, `.env.example`, and Vercel — drop `VITE_GA_MEASUREMENT_ID`,
`VITE_ANALYTICS_ENABLED` and `VITE_GA_DEBUG`.

`functions/.env` and `functions/.env.example` — drop `GA_MEASUREMENT_ID`,
`GA_API_SECRET`, `GA_CLIENT_ID_SALT`, `GA_ANALYTICS_ENABLED`, `GA_DEBUG`,
`GA_VALIDATE`. Delete `functions/lib/ga4.js` and remove its `require` plus the
`sendGa4Events`/`sendPurchase`/`reportScan` calls from `functions/index.js` and
`functions/src/processScan.js`.

`vercel.json` — remove the GA4 domains from the CSP. **Remove only these, leave
every other entry alone:**

- `script-src`: `https://www.googletagmanager.com`
- `connect-src`: `https://*.google-analytics.com`, `https://*.analytics.google.com`, `https://*.googletagmanager.com`
- `img-src`: `https://*.google-analytics.com`, `https://*.googletagmanager.com`

### Step 4 — verify

```
npm run build          # must succeed
grep -rn "lib/analytics" src/    # must return nothing
```

Nothing outside this list was touched. No Firestore rule, index, collection,
Cloud Function or business logic was changed for analytics.

---

## 3. What is collected

No personally identifying information, by construction and by test.

**User-scoped properties:** `gym_id` (tenant key), `user_role`, `plan_tier`,
`display_mode`, `traffic_type`. `user_id` is the Firebase **Auth UID** only —
never a member or staff Firestore document ID, which are random `addDoc()`
strings and are not identity.

**Events:** `page_view`, `sign_up`, `login`, `gym_setup_completed`,
`member_added`, `checkout_started`, `feature_first_use`, `dues_recorded`.

**Guardrails built into `src/lib/analytics.js`:**

- Param keys matching `name`, `phone`, `email`, `mobile`, `address` or
  `member_id` are refused, and the **whole event** is dropped, not just the key.
- Dynamic route IDs are redacted before `page_view` — `/owner/members/<docId>`
  is reported as `/owner/members/:id`. A catch-all also redacts any unmapped
  ID-shaped segment, so a route added later cannot leak by omission.
- Automatic page-view collection is disabled at init, otherwise gtag would
  report the raw URL and bypass redaction entirely.
- Counts are bucketed `1-25` / `26-100` / `101-500` / `500+`; rupee amounts use
  their own ladder, `1-1000` / `1001-3000` / `3001-8000` / `8001-20000` /
  `20000+`. No exact payment amount is ever sent.
- Kiosk routes are tagged `traffic_type='kiosk'` and never call `setUserId` —
  those devices are shared and sign in anonymously.
- Every export is a no-op, never a throw, when Analytics is unavailable
  (Safari private mode, in-app browsers, ad blockers). Analytics cannot break
  app render.
