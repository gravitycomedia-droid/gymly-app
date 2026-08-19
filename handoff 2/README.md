# Gymloop frontend handoff

Read in this order:

1. **`IMPLEMENTATION-PROMPT.md`** — paste into your coding agent; it explains the
   prototype format, translation rules, required outcome and order of work.
2. **`INTEGRATION.md`** — every in-app page, the route map, prop contracts,
   design tokens, porting recipe.
3. **`AUTH-ONBOARDING.md`** — sign in, PIN, OTP, sign up, the 4-step setup flow
   and how each action maps to a backend call.
4. **`GYMLOOP-FULL-SOURCE.md`** — all prototype code inlined. Raw files in `src/`.

Port `GymloopApp.dc.html` (in-app screens) and `GymloopAuth.dc.html` (auth
screens). The two "Prototype" files are device-frame chrome and `support.js` is
prototype runtime — neither ships.
