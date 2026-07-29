# PLAN-staff-checkin-toggle — Phase 3: `settings.staff_checkin_enabled` owner toggle

## Goal
Add an owner-facing settings toggle `settings.staff_checkin_enabled` on the gym doc. Per the owner's explicit scoping decision: **this is the option only** — no staff attendance sessions feature is being built yet, and `processScan` should NOT be changed to consume it. It's an additive flag so the UI choice exists when the staff-attendance feature lands later. Smallest plan of the five; good filler task any time after (or independent of) the deploy plan.

## Files to touch
- `src/pages/Settings/OwnerSettings.jsx` — only file.

## Implementation order

### Step 1 — Copy the existing toggle pattern exactly
`OwnerSettings.jsx` already has the identical pattern for `settings.workout_enabled` (~lines 377-385, handler + optimistic local state) and `settings.require_agreement` (~line 369). Replicate it:

1. State: wherever the loaded gym is kept (`getGym(userDoc.gym_id)` load at ~line 101), the toggle reads `gym.settings?.staff_checkin_enabled ?? false`. The `?? false` matters — **existing gyms have no such key, and some old gyms may have no `settings` map at all**; treat missing as OFF.
2. Handler, mirroring `handleWorkoutToggle`:
```jsx
const handleStaffCheckinToggle = async (value) => {
  await updateGym(userDoc.gym_id, { 'settings.staff_checkin_enabled': value });
  // + the same optimistic setState/toast pattern the neighbors use
};
```
Firestore dot-path updates create the nested `settings` map if absent — no migration needed.
3. UI: add a toggle row next to the workout/agreement toggles, matching their exact markup/CSS classes. Label: "Staff check-in" with sub-text like "Allow staff to check in with their own QR at the kiosk (feature coming soon)". Since nothing consumes the flag yet, the sub-text must say "coming soon" so an owner flipping it doesn't expect behavior to change today.

### Step 2 — Do NOT do these (scope traps)
- Do not modify `functions/src/processScan.js` to read the flag — staff check-in sessions aren't built; there is nothing to gate.
- Do not add a `staff_sessions` collection or rules.
- Do not surface the toggle to managers/receptionists. Only OwnerSettings, which is already owner-routed (`allowedRoles={['owner']}` in App.jsx), and the `gyms` update rule already restricts writes to `owner_id == request.auth.uid` — so no rules change is needed. (Note: staff cannot flip it even via console, because the gyms update rule checks `owner_id`, not gym claims.)

### Step 3 — Build & verify
```bash
npm run lint && npm run build
```
Push to `main` (Vercel auto-deploys). No firebase deploy needed — client-only change.

## Edge cases found while exploring
- `gym.settings` may be entirely undefined on old gym docs → every read must be `gym.settings?.staff_checkin_enabled ?? false`, and the optimistic state update must spread `...prev.settings` the way the taxConfig handler does (~line 224), not replace the map.
- OwnerSettings mixes two update styles (whole-object like `working_hours`, dot-path like `settings.workout_enabled`). Use the **dot-path** style — whole-object `settings: {...}` would clobber sibling settings written concurrently.
- The toggle must be rendered from the loaded gym doc, not local-only state, so a reload reflects the persisted value.

## Acceptance criteria
- [ ] OwnerSettings shows the new toggle, default OFF for an existing gym.
- [ ] Flipping it ON writes `settings.staff_checkin_enabled: true` on the gym doc (verify in Firestore console) and survives a page reload.
- [ ] Other settings (workout toggle, agreement toggle, tax config, plans) are untouched on the doc after flipping it (no map clobber).
- [ ] Receptionist/trainer cannot reach the settings route (existing guard — spot-check `/owner/settings` as receptionist redirects away).
- [ ] `npm run lint` and `npm run build` pass.
