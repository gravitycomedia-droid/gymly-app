# GA4 verification checklist

Run top to bottom. Every box maps to one acceptance criterion.
Property: `gymly-app-06` · Measurement ID: `G-6XXNPM9R3Y`

---

## Part 0 — Before you start

### 0.1 Finish the server-side secret (NOT done yet)

`GA_API_SECRET` in Vercel has no effect — Vercel runs the frontend; Cloud
Functions read their environment from Firebase. Add to `functions/.env`:

```
GA_MEASUREMENT_ID=G-6XXNPM9R3Y
GA_API_SECRET=<the Measurement Protocol secret>
GA_CLIENT_ID_SALT=gymloop-mp-v1
GA_ANALYTICS_ENABLED=true
GA_DEBUG=true            # testing only — set false when finished
```

Then deploy: `firebase deploy --only functions --project gymly-app-06`

If you created a `VITE_GA_API_SECRET` in Vercel, **delete it** — `VITE_*` vars
are inlined into the public JS bundle.

### 0.2 Turn on DebugView

DebugView shows events from flagged devices in real time, within seconds.

**Client (browser / PWA / kiosk):** in Vercel set `VITE_GA_DEBUG=true`, then
redeploy. Vite inlines env vars at build time, so a redeploy is required — an
existing deployment will not pick it up.

Use a **Preview deployment** rather than Production if you would rather not
touch live traffic.

**Desktop Chrome alternative, no deploy:** install the *Google Analytics
Debugger* extension and toggle it on. This will not work on a kiosk tablet or
the mobile PWA, which is why the env flag exists.

**Opening it:** analytics.google.com → **Admin** (gear, bottom left) →
*Data display* → **DebugView**. The device selector at the top left lists
active debug devices; pick yours if more than one appears.

> ⚠️ Events marked `debug_mode` are **excluded from standard GA4 reports**.
> Turn `VITE_GA_DEBUG` and `GA_DEBUG` back to `false` and redeploy when you
> finish, or your review data will be missing everything you tested.

---

## Part 1 — Zero events in dev  *(acceptance: zero events fire in dev build)*

- [ ] Run `npm run dev`, open the app, click around, log in
- [ ] DevTools → Network → filter `google-analytics` → **no requests at all**
- [ ] DebugView shows nothing from this session

Dev is blocked by `import.meta.env.PROD` regardless of any flag. If you see
traffic here, stop — something bypassed the module.

---

## Part 2 — User properties  *(acceptance: gym_id, user_role, plan_tier, display_mode)*

Log in to the deployed build as a **gym owner**. In DebugView click the top
event, then open the **User properties** panel on the right.

- [ ] `gym_id` present, matches the owner's real gym
- [ ] `user_role` = `owner`
- [ ] `plan_tier` present (`FREE`/`BASIC`/`PROFESSIONAL`/`PROFESSIONAL_PLUS`/`PREMIUM`)
- [ ] `display_mode` = `browser`
- [ ] `traffic_type` = `app`
- [ ] Install the PWA to the home screen, reopen, log in → `display_mode` = `standalone`

`plan_tier` resolves from a separate Firestore listener, so it may be absent on
the very first event of a cold session and present from the next one. That is
expected.

- [ ] Log in as a **trainer** or **receptionist** → `user_role` matches the role
- [ ] Log in as a **member** → `user_role` = `member`

---

## Part 3 — Ordering  *(gym_id must be set before the first event)*

- [ ] Hard-refresh a logged-in page (Cmd-Shift-R)
- [ ] In DebugView, open the **first** `page_view` of that session
- [ ] `gym_id` is already attached to it

Events are queued until identity resolves, so this should hold even on a slow
connection. Throttle to Slow 3G and repeat if you want to be sure.

---

## Part 4 — page_view redaction  *(acceptance: dynamic-ID routes redacted)*

Visit each route and read `page_path` in DebugView.

- [ ] `/owner/members` → `/owner/members`
- [ ] `/owner/members/add` → `/owner/members/add` *(literal, must NOT become `:id`)*
- [ ] Open any member profile → `/owner/members/:id` — **no document ID**
- [ ] Edit that member → `/owner/members/:id/edit`
- [ ] `/owner/payments/add` → `/owner/payments/add` *(literal)*
- [ ] Open a payment → `/owner/payments/:id`
- [ ] A member's payment history → `/owner/payments/member/:memberId`
- [ ] Public card `/public/member/<id>` → `/public/member/:id`
- [ ] Gym landing `/gym/<gymId>` → `/gym/:gymId`
- [ ] `/trainer/workout-plans/create` → stays `create`, not `:planId`
- [ ] Check `page_location` on any of the above — also carries the redacted
      path, **not** the browser's real URL

---

## Part 5 — PII absence  *(acceptance: no PII in any param, property or path)*

For every event in Part 6, open its parameter panel and confirm:

- [ ] No member or staff **name** anywhere
- [ ] No **phone number** anywhere
- [ ] No **email** or **address** anywhere
- [ ] No Firestore **document ID** (a 20-char random string) in any param
- [ ] `user_id` (if shown) is the Firebase **Auth UID** — a 28-char string —
      never a member document ID

Cross-check in the browser: DevTools → Network → filter `google-analytics` →
click a collect request → **Payload**. Search it for a member's real name and
phone. Both must be absent.

---

## Part 6 — Client events  *(acceptance: exactly these seven)*

| # | Event | How to trigger | Check in DebugView |
|---|---|---|---|
| 1 | `sign_up` | Register a brand-new gym owner with an unused phone | fires once · `method: phone_otp` |
| 2 | `login` | Log out, log back in via OTP | `method: phone_otp` |
| 3 | `login` | Log in with the 4-digit PIN instead | `method: pin` |
| 4 | `gym_setup_completed` | Complete all 4 onboarding steps | fires once, on reaching the done screen |
| 5 | `member_added` | Add a member to a gym that has none | `is_first_member: true` · `member_count_bucket: 1-25` |
| 6 | `member_added` | Add another member | `is_first_member: false` |
| 7 | `checkout_started` | Owner → Subscription → upgrade a plan | `plan_tier`, `value`, `currency: INR` |
| 8 | `checkout_started` | Payments → Add → Pay with Razorpay | fires **after** validation, not on a mis-click with no member selected |
| 9 | `dues_recorded` | Record a payment as *Pending / partial* | `amount_bucket` only — one of `1-1000`/`1001-3000`/`3001-8000`/`8001-20000`/`20000+`. **No exact rupee amount** |
| 10 | `feature_first_use` | Open a gated feature (Payments/Analytics) for the first time on this gym | `feature_name` · fires **once**; reopen and confirm it does NOT fire again |

- [ ] All ten behaviours confirmed
- [ ] **No other custom events appear.** `page_view` plus GA4's own
      `session_start` / `first_visit` / `user_engagement` are expected

---

## Part 7 — Kiosk exclusion  *(acceptance: kiosk tagged, setUserId not called)*

On a paired kiosk device (or `/kiosk/entry` in a fresh private window):

- [ ] `traffic_type` = `kiosk`
- [ ] `user_role` = `kiosk`
- [ ] `gym_id` still present — the tenant must be known
- [ ] **No `user_id` on any kiosk event.** In DevTools → Network → a collect
      request → Payload, confirm there is no `uid`/`user_id` field
- [ ] Navigating `/kiosk/entry` ↔ `/kiosk/exit` keeps `traffic_type: kiosk`

---

## Part 8 — Server events  *(Measurement Protocol)*

Requires 0.1 completed and functions deployed with `GA_DEBUG=true`.

- [ ] `trial_start` — start a PREMIUM subscription → `plan_tier: PREMIUM`, `trial_days: 30`
- [ ] `purchase` — complete a Razorpay subscription payment (or replay a
      `subscription.charged` webhook from the Razorpay dashboard) →
      `transaction_id`, `value` **in rupees not paise**, `currency: INR`,
      `items[]` with one entry
- [ ] `scan_processed` — scan a member QR at a kiosk → `scan_status: success`,
      `scan_mode: kiosk`
- [ ] `scan_processed` — scan the same member again the same day →
      `scan_status: duplicate`
- [ ] `scan_processed` — staff scan from the phone scanner → `scan_mode: staff`
- [ ] `trial_expired` — hard to trigger naturally; either wait for the 6 AM IST
      cron, or set a test gym's `trial_end_date` to the past and invoke
      `checkTrialExpiry` from the Firebase console
- [ ] All server events show `traffic_type: server` and a `gym_id` user property
- [ ] No `whatsapp_sent` event exists — it was dropped deliberately

**Payload validation without recording:** set `GA_VALIDATE=true`, redeploy, and
trigger an event. `firebase functions:log` will print
`ga4 validation: {"validationMessages":[]}`. An empty array means the payload is
well formed. Set it back to `false` afterwards — in validate mode nothing is
recorded.

---

## Part 9 — Resilience  *(acceptance: app renders with analytics blocked)*

- [ ] Enable uBlock Origin (or Brave shields) and hard-reload the deployed app
- [ ] App renders and behaves **completely normally** — login, member list,
      payments, scanning all work
- [ ] Console shows no uncaught analytics error
- [ ] Open the app in **Safari private mode** → same result
- [ ] Turn the blocker off → events resume

## Part 10 — Webhook safety  *(acceptance: MP failures don't block Razorpay)*

- [ ] Razorpay dashboard → Webhooks → recent deliveries → the subscription
      events still return **2xx**, with no added latency
- [ ] Temporarily set a wrong `GA_API_SECRET`, redeploy, replay a webhook →
      still returns 2xx; `firebase functions:log` shows
      `ga4: measurement protocol send failed` and nothing else breaks
- [ ] Restore the correct secret

## Part 11 — Kill switch  *(your post-review requirement)*

- [ ] Vercel → set `VITE_ANALYTICS_ENABLED=false` → redeploy
- [ ] Use the app → **zero** requests to `google-analytics.com` in Network
- [ ] Nothing new in DebugView
- [ ] App works exactly as before
- [ ] Set it back to `true` and redeploy

---

## Part 12 — Finish up

- [ ] `VITE_GA_DEBUG` = `false` in Vercel, redeployed
- [ ] `GA_DEBUG` = `false` and `GA_VALIDATE` = `false` in `functions/.env`,
      functions redeployed
- [ ] Confirm real (non-debug) events are arriving: GA4 → **Reports** →
      *Realtime*. Events can take up to 24h to appear in standard reports —
      Realtime is the quick check.
