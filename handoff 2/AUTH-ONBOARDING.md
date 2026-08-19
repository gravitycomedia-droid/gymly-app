# Auth & onboarding — page spec and integration

Source: `GymloopAuth.dc.html` (all screens, presentational) and
`Gymloop Auth & Onboarding.dc.html` (prototype state + device frames).
Same split as the owner app: **port `GymloopAuth`, throw away the frame file.**

Everything is phone-first: an Indian gym owner signs in with a mobile number and a
WhatsApp code, or a 4-digit PIN. No email/password anywhere.

---

## 1. Screens

| Screen id | Route suggestion | Purpose |
|---|---|---|
| `login` | `/signin` | Mobile number → send code. PIN alternative. Create-gym card. |
| `otp` | `/signin/verify` | 6-digit code, resend timer, change-number |
| `pin` | `/signin/pin` | 4-digit PIN, forgot-PIN falls back to code |
| `signup` | `/signup` | Owner name, gym name, mobile, city → verify |
| `onb` (step 1–4) | `/setup/step-1…4` | Gym details, first plan, team invites, members |
| `done` | `/setup/done` | Recap of done vs. skipped → dashboard |

### login
Number field with fixed `+91` affix, numeric-only, max 10 digits. Primary
**Send code**; validation message under the field when length ≠ 10. `OR` divider,
then **Sign in with PIN instead**. Bottom card sells signup. Copy states the code
arrives on WhatsApp with SMS fallback.

### otp
Back link reads **Change number** (not "Back") — it returns to `login` or `signup`
depending on which flow issued the code. Six 1-char inputs; a filled box switches
border to `#6C63C7` and background to `#F7F6FD`. Resend is disabled while the
30-second counter runs and its label swaps from "You can ask again in Ns" to
"Didn't get the code?". Primary label depends on flow: *Verify and sign in* vs.
*Verify and start setup*.

### pin
Masked 4-digit boxes (60px tall), same fill states. Header names the number being
signed in as. "Forgot PIN?" triggers the OTP flow. Same PIN as kiosk-mode unlock —
keep that true in the backend.

### signup
Four fields only (name, gym name, mobile, city select). Free-trial + terms line
under the primary. Footer links back to sign in.

### onb — 4 steps, all skippable
Shared chrome: "Step N of 4", `N of 4 done` counter, progress bar, and (desktop
only) clickable step chips showing ✓ for completed steps. Footer is
**Save and continue** + **Skip for now**, with **Back** from step 2 on, and a
standing promise that skipped steps wait on the dashboard checklist.

1. **Gym details** — gym name, address (noted as "shown on receipts"), opens/closes, optional logo upload slot.
2. **First plan** — three priced presets as radio cards (Monthly ₹1,200 / Quarterly ₹3,200 / Annual ₹11,000) plus a custom name+price block. Copy warns no member can be enrolled without a plan.
3. **Your team** — pre-seeded role rows (Reception desk, Trainer) with an Invite/Invited toggle, plus "Invite someone else". Copy states the permission model: trainers see members not money; reception can collect payments.
4. **Members** — three choice tiles: import from Excel/Sheets, add first member manually, do it later.

### done
Green check mark, `<gym name> is ready`, then a recap list marking each of the four
steps **Done** or **Later**. Primary **Go to dashboard**, secondary
**Finish the remaining steps** (jumps to step 1).

---

## 2. Prop contract

```js
auth = {
  screen: 'login'|'otp'|'pin'|'signup'|'onb'|'done',
  flow: 'signin'|'signup',        // decides otp back-target + primary label
  step: 1..4,
  phone: '9848012345',            // digits only, no +91
  otp: ['','','','','',''], pin: ['','','',''], otpLeft: 30,
  ownerName, gymName, city, address, openTime, closeTime,
  planPick: 0, planName, planPrice,
  importPick: 'import'|'manual'|'later',
  invites: [{ name, sub, initials, color, sent }],
  doneSteps: { 1:true, 2:false, … },
  error: '',  toast: ''
}

actions = {
  set(key, value),            // every text/select field
  go(screen), goStep(n), back(),
  setOtp(i, digit), setPin(i, digit),
  sendOtp(again),             // validates 10 digits, starts 30s counter
  verify(), finishSignIn(),   // -> onb step 1 (signup) or dashboard (signin)
  next(), skip(),             // onboarding footer
  pickPlan(i), toggleInvite(i), pickImport(key),
  finish(), help()
}
```

Only `mode` (`'desktop'|'mobile'`) and these two objects are read. Nothing touches
storage or network — swap the prototype's state class for your auth service.

---

## 3. Wiring to a real backend

| UI action | Backend |
|---|---|
| `sendOtp` | `POST /auth/otp` `{ phone }` — rate-limit per number, 30s resend lock (the UI already enforces the visible half) |
| `verify` | `POST /auth/otp/verify` `{ phone, code }` → session + `isNewAccount` flag. `isNewAccount` decides `onb` vs. dashboard, not the client's `flow` field |
| `finishSignIn` (PIN) | `POST /auth/pin` `{ phone, pin }` — throttle after 5 failures, then force OTP |
| signup submit | `POST /gyms` `{ ownerName, gymName, phone, city }` after verification |
| step 1 save | `PATCH /gyms/:id` — same fields as Settings → Gym Profile |
| step 2 save | `POST /plans` — a preset is just a pre-filled body |
| step 3 invite | `POST /staff/invite` `{ role, phone }` — sends the WhatsApp link to set a PIN |
| step 4 import | `POST /members/import` (file) or route to the Add Member wizard |
| `next` / `skip` | `PATCH /gyms/:id/setup` `{ step, status: 'done'|'skipped' }` — this is the same record the dashboard setup checklist reads |

The onboarding steps and the dashboard's setup checklist **must share one source of
truth**, otherwise skipping a step silently loses the reminder.

### Guardrails to add in production
- Server-side phone validation and OTP expiry (5 min), single-use codes.
- Distinguish "number not registered" from "wrong code" only on the code screen; never reveal on the number screen whether a gym exists.
- Staff sign in through the exact same screens — the session's role drives the app's `role` prop.
- Store phones canonically (`+91` + 10 digits) even though the UI shows them bare.

---

## 4. Design notes to keep

- All controls ≥ 44px; primary buttons 52px, full width; number/OTP inputs 58–60px.
- `+91` sits in a `#F5F6FA` affix inside the same rounded border as the input.
- Filled-input state: border `#6C63C7`, background `#F7F6FD`. Error text `#A62C22`.
- Desktop is a two-column split: fixed 430px `#332D6E` brand panel (headline, sub and three proof bullets that change per screen) + white form column, `max-width:460px`, centred. Mobile drops the panel and shows a compact logo header with a "Need help?" link.
- Toast is a dark pill, bottom-centre, 2.2s.
