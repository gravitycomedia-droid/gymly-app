# HANDOFF — Owner Dashboard Performance

**Master plan:** [PLAN-owner-dashboard-performance.md](PLAN-owner-dashboard-performance.md) — read this first, it has the full diagnosis.
**Status as of 2026-07-29:** Phase 1 verified in-browser (mock-role bypass, screenshots clean — icons render, no CLS). Phase 5 complete (not deployed). Phase 2 complete, verified in-browser (not deployed). Phase 6 complete, build-verified (not deployed). Phases 3 and 4 both implemented, build/dev-server verified — **both need live OTP testing (owner/staff/member) before they ship**, see caveats below and the full verification checklist at the bottom of this file.
**Dev server:** `npm run dev` → http://localhost:5173/

---

## Phase 1 — DONE ✅ (fonts)

### What changed

| File | Change |
|---|---|
| [src/index.css:1-3](src/index.css#L1-L3) | Deleted the three `@import url(...)` font requests; replaced with a comment warning not to re-add them |
| [src/index.css:82-94](src/index.css#L82-L94) | New base `.material-symbols-outlined` rule — reserves a 1em box (the CLS fix) |
| [index.html:17-35](index.html#L17-L35) | One consolidated font block: 4 preconnects + 1 text stylesheet + 1 icon stylesheet with `&display=swap` and `&icon_names=` |
| [scripts/extractIconNames.cjs](scripts/extractIconNames.cjs) | **New.** Generates/verifies the icon subset list |
| [package.json](package.json) | Added `npm run icons` and `npm run icons:check` |
| [.gitignore](.gitignore) | Ignores `scripts/.cache/` (cached Google icon metadata) |

### Measured result

| | stylesheets | latin WOFF2 files | bytes |
|---|---|---|---|
| Before | 5 | 20 text + 2 icon | **3,026,512** |
| After | 2 | 3 text + 1 icon | **155,272** |

The icon font alone was **1.12 MB downloaded twice** — the HTML link (4-axis) and the CSS `@import` (2-axis) returned different files, so nothing deduped. It is now a **41.9 KB, 140-icon subset**.

### Decisions that deviate from the plan (and why)

1. **Weight ranges, not enumerated weights.** The plan said "audit the weights and list only what's used." Better: `wght@400..800` returns **one variable WOFF2 per unicode subset**, while `wght@400;500;600` returns one static file *per weight*. Verified against the live API — Inter alone went from 21 `@font-face` blocks to 7. Audited usage first: CSS uses 400/500/600/700/800, Tailwind adds `font-normal|medium|semibold|bold`. Ranges shipped: Hanken Grotesk `400..800`, Inter `400..800`, Geist `400..700`.

2. **Icon extraction is list-driven, not regex-driven.** The plan's appendix had 95 hand-extracted names and warned they were incomplete. The script instead downloads Google's official **4,222-name metadata** and intersects it with every candidate string in `src/`. Over-inclusion is nearly free (~300 bytes/glyph), misses are what break the UI — so the filter runs in the safe direction. Found **140** icons.

   This caught a real bug: the first pass missed `sensors` and `wifi_off` in [ReceptionistDashboard.jsx:381](src/pages/RoleDashboards/ReceptionistDashboard.jsx#L381) and [:583](src/pages/RoleDashboards/ReceptionistDashboard.jsx#L583), which style icons with an inline `sym` object instead of the `material-symbols-outlined` class. Exactly the "renders as literal text" failure the plan warned about.

3. **No `overflow: hidden` on icons.** The plan suggested clipping so the fallback ligature text can't spill. Checked the font metrics with fontTools first: **unitsPerEm 960, glyph ink runs to y=-91** (0.095em *below* the baseline), and with `line-height: 1` the baseline sits on the box's bottom edge — clipping would have shaved the bottom off every icon. Advance width is exactly 1em (960/960), so `width/height: 1em` alone fixes the shift with zero clipping risk.

### ⚠️ Gotchas for whoever picks this up

- **The icon font is now a subset.** Adding a new icon to the UI *requires* adding its name to `icon_names=` in [index.html](index.html), or it renders as the literal word. Run `npm run icons` and paste the output. **`npm run icons:check` fails loudly if you forget** — worth wiring into CI or a pre-commit hook.
- Google Fonts **rejects unsorted `icon_names`** with `400: Invalid selector`. Keep them alphabetical (the script already sorts).
- Never re-add `@import url(...)` for fonts to any CSS file. Vite hoists it into the built stylesheet, which re-chains fonts behind the 80 KB CSS download.

### Still unverified — do this first

Phase 1 was verified at **build level only** (build passes, `@import`s gone from `dist/assets/index-*.css`, live font URLs return 200, subset resolves). There was no Chrome DevTools MCP in that session, so **nobody has looked at it in a browser yet.**

1. Open http://localhost:5173/ and eyeball every screen for icons rendering as literal text (`fitness_center` instead of 🏋). Highest-risk screens: **ReceptionistDashboard**, **OwnerLayout sidebar / BottomNav** (`{item.icon}`), **MembershipPlansList** (ternary icon at [line 159](src/pages/MembershipPlans/MembershipPlansList.jsx#L159)).
2. Check icon vertical alignment didn't shift — the new `width/height: 1em` rule is global.
3. Re-run the `web-perf` audit on `/owner/dashboard`, throttled (Slow 4G + 4× CPU). Record LCP / CLS / critical path against the baseline: **LCP 2,405 ms, render delay 2,401 ms, critical path 3,439 ms, CLS 0.05**.

---

## Next up — recommended order

Phases 3 and 4 touch the auth entry point and need **live OTP regression testing for owner, staff and member**. Everything else is safe to do without a test login, so do the safe work first.

### → Phase 5 — DONE ✅ (dashboard data)

**Files changed:** [OwnerDashboard.jsx](src/pages/OwnerDashboard/OwnerDashboard.jsx), [OwnerLayout.jsx](src/components/layouts/OwnerLayout.jsx), [AuthContext.jsx](src/context/AuthContext.jsx), new [hooks/useNewLeadsCount.js](src/hooks/useNewLeadsCount.js)

- **`getGym` 3× → 1×.** Both `OwnerLayout` and `OwnerDashboard` now consume `gymDoc` from `useAuth()` instead of fetching their own copy. Their local `getGym` calls and `gym`/`gymName` state are deleted.
  Bonus landed: `OwnerDashboard`'s full-page blocking spinner is gone — it was gated on a `loading` flag set only by the deleted fetch.
  **Gotcha found and fixed:** the dev `mockRole` bypass in `AuthContext.jsx` (~line 104) set `userDoc` but never called `refreshGymDoc`, so `gymDoc` stayed `null` in mock mode. Once the two consumers stopped doing their own fetch, mock-mode testing would have silently shown an empty gym name. Fixed by calling `refreshGymDoc('mock_gym_123')` in the mock branch — verified via Playwright screenshot that "Iron Temple Fitness" still renders in both the sidebar and dashboard greeting under `mockRole=owner`.
- **`leads` listener deduped.** Extracted into `src/hooks/useNewLeadsCount.js` (same shape as the existing `useLiveOccupancy` hook); both `OwnerLayout` and `OwnerDashboard` now call it instead of each running an identical `onSnapshot` query.
- **4 × `getCountFromServer` moved off the critical path**, not deleted — the deliberate stats-can-be-stale comment is preserved. Now deferred via `requestIdleCallback` (setTimeout(200) fallback) so they fire after idle instead of competing with mount-time fetches. The existing `memberCounts ?? stats ?? 0` fallback chain already renders `stats` first while the deferred counts resolve in the background.

**Verified:** `npm run build` passes, `npx eslint` shows the same pre-existing warning count as before the change (no new lint errors introduced), and Playwright screenshots of `/owner/dashboard` under the mock-role bypass are pixel-identical before/after — gym name, stats, and icons all render correctly with no blocking spinner.

### → Phase 2 — DONE ✅ (unblock the route chunk)

**Files changed:** new [src/routePreload.js](src/routePreload.js), [App.jsx](src/App.jsx), [ProtectedRoute.jsx](src/components/ProtectedRoute.jsx), [OwnerLogin.jsx](src/pages/Login/OwnerLogin.jsx)

Root cause was [ProtectedRoute.jsx:9-17](src/components/ProtectedRoute.jsx#L9-L17) returning a spinner while `loading`, so `<OwnerDashboard />` never mounted, so `React.lazy`'s `import()` never fired — the chunk queued *behind* the whole auth waterfall.

- Pulled the anonymous `() => import('./pages/OwnerDashboard/OwnerDashboard')` factory out into `importOwnerDashboard` in the new `routePreload.js`, so the same function reference can be called directly instead of only through `lazy()`.
- `ProtectedRoute` now takes an optional `preload` prop and fires it in a mount-only `useEffect` — independent of the `loading` gate, so the chunk request starts the instant the route guard mounts. Wired only onto the `/owner/dashboard` route (`preload={importOwnerDashboard}` in App.jsx), not globally, so unrelated public pages don't pay for it.
- `OwnerLogin.jsx`'s `handleVerify` calls `importOwnerDashboard()` right after `verifyOTP` succeeds, before `navigate('/')` — starts the fetch even earlier than the ProtectedRoute mount, in parallel with AuthContext's token/Firestore round-trip. Calling the same import factory twice is safe; the browser/bundler dedupes the request.

**Verified:** `npm run build` still splits `OwnerDashboard` into its own chunk (confirms the factory extraction didn't break code-splitting), `eslint` clean, and a Playwright script against the dev server (mock-role bypass, navigating straight to `/owner/dashboard`) showed the module request firing ~375 ms after navigation start with the dashboard rendering correctly afterward (gym name, stats, sidebar all present, no visual regression). Remaining console errors were pre-existing Firestore permission-denied noise from the mock UID hitting real security rules — unrelated to this change.

### → Phase 6 — DONE ✅ (build & delivery)

**Files changed:** [vite.config.js](vite.config.js), [vercel.json](vercel.json), [package.json](package.json), [package-lock.json](package-lock.json)

- **`manualChunks`** added to `vite.config.js`, splitting `firebase`/`@firebase`, `framer-motion`, `react-router`, and `react`/`react-dom`/`scheduler` out of the entry chunk into their own vendor chunks by `node_modules` package match. Entry chunk went from **1,117 kB / 295 kB gzip → 66.6 kB / 18.8 kB gzip**. Firebase is now its own 697 kB / 164 kB gzip chunk — still large (that's the SDK, not this change), but now it's a stable chunk that app code changes won't invalidate.
- **Cache headers** added to `vercel.json`: `/assets/*` (Vite's hashed output) → `public, max-age=31536000, immutable`; `favicon.svg`/`manifest.webmanifest`/`icons.svg` → `public, max-age=86400, must-revalidate`; `/sw.js` → `public, max-age=0, must-revalidate` (service worker must never be cached stale). `index.html` deliberately left with no explicit rule — it's unhashed and must always revalidate, which is already the default with no Cache-Control set.
- **Dropped `lucide-react`** (0 imports, as planned) and **`recharts`** (found during the same audit — also 0 imports, 8.5 MB in `node_modules`) via `npm uninstall`. Neither appeared in any built chunk before removal, so this is a devDependency-install-size win only, not a bundle-size win.

**Verified:** `npm run build` passes clean, produces the expected vendor chunk split, PWA precache manifest regenerates without error. `npm run lint` shows the same pre-existing 356 problems as before this change (none introduced) — confirmed by grepping for the two removed packages returning zero hits in `src/` prior to removal.

### → Phase 3 — IMPLEMENTED, needs live OTP verification before deploy

**Files changed:** [src/firebase/config.js](src/firebase/config.js), [src/firebase/firestore.js](src/firebase/firestore.js), [AuthContext.jsx](src/context/AuthContext.jsx), [AddMember.jsx](src/pages/Members/AddMember.jsx), [MemberWorkout.jsx](src/pages/MemberWorkout/MemberWorkout.jsx)

- **`getAuth(app)` → `initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence] })`.** Confirmed via grep that the app has zero `signInWithPopup`/`signInWithRedirect`/`GoogleAuthProvider` usage anywhere — phone OTP (`RecaptchaVerifier` + `signInWithPhoneNumber`, [src/firebase/auth.js](src/firebase/auth.js)) is the only auth path, and that doesn't touch the popup/redirect resolver, so dropping it should be safe. Confirmed in the build: `vendor-firebase` chunk shrank **697 kB → 664 kB gzip** (156 kB gzip, down from 164 kB) from this alone.
- **`initializeAppCheck` deferred one `requestAnimationFrame` tick** past module evaluation, and the `firebase/app-check` import itself is now dynamic (not loaded/parsed at all unless `VITE_RECAPTCHA_SITE_KEY` is set). Kept the delay to a single frame rather than `requestIdleCallback` — App Check enforcement risk is real and unverifiable locally (see caveat below), so this trades away only literal-milliseconds instead of an unbounded idle-callback delay.
- **`storage`/`functions` were left as eager `getStorage(app)`/`getFunctions(app)` calls, NOT made lazy.** Decided against this mid-implementation: both are ~20-callsite imports across Settings/Payments/Admin/Kiosk/Scanner pages, and unlike Auth's resolver or App Check's reCAPTCHA script, `getStorage`/`getFunctions` don't load any extra remote script at construction — they're synchronous object constructors. A lazy-init wrapper (e.g. a `Proxy`) would add real risk (Firebase's modular SDK relies on internal provider/component registries keyed by the actual instance, which a naive property-forwarding proxy could break in ways that wouldn't show up until a specific upload or Cloud Function call at runtime) for a payoff that's just deferring a cheap constructor call. Skipped.
- **`mockFirestore.js`** (343-line dev fixture module) is now a `dev`-gated dynamic `import()` in [firestore.js](src/firebase/firestore.js) instead of a static `import * as mock`. Vite/Rollup dead-code-eliminates the whole dynamic-import branch from prod builds since `import.meta.env.DEV` is inlined to `false` there.
- **Dropped `export * from 'firebase/firestore'`** from firestore.js. Traced every consumer with a script (not just grep) — only two files relied on it for raw SDK exports rather than the wrapper functions (`Timestamp`/`doc`/`updateDoc`/`getDoc` in `AddMember.jsx` and `MemberWorkout.jsx`); both now import those directly from `firebase/firestore`. Confirmed no other file depends on the wildcard.

**Verified:** `npm run build` passes clean (entry chunk **61 kB**, down slightly further from Phase 6's 66.6 kB; `vendor-firebase` **664 kB / 156 kB gzip**, down from 697 kB / 164 kB). `npm run lint` — same 356 pre-existing problems, zero new (the one new-looking `getDoc unused` warning in `MemberWorkout.jsx` was already there before this change, just via the proxy import). Ran the dev server and fetched every changed file through Vite's transform endpoint (`curl localhost:5174/src/firebase/config.js` etc.) — all return 200 with valid transformed ESM, confirming no syntax/import errors; also confirmed `mockFirestore.js`'s dynamic import resolves to a real module URL.

**⚠️ NOT verified — could not run a real browser in this sandbox.** Headless Chromium's binary download (Playwright) hung against this sandbox's network egress rules (npm registry access worked, Playwright's CDN did not), so nobody has actually loaded the app in a browser and watched the console since these changes landed. Two things specifically need eyes before this ships:
1. **Live OTP login for owner, staff, and member roles** — the `initializeAuth` swap touches the one code path (`RecaptchaVerifier`/`signInWithPhoneNumber`) that the mock-role bypass skips entirely.
2. **App Check enforcement**, if prod has `VITE_RECAPTCHA_SITE_KEY` set — the deferral is only a single animation frame, but this is unverifiable locally (the var is absent in dev) and was flagged as the riskiest single piece of Phase 3. Watch Firebase Console → App Check for a spike in rejected requests right after this deploys.

### → Phase 4 — IMPLEMENTED (3 of 4 sub-items), needs live OTP verification before deploy

**Files changed:** [AuthContext.jsx](src/context/AuthContext.jsx)

Per [PLAN-owner-dashboard-performance.md](PLAN-owner-dashboard-performance.md)'s Phase 4 (items 11-14):

- **Item 11 — stopped force-refreshing the token on every load.** Deleted the unconditional `if (!tokenRefreshed.current) { ...await getIdToken(true)... }` block (and the now-unused `tokenRefreshed` ref). The auth listener now reads `getIdTokenResult()` once, uncached-but-not-forced, and reuses that single read for both the `super_admin` claim and the gym-claim check below — consolidating what was two separate `getIdTokenResult()` calls (one for super_admin, one inside the healing check) into one.
- **Item 12 — parallelized the profile + gym fetch.** `getUser(uid)` and `refreshGymDoc(claims.gym_id)` (when the claim is already present — the common case for a returning session) now run via `Promise.all` instead of gym-doc waiting on the user-doc round trip finishing first. Added a check to skip the second `refreshGymDoc` call entirely when `fetchedDoc.gym_id` agrees with the claim (which it does in steady state) — a small extra win beyond what the plan asked for, purely additive, doesn't change behavior when they disagree (still corrects to the doc's gym_id, matching old behavior).
- **Item 14 — replaced the hard 2 s sleep with backoff polling.** New `waitForClaim(firebaseUser, claimKey, delays)` helper force-refreshes the token on a schedule (`150, 300, 600, 950` ms — sums to the same 2000 ms worst-case ceiling as the sleep it replaces) and returns as soon as the claim appears, instead of always blocking the full 2 seconds regardless of how fast the `onUserWrite` Cloud Function actually completes.
- **Item 13 — deliberately skipped.** The plan wanted `getUser()` in `firestore_real.js` made cache-first (resolve from `getDoc` instantly, revalidate via `getDocFromServer` in the background). Didn't do this because `getUser` is a **shared function used by 4 other single-shot callers** — `EditMember.jsx`, `MemberProfile.jsx`, `AssignWorkout.jsx`, `PublicCard.jsx` — that `await` it once to populate a view or edit form. A generic cache-first rewrite would make those pages silently show/edit stale member data with no signal that a fresher version had arrived, since a plain `await` can't receive a second push once it's already resolved. Doing this safely would mean either threading a revalidation callback through all 5 call sites, or duplicating cache-first logic just inside `AuthContext.jsx` bypassing the shared wrapper — both bigger and riskier than the other three items, for a benefit (faster *first paint*, not less total network time — the branching logic later in the same function still has to wait on the authoritative server read regardless) that's marginal by comparison. Left `getUser` untouched.

**A tradeoff worth knowing about:** because item 11 removed the unconditional refresh, a `super_admin` claim change (or any claim change) made to an already-persisted session is no longer guaranteed fresh the instant the app next loads — it now relies on Firebase's own background token refresh cycle (auto-refreshes roughly every ~55 min while a claim is valid). Previously every session start force-refreshed once, so this was always immediate. In practice this only matters for a closed tab reopened before natural expiry, right after an admin claim change happened elsewhere — narrow, but real. Not something to silently paper over; call it out if anyone asks why a role change didn't take effect until they logged out and back in.

**Verified:** `npm run build` passes clean, same entry-chunk size as Phase 3 (this doesn't touch the module graph, just control flow). `npm run lint` — same 356 pre-existing problems, zero new. Fetched `AuthContext.jsx` through Vite's dev transform endpoint — 200 OK, valid ESM, `waitForClaim` present in the output.

**⚠️ NOT verified — same sandbox limitation as Phase 3 (see below).** This is the highest-risk file in the app (multi-branch owner/staff/member/multi-gym-member resolution, claim-healing races) and none of it has been exercised against real Firebase Auth this session.

---

## Final verification checklist — do this before deploying Phases 3 & 4

Everything below is unverified by an actual browser session — do this on `npm run dev` (real Firebase project, mock-role bypass turned **off** — don't set `localStorage.mockRole`) before merging/deploying. Have DevTools console open for all of it.

1. **Owner login (existing account).** Log in with a real owner phone number. Confirm: OTP sends, verifies, lands on `/owner/dashboard` with gym name/stats populated, no console errors. Time it if you can — this is the one that should feel faster (no more unconditional force-refresh).
2. **Staff login (manager/receptionist/trainer).** Log in as staff. Confirm role-appropriate dashboard loads, permissions gate correctly (no owner-only pages leaking through), no console errors. This exercises the `resolveStaffLogin` branch, untouched by Phase 4 but downstream of Phase 3's `initializeAuth` change.
3. **Member login, single gym.** Log in as a member with exactly one membership. Confirm it goes straight to the member home, not the gym picker.
4. **Member login, multiple gyms.** Log in as a member with 2+ memberships. Confirm the gym picker appears, selecting one lands correctly, and `setActiveMembership` still mints the claim (check Network tab for the `setActiveGymClaim` call).
5. **Brand-new signup (the claim-healing path).** Register a new owner (or add a new staff/member and log them in for the first time). This is the one that exercises `waitForClaim` — watch the console/Network tab for the `resolveStaffLogin`/claim-mint round trip and confirm it resolves noticeably before the old fixed 2s would have, and that the dashboard still ends up fully populated (not stuck mid-heal).
6. **Logout / re-login.** Confirm state fully clears (no stale `userDoc`/`gymDoc` flash) and a second login works — checks the removed `tokenRefreshed` ref cleanup didn't break repeat logins in one tab session.
7. **App Check**, only if `VITE_RECAPTCHA_SITE_KEY` is set in the environment you're testing against (likely prod-only — see Phase 3 caveat): watch for `auth/app-check-token-invalid` or similar rejected-request errors in the console or Firebase Console → App Check right after load.
8. **A page each from the four `getUser()` call sites Phase 4 deliberately left untouched** — open `EditMember`, a member's `MemberProfile`, `AssignWorkout`, and a `PublicCard` link once each, just to confirm nothing regressed there (it shouldn't have, since that code wasn't touched, but cheap to check while you're already logged in).

If all eight pass with a clean console, Phases 1-6 are ready to ride along with whatever deploy resolves the pending prod frontend/backend mismatch (see below).

## Standing constraint

Per [PLAN-deploy-pending-stack.md](PLAN-deploy-pending-stack.md): **prod frontend is currently ahead of prod backend.** Sequence these deploys against that plan rather than shipping into an already-inconsistent prod. Phase 1 is committed-but-undeployed and is frontend-only, so it can ride along with whatever deploy resolves that.
