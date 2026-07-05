# WhatsApp Integration — Gymly

Complete map of every WhatsApp-related piece in the codebase: providers, cloud
functions, templates, frontend call sites, owner-dashboard surfaces, data model,
security rules, and indexes.

> **Heads-up — two parallel systems exist.** There is a **server-side** path
> (Cloud Functions → **Cleomitra** API, the real automation engine) and a
> **legacy client-side** path (`src/utils/whatsapp.js` → **Authkey.io**). They
> use different providers, different template formats, and write the same
> `whatsapp_logs` collection in slightly different shapes. See
> [§9 Dual-system caveat](#9-dual-system-caveat--cleanup-notes).

---

## 1. Providers & credentials

| Provider | Where used | Endpoint | Auth | Env / config key |
|---|---|---|---|---|
| **Cleomitra** (primary) | Cloud Functions, `InquiryModal.jsx` | `https://api.cleomitra.app/messages` | `X-API-Key` header | `functions.config().cleomitra.apikey` → `process.env.VITE_CLEOMITRA_API_KEY` → hardcoded fallback `cmk_…388f8`; frontend reads `import.meta.env.VITE_CLEOMITRA_API_KEY` |
| **Authkey.io** (legacy) | `src/utils/whatsapp.js` | `https://messages.authkey.io/api/send_sms` | `authkey` header | `import.meta.env.VITE_AUTHKEY_TOKEN` |

⚠️ **Security note:** the Cleomitra key has a **hardcoded fallback** in
[functions/index.js:10](functions/index.js#L10). It should move to
`functions.config()` / secret manager only and the literal should be rotated &
removed.

---

## 2. Server-side engine — `functions/index.js`

This is the real automation. All sends funnel through two helpers:

### Core helpers
| Function | Lines | Purpose |
|---|---|---|
| `sendWhatsAppFromFunction({phone, template, params, gymId, memberId})` | [9–111](functions/index.js#L9) | Builds Cleomitra template payload, **dedups** (skips if same `member_id`+`message_type`+`date_key` already `sent`/`delivered` today), POSTs to Cleomitra, returns `{success, messageId|error}` |
| `logWhatsApp({...})` | [113–131](functions/index.js#L113) | Appends a doc to `whatsapp_logs` with `date_key`, `status`, `cleomitra_message_id`, `retry_count` |
| `sendAndLog({...})` | [133–167](functions/index.js#L133) | Calls send → on success logs `sent`; on failure enqueues `message_retry_queue` + logs `failed` |
| `formatDate(ts)` | [169–174](functions/index.js#L169) | `D Mon YYYY` formatter for template params |

### Template mappings (Cleomitra template names)
Defined inside `sendWhatsAppFromFunction` at [functions/index.js:36–73](functions/index.js#L36).
The internal `template` key maps to a registered Cleomitra `templateName` +
ordered `body_parameters`:

| Internal key | Cleomitra template | Body params (in order) |
|---|---|---|
| `expiry_7d` / `expiry_3d` / `expiry_1d` | `gymly_expiry_reminder` | memberName, planName, gymName, **days**, expiryDate, gymPhone |
| `payment_due` | `gymly_payment_due` | memberName, amount, planName, gymName, gymPhone |
| `workout_reminder` | `gymly_workout_reminder` | memberName, gymName |
| `welcome_message` | `gymly_welcome` | gymName, memberName, loginUrl |
| `payment_confirmation` | `gymly_payment_confirmation` | memberName, amount, gymName, gymPhone |
| `inactivity_alert` | `gymly_inactivity_alert` | memberName, gymName, gymPhone |
| `new_inquiry_owner` | `gymly_new_inquiry` | gymName, leadName, leadPhone, leadGoal |

### Triggers & schedules that send WhatsApp

| Export | Type | Schedule (IST) | What it sends | Lines |
|---|---|---|---|---|
| `retryFailedMessages` | pubsub | every 5 min | Drains `message_retry_queue`; backoff 5min→30min→2hr; `permanently_failed` after `max_retries` (3) | [177–232](functions/index.js#L177) |
| `dailyExpiryReminders` | pubsub | 09:00 (`30 3 * * *`) | `expiry_7d/3d/1d` to members expiring in 7/3/1 days | [235–289](functions/index.js#L235) |
| `dailyWorkoutReminder` | pubsub | 10:00 (`30 4 * * *`) | `workout_reminder` to active members with a plan & no workout logged today | [292–337](functions/index.js#L292) |
| `pendingPaymentReminder` | pubsub | Mon 10:30 (`0 5 * * 1`) | `payment_due` for `pending`/`partial` payments | [340–379](functions/index.js#L340) |
| `onMemberCreated` | Firestore `onCreate users/{userId}` | — | `welcome_message` when a `member` doc is created | [382–407](functions/index.js#L382) |
| `onPaymentUpdated` | Firestore `onWrite payments/{paymentId}` | — | `payment_confirmation` when status flips to `paid` | [410–440](functions/index.js#L410) |
| `dailyInactivityCheck` | pubsub | 11:00 (`30 5 * * *`) | `inactivity_alert` to members inactive 3–4 days (gyms that opted in) | [443–503](functions/index.js#L443) |
| `cleanOldWhatsappLogs` | pubsub | Sun 03:00 | Deletes `whatsapp_logs` older than 90 days (batch 500) | [cleanup.js:10–34](functions/src/cleanup.js#L10) |

**Per-gym opt-outs** are honored via `gym.messaging_config` checks inside the
triggers (e.g. `expiry_alerts === false`, `welcome_messages === false`,
`payment_confirmations === false`, `inactivity_alerts === true` required to send).

---

## 3. Frontend legacy sender — `src/utils/whatsapp.js`

Self-contained client-side sender hitting **Authkey.io** (plain SMS-style text,
not Cleomitra templates).

- `WA_TEMPLATES` — 8 JS string templates: `welcome`, `expiry_7d/3d/1d`,
  `payment_due`, `payment_receipt`, `renewal_confirm`, `workout_reminder`
  ([whatsapp.js:7–91](src/utils/whatsapp.js#L7)).
- `sendWhatsApp({phone, templateName, params, gymId, memberId})` — renders a
  template, POSTs to Authkey (only if `VITE_AUTHKEY_TOKEN` set; otherwise status
  `pending`), then logs via `createWhatsAppLog` ([whatsapp.js:95–148](src/utils/whatsapp.js#L95)).
- `buildReceiptParams(gym, member, payment)` / `buildWelcomeParams(...)` — param
  builders ([whatsapp.js:152–171](src/utils/whatsapp.js#L152)).

### Call sites
| File | Line | Template | Trigger |
|---|---|---|---|
| `src/pages/Payments/AddPayment.jsx` | [180](src/pages/Payments/AddPayment.jsx#L180) | `payment_receipt` | After recording a new payment |
| `src/pages/Payments/PaymentDetail.jsx` | [78](src/pages/Payments/PaymentDetail.jsx#L78) | `payment_receipt` | Resend receipt from detail view |
| `src/pages/Analytics/Analytics.jsx` | [8](src/pages/Analytics/Analytics.jsx#L8) | (imported) | — |

> Note: `AddMember.jsx` has a `sendWhatsApp` **boolean state** (the "send welcome
> WhatsApp" checkbox, [line 92](src/pages/Members/AddMember.jsx#L92)) — it is
> *not* the util function. It writes `send_welcome_whatsapp` onto the new member
> doc ([line 199](src/pages/Members/AddMember.jsx#L199)); the actual welcome is
> sent server-side by `onMemberCreated`.

---

## 4. Owner-dashboard surfaces (where owners see/control WhatsApp)

| Surface | File | Notes |
|---|---|---|
| **WhatsApp Logs page** (`/owner/whatsapp`) | [src/pages/WhatsApp/WhatsAppLogs.jsx](src/pages/WhatsApp/WhatsAppLogs.jsx) | Realtime log feed; stats (sent today / this month / failed / retrying); filters Welcome/Expiry/Payment/Workout/Inactivity/Failed; grouped by date. Route gated by `SubscriptionGate feature="whatsapp_automation"` |
| **Route definition** | [src/App.jsx:256–264](src/App.jsx#L256) | `/owner/whatsapp` under `OwnerLayout activeTab="settings"` + `SubscriptionGate` |
| **Quick-link tile** | [src/pages/Settings/QuickLinks.jsx:41–48](src/pages/Settings/QuickLinks.jsx#L41) | "WhatsApp logs" tile → `/owner/whatsapp` |
| **Messaging toggles** | [src/pages/Settings/OwnerSettings.jsx](src/pages/Settings/OwnerSettings.jsx) | Settings → "WhatsApp messaging" sheet ([row 667](src/pages/Settings/OwnerSettings.jsx#L667), sheet [955–1031](src/pages/Settings/OwnerSettings.jsx#L955)). Toggles `welcome_messages`, `expiry_alerts`, `payment_confirmations`, `equipment_alerts`, `inactivity_alerts` → saved to `gym.messaging_config` via `updateGym` ([266–271](src/pages/Settings/OwnerSettings.jsx#L266)) |
| **New-inquiry notification** | [src/components/InquiryModal.jsx:5–32](src/components/InquiryModal.jsx#L5) | Public gym landing inquiry form notifies the **owner** via Cleomitra `gymly_new_inquiry` directly from the browser |

---

## 5. Subscription gating

WhatsApp automation is a **PREMIUM-only** feature.

- Feature flags in [src/utils/featureCheck.js:25–31](src/utils/featureCheck.js#L25):
  `whatsapp_automation`, `whatsapp_welcome_messages`, `whatsapp_expiry_alerts`,
  `whatsapp_payment_confirmations`, `whatsapp_payment_reminders`,
  `whatsapp_inactivity_alerts`, `whatsapp_milestone_celebrations` → all `['PREMIUM']`.
- [src/components/SubscriptionGate.jsx:59](src/components/SubscriptionGate.jsx#L59)
  lists the perks; wraps the `/owner/whatsapp` route.

---

## 6. Firestore data model

### `whatsapp_logs/{logId}`
Written by both `logWhatsApp` (server) and `createWhatsAppLog` (client).
Server fields: `gym_id`, `member_id`, `phone`, `message_type`, `status`,
`error_reason`, `cleomitra_message_id`, `retry_count`, `date_key` (`YYYY-MM-DD`,
used for dedup), `sent_at` (serverTimestamp), `message_preview`.
Client adds `authkey_message_id` instead of `cleomitra_message_id`.

Statuses surfaced in UI: `sent`, `delivered`, `failed`, `permanently_failed`,
`pending`, `retry`.

### `message_retry_queue/{docId}`
`phone`, `template`, `params`, `gym_id`, `member_id`, `retry_count`,
`max_retries` (3), `next_retry_at`, `status` (`pending`/`sent`/`permanently_failed`),
`error`, `created_at`.

### `gym.messaging_config` (on `gyms/{gymId}`)
`{ welcome_messages, expiry_alerts, payment_confirmations, equipment_alerts,
inactivity_alerts }` — booleans; `inactivity_alerts` defaults **false**, the rest **true**.

---

## 7. Security rules — [firestore.rules](firestore.rules)

Both collections are **gym-isolated (H-4)**:

- `whatsapp_logs/{logId}` ([115–125](firestore.rules#L115)) — read/create/update/delete
  only when `request.auth.token.gym_id == resource.data.gym_id`.
- `message_retry_queue/{docId}` ([128–137](firestore.rules#L128)) — same isolation.

> Server writes use the Admin SDK and bypass rules; client writes
> (`createWhatsAppLog`) must satisfy the `gym_id` match.

---

## 8. Indexes — [firestore.indexes.json](firestore.indexes.json)

- Composite: `whatsapp_logs` on `gym_id ASC, sent_at DESC` ([144–151](firestore.indexes.json#L144)) — powers the realtime log feed query in `getWhatsAppLogsRealtime`.
- Field overrides: `whatsapp_logs.message_preview` and `whatsapp_logs.error_reason` set to no single-field indexes ([296–297](firestore.indexes.json#L296)).

The feed query lives in
[src/firebase/firestore-payments_real.js:290–303](src/firebase/firestore-payments_real.js#L290)
(`where gym_id == … orderBy sent_at desc limit 100`), proxied through
[firestore-payments.js:35–36](src/firebase/firestore-payments.js#L35).

---

## 9. Dual-system caveat & cleanup notes

1. **Two providers, two template formats.** Receipts sent from the payment pages
   go through **Authkey** (`payment_receipt`, free text); the scheduled/triggered
   automation goes through **Cleomitra** (approved WhatsApp templates). A member
   can therefore receive a `payment_confirmation` (Cleomitra, via
   `onPaymentUpdated`) *and* a `payment_receipt` (Authkey, via the AddPayment
   page) for the same payment. Worth consolidating onto Cleomitra.
2. **Hardcoded API key** fallback in [functions/index.js:10](functions/index.js#L10)
   — rotate & remove.
3. **Client-side Cleomitra key** is exposed in the bundle via
   `VITE_CLEOMITRA_API_KEY` (used by `InquiryModal.jsx`). Any `VITE_*` var ships
   to the browser; consider moving the inquiry notification to a callable function.
4. **`equipment_alerts`** is a `messaging_config` toggle in the UI but has no
   corresponding Cleomitra template/trigger yet — currently a no-op.
5. **Template-key mismatch:** the UI labels (`WhatsAppLogs.jsx` `TYPE_LABELS`)
   include both `welcome` (Authkey) and `welcome_message` (Cleomitra),
   `payment_receipt` (Authkey) and `payment_confirmation` (Cleomitra) — because
   both systems write logs.

---

## 10. Quick reference — file map

```
functions/index.js              Cleomitra engine: send/log/retry helpers,
                                template mappings, 7 triggers+schedules
functions/src/cleanup.js        cleanOldWhatsappLogs (90-day purge)
src/utils/whatsapp.js           Legacy Authkey sender + 8 text templates
src/pages/WhatsApp/WhatsAppLogs.jsx   Owner log viewer (/owner/whatsapp)
src/pages/Settings/OwnerSettings.jsx  messaging_config toggles UI
src/pages/Settings/QuickLinks.jsx     Tile → /owner/whatsapp
src/components/InquiryModal.jsx       Owner new-inquiry Cleomitra notify
src/pages/Payments/AddPayment.jsx     Authkey payment_receipt on add
src/pages/Payments/PaymentDetail.jsx  Authkey payment_receipt resend
src/utils/featureCheck.js             PREMIUM gating flags
src/components/SubscriptionGate.jsx   Gate around /owner/whatsapp
src/firebase/firestore-payments_real.js  create/getRealtime WA log helpers
firestore.rules                  whatsapp_logs + message_retry_queue isolation
firestore.indexes.json           whatsapp_logs composite index
```
