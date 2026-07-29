# PLAN-attendance-rules-lockdown — Phase 2: stop trusting the browser for attendance writes

## Goal
Now that every scan path goes through the `processScan` Cloud Function (Admin SDK, bypasses rules), lock the attendance collections so clients can no longer forge check-ins from the browser console. Today any authenticated user with a gym_id claim can `addDoc` into `attendance_logs`, any anonymous session can write `attendance_sessions` (`isKiosk()` is just "signed in anonymously" — anyone can do that from devtools), and `access_denied_logs` has `allow create: if true` (unauthenticated internet writes — a spam/cost vector).

**HARD GATE: do not start until PLAN-deploy-pending-stack is deployed AND verified in production.** Flipping these rules first breaks every scan flow.

## Files to touch
- `firestore.rules` (the only required change)
- `src/firebase/firestore-kiosk.js` (one client write path to remove — see Step 1)
- Possibly callers of `logAccessDenied` in `src/pages/Kiosk/` (Step 1 tells you how to find them)

## Implementation order

### Step 1 — Find and remove remaining CLIENT writes to these collections
Rules changes must come *after* no client code writes to them. Run:
```bash
grep -rn "addDoc(collection(db, 'attendance_logs'" src/
grep -rn "addDoc(collection(db, 'attendance_sessions'" src/
grep -rn "access_denied_logs" src/
```
Expected findings and what to do:
- `src/firebase/firestore-kiosk.js` has `logAccessDenied()` (~line 204) doing a client `addDoc` to `access_denied_logs`. `processScan` now writes denied logs server-side (`functions/src/processScan.js` ~line 233). For every remaining caller of `logAccessDenied` in kiosk pages: if the denial came from a `processScan` rejection, the server already logged it — delete the client call. If it's a purely client-side denial that never reaches the server (e.g. malformed QR that is never sent), either drop the log or route it through `processScan` so it's rejected (and logged) server-side. Then delete `logAccessDenied` itself if it has no callers left.
- If any `addDoc` to `attendance_logs`/`attendance_sessions` remains in `src/`, that's a scan path that was missed in the processScan migration — migrate it to the `processScan` callable first (copy the call pattern from `ReceptionistDashboard.jsx` or `EntryKiosk`). Do NOT flip the rule while such a path exists.

### Step 2 — Edit firestore.rules

**`attendance_logs`** — creates become server-only; keep gym-scoped read. Also close update/delete (nothing in the app edits attendance logs client-side; verify with `grep -rn "updateDoc(doc(db, 'attendance_logs'" src/` → expect no hits):
```
match /attendance_logs/{logId} {
  allow read: if request.auth != null
    && request.auth.token.gym_id == resource.data.gym_id;
  allow create, update, delete: if false;
}
```

**`attendance_sessions`** — create becomes server-only, **but `update` MUST stay open**:
```
match /attendance_sessions/{sessionId} {
  allow create: if false;
  allow update: if request.auth != null
    && (resource.data.gymId == request.auth.token.gym_id || isKiosk());
  allow read: if request.auth != null
    && (request.auth.token.gym_id == resource.data.gymId || isKiosk());
  allow delete: if false;
}
```
Why update stays open (the edge case a weaker model WILL miss): the 90-minute auto-exit in `src/firebase/firestore-kiosk.js` (~lines 150-152 and ~175) is a **client-side** `updateDoc` fired from the owner dashboard's live-occupancy path (`completeAttendanceSession`). Closing update breaks the owner dashboard's occupancy count. Kiosk reads must also stay (`isKiosk()` in read) — kiosk screens read sessions for dedup/occupancy display.

Note the field-name inconsistency: `attendance_sessions` uses `gymId` (camelCase), `attendance_logs` uses `gym_id` (snake_case). Keep each rule matching its collection's actual field — do not "fix" the inconsistency in rules.

**`access_denied_logs`** — close creates; scope reads to the gym (currently any authed user can read all gyms' denial logs):
```
match /access_denied_logs/{logId} {
  allow read: if request.auth != null
    && (request.auth.token.gym_id == resource.data.gym_id || isKiosk());
  allow create, update, delete: if false;
}
```
Before deploying this read change, check what field the denied-log docs actually carry: look at the object written in `functions/src/processScan.js` ~line 233 and the old client writer in `firestore-kiosk.js` ~line 204. If they use `gymId` instead of `gym_id` (or a mix), match the rule to the real field, or use `(request.auth.token.gym_id in [resource.data.gym_id, resource.data.gymId])`-style tolerance. Also check the reader (`firestore-kiosk.js` ~line 217 and whichever page calls it) queries with a gym filter — a rules-restricted read against an unfiltered query fails outright (rules are not filters).

### Step 3 — Build, deploy, verify
```bash
npm run build        # only needed if Step 1 changed client code
firebase deploy --only firestore:rules
```
If client code changed: commit and push to `main` (Vercel auto-deploys).

## Edge cases found while exploring (recap)
- 90-min auto-exit is a client update → `attendance_sessions.update` must remain open.
- Kiosks are anonymous with no claims → `isKiosk()` branches must remain in read/update.
- `gymId` vs `gym_id` naming differs per collection — rules must match per-collection reality.
- Rules are not query filters: tightening a read rule breaks any client query that doesn't constrain to the caller's gym. Check each reader's query before tightening its read rule.
- `processScan` uses the Admin SDK → completely unaffected by any of these rules. If a scan breaks after this change, the cause is a missed client write path (Step 1), not the function.

## Acceptance criteria
- [ ] From the browser console as a logged-in member: `addDoc(collection(db,'attendance_logs'), {...})` → permission-denied. Same for `attendance_sessions` and `access_denied_logs` (also while signed out for the latter).
- [ ] Kiosk, tablet, staff QR, and receptionist scans all still check members in.
- [ ] Owner dashboard live occupancy still works, and a session older than 90 min still auto-exits (seed one by editing a session's entry time back 2h in the Firestore console, then open the owner dashboard).
- [ ] AttendanceLogs page still lists today's records.
- [ ] `grep -rn "access_denied_logs" src/` shows readers only, no `addDoc`.
