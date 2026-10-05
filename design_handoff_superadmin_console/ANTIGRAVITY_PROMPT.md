# Task for Antigravity: Rebuild the Gymloop Super Admin console

You are working in the existing Gymloop React app (React 19, Vite, Tailwind CSS 3, Framer Motion, Firebase, PWA). Replace the current single-page, desktop-only Super Admin screen with the responsive console specified in `README.md`, in this folder.

**Source of truth**
1. `README.md`: the full spec. It covers tokens, components, every screen and state, copy, validation, data model and accessibility.
2. `design/Gymloop Console.dc.html`: the clickable prototype. Open it in a browser and resize it to 375 / 768 / 1280 px to see the intended behaviour.
3. `design/Gymloop Super Admin Handoff.dc.html`: the design board, with every screen and state side by side.

The HTML files are design references. **Don't copy their markup or inline styles.** Rebuild the UI with Tailwind utilities, Framer Motion and the app's existing patterns: router, Firebase hooks, folder conventions and auth guard.

## Ground rules
- Before you write code, inspect the repo. Find:
  - the router setup
  - the existing `/superadmin` page and its auth/role guard
  - the Firebase config and hooks
  - any shared UI components
  - the current Firestore collection and field names

  **Adapt the README's data model to the real field names; don't rename existing data.**
- Keep the existing auth and super-admin guard. Every new route lives under `/superadmin` behind that same guard.
- Add the tokens from README §5 to `tailwind.config.js` under `theme.extend`, merged with what's already there. Don't break existing colours. If Gymloop brand tokens already exist, map the accent to the brand colour.
- The layout is mobile-first: base styles are for mobile, `md:` for 768 and up, `lg:` for 1024 and up. There must be no horizontal page scroll at 375 / 768 / 1280.
- Currency uses `₹` with `en-IN` grouping. Dates use the format `DD MMM YYYY`. Use the helpers in README §8.
- Never fetch or display individual member data. Gym detail shows aggregates only.
- Mobile tap targets are at least 44×44 px. Every interactive element gets a visible focus ring. Esc closes overlays. Enter submits forms.

## Build order (commit after each step)
1. **Foundation.** Add the Tailwind tokens, the Geist fonts, the formatting helpers (`src/features/superadmin/lib/format.js`) and `lucide-react`, if it isn't installed yet.
2. **Primitives.** In `src/features/superadmin/components/`, build:
   - Button (4 variants × default/hover/pressed/disabled/loading)
   - StatusBadge, PlanBadge
   - TextInput, TextareaWithCounter, PhoneInput, CurrencyInput, Switch
   - SearchInput, FilterSelect, FilterChip, SegmentedControl, Tabs, RadioCard, GymMultiSelect
   - Card, KpiCard, EmptyState, ErrorState, NotFound, Skeleton, Pagination
   - Toast (provider + `useToast`)
   - ConfirmDialog (provider + `useConfirm()` that returns a Promise)
   - ResponsiveDialog: a modal on md+, a bottom or full-screen sheet on mobile
   - SidePanel
3. **Shell.** `SuperAdminLayout` with the Sidebar (collapsible, state persisted to localStorage), the TopBar with the account menu, and the BottomTabBar. Add the page transition keyed by pathname, and the logout flow (confirm, then the existing `signOut`, then the existing login route).
4. **Routes.**
   - `/superadmin` → Dashboard
   - `/superadmin/gyms/:gymId` → GymDetail
   - `/superadmin/broadcasts` → Broadcasts (`?tab=compose|drafts|sent`)
   - `/superadmin/plans` → Plans
   - `/superadmin/settings` → Settings
5. **Dashboard.** KPI cards (independent loading, error and retry), the gyms list with search, filters and sort in URL params, a table on md+ and cards on mobile, 20 per page, and all states.
6. **Gym detail.** Owner card, subscription card (days-remaining styles), payments (with its own error and retry), member summary (stat grid plus a 6-month bar chart built from flex divs), the skeleton and the 404 state.
7. **Broadcasts.**
   - Compose: validation, live counters, audience targeting, live reach count, a live preview (side panel on lg, sheet or modal below lg), save draft, publish with confirmation, and an unsaved-changes guard using `useBlocker` plus `beforeunload`.
   - Drafts and Sent: search, date range, and a detail side panel or sheet.
   - Firestore: create the `broadcasts` collection if it's missing.
8. **Plans.** The segmented filter with counts, sort, the table and cards, and the activate/deactivate toggle (with a warning when `gymCount > 0`). The add/edit dialog locks the Plan ID after creation: use the Plan ID as the doc id and enforce uniqueness in a transaction. Include the saving state and a toast.
9. **Settings.** Phone (+91) and email validation. Save is disabled until something changes. Include the saving, success toast and inline error states. The Account card has a logout button.
10. **QA pass.** Check every screen at 375, 768 and 1280 against the design board. Walk every loading, empty and error state (simulate them by throwing in or delaying the hooks). Check keyboard-only navigation, contrast and reduced motion (`useReducedMotion`).

## Acceptance criteria
- [ ] All 5 routes plus the logout flow work and are linked from the navigation.
- [ ] No horizontal page scroll at 375, 768 or 1280. The tablet shows the 72 px icon rail.
- [ ] The gym list is a table on md+ and cards on mobile. Filter and search state survives going Back from gym detail.
- [ ] Gym detail shows owner, subscription, payments and aggregate member stats only.
- [ ] Broadcasts has Compose, Drafts and Sent, with targeting, reach count, preview, publish confirmation and an unsaved guard.
- [ ] Plans supports create, edit (Plan ID locked), activate and deactivate (with warning), and All/Active/Inactive filtering.
- [ ] Settings validates the +91 phone number and the email, with save, success and error states.
- [ ] Every list and data view has loading, empty and error states.
- [ ] All currency is shown as ₹ with Indian grouping. All dates use DD MMM YYYY.
- [ ] Tokens and components are shared across screens, not duplicated per screen.

When something in the repo contradicts the spec, such as a different field name or an existing component, follow the repo. Note each deviation in a short `IMPLEMENTATION_NOTES.md`.
