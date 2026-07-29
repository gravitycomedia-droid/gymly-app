# PLAN — Owner Dashboard Performance

**Created:** 2026-07-29
**Target:** `/owner/dashboard` — LCP 2,405 ms (render delay 2,401 ms), critical path 3,439 ms, CLS 0.05
**Stack (confirmed):** Vite 5 + React 19 SPA, `vite-plugin-pwa`, Firebase v12 (phone-OTP auth only), hosted on Vercel

> The DevTools findings you supplied are correct but describe symptoms. This plan maps each
> symptom to the line of code that causes it. Everything below was verified against the repo,
> including a fresh `vite build`.

---

## Verified root causes

### 1. Fonts are requested **twice**, from two places, with mismatched weights

| Where | Request |
|---|---|
| [index.html:13](index.html#L13) | Hanken Grotesk `400;500;600;700` + Inter `400;500;600` + Geist `400;500;600` — `display=swap` |
| [index.html:16](index.html#L16) | Material Symbols, **full 4-axis variable range** `opsz 20..48, wght 100..700, FILL 0..1, GRAD -50..200` — **no `display=swap`** |
| [src/index.css:1](src/index.css#L1) | Inter `300;400;500;600;700` — `display=swap` |
| [src/index.css:2](src/index.css#L2) | Hanken Grotesk `500;600;700` + Geist `500;600` — `display=swap` |
| [src/index.css:3](src/index.css#L3) | Material Symbols `wght,FILL@100..700,0..1` — `display=swap` |

Two consequences, both confirmed in `dist/`:

- **Duplicate font files.** The weight sets differ between the HTML links and the CSS
  `@import`s (Inter `400;500;600` vs `300..700`, Material Symbols 4-axis vs 2-axis), so Google
  Fonts serves a *different* stylesheet and *different* WOFF2 files for each. That is the "12+
  concurrent assets" and "~2,700 ms font load" in your trace.
- **A serialized chain.** Vite hoists the three `@import`s to the top of the built CSS
  (verified: `dist/assets/index-*.css` begins with all three). The browser must download the
  **80 KB** `index.css` before it can even discover them → `HTML → index.css → 3 font CSS → WOFF2`.

**This is the LCP.** The LCP element is a `span.material-symbols-outlined`, and the
`index.html:16` request omits `display=swap` → the icon font defaults to `font-display: block`
→ icons render **invisible** for up to 3 s. That is the 2,401 ms render delay almost exactly.
The `fitness_center` icon in `.dashboard-gym-badge` ([OwnerDashboard.jsx:194](src/pages/OwnerDashboard/OwnerDashboard.jsx#L194))
and `.sidebar-brand` ([OwnerLayout.jsx](src/components/layouts/OwnerLayout.jsx)) are the candidates.

Also: **zero `preconnect` hints** anywhere, so DNS + TCP + TLS to `fonts.gstatic.com`,
`apis.google.com` and `*.firebaseapp.com` all happen mid-load.

### 2. The main entry chunk is 1,117 kB (295 kB gzip)

```
dist/assets/index-kJa423So.js   1,117.26 kB │ gzip: 295.35 kB   ← blocks everything
dist/assets/index-Wwlh_gtl.css     80.88 kB
dist/assets/OwnerDashboard-*.js    13.49 kB │ gzip:   3.55 kB   ← the actual page
```

Route splitting is already good — the problem is what got pulled into the *entry*:

- [src/firebase/firestore.js:6](src/firebase/firestore.js#L6) does `export * from 'firebase/firestore'`
  **and** statically imports both `firestore_real.js` (700 lines) and `mockFirestore.js` (343 lines
  of dev-only mock data). `AuthContext` imports it eagerly → the entire Firestore SDK, every
  helper, and all the mock fixtures ship in the entry chunk and are **shipped to production**.
- [src/firebase/config.js](src/firebase/config.js) eagerly initialises `auth` + `firestore` +
  `storage` + `functions` + **App Check**. `storage` and `functions` are not needed for dashboard
  first paint.
- `initializeAppCheck` with `ReCaptchaEnterpriseProvider` runs at **module-evaluation time**
  ([config.js:31-36](src/firebase/config.js#L31-L36)) — this is what drags `recaptcha__en.js` onto
  the main thread during boot (your ">30 ms tasks" finding).
- No `manualChunks`, so a one-line app change busts the whole 295 KB gzip for returning users.

### 3. Firebase Auth loads a gapi iframe the app never uses

`getAuth(app)` registers the browser popup/redirect resolver, which loads
`apis.google.com/js/api.js` and an `__/auth/iframe.js` iframe from
`gymly-app-06.firebaseapp.com`. That is exactly the `iframe.js → Identity Toolkit → Firestore`
chain in your trace.

**The app is phone-OTP only** — verified: no `signInWithPopup`, `signInWithRedirect`,
`getRedirectResult`, or `GoogleAuthProvider` anywhere in `src/`. The resolver is pure overhead.

### 4. The auth boot is four sequential round trips, and it gates everything

In [AuthContext.jsx:143-182](src/context/AuthContext.jsx#L143-L182), before `loading` flips false:

1. `await firebaseUser.getIdToken(true)` — a **forced** token refresh, on *every* page load
2. `await firebaseUser.getIdTokenResult()`
3. `await getUser(uid)` — which uses `getDocFromServer`
   ([firestore_real.js:50](src/firebase/firestore_real.js#L50)), deliberately **bypassing** the
   persistent cache that `config.js` went to the trouble of enabling
4. `await refreshGymDoc(gym_id)` → `getGym()`

Plus a hard **`await new Promise(r => setTimeout(r, 2000))`**
([AuthContext.jsx:177](src/context/AuthContext.jsx#L177)) in the claim-healing path.

### 5. The dashboard chunk can't start downloading until auth finishes

[ProtectedRoute.jsx](src/components/ProtectedRoute.jsx) returns a spinner while `loading` is
true, so `<OwnerDashboard />` is never rendered, so `React.lazy`'s `import()` never fires. The
13.5 kB dashboard chunk and its 12.7 kB CSS queue up *behind* the entire auth waterfall instead
of downloading alongside it. This is the single biggest cause of the slow **page transition**
feel on bad networks.

### 6. The dashboard fires ~12 Firestore round trips, several of them duplicates

- **`getGym` is called three times per load** — `AuthContext.refreshGymDoc`,
  [OwnerLayout.jsx:30](src/components/layouts/OwnerLayout.jsx#L30), and
  [OwnerDashboard.jsx:45](src/pages/OwnerDashboard/OwnerDashboard.jsx#L45). The dashboard's
  full-page spinner ([OwnerDashboard.jsx:171](src/pages/OwnerDashboard/OwnerDashboard.jsx#L171))
  is gated on its own redundant copy — while `gymDoc` is already sitting in `useAuth()`.
- **The `leads` listener is subscribed twice** with an identical query — OwnerLayout and
  OwnerDashboard both `onSnapshot` `leads where gym_id == X and status == 'new'`.
- **4 × `getCountFromServer`** ([OwnerDashboard.jsx:125-129](src/pages/OwnerDashboard/OwnerDashboard.jsx#L125-L129))
  = 4 more round trips, recomputing numbers the `stats/summary` doc already carries — and the
  code already falls back to that doc.
- 6 independent `useEffect`s all keyed on `gym_id` fan out as separate requests, competing with
  the font downloads for bandwidth on a slow link.

---

## Implementation phases

Ordered by impact ÷ effort. **Phase 1 alone should recover most of the LCP.**

### Phase 1 — Fonts (~30 min, largest single win)

1. **Delete lines 1-3 of [src/index.css](src/index.css#L1-L3)** — the three `@import`s. This
   removes the CSS-blocked font chain and half the duplicate downloads.
2. **Rewrite the `<head>` of [index.html](index.html)** as one consolidated block:
   - `preconnect` to `https://fonts.googleapis.com` and `https://fonts.gstatic.com` (the latter
     **must** carry `crossorigin`).
   - `preconnect` to `https://apis.google.com` and `https://firestore.googleapis.com` *(drop the
     `apis.google.com` hint once Phase 3 lands — it will no longer be contacted).*
   - **One** text-font stylesheet covering the union of weights actually used — audit first:
     `grep -rn "font-weight" src/*.css src/**/*.css | sort -u`. Do not ship weights nothing
     references.
   - **One** Material Symbols stylesheet with **`&display=swap`** and the `opsz`/`GRAD` axes
     dropped (nothing in the codebase varies them).
3. **Subset the icon font with `icon_names`.** Google Fonts accepts
   `&icon_names=add,arrow_back,...`, which returns a small static font instead of the full
   variable face. The codebase uses **95 unique icons** (extracted list saved in the appendix
   below).
   > ⚠️ Some icons are referenced through variables — `{item.icon}` in
   > [OwnerLayout.jsx](src/components/layouts/OwnerLayout.jsx) and `BottomNav`, and a ternary in
   > [MembershipPlansList.jsx:159](src/pages/MembershipPlans/MembershipPlansList.jsx#L159). A
   > missed name renders as **literal text** ("fitness_center") in the UI. Write the extraction
   > as a small script that scans both the literal `>icon<` pattern and the nav config objects,
   > and eyeball every screen once after the change.
4. **Reserve icon space** to kill the 0.05 CLS: give `.material-symbols-outlined` an explicit
   `width`/`height`/`line-height` and `font-display: swap` so the swap-in doesn't reflow.

**Expected:** LCP render delay collapses from ~2,400 ms to the paint cost of the page. This is
the fix for the reported 2,405 ms LCP.

### Phase 2 — Unblock the route chunk (~1 h)

5. **Warm the dashboard chunk in parallel with auth.** Extract the `lazy()` factories in
   [App.jsx](src/App.jsx) into named functions and call the likely-next one immediately on boot
   (from `main.jsx` or an effect in `AuthProvider`), so the 13.5 kB chunk downloads *while* the
   token round trip is in flight instead of after it. Prefetch the owner bundle on the login
   screen's success handler too.
6. **Replace the full-page spinner with a skeleton.** Drop the `loading` gate at
   [OwnerDashboard.jsx:171](src/pages/OwnerDashboard/OwnerDashboard.jsx#L171) — render the
   greeting, action buttons and stat-card frames immediately, and let each section fill in.
   Perceived load time improves even where wall-clock does not.

### Phase 3 — Firebase boot (~1-2 h)

7. **Drop the popup/redirect resolver.** Replace `getAuth(app)` in
   [config.js:25](src/firebase/config.js#L25) with:
   ```js
   import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence } from 'firebase/auth';
   auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
   ```
   Removes `apis.google.com/js/api.js` + the `firebaseapp.com` auth iframe from the critical
   path entirely. Safe here because auth is phone-OTP only (verified).
   **Regression-test the full OTP login for owner, staff and member before shipping** — this
   touches the auth entry point.
8. **Defer App Check.** Move `initializeAppCheck` out of module evaluation into a
   `requestIdleCallback` (fallback `setTimeout`) after first paint. This is what pulls reCAPTCHA
   Enterprise onto the boot main thread.
   > Check first whether `VITE_RECAPTCHA_SITE_KEY` is set in Vercel prod — it is absent from
   > local `.env`, so App Check may be prod-only. Deferring it changes *when* the App Check token
   > is minted; verify no early Firestore read fires before it and gets rejected.
9. **Lazy-init `storage` and `functions`** — convert to `getStorageLazy()` / `getFunctionsLazy()`
   accessors so they leave the boot path.
10. **Make `mockFirestore` dev-only.** Guard the import in
    [firestore.js](src/firebase/firestore.js) behind `import.meta.env.DEV` with a dynamic
    `import()`, so 343 lines of fixtures stop shipping to production.

### Phase 4 — Auth waterfall (~2 h, touches login — test carefully)

11. **Stop force-refreshing the token on every load.**
    [AuthContext.jsx:149-152](src/context/AuthContext.jsx#L149-L152) — read the cached
    `getIdTokenResult()` first and only call `getIdToken(true)` when `claims.gym_id` is missing.
    The code *already* has that exact check at lines 172-182; this just reorders it.
12. **Parallelise the profile fetch.** `gym_id` is available from the token claim without the
    user doc, so `getUser(uid)` and `getGym(claims.gym_id)` can run in one `Promise.all` instead
    of back-to-back.
13. **Make `getUser` cache-first.** [firestore_real.js:50](src/firebase/firestore_real.js#L50) —
    resolve from `getDoc` (persistent cache) for an instant first render, then revalidate with
    `getDocFromServer` in the background and update state. Keep the existing stale-login guard in
    mind: the "always fetch from server" comment was deliberate, so revalidation must still
    correct a stale doc, just without blocking paint.
14. **Remove the hard 2 s sleep** at [AuthContext.jsx:177](src/context/AuthContext.jsx#L177) —
    poll for the claim with backoff instead of a fixed stall.

### Phase 5 — Dashboard data (~2 h)

15. **Delete both duplicate `getGym` calls.** Consume `gymDoc` from `useAuth()` in
    [OwnerDashboard.jsx:41-54](src/pages/OwnerDashboard/OwnerDashboard.jsx#L41-L54) and
    [OwnerLayout.jsx:28-31](src/components/layouts/OwnerLayout.jsx#L28-L31). Removes 2 round
    trips and the page's blocking spinner in one edit.
16. **De-duplicate the leads listener.** Lift it into a shared hook or context so OwnerLayout and
    OwnerDashboard share one subscription.
17. **Don't block on the 4 count queries.** Render `stats/summary` immediately (it is already the
    fallback) and reconcile with `getCountFromServer` in the background — the numbers only need
    to *settle* correctly, not arrive first.

### Phase 6 — Build & delivery (~1 h)

18. **Add `manualChunks`** to [vite.config.js](vite.config.js): split `react`+`react-dom`+
    `react-router`, `firebase/firestore`, `firebase/auth`, and `framer-motion` into stable
    vendor chunks so app edits stop invalidating 295 KB gzip for returning users.
19. **Verify asset caching on Vercel.** Vite emits content-hashed filenames; confirm
    `/assets/*` responds with `cache-control: public, max-age=31536000, immutable` and that
    `index.html` is `max-age=0, must-revalidate`. Add explicit headers to
    [vercel.json](vercel.json) if the defaults don't match.
20. **Drop the unused `lucide-react` dependency** — 0 imports across `src/`.

---

## Deliberately *not* doing

- **Inline SVG for the LCP icon** (your original suggestion). Correct diagnosis, but with
  `display=swap` + `icon_names` subsetting the icon font stops being the bottleneck, and
  converting 242 usages across 31 files is a large diff for the remaining delta. Revisit only if
  the icon font is still measurable after Phase 1.
- **Self-hosting fonts.** Worth doing eventually (it also lets you tighten CSP `font-src` to
  `'self'`), but the duplicate-request bug is the actual problem and self-hosting is not needed
  to fix it.
- **SSR / framework migration.** Out of scope; the wins above are all achievable in the current
  Vite SPA.

---

## Verification

Re-run the `web-perf` audit against `/owner/dashboard` after **each** phase, on a throttled
profile (Slow 4G + 4× CPU), and record LCP / CLS / critical-path length. Phases 3 and 4 touch
the auth entry point — run the full OTP login for **owner, staff, and member** roles before
each deploy.

Also note the standing warning from [PLAN-deploy-pending-stack.md](PLAN-deploy-pending-stack.md):
prod frontend is currently ahead of backend. Sequence these deploys against that plan rather
than shipping into an already-inconsistent prod.

---

## Appendix — the 95 statically-referenced icon names

```
account_balance_wallet, add, add_a_photo, add_circle, all_inclusive, arrow_back, arrow_back_ios,
autorenew, badge, bar_chart, block, calendar_month, call, camera_alt, campaign, cancel,
card_membership, chat, check, check_circle, chevron_right, close, confirmation_number,
content_copy, delete, delete_forever, directions, download, edit, edit_note, emoji_events, error,
event_available, fiber_new, fingerprint, fitness_center, flag, flip_camera_ios, grid_view, group,
health_and_safety, history, hourglass_empty, inbox, info, inventory_2, lightbulb, link, list_alt,
local_fire_department, location_on, lock_open, login, logout, monitor_weight, monitoring,
more_horiz, offline_bolt, open_in_new, pause_circle, payments, pending_actions, people, person,
person_add, person_check, person_off, phone_iphone, photo_camera, photo_library, point_of_sale,
pool, preview, public, qr_code, qr_code_2, qr_code_scanner, receipt_long, refresh, restaurant,
restore, save, schedule, search, sensors_off, smartphone, sports_gymnastics, star, sync_alt,
task_alt, timer, touch_app, visibility, visibility_off, warning
```

**Incomplete** — must be merged with the variable-referenced icons from the `OWNER_NAV` /
`BottomNav` / member-nav config objects before use.
