# PLAN-workout-collections-lockdown — Close the cross-tenant hole in workout/progress/leads rules

## Goal
Five collections are wide open to ANY authenticated user across ALL gyms: `workout_plans`, `workout_days`, `workout_logs`, `progress_logs`, `soreness_logs` (`allow read, write: if request.auth != null` — firestore.rules ~lines 100-119). `leads` read/update is similarly cross-gym (~line 97). Any member of any gym can read and overwrite every other member's workout history, body-weight progress, and every gym's sales leads from the browser console. Lock these down to owner-or-same-gym-staff, without breaking existing queries.

**Ordering:** do this AFTER PLAN-deploy-pending-stack (it assumes members/staff have `role` + `gym_id` claims minted by `setActiveGymClaim`/`resolveStaffLogin`). Independent of the attendance plan.

## Files to touch
- `firestore.rules` — the six match blocks
- `src/firebase/firestore_real.js` — add `gym_id` to creates: `createWorkoutPlan` (~line 406), `createWorkoutLog` (~line 455), progress-log create (~line 575), soreness-log create (~line 618), and the workout-days create + `incrementallyUpdateWorkoutLog`'s create branch (~line 567)
- Callers that must pass `gym_id` down (find with grep in Step 1)

## Critical design facts (found while exploring — a weaker model WILL get these wrong)
1. **Members now carry `gym_id` claims too.** After the multi-gym rework, `setActiveGymClaim` mints `role: 'member'` + `gym_id` for members. So a rule like `request.auth.token.gym_id == resource.data.gym_id` alone lets every member read gym-mates' personal logs. Staff-side branches MUST also check `request.auth.token.role in ['owner','manager','trainer']`.
2. **Personal collections are keyed by Auth UID, not membership doc id.** `workout_logs`/`progress_logs`/`soreness_logs` docs carry `member_id == request.auth.uid` (the deliberate design decision from the multi-gym rework). The "own data" branch is `resource.data.member_id == request.auth.uid`.
3. **Legacy docs have no `gym_id` field.** None of these creates currently write `gym_id`. Rules needing `resource.data.gym_id` would brick every existing doc. Use a legacy fallback: treat `gym_id == null` docs as accessible to their owner (`member_id` match) and to any staff-role user; enforce the gym match only when the field exists. Tighten later once data is backfilled (backfill itself is out of scope).
4. **Rules are not filters.** Every existing query must still be satisfiable under the new rules. The member-side queries all filter `where('member_id','==', uid)` — fine. Check trainer-side queries on `workout_plans` (~lines 368-397): see what they filter by (`gym_id`? `trainer_id`?) and make sure a staff-role branch admits whatever the query returns. If `getWorkoutPlans` queries by `gym_id`, plans need a staff branch on `gym_id` with the legacy-null fallback.
5. **`workout_days` has no member or gym field** — only `plan_id`. Avoid `get()`-on-parent-plan rules (a read cost on every day-doc access). Instead: add `gym_id` to new day docs at create, and use a permissive-for-legacy rule (`resource.data.gym_id == null || matches claim`) with authed-only as the floor. This is a real but much smaller residual hole (workout day structure, no personal data) — note it in the commit message.

## Implementation order

### Step 1 — Map every reader/writer
```bash
grep -n "workout_plans\|workout_days\|workout_logs\|progress_logs\|soreness_logs\|'leads'" src/firebase/firestore_real.js src/firebase/firestore.js
grep -rln "getWorkoutPlans\|createWorkoutPlan\|createWorkoutLog\|getMemberWorkoutLogs\|addProgressLog\|logSoreness\|getLeads" src/pages src/components
```
For each query note: which field it filters on, and which role runs it (member page vs trainer page vs owner page). This table decides the exact rule branches. Do not skip it.

### Step 2 — Add `gym_id` to all creates in `firestore_real.js`
In each create listed under "Files to touch", spread `gym_id` into the written doc. Source of truth for the value: the caller's `userDoc.gym_id` (staff/trainer pages) or the member's active membership doc (member pages — `userDoc.gym_id` there too, since `userDoc` is the active membership). Thread it as a parameter if the helper doesn't already receive it. Keep field name `gym_id` (snake_case) to match the rest of the app.

### Step 3 — Rewrite the rules
Shape for the three personal-log collections (`workout_logs`, `progress_logs`, `soreness_logs`):
```
function isStaff() {
  return request.auth != null
    && request.auth.token.role in ['owner', 'manager', 'trainer'];
}

match /workout_logs/{logId} {
  allow read, update, delete: if request.auth != null && (
    resource.data.member_id == request.auth.uid
    || (isStaff() && (resource.data.gym_id == null
                      || resource.data.gym_id == request.auth.token.gym_id))
  );
  allow create: if request.auth != null && (
    request.resource.data.member_id == request.auth.uid || isStaff()
  );
}
```
(duplicate for the other two; `soreness_logs`/`progress_logs` may use a different owner field — confirm the actual field name from the create code at ~lines 575/618 before writing the rule).

`workout_plans` / `workout_days`: read for any authed user **in the same gym or legacy-null** (members must read their assigned plan), write restricted to `isStaff()` with the same gym/legacy check.

`leads`: replace `allow read, update: if request.auth != null` with:
```
allow read, update: if request.auth != null
  && request.auth.token.role in ['owner', 'manager', 'receptionist']
  && resource.data.gym_id == request.auth.token.gym_id;
```
Leads DO carry `gym_id` (the public create rule whitelists it), so no legacy fallback needed — but verify LeadsDashboard's query filters by `gym_id` (Step 1) or the read will fail. Keep the public `create` rule exactly as is (that's the website lead form).

### Step 4 — Validate, build, deploy, verify
```bash
firebase deploy --only firestore:rules   # deploy validates syntax
npm run build && npm run lint
```
Push client changes to `main` for Vercel. Then walk the flows in Step 5 of acceptance.

## Acceptance criteria
- [ ] As member A (console): reading member B's `workout_logs` / `progress_logs` doc by id → permission-denied; own pages (MemberWorkout, MemberProgress) fully work, including logging a workout and a weight entry.
- [ ] As a trainer: WorkoutPlanList, WorkoutPlanBuilder, AssignWorkout all work; can view an assigned member's logs.
- [ ] As a member of gym X with a forged query for gym Y's `leads` → permission-denied; LeadsDashboard still lists leads for the owner; the public landing-page lead form still submits while signed out.
- [ ] New docs in all five collections contain `gym_id`; old docs still readable by their owners (test with a pre-existing member's workout history page).
- [ ] `firebase deploy --only firestore:rules` succeeded and no page in the member/trainer/owner workout flows shows a Firestore permission error in the console.
