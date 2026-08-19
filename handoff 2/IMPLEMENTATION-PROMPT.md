# Implementation prompt

Paste this into your coding agent (Claude Code, Cursor, …) with this folder attached.

---

You are implementing a new frontend for **Gymloop**, a gym-management app for gym
owners in India. A complete, approved HTML prototype is attached in this folder.
Build the real frontend to match it.

## Inputs
- `GYMLOOP-FULL-SOURCE.md` — every prototype file inlined.
- `src/` — the same files raw.
- `INTEGRATION.md` — in-app pages: route map, prop contracts, design tokens, porting recipe.
- `AUTH-ONBOARDING.md` — sign in / PIN / OTP / sign up / 4-step setup / done, plus backend wiring.

## What the prototype is
Each `*.dc.html` file is HTML with a small logic class. Two pairs:
- **Owner app** — `Gymloop Owner Prototype.dc.html` (state, seed data, routing, device frames) + `GymloopApp.dc.html` (every screen).
- **Auth** — `Gymloop Auth & Onboarding.dc.html` (state, frames) + `GymloopAuth.dc.html` (auth screens).

In both pairs the second file is **purely presentational**: it receives one data
object plus one actions object and renders. Port those two files; the frame files
are prototype chrome (device bezels, screen switcher) — do not port them.

`support.js` is prototype runtime. Ignore it.

## Translation rules
- `{{ value }}` → your template syntax. The `renderVals()` method at the bottom of each file shows exactly how every displayed value is derived — status colours, filters, sorting, formatting, permissions. Port that logic verbatim; do not re-derive it.
- `<sc-for list="{{ xs }}" as="x">` → `xs.map(x => …)`; `$index` is available inside.
- `<sc-if value="{{ flag }}">` → conditional render.
- `style-hover` / `style-active` / `style-focus` → your hover/active/focus styles.
- `<dc-import name="X" …>` → `<X …/>`.
- All styling is inline in the prototype. Move it into your styling system, but **keep the literal values** — the palette, radii and sizes in `INTEGRATION.md` §3 are the design, not defaults.

## Required outcome
1. Every route in `INTEGRATION.md` §2 and every screen in `AUTH-ONBOARDING.md` §1 exists and is reachable.
2. Responsive at the two breakpoints the prototype ships: `<1024px` mobile (bottom tab bar + FAB) and `≥1024px` desktop (fixed left rail + top bar). `mode` in the prototype is a media query in production.
3. Four generic components carry ~15 routes — build these first and well: `ListScreen`, `Wizard`, `SettingsDetail`, `MemberProfile`. Settings detail pages are generated from a `settingsDef` object; adding a settings page must not require new UI code.
4. Role-based permissions (`owner`, `manager`, `receptionist`, `trainer`) gate the same elements as the prototype **and** are enforced server-side.
5. i18n: the `T = { en, te, kn }` dictionary near the top of `GymloopApp.dc.html` moves into your i18n library. Language is set in Settings → Language. Telugu/Kannada need `Noto Sans Telugu` / `Noto Sans Kannada`.
6. Accessibility: keep every control ≥44px tall, keep the visible focus ring, keep the `aria-label`s and `<label for>` pairs, keep `data-screen-label` values as your screen names.
7. Onboarding steps and the dashboard setup checklist read and write **one** shared setup record.

## Replace, don't keep
- All seed data (`buildMembers()`, the 124 generated members, hardcoded KPIs, chart bars, heat grid) is fake — replace with API data of the same shape (`INTEGRATION.md` §1).
- Charts and the attendance heat grid are CSS mock-ups — use a real chart library, keep the KPI-row-above-chart layout.
- The QR scanner screen is a static frame — wire a real camera/QR library.
- OTP verification accepts any code in the prototype. Implement real OTP (expiry, single use, rate limits) per `AUTH-ONBOARDING.md` §3.

## Order of work
1. Design tokens + app shell (rail, top bar, tab bar, FAB, toast).
2. Auth + onboarding (`GymloopAuth`) — it is self-contained and unblocks everything else.
3. `ListScreen`, `Wizard`, `SettingsDetail`, `MemberProfile`.
4. Dashboard, members list, leads, analytics, attendance.
5. Remaining routes as configuration of the generic components.

## Ask before you deviate
If a prototype screen conflicts with the existing app's data model, say so and
propose the smallest change — do not silently redesign a screen. Report any screen
you could not build exactly, with the reason.
