# GYMLY — Efficiency Optimisation Prompt Chain
# Project: gymly-app-06 | IDE: Antigravity 2.0 with Claude Code
# Use these prompts in order. Do not skip steps. Do not combine sessions.
# Last updated: 2026-06-05

---

## HOW TO USE THIS FILE

Each session has:
- **LOAD FIRST** — what to paste into Antigravity before anything else
- **PROMPT** — the exact task prompt to give Claude Code
- **GATE** — what you must verify BEFORE moving to the next session
- **UNDO** — how to reverse the change if something goes wrong

Paste prompts exactly as written. Add no extra instructions mid-prompt.
If Claude Code asks a clarifying question, answer it and then say "continue."

---

## SESSION 0 — PREREQUISITE CHECK
*Run this before starting any optimisation sessions. Takes 5 minutes.*

### LOAD FIRST
```
Read AGENTS.md completely before doing anything. Do not touch any file.
```

### PROMPT
```
Read AGENTS.md.

Then do a read-only audit — do not change any file:

1. Open src/firebase/config.js. Tell me exactly what localCache is currently set to:
   memoryLocalCache or persistentLocalCache.

2. Open src/context/AuthContext.jsx. Find the section inside onAuthStateChanged where
   the user profile is fetched. Tell me: is it onSnapshot or getDoc?

3. Search src/ for 'last_seen'. List every file and line where last_seen is written
   to Firestore.

4. Search src/ for 'attendance_count'. List every file and line where attendance_count
   is incremented on a Firestore document.

5. Open functions/index.js. List all exports currently defined.

Report findings only. No code changes.
```

### GATE
Review the audit output. Confirm:
- [ ] config.js uses memoryLocalCache (if already persistentLocalCache, skip Session 1)
- [ ] AuthContext uses onSnapshot (if already getDoc, skip Session 2)
- [ ] You know exactly which files write last_seen and attendance_count
- [ ] You have the current functions/index.js export list

---

## SESSION 1 — O-1: PERSISTENT CACHE
*Estimated time: 15 minutes including build and test*

### LOAD FIRST
```
Read AGENTS.md completely before doing anything. Do not touch any file.
```

### PROMPT
```
Read AGENTS.md.

Open src/firebase/config.js.

Make exactly this change and no others:

1. Replace the memoryLocalCache import. The new import line is:
   import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

2. Replace the initializeFirestore call with:
   const db = initializeFirestore(app, {
     localCache: persistentLocalCache({
       tabManager: persistentMultipleTabManager()
     })
   });

Show me the full unified diff before applying anything.
Do not change any other file. Do not add comments.

After I approve the diff:
- Apply the change
- Run: npm run build
- Paste the last 10 lines of build output here
```

### GATE
- [ ] `npm run build` shows zero errors
- [ ] Open app in browser → DevTools → Application → IndexedDB → should show `firestore/` entries
- [ ] Reload the page → Network tab → zero Firestore requests on reload (cache hit)

### UNDO
```js
// Revert config.js to:
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';
const db = initializeFirestore(app, { localCache: memoryLocalCache() });
```

---

## SESSION 2 — O-4 + O-6: REPLACE ONSNAPSHOT + THROTTLE WRITES
*Estimated time: 30 minutes. These two changes are in the same session because both*
*touch AuthContext.jsx and neither requires a Cloud Function deploy.*

### LOAD FIRST
```
Read AGENTS.md completely before doing anything. Do not touch any file.
```

### PROMPT
```
Read AGENTS.md.

This session makes two changes. Show diffs separately. Apply only after I approve each.

── CHANGE A: Replace onSnapshot with getDoc in AuthContext.jsx ───────────────

Open src/context/AuthContext.jsx.

Find the onSnapshot call that fetches the user profile document inside
onAuthStateChanged. Replace it with a one-time getDoc call.

Requirements:
- Import getDoc from 'firebase/firestore' if not already imported
- Remove onSnapshot import if it becomes unused after this change
- The getDoc result should set userDoc state and then setLoading(false)
- No cleanup/unsubscribe needed (no listener)
- Add a refreshUserDoc async function to the component:
    const refreshUserDoc = async () => {
      if (!user) return;
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) setUserDoc(snap.data());
    };
- Export refreshUserDoc in the context value object

Show diff A before applying.

── CHANGE B: Throttle last_seen writes ──────────────────────────────────────

Search src/ for every location where last_seen is written to Firestore.
For each location, wrap the write with this throttle logic:

  const THROTTLE_MS = 30 * 60 * 1000;
  const key = `last_seen_write_${uid}`;
  const lastWrite = parseInt(sessionStorage.getItem(key) || '0', 10);
  if (Date.now() - lastWrite >= THROTTLE_MS) {
    await updateDoc(doc(db, 'users', uid), { last_seen: serverTimestamp() });
    sessionStorage.setItem(key, String(Date.now()));
  }

Show diff B (all affected files) before applying.

── CHANGE C: Remove attendance_count client writes ──────────────────────────

Search src/ for every location where attendance_count is incremented on a
Firestore /users document. Remove those lines. Add a comment:
  // attendance_count is maintained server-side by gymStats Cloud Function (O-3)

Show diff C before applying.

After I approve all three diffs:
- Apply A, B, C
- Run: npm run build
- Paste the last 10 lines of build output
```

### GATE
- [ ] `npm run build` shows zero errors
- [ ] Login → Firebase Console → Firestore → Usage shows one read, not continuous reads
- [ ] Edit profile → save → profile updates correctly (refreshUserDoc fires)
- [ ] Check DevTools → Application → Session Storage → `last_seen_write_{uid}` key present
- [ ] Reload within 30 min → no last_seen write in network tab

### UNDO — Change A (onSnapshot restore)
```js
// Restore the onSnapshot block from git:
git diff HEAD~1 src/context/AuthContext.jsx
git checkout HEAD~1 -- src/context/AuthContext.jsx
```

### UNDO — Changes B and C
```js
git checkout HEAD~1 -- <affected files>
```

---

## SESSION 3 — O-2: CUSTOM CLAIMS
*Estimated time: 45 minutes. Requires a function deploy and rules deploy.*
*Prerequisites: Session 0 audit complete. O-1, O-4, O-6 shipped and verified.*

### LOAD FIRST
```
Read AGENTS.md completely before doing anything. Do not touch any file.
```

### PROMPT PART 1 — Create and deploy the function
```
Read AGENTS.md.

Task 1: Create functions/src/userClaims.js as a CommonJS (.js, NOT .ts) file.
Requirements:
- Firestore onWrite trigger on /users/{uid}
- If document deleted: call admin.auth().setCustomUserClaims(uid, {}) — clear claims
- If document exists: read role and gym_id fields
- If role or gym_id is missing: log and return null (do not set claims)
- Call admin.auth().setCustomUserClaims(uid, { role, gym_id })
- Wrap setCustomUserClaims in try/catch:
    - auth/user-not-found: log a message and return null (expected for addDoc members)
    - Any other error: rethrow
- Log the uid, role, gym_id on success

Show me the complete file content before creating.

Task 2: Add this to the bottom of functions/index.js:
  const { onUserWrite } = require('./src/userClaims');
  exports.onUserWrite = onUserWrite;

Show diff before applying.

After I approve both:
- Create the file
- Apply the index.js change
- Run: firebase deploy --only functions --project gymly-app-06
- Paste the deploy output here
```

### GATE BETWEEN PART 1 AND PART 2
After the function is deployed:
1. Open your own gym owner account
2. Update any field on your /users/{uid} document (e.g. change the name slightly and back)
3. Go to Firebase Console → Authentication → your user → Custom Claims
4. Confirm `role` and `gym_id` are present

Only proceed to Part 2 after confirming claims are working on a real user.

### PROMPT PART 2 — Update rules and frontend
```
Read AGENTS.md.

The userClaims Cloud Function has been deployed and verified working.
Now update rules and frontend.

Task 3: Show me the diff for firestore.rules that replaces every occurrence of:
  get(/databases/$(database)/documents/users/$(request.auth.uid)).data.gym_id
with:
  request.auth.token.gym_id
and every occurrence of:
  get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
with:
  request.auth.token.role

Do not change any other part of the rules file.
After I approve: run firebase rules:check --project gymly-app-06
Paste the check output. If it passes: firebase deploy --only firestore:rules --project gymly-app-06

Task 4: In src/context/AuthContext.jsx, inside onAuthStateChanged, after confirming
the user object exists and before calling loadUserDoc, add:
  await user.getIdToken(true); // Force token refresh to pick up custom claims

Show diff before applying. After I approve: apply, run npm run build.
```

### GATE
- [ ] rules:check passes with no errors
- [ ] Login → DevTools → Application → Cookies → decode token at jwt.io
  → `role` and `gym_id` fields present in token payload
- [ ] All pages load correctly (members, payments, dashboard)
- [ ] Firebase Console → Firestore → Usage — reads drop (no more get() evaluation reads)

### UNDO — Rules
```bash
git checkout HEAD~1 -- firestore.rules
firebase deploy --only firestore:rules --project gymly-app-06
```

---

## SESSION 4 — O-3: STATS DOCUMENT
*Estimated time: 1.5 hours. Requires index deploy + function deploy + rules + frontend.*
*Prerequisites: O-2 custom claims deployed and verified (rules now use token fields).*

### LOAD FIRST
```
Read AGENTS.md completely before doing anything. Do not touch any file.
```

### PROMPT PART 1 — Indexes (deploy and wait)
```
Read AGENTS.md.

Task 1 only: Show me the JSON additions needed in firestore.indexes.json for the
gymStats Cloud Function. The function will query:
- /users where gym_id == x AND role == 'member' AND is_deleted != true
- /payments where gym_id == x AND payment_date >= monthStart
- /attendance_logs where gym_id == x AND entry_time >= todayStart AND entry_time < todayEnd

Show the exact JSON index objects to add. Do not modify the file yet — just show me.
```

After reviewing, apply and deploy manually:
```bash
# After Claude shows the JSON and you approve it:
# Paste the index entries into firestore.indexes.json
firebase deploy --only firestore:indexes --project gymly-app-06
# Then go to Firebase Console → Firestore → Indexes
# WAIT until all new indexes show ENABLED (green) before proceeding
```

### GATE BETWEEN PART 1 AND PART 2
- [ ] Firebase Console → Firestore → Indexes → all 3 new indexes show ENABLED

### PROMPT PART 2 — Function
```
Read AGENTS.md.

Indexes are deployed and ENABLED. Proceed.

Create functions/src/gymStats.js as a CommonJS (.js, NOT .ts) file.
Requirements:
- async function recomputeStats(gymId) that:
    - queries /users (gym_id == gymId, role == 'member', is_deleted != true)
    - counts: total_members, active_members (expiry > now), expiring_today, expiring_7d (within next 7 days)
    - queries /payments (gym_id == gymId, payment_date >= first day of current month)
    - sums: today_revenue (today only), month_revenue (whole month)
    - queries /attendance_logs (gym_id == gymId, entry_time >= todayStart, entry_time < todayEnd)
    - counts: today_attendance
    - writes /gyms/{gymId}/stats/summary with all 8 fields + last_updated timestamp
- in-memory debounce map: 60 seconds per gymId (setTimeout, cleared and reset on each trigger)
- Trigger 1: functions.firestore.document('users/{userId}').onWrite — only if role == 'member'
- Trigger 2: functions.firestore.document('payments/{paymentId}').onWrite
- Trigger 3: functions.firestore.document('attendance_logs/{logId}').onWrite
- Trigger 4: functions.pubsub.schedule('0 0 * * *').timeZone('Asia/Kolkata').onRun
    — calls recomputeStats for every gym doc in /gyms collection
- Export: statsOnUserWrite, statsOnPaymentWrite, statsOnAttendanceWrite, statsResetDaily

Show complete file content before creating.

Task 2: Add the 4 exports to functions/index.js. Show diff.

After I approve both:
- Create the file and apply the index.js diff
- Deploy: firebase deploy --only functions --project gymly-app-06
- Paste deploy output
```

### PROMPT PART 3 — Frontend + rules
```
Read AGENTS.md.

gymStats function is deployed. Now update the frontend and rules.

Task 3: Show me the diff for OwnerDashboard.jsx (or wherever the dashboard stats
are fetched). Replace the full /users and /payments collection queries with a single:
  getDoc(doc(db, 'gyms', gymId, 'stats', 'summary'))
Map the stats doc fields to the existing state variables. If the stats doc does not
exist yet (first deploy), show a "Calculating stats..." message instead of an error.

Task 4: Show me the firestore.rules addition for the stats subcollection:
  match /gyms/{gymId}/stats/{document} {
    allow read: if request.auth != null && request.auth.token.gym_id == gymId;
    allow write: if false;
  }

After I approve both:
- Apply Task 3 diff
- Apply Task 4 diff
- Run: firebase deploy --only firestore:rules --project gymly-app-06
- Run: npm run build
- Paste last 10 lines of build output
```

### GATE
- [ ] Open OwnerDashboard → should load in < 500ms
- [ ] Check Firebase Console → Firestore → `/gyms/{gymId}/stats/summary` document exists
- [ ] Trigger a test: add a test payment → wait 60 seconds → refresh dashboard → today_revenue should update
- [ ] `npm run build` zero errors

### UNDO — If dashboard breaks
```bash
git checkout HEAD~1 -- src/pages/Dashboard/OwnerDashboard.jsx
git push  # triggers Vercel redeploy
```

---

## SESSION 5 — O-5: PAGINATION
*Estimated time: 1 hour. Frontend only — no function deploy needed.*
*Prerequisites: Composite indexes from Session 4 are already ENABLED.*

### LOAD FIRST
```
Read AGENTS.md completely before doing anything. Do not touch any file.
```

### PROMPT
```
Read AGENTS.md.

Task 1: Create src/hooks/usePaginatedCollection.js — a reusable React hook.
Requirements:
- Accepts a Firestore Query object as the base query
- Internally applies limit(25) and startAfter(lastDoc) for pagination
- Returns: { docs, hasMore, loading, loadFirst, loadMore }
- docs: array of { id, ...data() } objects
- hasMore: true if the last page returned exactly 25 results
- loadFirst: async function that resets and loads the first page
- loadMore: async function that appends the next page
- loading: boolean
Show the complete file content before creating.

Task 2: Update PaymentList to use usePaginatedCollection.
- The base query should be: query(collection(db, 'payments'), where('gym_id', '==', gymId), orderBy('payment_date', 'desc'))
- Show first 25, add a "Load more" button below the list that calls loadMore()
- Keep existing search/filter but apply it client-side on already-loaded docs only
- Keep any export-to-CSV or export-to-PDF functionality — it should work on loaded docs
Show diff before applying.

Task 3: Same for AttendanceLogs.
- Base query: query(collection(db, 'attendance_logs'), where('gym_id', '==', gymId), orderBy('entry_time', 'desc'))
Show diff before applying.

Task 4: Same for MemberList.
- Base query: query(collection(db, 'users'), where('gym_id', '==', gymId), where('role', '==', 'member'), where('is_deleted', '!=', true), orderBy('name', 'asc'))
Show diff before applying.

After I approve all 4 diffs:
- Create the hook file
- Apply all 3 component diffs
- Run: npm run build
- Paste last 10 lines of build output
```

### GATE
- [ ] PaymentList shows 25 items, "Load more" visible, clicking it loads next 25
- [ ] AttendanceLogs same
- [ ] MemberList same
- [ ] Search/filter still works on loaded results
- [ ] `npm run build` zero errors

---

## SESSION 6 — O-7: BASE64 PHOTO MIGRATION
*Estimated time: 1 hour including migration run.*
*Prerequisites: All previous sessions complete. Run during low-traffic period.*

### LOAD FIRST
```
Read AGENTS.md completely before doing anything. Do not touch any file.
```

### PROMPT
```
Read AGENTS.md.

Task 1: Create functions/src/migratePhotos.js as a CommonJS (.js, NOT .ts)
admin-only HTTPS callable Cloud Function.
Requirements:
- Auth guard: caller must be authenticated AND have role === 'admin' in /users/{uid}
- Use functions.runWith({ timeoutSeconds: 540, memory: '1GB' })
- Query /users in batches of 20 using startAfter cursor pagination (loop until empty)
- For each doc where profile_photo starts with 'data:image':
    - Extract the base64 data and mime type
    - Upload to Firebase Storage at path: profile_photos/{gym_id}/{userId}.{ext}
    - Get the public download URL
    - Update the user doc: set profile_photo = download URL
- Add 200ms delay between each batch (not each document)
- Wrap each document migration in try/catch — one failure must not stop the batch
- Return { migrated: number, failed: number }
Show complete file content before creating.

Task 2: Add export to functions/index.js:
  const { migratePhotos } = require('./src/migratePhotos');
  exports.migratePhotos = migratePhotos;
Show diff before applying.

Task 3: Search src/ for the profile photo upload component (search for 'FileReader',
'base64', 'profile_photo', 'toDataURL'). Show me the current upload code.
Then show a diff that changes the upload to use Firebase Storage directly:
- Use uploadBytes(ref(storage, path), file) to upload the File object
- Use getDownloadURL to get the URL
- Save the URL string to Firestore (not the base64 string)
Show diff before applying.

After I approve all 3:
- Create the migration function file
- Apply the index.js and upload component diffs
- Deploy: firebase deploy --only functions --project gymly-app-06
- Run: npm run build
- After successful deploy, tell me the exact browser console command to run
  the migration as an authenticated admin user
```

### Run the migration
After the function is deployed and the build passes, open the app in a browser as an admin user and run in the console:
```js
// Paste this in browser console as admin user:
const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js');
// Or use the app's already-loaded Firebase Functions instance
const migrate = httpsCallable(window.__firebase_functions, 'migratePhotos');
const result = await migrate({});
console.log('Migration result:', result.data);
// Expected: { migrated: N, failed: 0 }
```

### GATE
- [ ] Migration result shows `failed: 0`
- [ ] Open a member profile — photo displays correctly (URL, not blob)
- [ ] Firebase Console → Firestore → a few user docs → profile_photo field is now a URL string
- [ ] Firebase Console → Storage → `profile_photos/` folder has the uploaded images
- [ ] New photo upload works (goes to Storage, not Firestore base64)
- [ ] `npm run build` zero errors

---

## FINAL VERIFICATION SESSION

### PROMPT
```
Read AGENTS.md.

Perform a read-only final audit of the efficiency optimisations:

1. Open src/firebase/config.js — confirm persistentLocalCache is in use
2. Open src/context/AuthContext.jsx — confirm onSnapshot is NOT used for user profile,
   confirm refreshUserDoc is exported, confirm getIdToken(true) is called after login
3. Search src/ for 'last_seen' — confirm every write is throttled via sessionStorage
4. Search src/ for 'attendance_count' with updateDoc — confirm no client writes remain
5. Open functions/src/userClaims.js — confirm it exists and exports onUserWrite
6. Open functions/src/gymStats.js — confirm it exists and exports all 4 functions
7. Open src/hooks/usePaginatedCollection.js — confirm it exists
8. Open functions/src/migratePhotos.js — confirm it exists
9. Open functions/index.js — list all exports and confirm all 7 optimisation exports are present
10. Open firestore.rules — confirm no get() evaluation calls remain (all replaced with token reads)

Report findings. No code changes.
```

---

## COST TRACKING

After each session, note the change in Firebase Console → Firestore → Usage.

| Session | Optimisation | Reads before | Reads after | Notes |
|---------|-------------|--------------|-------------|-------|
| 1 | O-1 Persistent Cache | | | |
| 2 | O-4 + O-6 onSnapshot + throttle | | | |
| 3 | O-2 Custom Claims | | | |
| 4 | O-3 Stats Document | | | |
| 5 | O-5 Pagination | | | |
| 6 | O-7 Base64 Migration | | | |

---

*End of prompt chain*
*Target: ~$0.47/month at 10 gyms × 500 members | ~$2.93/month at 15 gyms × 700 members*
