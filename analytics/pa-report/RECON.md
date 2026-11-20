# RECON — Gymloop (repo: gymly-app) · schema only, read from source code

Method: static read of `src/`, `functions/`, `firestore.rules`. No Firestore connection was made and no
document data was read. Field names below come from write sites in code (file:line cited).

## Collections (name → key fields → types)

| Collection | Key fields (type) | Source |
|---|---|---|
| `users` (owners: doc id = Auth uid; members/staff: `addDoc` auto-id) | `role` (str: owner/manager/trainer/receptionist/member), `gym_id` (str), `plan_id` (str), `plan_name` (str), `start_date` (Timestamp), `subscription_expiry` (Timestamp), `payment_status` (str: paid/pending/partial), `memberId`, `memberNumber` (str), `qr_attendance_enabled` (bool), `attendance_count` (int), `last_seen` (Timestamp\|null), `renewal_history` (array<map>), `current_streak`, `longest_streak` (int), `last_checkin_date` (str), `frozen` (bool), `is_deleted` (bool), `gender`, `goal` (str), `created_by` (str) — PII fields exist (`name`, `phone`, `date_of_birth`, `medical_notes`) and are **excluded** from synthetic data | `src/owner/screens/Members/AddMember.jsx:111-123` |
| `gyms` | `name`, `owner_id` (str), `city` (str enum: Hyderabad, Bengaluru, Vijayawada, Warangal, Mysuru, Other), `gym_type` (str), `working_hours` (map), `settings.plans` (array<map>, **embedded, no /plans collection**), `setup_status` (map step→done/skipped), `subscription_valid_until` (Timestamp, coupon entitlement) | `src/pages/Signup/Signup.jsx:92-101`, `src/pages/Onboarding/Onboarding.jsx:94,164` |
| `gyms/{gymId}/stats/summary` | `total_members` (int) | `AddMember.jsx:190` |
| `attendance_logs` | `gym_id`, `member_id` (str), `plan_name` (str), `subscription_expiry` (Timestamp), `date` (str YYYY-MM-DD), `entry_time` (Timestamp), `exit_time` (Timestamp\|null), `scanned_by` (str: e.g. `qr_staff_verified`, `manual_verified`), `scan_mode` (str: `phone`/`kiosk`/`staff`/`manual`), `scanned_by_uid` | `functions/src/processScan.js:142-155, 411-444` |
| `attendance_sessions`, `kiosk_devices` | kiosk QR session / paired device (`device_secret`) | `src/firebase/firestore-kiosk.js` |
| `gym_settings/{gymId}` | `attendance_mode` (str: `qr` \| `biometric`) | `functions/src/attendanceMode.js:56` |
| `payments` (member fees) | `gym_id`, `member_id`, `plan_id`, `plan_name`, `amount`, `discount`, `final_amount`, `paid_amount`, `pending_amount` (₹ numbers), `method` (str), `status` (str), `payment_date`, `due_date`, `membership_start`, `membership_end` (Timestamp), `invoice_number` | `AddMember.jsx:156-165` |
| `subscriptions/{gymId}` (Gymloop SaaS plan of the gym) | `plan` (FREE/BASIC/PROFESSIONAL/PROFESSIONAL_PLUS/PREMIUM/PREMIUM_PLUS), `status` (active/past_due/halted/cancelled), `is_trial` (bool), `trial_started_at`, `trial_end_date` (Timestamp), `amount_monthly` (paise int), `razorpay_subscription_id`, `razorpay_customer_id`, `next_billing_date`, `failed_payment_count` (int) | `functions/index.js:94-150, 197-245` |
| `billing/{gymId}/payments` | `razorpay_subscription_id`, `amount` (paise), `plan`, `status` (`success` if captured else Razorpay status) | `functions/index.js:39-51` |
| Others (not used by pipeline) | `leads`, `invoices`, `whatsapp_logs`, `message_logs`, `workout_*`, `bio_*`, `audit_logs`, `deleted_members`, `coupons`, `used_coupons`, `gym_summaries`, `platform_stats` | `firestore.rules` |

## Owner journey (routes/screens in order: landing → signup → gym setup → plans → add member → first check-in → subscription checkout)

| Prompt step | Route / screen | Existing GA4 event |
|---|---|---|
| landing_visit | `/` → `AutoRedirect`, `/select-role` (marketing site gymly.online) | `page_view` (manual) |
| signup_started / signup_completed | `/owner/register` → `pages/Signup/Signup.jsx` (OTP → `createGym` → PIN) | `sign_up` (method: phone_otp) |
| gym_profile_completed | `/owner/setup` → `pages/Onboarding/Onboarding.jsx` step 1 (gym details) | — (step-level), `gym_setup_completed` fires after step 4 |
| first_plan_created | Onboarding step 2 → writes `gyms.settings.plans[]`; later `/owner/plans/add` | — |
| (team) | Onboarding step 3 (staff, skippable) | — |
| first_member_added | Onboarding step 4 / `/owner/members/add` (**one-by-one form**, no bulk import) | `member_added` (`is_first_member`, `member_count_bucket`) |
| first_checkin_recorded | `/scan`, `/tablet`, `/kiosk/entry` → callable `processScan` | server `scan_processed` |
| trial_started | `/owner/subscription` → `createSubscription` (PREMIUM = 30-day trial) | server `trial_start` |
| checkout_viewed | `/owner/subscription` upgrade modal | `checkout_started` (`plan_tier`, `value`) |
| subscription_paid | Razorpay webhook `subscription.activated` / `subscription.charged` | server `purchase` |

## Member lifecycle fields (join date, plan, plan duration, expiry, renewal, status, attendance source: QR/kiosk)

- Join date: `users.start_date`
- Plan: `users.plan_id`, `users.plan_name`; plan definition in `gyms.settings.plans[]` with `name`, `price`, `basePrice`, `discount`, `finalPrice`, `duration_days` (`owner/screens/Plans/AddPlan.jsx:74`). Duration in months = `round(duration_days/30)`.
- Expiry: `users.subscription_expiry`
- Renewal: `users.renewal_history[]` entries `{type, renewed_at, plan_id, days, old_expiry, new_expiry, ...}` (`functions/src/extendMembership.js:72-82`, `components/RenewModal.jsx:60-64`); a new `payments` row per renewal.
- Status: derived (no stored "churned" field) — active if `subscription_expiry` ≥ today; `payment_status`, `frozen`, `is_deleted`.
- Attendance source: `attendance_logs.scan_mode` (`phone` = member QR scanned by staff, `kiosk`, `staff`, `manual`); gym-level `gym_settings.attendance_mode` = `qr` | `biometric`. Synthetic data will use `scan_mode ∈ {phone, kiosk}` and expose a derived `attendance_source ∈ {qr, kiosk}` as the prompt asks.
- Reminders: `whatsapp_logs` / `message_logs` collections exist, but per brief, renewal reminders are treated as not live in baseline.

## Payment/subscription fields (Razorpay order/payment status fields, plan price fields)

- Client checkout: `src/utils/razorpay.js` returns `razorpay_payment_id`, `razorpay_order_id`, `razorpay_signature`, `method:'razorpay'`; dismiss → `onFailure('dismissed')`.
- SaaS plan prices (₹/month): FREE 0, BASIC 199, PROFESSIONAL 499, PROFESSIONAL_PLUS 799, PREMIUM 999 (30-day trial), PREMIUM_PLUS 1499 (manual only) — `owner/screens/Subscription.jsx:11-17`, `functions/index.js:81-90` (amounts in paise).
- Status fields: `subscriptions.status` (active/past_due/halted/cancelled), `subscriptions.failed_payment_count`, `billing/{gymId}/payments.status` (`success`/failed…). Member fees: `payments.status`, `users.payment_status` (paid/pending).

## checkout_variant — where it is read, what each variant renders, what event marks "checkout completed"

**⚠ NOT FOUND.** There is no `checkout_variant` key and no Firebase Remote Config usage anywhere in `src/` or `functions/` (`firebase/remote-config` is not imported; it only appears transitively in `functions/package-lock.json`). There is one checkout UI (the upgrade modal in `owner/screens/Subscription.jsx`), no variant rendering.
- "Checkout viewed" = upgrade modal opened / `checkout_started` event.
- "Checkout completed" = Razorpay webhook `subscription.activated|charged` → server `purchase` event, `billing/{gymId}/payments.status == 'success'`.
- Guardrail source: `subscription.payment_failed` → `subscriptions.status='past_due'`, `failed_payment_count++`.
- Proposal: simulate the test under the flag name the brief specifies (`checkout_variant`: `control` / `new_design`) and state in the report that it is a **proposed** Remote Config flag, not a live one.

## Existing analytics/logging events (if any: Firebase Analytics logEvent calls, etc.)

GA4 via Firebase Analytics, wrapper `src/lib/analytics.js` (PII denylist, path redaction, kill switch `VITE_ANALYTICS_ENABLED`). See `ANALYTICS.md`, `ANALYTICS-REPORT.md`.
- Client: `page_view`, `login` (phone_otp/pin), `sign_up`, `gym_setup_completed`, `member_added`, `feature_first_use` (`feature_name`), `checkout_started` (`plan_tier`, `value`), `dues_recorded` (`amount_bucket`)
- Server (Measurement Protocol): `trial_start`, `trial_expired`, `purchase`, `scan_processed`
- User properties: `gym_id`, `user_role`, `plan_tier`, `traffic_type`
- Audit trail: `audit_logs/{gymId}/events`, `admin_logs` (server-only).
