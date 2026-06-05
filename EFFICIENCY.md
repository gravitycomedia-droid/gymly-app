# GYMLY — Firebase Efficiency Optimisation Plan
# Project: gymly-app-06 | Maintained by: Vishnu (Linq Tech)
# Goal: $10.53/month → $0.47/month (96% reduction) at 10 gyms × 500 members
# Under $3/month at 15 gyms × 700 members. Under $6/month at 30 gyms × 700 members.
# Last updated: 2026-06-05

---

## QUICK REFERENCE — ALL 7 OPTIMISATIONS

| # | Name | Reads saved/day | Writes saved/day | Time | Risk |
|---|------|-----------------|-----------------|------|------|
| O-1 | Persistent Cache | ~40,000 | — | 10 min | Zero |
| O-2 | Custom Claims | ~30,000 | — | 30 min | Low |
| O-3 | Stats Document | ~50,000 | — | 1 hr | Medium |
| O-4 | Replace onSnapshot | ~15,000 | — | 20 min | Low |
| O-5 | Pagination | ~20,000 | — | 1 hr | Low |
| O-6 | Throttle Writes | — | ~12,000 | 20 min | Zero |
| O-7 | Base64 Migration | ~5,000 | — | 1 hr | Medium |
| **TOTAL** | | **~160,000/day** | **~12,000/day** | **~5 hrs** | |

**Do in this order:** O-1 → O-4 → O-6 → O-2 → O-3 → O-5 → O-7

---

## COST BASELINE

### Before (current — 10 gyms × 500 members)

| Source | Reads/day | Cost/month |
|--------|-----------|-----------|
| AuthContext onSnapshot persistent listener | 15,000 | $0.81 |
| OwnerDashboard full member fetch | 50,000 | $2.70 |
| PaymentList full collection fetch | 25,000 | $1.35 |
| AttendanceLogs full collection fetch | 20,000 | $1.08 |
| Firestore rules get() evaluation | 30,000 | $1.62 |
| Page reload re-fetches (memoryLocalCache) | 40,000 | $2.16 |
| **TOTAL reads** | **180,000/day** | **$9.72** |
| last_seen + attendance_count writes | 15,000/day | $0.81 |
| **GRAND TOTAL** | | **~$10.53/month** |

### After (all 7 optimisations — same 10 gyms × 500 members)

| Source | Reads/day | Cost/month |
|--------|-----------|-----------|
| Auth getDoc on login | 500 | $0.03 |
| Dashboard stats doc | 100 | $0.01 |
| Paginated payments + attendance | 4,500 | $0.24 |
| Persistent cache delta only | 1,800 | $0.10 |
| **TOTAL reads** | **6,900/day** | **$0.38** |
| Throttled writes | 1,500/day | $0.08 |
| Cloud Functions invocations | ~1M/month | $0.40 |
| **GRAND TOTAL** | | **~$0.47/month** |

### Scale projections (after all optimisations)

| Scale | Estimated cost |
|-------|---------------|
| 10 gyms × 500 members | **$0.47/month** |
| 15 gyms × 700 members | **$2.93/month** |
| 30 gyms × 700 members | **$5.86/month** |
| 50 gyms × 1,000 members | **~$9.80/month** |

---

## DO THIS BEFORE ANY OPTIMISATION

Start every Antigravity session with:

```
Read AGENTS.md completely before doing anything. Do not touch any file until you confirm you have read it.
```

---

## O-1 — PERSISTENT CACHE
**Effort:** 10 minutes | **Risk:** Zero | **Saving:** ~40,000 reads/day (~$2.16/month)

### What the problem is
`memoryLocalCache()` in `src/firebase/config.js` stores Firestore data in RAM only.
Every page reload, tab switch, or F5 fetches ALL data again from Firestore.
With 10 gyms and heavy usage this burns 40,000 reads/day doing zero useful work.

### What the fix does
`persistentLocalCache()` stores Firestore data in IndexedDB (browser storage).
Reloads serve cached data instantly. Only document deltas are fetched from Firestore.
`persistentMultipleTabManager()` coordinates the cache across multiple browser tabs
so two tabs in the same gym do not double-fetch.

### Files changed
- `src/firebase/config.js` — one import change, one function call change

### Code change

```js
// BEFORE — src/firebase/config.js
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';

const db = initializeFirestore(app, {
  localCache: memoryLocalCache()
});

// AFTER — src/firebase/config.js
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';

const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
```

### Verification
1. Open OwnerDashboard — note network tab Firestore reads
2. Reload the page
3. Network tab should show zero Firestore fetches (served from IndexedDB cache)
4. DevTools → Application → IndexedDB → should show `firestore/...` entries

### Antigravity prompt
```
Read AGENTS.md first.

Then open src/firebase/config.js.

Make exactly this change:
1. Replace the memoryLocalCache import with:
   import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
2. Replace the initializeFirestore call with:
   const db = initializeFirestore(app, {
     localCache: persistentLocalCache({
       tabManager: persistentMultipleTabManager()
     })
   });

Show me the full diff before applying. Do not change any other file.
After I approve, apply the change, then run: npm run build
Confirm zero build errors.
```

---

## O-4 — REPLACE AUTHCONTEXT ONSNAPSHOT
**Effort:** 20 minutes | **Risk:** Low | **Saving:** ~15,000 reads/day (~$0.81/month)

### What the problem is
`AuthContext.jsx` uses `onSnapshot()` on the user profile document. This creates a
persistent WebSocket listener that keeps the document open and charges a read every
time the document changes anywhere. With 500 members across 10 gyms, this listener
alone costs 15,000 reads/day — just to keep user profiles "live".

User profiles (name, role, gym_id) almost never change mid-session. The live listener
provides zero real benefit and significant cost.

### What the fix does
Replace `onSnapshot` with a one-time `getDoc()` on login.
Add a `refreshUserDoc()` function that components can call explicitly after editing
profile (the only moment a re-fetch is actually needed).

### Files changed
- `src/context/AuthContext.jsx` — replace onSnapshot block, add refreshUserDoc

### Code change

```js
// BEFORE — AuthContext.jsx (approximate lines 70-90)
const unsubscribeUserDoc = onSnapshot(
  doc(db, 'users', uid),
  (docSnap) => {
    if (docSnap.exists()) {
      setUserDoc(docSnap.data());
    }
    setLoading(false);
  }
);
return () => unsubscribeUserDoc();

// AFTER — AuthContext.jsx
const loadUserDoc = async (uid) => {
  const docSnap = await getDoc(doc(db, 'users', uid));
  if (docSnap.exists()) {
    setUserDoc(docSnap.data());
  }
  setLoading(false);
};

await loadUserDoc(uid);
// No cleanup needed — no listener to unsubscribe
```

### Add refreshUserDoc to context value

```js
// Add inside AuthContext component
const refreshUserDoc = async () => {
  if (!user) return;
  const docSnap = await getDoc(doc(db, 'users', user.uid));
  if (docSnap.exists()) {
    setUserDoc(docSnap.data());
  }
};

// Add to context value export
const value = {
  user,
  userDoc,
  loading,
  refreshUserDoc,   // ← ADD THIS
};
```

### Where to call refreshUserDoc
Any component that lets a user edit their profile should call `refreshUserDoc()`
after a successful save. Search the codebase for profile edit save handlers.

### Verification
1. Login → open Firebase Console → Firestore → Usage tab
2. Should see a single read on login, then zero reads until next explicit action
3. Edit profile → save → profile should update (refreshUserDoc called)

### Antigravity prompt
```
Read AGENTS.md first.

Open src/context/AuthContext.jsx.

Find the onSnapshot call on the user profile document inside onAuthStateChanged.
Replace it with a one-time getDoc call. Import getDoc from 'firebase/firestore' if
not already imported. Remove onSnapshot import if it becomes unused.

Also add a refreshUserDoc async function to the context that re-runs the same getDoc.
Export refreshUserDoc in the context value object.

Show full diff before applying. Do not change any other file.
After I approve: apply, then run npm run build. Confirm zero errors.
Then tell me: which components in src/ have profile edit save handlers where I should
add a refreshUserDoc() call.
```

---

## O-6 — THROTTLE WRITES
**Effort:** 20 minutes | **Risk:** Zero | **Saving:** ~12,000 writes/day (~$0.81/month)

### What the problem is
Two write patterns fire far too frequently:

**last_seen field:** Updated every time the app loads or the user takes any action.
With 500 members checking in and browsing daily, this creates thousands of writes
for data that only needs minute-level granularity.

**attendance_count field:** Incremented directly on the user document during every
kiosk check-in. With the Stats Document (O-3) computing this server-side, this
client write is redundant.

### What the fix does
- `last_seen`: throttled to once per 30 minutes using `sessionStorage` as a guard.
  The write only fires if 30 minutes have passed since the last recorded write.
- `attendance_count` on the user doc: removed entirely from the check-in flow.
  The Stats Document (O-3) tracks this server-side.

### Files changed
- `src/context/AuthContext.jsx` (or wherever last_seen is updated)
- Kiosk check-in component / Cloud Function that increments attendance_count

### Code change — last_seen throttle

```js
// Wherever last_seen is written (AuthContext or a useEffect)

const throttledUpdateLastSeen = async (uid) => {
  const THROTTLE_MS = 30 * 60 * 1000; // 30 minutes
  const key = `last_seen_write_${uid}`;
  const lastWrite = parseInt(sessionStorage.getItem(key) || '0', 10);
  const now = Date.now();

  if (now - lastWrite < THROTTLE_MS) {
    return; // Skip — wrote less than 30 minutes ago
  }

  await updateDoc(doc(db, 'users', uid), {
    last_seen: serverTimestamp()
  });

  sessionStorage.setItem(key, String(now));
};
```

### Code change — remove attendance_count from check-in

```js
// In the kiosk check-in function or Cloud Function
// REMOVE this line (or the equivalent updateDoc):
// await updateDoc(doc(db, 'users', memberId), { attendance_count: increment(1) });

// attendance_count is now computed by the gymStats Cloud Function (O-3)
// Do NOT add this back. The Stats Document is the single source of truth.
```

### Verification
1. Open app — check sessionStorage in DevTools → Application → Session Storage
2. Should see `last_seen_write_{uid}` key with a timestamp
3. Reload within 30 minutes → no last_seen Firestore write in network tab
4. Wait 30+ minutes (or manually clear sessionStorage) → write fires again

### Antigravity prompt
```
Read AGENTS.md first.

Task 1: Find every place in src/ where last_seen is written to Firestore
(search for 'last_seen' in all .jsx and .js files in src/).
Wrap each write with this throttle: skip the write if sessionStorage has
'last_seen_write_{uid}' set within the last 30 minutes. After writing, update
the sessionStorage key to Date.now().

Task 2: Find every place in src/ and in functions/ where attendance_count is
incremented directly on a /users document. Remove those lines.
(attendance_count will be maintained by the gymStats Cloud Function in O-3.)

Show a diff for each file before applying. Do not change any other files.
After I approve all diffs: apply changes, run npm run build, confirm zero errors.
```

---

## O-2 — CUSTOM CLAIMS
**Effort:** 30 minutes | **Risk:** Low | **Saving:** ~30,000 reads/day (~$1.62/month)

### What the problem is
Every Firestore security rule that checks `role` or `gym_id` does a hidden `get()`:
```
get(/databases/$(database)/documents/users/$(request.auth.uid)).data.gym_id
```
This is a real Firestore read. Firebase charges for it. It does not appear in
any dashboard widget — it looks invisible. But with 9 collections each doing 2
`get()` calls per operation, multiplied across all active users, this costs
~30,000 reads/day that show up nowhere except the bill.

### What the fix does
Custom Claims embed `role` and `gym_id` directly inside the Firebase Auth JWT token.
Rules can then read `request.auth.token.role` and `request.auth.token.gym_id`
with zero Firestore reads — the data is in the token itself.

### Files changed
- `functions/src/userClaims.js` — NEW Cloud Function (Firestore trigger)
- `functions/index.js` — add export
- `firestore.rules` — replace all get() calls with token reads
- `src/context/AuthContext.jsx` — add `getIdToken(true)` after login

### New Cloud Function — userClaims.js

```js
// functions/src/userClaims.js
// CommonJS — NO TypeScript, NO .ts extension (project constraint)

const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();

exports.onUserWrite = functions.firestore
  .document('users/{uid}')
  .onWrite(async (change, context) => {
    const uid = context.params.uid;

    // Document deleted — clear claims
    if (!change.after.exists) {
      await admin.auth().setCustomUserClaims(uid, {});
      return null;
    }

    const data = change.after.data();
    const role = data.role || null;
    const gym_id = data.gym_id || null;

    // Only set claims if both fields exist
    if (!role || !gym_id) {
      console.log(`User ${uid} missing role or gym_id — skipping claims`);
      return null;
    }

    await admin.auth().setCustomUserClaims(uid, { role, gym_id });
    console.log(`Claims set for ${uid}: role=${role}, gym_id=${gym_id}`);
    return null;
  });
```

### functions/index.js addition

```js
// Add to bottom of functions/index.js
const { onUserWrite } = require('./src/userClaims');
exports.onUserWrite = onUserWrite;
```

### Firestore rules change (global replace)

```
// BEFORE — in every collection rule
get(/databases/$(database)/documents/users/$(request.auth.uid)).data.gym_id
get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role

// AFTER — reads from JWT token (zero Firestore reads)
request.auth.token.gym_id
request.auth.token.role
```

### AuthContext.jsx — force token refresh on login

```js
// Inside onAuthStateChanged, after user is confirmed:
// Add this line AFTER the user is set but BEFORE loading is set to false

await user.getIdToken(true); // Force refresh to pick up new custom claims
```

### IMPORTANT — migration concern
Staff and member docs use `addDoc()` — their Firestore doc IDs are NOT Auth UIDs.
Most members have no Firebase Auth account at all. The `onUserWrite` trigger fires
only on `/users/{uid}` writes. For members with no Auth account, `setCustomUserClaims`
will fail with `auth/user-not-found` — catch this silently.

```js
// Add try/catch inside userClaims.js:
try {
  await admin.auth().setCustomUserClaims(uid, { role, gym_id });
} catch (err) {
  if (err.code === 'auth/user-not-found') {
    // Expected for addDoc members with no Auth account — silently ignore
    console.log(`No Auth account for ${uid} — claims skipped`);
  } else {
    throw err;
  }
}
```

### Deploy order
1. Deploy function first: `firebase deploy --only functions --project gymly-app-06`
2. After deploy — WAIT: existing users need their `/users/{uid}` docs touched to
   trigger the function. Options:
   - A) Do a bulk touch: write a one-time admin script that reads all /users docs
     and re-saves them (or run a backfill function).
   - B) Claims populate naturally as users log in and their docs get updated.
   - Option B is safer for a live system.
3. Update and deploy firestore.rules after the function is deployed and claims are
   confirmed working (test with one real user first).

### Verification
1. Login as an owner → open DevTools → Application → Cookies
2. Decode the Firebase ID token at jwt.io
3. Should see `role` and `gym_id` fields in the payload
4. Firebase Console → Firestore → Usage → reads should drop after rules deploy

### Antigravity prompt
```
Read AGENTS.md first.

Task 1: Create functions/src/userClaims.js as a CommonJS (.js, NOT .ts) Cloud Function.
It should be a Firestore onWrite trigger on /users/{uid}.
When triggered: read role and gym_id from the new document.
Call admin.auth().setCustomUserClaims(uid, { role, gym_id }).
Wrap the setCustomUserClaims call in try/catch: silently ignore auth/user-not-found
errors (expected for addDoc members with no Auth account), throw all others.
Log success and skip cases. Return null.

Task 2: Add the export to functions/index.js (one line at the bottom).

Task 3: Show me the full diff for both files before applying.

After I approve: apply changes.
Then deploy ONLY the function:
  firebase deploy --only functions --project gymly-app-06
Wait for deploy confirmation.

Task 4 (AFTER deploy confirmed): Show me a diff for firestore.rules that replaces
every occurrence of:
  get(/databases/$(database)/documents/users/$(request.auth.uid)).data.gym_id
with:
  request.auth.token.gym_id
and every occurrence of:
  get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
with:
  request.auth.token.role
Run rules:check before deploying. Show me the check output.

Task 5 (AFTER rules deploy): In src/context/AuthContext.jsx, add
  await user.getIdToken(true)
inside onAuthStateChanged after the user is confirmed, before setLoading(false).
Show diff. Apply after I approve. Run npm run build.
```

---

## O-3 — STATS DOCUMENT
**Effort:** 1 hour | **Risk:** Medium | **Saving:** ~50,000 reads/day (~$2.70/month)**

### What the problem is
The OwnerDashboard currently fetches every member document and every payment document
to compute dashboard stats (total members, active members, today's revenue, etc.).
At 500 members per gym and 10 gyms, with managers checking the dashboard throughout
the day, this generates ~50,000 reads/day from one single page.

### What the fix does
A new Cloud Function (`gymStats.js`) maintains a pre-computed summary document at
`/gyms/{gymId}/stats/summary`. This document is updated server-side whenever
relevant data changes. The dashboard reads ONE document instead of 200+.

### Files changed
- `functions/src/gymStats.js` — NEW Cloud Function (Firestore triggers)
- `functions/index.js` — add exports
- `src/pages/Dashboard/OwnerDashboard.jsx` — read stats doc instead of querying members

### New document structure

```
/gyms/{gymId}/stats/summary
{
  total_members: number,
  active_members: number,          // subscription_expiry > now
  expiring_today: number,          // subscription_expiry is today
  expiring_7d: number,             // subscription_expiry within next 7 days
  today_revenue: number,           // sum of today's payment amounts
  month_revenue: number,           // sum of this month's payment amounts
  today_attendance: number,        // count of today's attendance_logs entries
  last_updated: Timestamp
}
```

### New Cloud Function — gymStats.js

```js
// functions/src/gymStats.js
// CommonJS — NO TypeScript, NO .ts extension

const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ── Helper: recompute and write stats for one gym ─────────────────────────
async function recomputeStats(gymId) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd   = new Date(todayStart.getTime() + 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const in7d       = new Date(todayStart.getTime() + 7 * 86400000);

  // Member counts
  const membersSnap = await db.collection('users')
    .where('gym_id', '==', gymId)
    .where('role', '==', 'member')
    .where('is_deleted', '!=', true)
    .get();

  let totalMembers = 0;
  let activeMembers = 0;
  let expiringToday = 0;
  let expiring7d = 0;

  membersSnap.forEach(doc => {
    const d = doc.data();
    totalMembers++;
    const expiry = d.subscription_expiry?.toDate?.() || null;
    if (expiry && expiry > now) activeMembers++;
    if (expiry && expiry >= todayStart && expiry < todayEnd) expiringToday++;
    if (expiry && expiry >= todayStart && expiry < in7d) expiring7d++;
  });

  // Revenue
  const paymentsSnap = await db.collection('payments')
    .where('gym_id', '==', gymId)
    .where('payment_date', '>=', admin.firestore.Timestamp.fromDate(monthStart))
    .get();

  let todayRevenue = 0;
  let monthRevenue = 0;

  paymentsSnap.forEach(doc => {
    const d = doc.data();
    const pDate = d.payment_date?.toDate?.() || null;
    const amount = d.amount || 0;
    monthRevenue += amount;
    if (pDate && pDate >= todayStart && pDate < todayEnd) todayRevenue += amount;
  });

  // Today's attendance
  const attendanceSnap = await db.collection('attendance_logs')
    .where('gym_id', '==', gymId)
    .where('entry_time', '>=', admin.firestore.Timestamp.fromDate(todayStart))
    .where('entry_time', '<', admin.firestore.Timestamp.fromDate(todayEnd))
    .get();

  const todayAttendance = attendanceSnap.size;

  // Write summary doc
  await db.collection('gyms').doc(gymId)
    .collection('stats').doc('summary')
    .set({
      total_members: totalMembers,
      active_members: activeMembers,
      expiring_today: expiringToday,
      expiring_7d: expiring7d,
      today_revenue: todayRevenue,
      month_revenue: monthRevenue,
      today_attendance: todayAttendance,
      last_updated: admin.firestore.Timestamp.now(),
    });
}

// ── Debounce map (in-memory — sufficient for Cloud Functions) ─────────────
const debounceTimers = {};
const DEBOUNCE_MS = 60000; // 60 seconds

function debounceRecompute(gymId) {
  if (debounceTimers[gymId]) clearTimeout(debounceTimers[gymId]);
  debounceTimers[gymId] = setTimeout(() => {
    recomputeStats(gymId).catch(err =>
      console.error(`gymStats recompute failed for ${gymId}:`, err)
    );
    delete debounceTimers[gymId];
  }, DEBOUNCE_MS);
}

// ── Trigger on /users writes (member joins, cancels, expires) ─────────────
exports.statsOnUserWrite = functions.firestore
  .document('users/{userId}')
  .onWrite(async (change, context) => {
    const data = change.after.exists ? change.after.data() : change.before.data();
    const gymId = data?.gym_id;
    if (!gymId || data?.role !== 'member') return null;
    debounceRecompute(gymId);
    return null;
  });

// ── Trigger on /payments writes ───────────────────────────────────────────
exports.statsOnPaymentWrite = functions.firestore
  .document('payments/{paymentId}')
  .onWrite(async (change, context) => {
    const data = change.after.exists ? change.after.data() : change.before.data();
    const gymId = data?.gym_id;
    if (!gymId) return null;
    debounceRecompute(gymId);
    return null;
  });

// ── Trigger on /attendance_logs writes ───────────────────────────────────
exports.statsOnAttendanceWrite = functions.firestore
  .document('attendance_logs/{logId}')
  .onWrite(async (change, context) => {
    const data = change.after.exists ? change.after.data() : change.before.data();
    const gymId = data?.gym_id;
    if (!gymId) return null;
    debounceRecompute(gymId);
    return null;
  });

// ── Scheduled: reset today stats at midnight IST ──────────────────────────
exports.statsResetDaily = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('Asia/Kolkata')
  .onRun(async () => {
    const gymsSnap = await db.collection('gyms').get();
    const promises = gymsSnap.docs.map(doc => recomputeStats(doc.id));
    await Promise.all(promises);
    console.log(`Daily stats reset for ${gymsSnap.size} gyms`);
    return null;
  });
```

### functions/index.js additions

```js
const {
  statsOnUserWrite,
  statsOnPaymentWrite,
  statsOnAttendanceWrite,
  statsResetDaily
} = require('./src/gymStats');

exports.statsOnUserWrite = statsOnUserWrite;
exports.statsOnPaymentWrite = statsOnPaymentWrite;
exports.statsOnAttendanceWrite = statsOnAttendanceWrite;
exports.statsResetDaily = statsResetDaily;
```

### OwnerDashboard.jsx change

```js
// BEFORE — fetches entire /users and /payments collections
// (pseudocode — actual line numbers may vary)
const membersSnap = await getDocs(query(collection(db, 'users'), where('gym_id','==',gymId)));
const paymentsSnap = await getDocs(query(collection(db, 'payments'), where('gym_id','==',gymId)));
// ... manual counting loops

// AFTER — one document read
import { doc, getDoc } from 'firebase/firestore';

const statsRef = doc(db, 'gyms', gymId, 'stats', 'summary');
const statsSnap = await getDoc(statsRef);

if (statsSnap.exists()) {
  const s = statsSnap.data();
  setStats({
    totalMembers:    s.total_members,
    activeMembers:   s.active_members,
    expiringToday:   s.expiring_today,
    expiring7d:      s.expiring_7d,
    todayRevenue:    s.today_revenue,
    monthRevenue:    s.month_revenue,
    todayAttendance: s.today_attendance,
    lastUpdated:     s.last_updated,
  });
} else {
  // Stats doc not yet created (first deploy) — show loading state
  setStats(null);
}
```

### Firestore rules addition

```
// Add to firestore.rules
match /gyms/{gymId}/stats/{document} {
  allow read: if request.auth != null
    && request.auth.token.gym_id == gymId;
  allow write: if false; // server only
}
```

### firestore.indexes.json additions (deploy before function)

```json
{
  "indexes": [
    {
      "collectionGroup": "users",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "gym_id", "order": "ASCENDING" },
        { "fieldPath": "role", "order": "ASCENDING" },
        { "fieldPath": "is_deleted", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "payments",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "gym_id", "order": "ASCENDING" },
        { "fieldPath": "payment_date", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "attendance_logs",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "gym_id", "order": "ASCENDING" },
        { "fieldPath": "entry_time", "order": "ASCENDING" }
      ]
    }
  ]
}
```

### Deploy order (STRICT — indexes must be green before function)
1. `firebase deploy --only firestore:indexes --project gymly-app-06`
2. Wait in Firebase Console → Firestore → Indexes until all 3 are ENABLED (green)
3. `firebase deploy --only functions --project gymly-app-06`
4. Test: trigger a payment write manually → check `/gyms/{gymId}/stats/summary`
5. Deploy rules: `firebase deploy --only firestore:rules --project gymly-app-06`
6. Deploy frontend: `git push` → Vercel auto-deploy

### Antigravity prompt
```
Read AGENTS.md first.

Task 1: Create functions/src/gymStats.js as a CommonJS (.js, NOT .ts) file.
Requirements:
- Three Firestore onWrite triggers: /users/{userId}, /payments/{paymentId}, /attendance_logs/{logId}
- Each trigger reads gym_id from the changed document, then calls a debounced recompute function
- Debounce: 60 seconds (use setTimeout, in-memory map keyed by gymId)
- The recompute function queries users (members only, not deleted), payments (current month), and
  attendance_logs (today) for that gymId, then writes /gyms/{gymId}/stats/summary with:
  total_members, active_members, expiring_today, expiring_7d, today_revenue, month_revenue,
  today_attendance, last_updated
- One scheduled trigger: runs daily at midnight IST, calls recompute for all gyms
Show me the full file content before creating.

Task 2: Add the 4 exports to functions/index.js (bottom of file). Show diff.

Task 3: Show me the 3 new composite indexes needed in firestore.indexes.json (users, payments,
attendance_logs). I will deploy indexes manually first.

Task 4: Show me the OwnerDashboard.jsx diff — replace the full member+payment fetch with a single
getDoc on /gyms/{gymId}/stats/summary. Map the stats doc fields to the existing state shape.

Task 5: Show me the firestore.rules addition for /gyms/{gymId}/stats/{document}.

After I approve all 5 diffs:
1. Apply Tasks 2, 3, 4, 5.
2. Tell me to deploy indexes first. Wait for my confirmation.
3. After my confirmation: firebase deploy --only functions --project gymly-app-06
4. After function deploy: firebase deploy --only firestore:rules --project gymly-app-06
5. Run npm run build. Confirm zero errors.
```

---

## O-5 — PAGINATION
**Effort:** 1 hour | **Risk:** Low | **Saving:** ~20,000 reads/page-load eliminated

### What the problem is
`PaymentList`, `AttendanceLogs`, and `MemberList` each fetch entire collections.
A gym with 500 members and 2 years of payment history fetches 500-2000 documents
every time a manager opens the page. Most of these are never scrolled to.

### What the fix does
Replace `getDocs(query(...))` with `getDocs(query(..., orderBy(...), limit(25)))`.
Add "Load more" / cursor pagination using `startAfter()`.
The first load becomes 25 reads instead of 500+.

### Shared pagination hook

```js
// src/hooks/usePaginatedCollection.js
import { useState, useCallback } from 'react';
import { getDocs, query, orderBy, limit, startAfter } from 'firebase/firestore';

const PAGE_SIZE = 25;

export function usePaginatedCollection(baseQuery) {
  const [docs, setDocs] = useState([]);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const loadFirst = useCallback(async () => {
    setLoading(true);
    const snap = await getDocs(query(baseQuery, limit(PAGE_SIZE)));
    setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLastDoc(snap.docs[snap.docs.length - 1] || null);
    setHasMore(snap.size === PAGE_SIZE);
    setLoading(false);
  }, [baseQuery]);

  const loadMore = useCallback(async () => {
    if (!lastDoc || loading) return;
    setLoading(true);
    const snap = await getDocs(query(baseQuery, startAfter(lastDoc), limit(PAGE_SIZE)));
    setDocs(prev => [...prev, ...snap.docs.map(d => ({ id: d.id, ...d.data() }))]);
    setLastDoc(snap.docs[snap.docs.length - 1] || null);
    setHasMore(snap.size === PAGE_SIZE);
    setLoading(false);
  }, [baseQuery, lastDoc, loading]);

  return { docs, hasMore, loading, loadFirst, loadMore };
}
```

### Required indexes (add to firestore.indexes.json before deploying)

```json
{
  "collectionGroup": "payments",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "gym_id", "order": "ASCENDING" },
    { "fieldPath": "payment_date", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "attendance_logs",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "gym_id", "order": "ASCENDING" },
    { "fieldPath": "entry_time", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "users",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "gym_id", "order": "ASCENDING" },
    { "fieldPath": "role", "order": "ASCENDING" },
    { "fieldPath": "name", "order": "ASCENDING" }
  ]
}
```

### Antigravity prompt
```
Read AGENTS.md first.

Task 1: Create src/hooks/usePaginatedCollection.js — a reusable React hook that wraps
Firestore getDocs with cursor pagination (limit 25, startAfter). It should return:
docs (array), hasMore (bool), loading (bool), loadFirst(), loadMore().

Task 2: Show me the 3 composite indexes needed in firestore.indexes.json (payments by
gym_id + payment_date DESC, attendance_logs by gym_id + entry_time DESC, users by
gym_id + role + name). Do not deploy indexes — show only the JSON additions.

Task 3: Update PaymentList to use usePaginatedCollection instead of getDocs on full collection.
Add a "Load more" button at the bottom that calls loadMore(). Keep any existing search/filter
functionality but limit it to already-loaded docs (client-side filter on the 25 loaded items).

Task 4: Do the same for AttendanceLogs.

Task 5: Do the same for MemberList.

Show diff for each file before applying. Do not apply until I approve each diff.

After I approve all diffs:
1. Deploy indexes first: firebase deploy --only firestore:indexes --project gymly-app-06
2. Tell me to check Firebase Console → Indexes → wait for ENABLED status
3. After my confirmation: apply all frontend changes, run npm run build
```

---

## O-7 — BASE64 PHOTO MIGRATION
**Effort:** 1 hour | **Risk:** Medium | **Saving:** Firestore storage cost ×10 reduction

### What the problem is
Some member profile photos are stored as base64 strings directly inside Firestore
documents (field `profile_photo` starting with `data:image`). A single base64 photo
is ~50KB. A 500-member gym with 50% base64 photos = 12.5MB of Firestore storage in
document data. Firestore charges for storage AND for reading large documents.

### What the fix does
A one-time admin callable function reads all documents where `profile_photo` starts
with `data:image`, uploads each image to Firebase Storage, and replaces the Firestore
field with the Storage download URL (~200 bytes instead of ~50KB).

New photo uploads (post-migration) go directly to Storage — never to Firestore.

### Files changed
- `functions/src/migratePhotos.js` — NEW Cloud Function (admin callable, one-time)
- `functions/index.js` — add export
- Photo upload component — update to use Storage, not base64 in Firestore

### Migration Cloud Function

```js
// functions/src/migratePhotos.js
// CommonJS — NO TypeScript

const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const bucket = admin.storage().bucket();

exports.migratePhotos = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' }) // large timeout for many gyms
  .https.onCall(async (data, context) => {

    // Admin-only guard
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '');
    const callerSnap = await db.collection('users').doc(context.auth.uid).get();
    if (!callerSnap.exists || callerSnap.data().role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only.');
    }

    const BATCH_SIZE = 20;
    const DELAY_MS = 200;
    let migrated = 0;
    let failed = 0;
    let lastDoc = null;

    while (true) {
      // Query in batches — no Firestore index needed for != filter with limit
      let q = db.collection('users').limit(BATCH_SIZE);
      if (lastDoc) q = q.startAfter(lastDoc);
      const snap = await q.get();
      if (snap.empty) break;

      for (const docSnap of snap.docs) {
        const d = docSnap.data();
        if (!d.profile_photo || !d.profile_photo.startsWith('data:image')) continue;

        try {
          const base64Data = d.profile_photo.split(',')[1];
          const mimeType = d.profile_photo.match(/data:(.*?);/)?.[1] || 'image/jpeg';
          const ext = mimeType.split('/')[1] || 'jpg';
          const filePath = `profile_photos/${d.gym_id || 'unknown'}/${docSnap.id}.${ext}`;
          const file = bucket.file(filePath);

          await file.save(Buffer.from(base64Data, 'base64'), {
            metadata: { contentType: mimeType }
          });

          await file.makePublic(); // or use signed URL — match your existing photo access pattern
          const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

          await docSnap.ref.update({ profile_photo: publicUrl });
          migrated++;
          console.log(`Migrated: ${docSnap.id}`);
        } catch (err) {
          failed++;
          console.error(`Failed: ${docSnap.id} — ${err.message}`);
        }

        await new Promise(r => setTimeout(r, DELAY_MS));
      }

      lastDoc = snap.docs[snap.docs.length - 1];
    }

    return { migrated, failed };
  });
```

### Run after deploy

```js
// In browser console (as an authenticated admin user) or via Firebase emulator:
import { getFunctions, httpsCallable } from 'firebase/functions';
const functions = getFunctions();
const migrate = httpsCallable(functions, 'migratePhotos');
const result = await migrate({});
console.log(result.data); // { migrated: 43, failed: 0 }
```

### Antigravity prompt
```
Read AGENTS.md first.

Task 1: Create functions/src/migratePhotos.js as a CommonJS (.js) admin-only HTTPS callable
Cloud Function. Requirements:
- Auth check: caller must be authenticated and have role === 'admin' in /users/{uid}
- Query /users in batches of 20 using startAfter pagination
- For each user where profile_photo starts with 'data:image':
  - Upload the base64 image to Firebase Storage at path: profile_photos/{gym_id}/{userId}.{ext}
  - Get the public URL
  - Update the user doc: profile_photo = public URL (not base64)
- Add 200ms delay between batches to avoid Storage throttling
- Return { migrated, failed } counts
- Use functions.runWith({ timeoutSeconds: 540, memory: '1GB' })

Task 2: Add the export to functions/index.js. Show diff.

Task 3: Find the photo upload component in src/ (search for 'base64', 'profile_photo',
and 'FileReader'). Show me the current upload code. Then suggest a diff that uploads
to Firebase Storage directly (using uploadBytes from firebase/storage) and saves
the download URL to Firestore instead of the base64 string.

Show all diffs before applying. After I approve:
1. Apply changes
2. Deploy only the function: firebase deploy --only functions --project gymly-app-06
3. After confirmation: run the migration by calling the function once from the browser
4. Report migrated and failed counts
```

---

## VERIFICATION CHECKLIST

Run after all 7 optimisations are deployed:

### Firebase Console checks
- [ ] Firestore → Usage → reads/day has dropped significantly vs baseline
- [ ] Firestore → Indexes — all new indexes show ENABLED (green)
- [ ] Functions → Logs — no errors on gymStats, userClaims, migratePhotos

### Frontend checks
- [ ] `npm run build` — zero errors after every change
- [ ] OwnerDashboard loads in < 500ms (stats doc read, not full collection)
- [ ] PaymentList shows 25 records, "Load more" button present
- [ ] MemberList shows 25 records, "Load more" button present
- [ ] Profile photo shows correctly post-migration (URL, not base64 blob)

### Auth / token checks
- [ ] Login → DevTools → Application → Cookies → decode Firebase token at jwt.io
  → `role` and `gym_id` fields present in payload (Custom Claims working)
- [ ] Logout → login again → check token refreshed with claims

### Cache checks
- [ ] DevTools → Application → IndexedDB → `firestore/...` entries exist
- [ ] Reload page → zero Firestore reads in network tab (served from cache)

### Cost monitoring
- [ ] Set GCP billing alert at $5/month (Google Cloud Console → Billing → Budgets)
- [ ] Set second alert at $20/month as hard ceiling

---

## LONG-TERM (AFTER ALL 7 DONE)

- Algolia for member search if any gym exceeds 1,000 members
  (Firestore text search is prefix-only — Algolia gives full-text with typo tolerance)
- Daily Firestore export to GCS via Cloud Scheduler (disaster recovery)
- Per-gym Firestore quota alerts using Cloud Monitoring
- Composite indexes for all remaining client-side sorts (eliminate array.sort() calls)
- Consider subcollection `trainer_profiles/{gymId}/trainers` for public landing page
  (removes the auth-guard workaround in GymLandingPage.jsx)

---

*End of EFFICIENCY.md*
*10 gyms × 500 members baseline | Target: ≤$5/month at 15,000 members*
