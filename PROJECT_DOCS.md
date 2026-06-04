# Gymly App — Full Project Documentation

> **Last Updated:** June 2026  
> **Live URL:** https://gymly.online  
> **Firebase Project:** `gymly-app-06`  
> **Stack:** React 19 + Vite 5 + Firebase 12 + Tailwind CSS 3 + Framer Motion

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack & Dependencies](#2-tech-stack--dependencies)
3. [Project Structure](#3-project-structure)
4. [Environment Variables](#4-environment-variables)
5. [Authentication & Roles](#5-authentication--roles)
6. [Routing Architecture](#6-routing-architecture)
7. [Firebase Architecture](#7-firebase-architecture)
8. [Firestore Data Models](#8-firestore-data-models)
9. [Firestore Security Rules](#9-firestore-security-rules)
10. [Frontend Pages & Components](#10-frontend-pages--components)
11. [State Management](#11-state-management)
12. [Utility Services](#12-utility-services)
13. [Subscription & Coupon System](#13-subscription--coupon-system)
14. [Mock / Demo Mode](#14-mock--demo-mode)
15. [PWA Configuration](#15-pwa-configuration)
16. [Deployment](#16-deployment)
17. [Known Issues & Notes](#17-known-issues--notes)

---

## 1. Project Overview

**Gymly** is a multi-tenant SaaS Gym Management Platform. Each gym owner registers, sets up their gym, and manages:
- Members (add, edit, delete, renew memberships)
- Staff (manager, trainer, receptionist roles)
- Payments & Invoicing
- Attendance (QR-based, Kiosk mode, tablet mode)
- Workout Plans & Assignment
- Analytics & Revenue Reports
- WhatsApp automation logs
- Digital Membership Cards

Members get their own app experience: home dashboard, workout tracker, progress logs, digital membership card, payment history.

There is also a **Super Admin** portal for managing all gyms on the platform.

---

## 2. Tech Stack & Dependencies

### Core
| Package | Version | Purpose |
|---|---|---|
| `react` | ^19.2.4 | UI framework |
| `react-dom` | ^19.2.4 | DOM rendering |
| `react-router-dom` | ^7.14.0 | Client-side routing |
| `vite` | ^5.4.0 | Build tool (Rollup bundler) |
| `@vitejs/plugin-react` | ^4.3.1 | Vite React plugin |

### Firebase
| Package | Version | Purpose |
|---|---|---|
| `firebase` | ^12.11.0 | Auth, Firestore, Storage |

> ⚠️ **Important:** Do NOT upgrade to Vite 8+ with Firebase 12. Vite 8 uses `rolldown` which has breaking ESM export incompatibilities with `@firebase/util`. Stick with Vite 5.

### UI & Animation
| Package | Version | Purpose |
|---|---|---|
| `framer-motion` | ^12.40.0 | Page transitions, animations |
| `lucide-react` | ^1.17.0 | Icon library |
| `tailwindcss` | ^3.4.19 | Utility CSS |
| `autoprefixer` | ^10.5.0 | CSS vendor prefixes |

### Charts & Data Viz
| Package | Version | Purpose |
|---|---|---|
| `chart.js` | ^4.5.1 | Chart rendering engine |
| `react-chartjs-2` | ^5.3.1 | React wrapper for Chart.js |
| `recharts` | ^3.8.1 | Alternative chart library |

### QR & PDF
| Package | Version | Purpose |
|---|---|---|
| `qrcode.react` | ^4.2.0 | Generate QR codes |
| `react-qr-code` | ^2.0.18 | QR code component |
| `jsqr` | ^1.4.0 | QR code scanner (decode from camera) |
| `html2canvas` | ^1.4.1 | Screenshot DOM elements (membership card download) |
| `jspdf` | ^4.2.1 | PDF generation |

### PWA
| Package | Version | Purpose |
|---|---|---|
| `vite-plugin-pwa` | ^1.2.0 | Service worker & manifest generation |

---

## 3. Project Structure

```
GYMLY APP/
├── src/
│   ├── App.jsx                  # Root component with all routes
│   ├── main.jsx                 # Entry point
│   ├── index.css                # Global styles, design tokens, Tailwind
│   ├── assets/                  # Static images, icons
│   ├── components/              # Shared reusable components
│   │   ├── layouts/             # OwnerLayout, MemberLayout
│   │   ├── AccessRestricted.jsx
│   │   ├── AutoRedirect.jsx     # Redirects based on auth state
│   │   ├── BottomNav.jsx        # Mobile bottom navigation
│   │   ├── DeleteConfirmModal.jsx
│   │   ├── ExerciseCard.jsx
│   │   ├── FeatureGate.jsx      # Hides UI behind plan features
│   │   ├── InquiryModal.jsx     # Lead capture modal
│   │   ├── MemberCard.jsx       # Membership card component
│   │   ├── PageTransition.jsx
│   │   ├── ProtectedRoute.jsx   # Route auth guard
│   │   ├── PWAInstallPrompt.jsx
│   │   ├── RenewModal.jsx       # Membership renewal flow
│   │   ├── SubscriptionGate.jsx # Feature-level gate for paid features
│   │   └── WorkoutGate.jsx
│   ├── context/
│   │   ├── AuthContext.jsx      # Global auth state (Firebase + mock)
│   │   └── ToastContext.jsx     # Toast notification system
│   ├── data/
│   │   ├── exerciseLibrary.js   # Flat list of exercise names
│   │   ├── gymlyCodesData.js    # Subscription coupon codes & lookup
│   │   ├── gymlyExerciseDb.js   # Full exercise database with muscles/instructions
│   │   ├── predefinedPlans.js   # Default membership plan templates
│   │   └── seedPlans.js         # Seed data for workout plans
│   ├── firebase/
│   │   ├── config.js            # Firebase SDK initialization
│   │   ├── auth.js              # Auth helpers (login, logout, OTP)
│   │   ├── firestore.js         # Proxy wrapper for all member/gym operations
│   │   ├── firestore_real.js    # Real Firestore implementations
│   │   ├── firestore-payments.js      # Proxy for payment operations
│   │   ├── firestore-payments_real.js # Real payment Firestore implementations
│   │   ├── firestore-kiosk.js   # Kiosk device management
│   │   ├── mockFirestore.js     # In-memory mock for demo mode
│   │   └── storage.js           # Firebase Storage helpers (photo upload)
│   ├── hooks/
│   │   ├── useKioskAuth.js
│   │   ├── useKioskCamera.js
│   │   ├── useLiveOccupancy.js
│   │   └── useSubscription.js
│   ├── pages/
│   │   ├── Admin/               # Super-admin portal
│   │   ├── Agreement/           # Member digital agreement signing
│   │   ├── Analytics/           # Revenue & attendance analytics
│   │   ├── Attendance/          # Attendance logs, kiosk device management
│   │   ├── GymRegistration/     # New gym owner onboarding
│   │   ├── Kiosk/               # EntryKiosk, ExitKiosk (no-auth tablet pages)
│   │   ├── Login/               # OwnerLogin (email/pass), MemberLogin (OTP)
│   │   ├── MemberCard/          # Member's digital card page
│   │   ├── MemberHome/          # Member dashboard
│   │   ├── MemberPayments/      # Member's own payment history
│   │   ├── MemberProfile/       # Member's own profile (editable)
│   │   ├── MemberProgress/      # Member body progress tracking
│   │   ├── MemberWorkout/       # Member workout execution screen
│   │   ├── Members/             # Owner's member management (list, add, edit, profile)
│   │   ├── MembershipPlans/     # Owner's plan management (list, add/edit)
│   │   ├── Notifications/       # Member notification center
│   │   ├── OwnerDashboard/      # Owner home dashboard + leads
│   │   ├── Payments/            # Owner payment list, add, detail
│   │   ├── PublicCard/          # Public member card view (no auth)
│   │   ├── RoleDashboards/      # Trainer and Receptionist dashboards
│   │   ├── RoleSelection/       # Landing page to choose Owner/Member
│   │   ├── Scanner/             # QR Scanner, Tablet mode
│   │   ├── Settings/            # Owner settings, equipment, numbering, card editor
│   │   ├── SetupChecklist/      # Post-registration gym setup guide
│   │   ├── Staff/               # Staff list & add
│   │   ├── Subscription/        # Subscription plans page, gym landing, owner subscription
│   │   ├── Trainer/             # Workout plan builder & assignment
│   │   └── WhatsApp/            # WhatsApp log viewer
│   └── utils/
│       ├── calorieEngine.js     # Calorie burn calculation
│       ├── featureCheck.js      # Subscription feature flags
│       ├── helpers.js           # Date formatting, initials, avatar colors
│       ├── invoiceGenerator.js  # PDF invoice generation
│       ├── kioskSounds.js       # Audio feedback for kiosk
│       ├── numberingService.js  # Auto member numbering system
│       ├── permissions.js       # RBAC permission definitions
│       ├── progressiveOverload.js # Workout progression logic
│       ├── razorpay.js          # Razorpay payment gateway integration
│       ├── subscriptionService.js # Subscription status checks
│       └── whatsapp.js          # WhatsApp API integration
├── firestore.rules              # Firestore security rules
├── firestore.indexes.json       # Firestore composite indexes
├── firebase.json                # Firebase hosting + functions config
├── storage.rules                # Firebase Storage security rules
├── vite.config.js               # Vite + PWA plugin config
├── tailwind.config.js           # Tailwind custom tokens
├── package.json
├── GYMLY_COUPONS.txt            # Subscription coupon codes (admin use only)
└── .env                         # Firebase env vars (never commit)
```

---

## 4. Environment Variables

All vars are prefixed `VITE_` (Vite requirement). Never hardcode — always read from `process.env` / `import.meta.env`.

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=gymly-app-06
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Set these in Vercel dashboard under Project → Settings → Environment Variables.

---

## 5. Authentication & Roles

### Auth Methods
- **Owners/Staff:** Email + Password (Firebase Auth)
- **Members:** Phone OTP (Firebase Phone Auth)

### User Roles
All users have a `role` field in their `/users/{uid}` Firestore document:

| Role | Home Route | Description |
|---|---|---|
| `owner` | `/owner/dashboard` | Full gym management access |
| `manager` | `/manager/members` | Members + payments, no billing |
| `trainer` | `/trainer/members` | Only assigned members + workouts |
| `receptionist` | `/receptionist` | Add members + mark attendance |
| `member` | `/member/home` | Own profile, workout, card |
| `admin` | `/admin` | Super-admin, all gyms |

### Permission System (`src/utils/permissions.js`)

```js
ROLE_PERMISSIONS = {
  owner: ['all', 'add_member', 'edit_member', 'delete_member', 'view_members', ...],
  manager: ['add_member', 'edit_member', 'view_members', 'view_payments', ...],
  trainer: ['view_assigned_members', 'assign_workout'],
  receptionist: ['add_member', 'view_members', 'mark_attendance'],
  member: ['view_own_profile', 'view_own_workout'],
}
```

`can(userDoc, 'action')` — checks if user has permission. Owner with `'all'` bypasses all checks.

### AuthContext (`src/context/AuthContext.jsx`)
- Subscribes to `onAuthStateChanged`
- Sets up `onSnapshot` listener on `/users/{uid}` for real-time profile updates
- Exposes: `user`, `userDoc`, `loading`, `refreshUserDoc`, `isAuthenticated`
- **Mock Mode:** If `localStorage.getItem('mockRole')` is set, bypasses Firebase entirely and uses hardcoded demo data

---

## 6. Routing Architecture

All routes are in `src/App.jsx`. Key patterns:

### Public Routes
```
/                       → AutoRedirect (to dashboard or login)
/select-role            → RoleSelection
/owner/login            → OwnerLogin
/member/login           → MemberLogin (OTP)
/public/member/:id      → PublicCardScreen (no auth)
/gym/:gymId             → GymLandingPage
/gym/:gymId/plans       → SubscriptionPlans
```

### Protected Owner Routes
All wrapped in `<ProtectedRoute>` + `<OwnerLayout>`:
```
/owner/dashboard
/owner/members          → requires 'view_members'
/owner/members/add      → requires 'add_member'
/owner/members/:id      → requires 'view_members'
/owner/members/:id/edit → requires 'edit_member'
/owner/staff
/owner/payments         → wrapped in <SubscriptionGate feature="payments">
/owner/analytics        → wrapped in <SubscriptionGate feature="analytics">
/owner/attendance       → wrapped in <SubscriptionGate feature="attendance_heatmap">
/owner/whatsapp         → wrapped in <SubscriptionGate feature="whatsapp_automation">
/owner/plans            → membership plan management
/owner/settings
/owner/kiosk-devices    → wrapped in <SubscriptionGate feature="kiosk_attendance">
/owner/subscription
```

### Protected Member Routes
All wrapped in `<ProtectedRoute allowedRoles={['member']}>` + `<MemberLayout>`:
```
/member/home
/member/workout         → wrapped in <WorkoutGate>
/member/progress        → wrapped in <WorkoutGate>
/member/profile
/member/card
/member/payments
```

### Kiosk Routes (no auth)
```
/kiosk/entry            → EntryKiosk (tablet-facing)
/kiosk/exit             → ExitKiosk
```

### Route Guards
- `ProtectedRoute` — checks `isAuthenticated`, optionally `requiredPermission` and `allowedRoles`
- `SubscriptionGate` — checks if gym's subscription is active OR if coupon bypass is active
- `WorkoutGate` — checks if member has an assigned workout plan

---

## 7. Firebase Architecture

### Proxy Pattern (CRITICAL)

All Firestore operations go through **proxy wrapper files**:

```
src/firebase/firestore.js         ← import this in components
src/firebase/firestore-payments.js ← import this for payments
```

These proxy files check `localStorage.getItem('mockRole')` and route calls to either:
- `firestore_real.js` → actual Firebase/Firestore
- `mockFirestore.js` → in-memory demo data

**Never import `firestore_real.js` directly in components.**

### Firebase Services Used
- **Firebase Auth** — email/password + phone OTP
- **Cloud Firestore** — all data (no local persistence, uses `memoryLocalCache`)
- **Firebase Storage** — member profile photos, gym logos
- **Firebase Hosting** — (configured but Vercel is primary deploy target)
- **Cloud Functions** — WhatsApp automation, subscription logic (in `/functions`)

---

## 8. Firestore Data Models

### `/users/{uid}`
```js
{
  id: string,             // Firebase Auth UID
  name: string,
  email: string,          // owners/staff
  phone: string,          // all users
  role: 'owner' | 'manager' | 'trainer' | 'receptionist' | 'member',
  gym_id: string,         // which gym this user belongs to
  permissions: string[],  // from ROLE_PERMISSIONS
  profile_photo: string,  // Storage URL or base64
  // Member-specific:
  plan_id: string,
  plan_name: string,
  subscription_expiry: Timestamp,
  enrollment_id: string,  // e.g. "JN01-30-001"
  memberNumber: string,   // e.g. "ITF-JN26-01"
  memberId: string,       // legacy/alias
  agreement_status: 'pending' | 'agreed',
  agreement_url: string,
  attendance_count: number,
  last_seen: Timestamp,
  workout_plan_id: string,
  assigned_trainer_id: string,
  // Owner-specific:
  gym_id: string,
  created_at: Timestamp,
}
```

### `/gyms/{gymId}`
```js
{
  id: string,
  name: string,
  owner_id: string,       // Firebase Auth UID of owner
  phone: string,
  email: string,
  address: string,
  city: string,
  description: string,
  logo_url: string,
  photos: string[],       // gallery
  equipment: [{ id, name, photo, muscles }],
  settings: {
    plans: [              // membership plans (stored embedded in gym doc)
      {
        id: string,
        name: string,
        category: 'Monthly'|'Quarterly'|'Six Months'|'Nine Months'|'Yearly'|'Custom',
        customDays: number | null,
        duration_days: number,
        basePrice: number,
        discount: number,
        finalPrice: number,
        price: number,    // legacy alias for finalPrice
        description: string,
        features: { gymAccess, personalTrainer, dietPlan, poolSpa, groupClasses },
        access: { qrEntry, mobileApp },
        maxVisits: number,  // 0 = unlimited
        is_active: boolean,
      }
    ]
  },
  // Subscription (coupon-based):
  subscription_valid_until: Timestamp | Date,
  subscription_coupon_label: string,
  subscription_coupon_active: boolean,
  created_at: Timestamp,
}
```

### `/payments/{paymentId}`
```js
{
  id: string,
  gym_id: string,
  member_id: string,      // user UID
  member_name: string,
  plan_id: string,
  plan_name: string,
  amount: number,         // base amount
  final_amount: number,   // after discount
  paid_amount: number,
  pending_amount: number,
  status: 'paid' | 'partial' | 'pending',
  method: 'cash' | 'upi' | 'card' | 'bank_transfer',
  invoice_number: string, // e.g. "GYM-2026-0034"
  payment_date: Timestamp,
  notes: string,
  // Renewal tracking:
  enrollment_start: Timestamp,
  enrollment_end: Timestamp,
}
```

### `/attendance_logs/{logId}`
```js
{
  gym_id: string,
  member_id: string,
  member_name: string,
  plan_name: string,
  date: string,           // "YYYY-MM-DD"
  entry_time: Timestamp,
  is_expired: boolean,
  scanned_by: 'qr_self' | 'staff' | 'kiosk',
  scan_mode: 'phone' | 'tablet' | 'kiosk',
}
```

### `/workout_plans/{planId}`
```js
{
  id: string,
  name: string,
  type: 'predefined' | 'custom',
  gym_id: string | null,  // null = system predefined plan
  created_by: string,
  is_active: boolean,
  description: string,
}
```

### `/workout_days/{dayId}`
```js
{
  plan_id: string,
  day_number: number,
  name: string,
  exercises: [{ id, name, sets, reps, rest, difficulty, equipment }],
}
```

### `/workout_logs/{logId}`
```js
{
  member_id: string,
  plan_id: string,
  day_number: number,
  exercises: [{ id, name, completed, weight, reps }],
  completed_count: number,
  total_calories: number,
  log_date: Timestamp,
  client_date: string,
  is_active: boolean,
}
```

### `/progress_logs/{logId}`
```js
{
  member_id: string,
  weight: number,
  body_fat: number,
  muscle_mass: number,
  chest: number,
  waist: number,
  biceps: number,
  logged_at: Timestamp,
}
```

### `/kiosk_devices/{deviceId}`
```js
{
  gym_id: string,
  name: string,
  pairingCode: string,
  mode: 'entry' | 'exit',
  status: 'active' | 'offline',
  lastSeen: Timestamp,
}
```

### `/used_coupons/{gymId_couponCode}`
```js
{
  gym_id: string,
  code: string,
  days: number,
  label: string,
  used_at: Timestamp,
}
```

### `/invoice_counter/{gymId}`
```js
{
  count: number,   // auto-incremented for invoice numbering
}
```

### `/numbering_settings/{gymId}`
```js
{
  gymPrefix: string,              // e.g. "ITF"
  memberNumberTemplate: string,   // e.g. "{GYM_PREFIX}-{MONTH}{YY}-{SERIAL}"
  serialDigits: number,
  enrollmentTemplate: string,
  enrollmentSerialReset: 'monthly' | 'yearly' | 'never',
}
```

### `/serial_counters/{docId}`
Used by numberingService for auto-incrementing member/enrollment serial numbers.

### `/leads/{leadId}`
```js
{
  gym_id: string,
  name: string,
  phone: string,
  email: string,
  plan_interest: string,
  status: 'new' | 'contacted' | 'joined',
  created_at: Timestamp,
}
```

### `/whatsapp_logs/{logId}`
```js
{
  gym_id: string,
  member_id: string,
  phone: string,
  message_type: 'welcome' | 'expiry_7d' | 'expiry_1d' | 'payment_due',
  status: 'sent' | 'delivered' | 'failed',
  message_preview: string,
  error_reason: string,
  sent_at: Timestamp,
  retry_count: number,
}
```

---

## 9. Firestore Security Rules

File: `firestore.rules`

Key rules summary:

| Collection | Read | Write |
|---|---|---|
| `users` | Public | Authenticated |
| `gyms` | Public | Authenticated |
| `leads` | Authenticated | Public (anyone can submit inquiry) |
| `payments` | Authenticated | Authenticated |
| `attendance_logs` | Authenticated | Authenticated |
| `workout_plans/days/logs` | Authenticated | Authenticated |
| `kiosk_devices` | Public (for pairing) | create: auth, update: public (heartbeat) |
| `attendance_sessions` | Public | Public (kiosk writes without auth) |
| `subscriptions` / `billing` | Authenticated | Owner or Admin only |
| `admins` | Own UID only | Disabled (console-only) |
| `used_coupons` | Authenticated | Authenticated |
| `numbering_settings` / `serial_counters` | Authenticated | Authenticated |

Deploy rules: `npx -y firebase-tools@latest deploy --only firestore:rules`

---

## 10. Frontend Pages & Components

### Owner-Facing Pages

#### `OwnerDashboard` (`/owner/dashboard`)
- Shows member stats, revenue summary, quick actions
- Real-time member count, expiry warnings, today's attendance

#### `MemberList` (`/owner/members`)
- Paginated list of all gym members
- Filter by status (active/expired/expiring)
- Search by name/phone

#### `MemberProfile` (`/owner/members/:id`)
- Full member detail view
- Edit info, renew membership, view payment history
- Download digital membership card as PNG
- Delete member (also deletes all associated payment records using `deleteMemberPayments`)
- Camera/Gallery photo picker

#### `AddMember` (`/owner/members/add`)
- Form to add a new member
- Auto-generates `memberNumber` and `enrollment_id` via `numberingService`
- Creates payment record when plan is selected
- Camera/Gallery photo picker

#### `PaymentList` (`/owner/payments`)
- All payments for gym, sorted by date
- Filter by status (paid/partial/pending)

#### `AddPayment` (`/owner/payments/add`)
- Manual payment recording form

#### `MembershipPlansList` (`/owner/plans`)
- Shows all gym membership plans
- Pricing cards with features listed

#### `AddMembershipPlan` (`/owner/plans/add` or `/owner/plans/edit/:planId`)
- Form: plan name, billing cycle, pricing, features, access, limits
- Billing cycles: Monthly (30d), Quarterly (90d), Six Months (180d), Nine Months (270d), Yearly (365d), Custom (N days)
- Live preview card on right side
- Save button in top header (above navbar)
- Saves as array inside `gym.settings.plans` using Firestore dotted path update

#### `OwnerSettings` (`/owner/settings`)
- Gym profile editing (name, description, photos)
- Subscription status + coupon activation
- Quick Links (Kiosk, Equipment, Numbering, Card Editor)
- Staff section

#### `Analytics` (`/owner/analytics`)
- Revenue charts, member growth, attendance heatmap

#### `AttendanceLogs` (`/owner/attendance`)
- Daily attendance records with filters

#### `EntryKiosk` / `ExitKiosk` (`/kiosk/entry`, `/kiosk/exit`)
- No-auth tablet-facing pages
- Scans member QR codes via device camera
- Logs attendance to Firestore without authentication

### Member-Facing Pages

#### `MemberHome` (`/member/home`)
- Member dashboard: subscription status, next workout, quick stats

#### `MemberCard` (`/member/card`)
- Digital membership card with QR code
- Download as PNG

#### `MemberWorkout` (`/member/workout`)
- Day-by-day workout execution with sets/reps logging
- Real-time save to Firestore

#### `MemberProgress` (`/member/progress`)
- Body measurements over time, progress charts

---

## 11. State Management

No Redux or Zustand. State is managed via:

1. **React Context:**
   - `AuthContext` — global user/auth state
   - `ToastContext` — global toast notification queue

2. **Local `useState`** — per-page state

3. **Firestore `onSnapshot` listeners** — real-time data that auto-updates UI

All data fetching is done directly in page components using the Firebase proxy helpers.

---

## 12. Utility Services

### `numberingService.js`
Auto-generates formatted member numbers and enrollment IDs.
- Template-based: `{GYM_PREFIX}-{MONTH}{YY}-{SERIAL}`
- Uses atomic Firestore increment counters in `/serial_counters`
- Supports monthly or yearly serial resets

### `subscriptionService.js`
Checks if a gym's subscription is currently valid by reading `gym.subscription_valid_until`.

### `featureCheck.js`
Maps subscription tiers to feature flags:
- `payments`, `analytics`, `whatsapp_automation`, `attendance_heatmap`, `kiosk_attendance`
- Used by `SubscriptionGate` component

### `invoiceGenerator.js`
Generates PDF invoices using jsPDF. Auto-increments invoice counter in Firestore.

### `whatsapp.js`
Sends WhatsApp messages via configured API (not WhatsApp Business Cloud directly). Logs to `/whatsapp_logs`.

### `helpers.js`
- `getInitials(name)` — "John Doe" → "JD"
- `getAvatarColor(name)` — deterministic color from name
- `getExpiryStatus(expiry)` — returns `'active' | 'expiring' | 'expired'`
- Date formatting utilities

### `permissions.js`
- `can(userDoc, action)` — RBAC check
- `hasRole(userDoc, ...roles)`
- `getHomeRoute(role)` — redirect after login

---

## 13. Subscription & Coupon System

### How Subscriptions Work
Gymly uses a **coupon-code-based** subscription model (not Stripe/Razorpay for gym's own subscription).

1. Admin generates coupon codes and distributes them via `GYMLY_COUPONS.txt`
2. Gym owner enters coupon code in Settings → Subscription
3. Code is validated against `src/data/gymlyCodesData.js`
4. Code checked against `/used_coupons/{gymId_code}` (prevent reuse)
5. `gym.subscription_valid_until` is updated
6. `SubscriptionGate` reads this field to allow/block features

### Coupon Code Format
```
GYM1M-XXXXXX   → 30 days (1 Month)
GYM3M-XXXXXX   → 90 days (3 Months)
GYM6M-XXXXXX   → 180 days (6 Months)
GYM1Y-XXXXXX   → 365 days (1 Year)
```

### `SubscriptionGate` Component
- Wraps paid features in routes
- Reads `gym.subscription_valid_until` from Firestore
- Also checks `gym.subscription_coupon_active`
- Shows upgrade prompt if subscription expired

---

## 14. Mock / Demo Mode

### How to Activate
Set `localStorage.setItem('mockRole', 'owner')` in browser console.

Available mock roles: `owner`, `manager`, `trainer`, `receptionist`, `member`, `admin`

### How It Works
- `AuthContext` detects `mockRole` in localStorage and sets fake user/userDoc
- All Firebase proxy calls (`firestore.js`, `firestore-payments.js`) detect mock mode and route to `mockFirestore.js`
- `mockFirestore.js` returns hardcoded in-memory data: mock gym, 5 members, payments, attendance logs

### Mock Data Mutations
When in mock mode, `deleteMember` and `deleteMemberPayments` mutate the in-memory arrays (using `let` exports) so UI updates correctly without hitting Firestore.

---

## 15. PWA Configuration

Configured in `vite.config.js` via `vite-plugin-pwa`:
- **Name:** "Gymly — Gym Management"
- **Short Name:** "Gymly"
- **Theme Color:** `#534AB7`
- **Display:** fullscreen
- **Auto-update** service worker strategy

`PWAInstallPrompt` component in `App.jsx` shows an install banner on mobile.

---

## 16. Deployment

### Vercel (Primary — Production)
- **Live URL:** https://gymly.online
- **Deploy command:** `npx vercel --prod`
- Vite builds automatically, output in `/dist`
- All env vars set in Vercel dashboard

### Firebase Hosting (Secondary)
```bash
npx -y firebase-tools@latest deploy --only hosting
```

### Firestore Rules & Indexes
```bash
# Deploy rules only
npx -y firebase-tools@latest deploy --only firestore:rules

# Deploy indexes only
npx -y firebase-tools@latest deploy --only firestore:indexes

# Deploy everything
npx -y firebase-tools@latest deploy
```

### Local Dev
```bash
npm install
npm run dev     # starts at http://localhost:5173
```

---

## 17. Known Issues & Notes

### Vite 8 Incompatibility
Do NOT upgrade Vite beyond 5.x while on Firebase 12. Vite 8 uses `rolldown` bundler which throws `[MISSING_EXPORT] updateEmulatorBanner` errors for all Firebase sub-packages. Vite 5 with Rollup is stable.

### Firestore `orderBy` + Composite Index Requirement
Any Firestore query using `where` + `orderBy` on different fields requires a composite index in `firestore.indexes.json`. This project sorts in JavaScript instead of Firestore when possible to avoid index requirements (e.g., `getMemberPaymentsRealtime` sorts client-side).

The `deleteMemberPayments` function intentionally omits `orderBy` so it works without a composite index.

### Member Deletion
When deleting a member from `MemberProfile`, the code calls `deleteMemberPayments(gym_id, member_id)` first — this deletes all payment records for that member before deleting the user document. The function uses a simple `where gym_id == X AND member_id == Y` query (no orderBy) to avoid needing a composite index.

### Photo Upload
Profile photos are handled in two ways:
1. **Camera:** Uses `getUserMedia` → captures frame → converts to base64
2. **Gallery:** Uses `<input type="file" accept="image/*">` → reads as base64 or uploads to Firebase Storage

### Membership Plan Storage
Plans are stored **embedded** inside the gym document at `gym.settings.plans` (an array), NOT as a separate Firestore collection. Updates use Firestore's dotted path: `updateGym(gymId, { 'settings.plans': updatedArray })`.

Firestore does NOT accept `undefined` values — always use `null` for optional fields.
