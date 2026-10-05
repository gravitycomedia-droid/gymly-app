# Super Admin console — implementation notes

Built from `design_handoff_superadmin_console/` (README.md + ANTIGRAVITY_PROMPT.md).
Where the repo contradicted the spec, the repo won — as the handoff's own ground
rules require. Every such deviation is listed here.

Code lives in `src/superadmin/`, mirroring the `src/owner/` feature-folder
convention the previous design handoff established.

---

## 1. Routes: `/admin`, not `/superadmin`

The spec routes everything under `/superadmin`. This app has shipped
`/admin`, `/admin/broadcasts` and `/admin/plans` behind
`<ProtectedRoute requireSuperAdmin>` since Phase 1. Renaming would break
existing links for no user-visible gain.

| Spec | Built |
|---|---|
| `/superadmin` | `/admin` |
| `/superadmin/gyms/:gymId` | `/admin/gyms/:gymId` *(new)* |
| `/superadmin/broadcasts` | `/admin/broadcasts` |
| `/superadmin/plans` | `/admin/plans` |
| `/superadmin/settings` | `/admin/settings` *(new)* |

The existing auth guard is unchanged: the `super_admin` custom claim, with
Firestore rules as the real enforcement.

## 2. Design tokens are namespaced `sa-*`

The spec's token names (`surface`, `warning`, `line`, `ink`, `accent`…) collide
with tokens this app already ships — `surface` alone is used in 16 files, and
`warning` is `#EF9F27` app-wide. Overriding them would silently restyle the
owner, member and landing surfaces.

Every console token is therefore nested under a single `sa` key in
`tailwind.config.js`, so the spec's `bg-surface` is written `bg-sa-surface`,
`text-ink-2` is `text-sa-ink-2`, and so on. Same hex values, same structure.
Shadows are `shadow-sa-sm|md|lg|toast|seg` and the shimmer keyframe is
`animate-sa-shimmer`, for the same reason.

Nothing outside `src/superadmin/` changed colour.

## 3. Controls kept, contrary to spec §12

The spec lists "editing gyms, suspending gyms, changing a gym's plan" as
non-goals. This app already had all of them working, audited, and deployed:
`adminAssignPlan`, `adminSetTrial`, `adminSetGymStatus`,
`adminMarkSubscriptionPaid`, plus View-as-owner. Deleting working operational
tooling to match a greenfield spec would have been a regression, so they were
restyled onto the new Gym detail screen instead, in a **Controls** card.

Also kept, for the same reason:
- **Churn-risk scoring** (`healthOf` in `lib/status.js`) — surfaced as a badge
  on the gym list, a health filter in the toolbar, and a reason list on Gym
  detail. Derived from data already loaded; costs no extra reads.
- **Past-due dunning banner** on the dashboard.
- **View-as-owner** — still `src/pages/Admin/ViewAsOwner.jsx` on its original
  stylesheet. It is a dense desktop-only data view that the new console
  deliberately does not restyle; it now imports its own CSS instead of relying
  on a parent to do it.

## 4. Status vocabulary is five values, not four

Spec: `active | trial | expired | suspended`.
Platform: `active | trial | past_due | suspended | cancelled`, stored on
`gym_summaries.status`, with `trial` being a presentation layer over
`status: 'active' + is_trial: true`.

`past_due` drives the dunning flow and `cancelled` is a real terminal state, so
the badge vocabulary was extended rather than collapsed. `expired` is kept in
the badge map for payment rows.

## 5. Field-name map

The spec's data model is a proposal. The real collections are mapped in one
place — the header comment of `src/superadmin/lib/api.js`. Summary:

| Spec | Actual |
|---|---|
| `gyms.ownerName` / `ownerPhone` | `gyms.owner_name` / `gyms.phone` |
| `gyms.status`, `gyms.planId` | `gym_summaries.status` (+ `is_trial`), `gym_summaries.plan` |
| `gyms.stats.*` | `gyms/{id}/stats/summary.*` |
| `gyms/{id}/payments` | `billing/{gymId}/manual_payments` (**paise**) |
| `platform/stats` | `platform_stats/global` |
| `plans.displayName` / `monthlyAmount` / `isActive` | `plans.name` / `monthly_amount_inr` / `is_active` |
| `broadcasts.message` | `broadcasts.body` |
| `superAdmin/profile` | `platform_settings/super_admin` (**new**) |

Plan IDs are already the Firestore doc id, so the spec's uniqueness and
immutability requirements come for free — which is exactly why the Plan ID
field locks after creation.

## 6. KPI #4 is MRR, not "Total collected"

The spec's fourth KPI is all-time revenue collected by the platform. Nothing
stores that: `platform_stats/global` has `mrr_inr` and `past_due_inr`, computed
hourly from `gym_summaries`. The card shows **Monthly recurring** with past-due
at risk as its secondary line — the same operational question, answered with
data that actually exists.

"+N this month" on the Total gyms card is computed client-side from the loaded
gym list rather than being read from `platform_stats`.

## 7. Backend changes (written, **not deployed**)

### `functions/src/adminControl.js`
- **`adminCreateBroadcast` now creates *or updates*, and understands drafts.**
  - Accepts `status: 'draft' | 'published'` (defaults to `published`, so the old
    call signature still works).
  - A draft is written with `active: false`. The existing owner-app rule reads
    `resource.data.active == true`, so **drafts are structurally invisible to
    gym owners** — no new rule needed.
  - Accepts `id` to update an existing doc, which is how "save draft" then
    "publish" reuses one document.
  - Rejects edits to an already-published broadcast (`failed-precondition`),
    matching the promise the publish dialog makes to the operator.
  - Accepts `plan_ids[]` for multi-plan targeting. `plan_filter` is still
    written with the first plan id, so the existing single-plan owner-app reader
    keeps working. Audience values `plans`/`gyms` normalise to the legacy
    `plan`/`specific`.
  - Stores `reach_count` (snapshot at publish) and `published_at`.
- **`adminSaveContactDetails`** — new. Validates a `^[6-9]\d{9}$` phone and an
  email, writes `platform_settings/super_admin`, and audits like everything else.

### `functions/index.js`
- Exports `adminSaveContactDetails`.

### `firestore.rules`
- New `match /platform_settings/{document}`: `read: if isSuperAdmin()`,
  `write: if false`. Writes go through the callable, like every other admin
  collection.

**Nothing here is deployed.** Until `firebase deploy --only functions,firestore:rules`
runs, Broadcast drafts and the Settings save will fail with a callable error —
the UI surfaces that as an inline banner plus an error toast, and keeps the
typed values.

## 8. Not built — needs a Cloud Function first

- **The 6-month member bar chart.** `gyms/{id}/stats/summary` has no month-by-
  month history; nothing records one. The chart component is written and reads
  `summary.member_history` (`[{ month: 'YYYY-MM', count }]`); until a function
  writes that array, the section renders an explanatory note instead of a
  misleading empty chart. Writing the snapshot function is a small addition to
  `functions/src/gymStats.js`.
- **"New members this month"** on the member summary, for the same reason. The
  fifth stat tile shows **Expiring in 7 days** instead, which `summary` does
  store and which is more actionable.
- **Per-payment plan name and status** on the Gym detail payment history.
  `billing/{gymId}/manual_payments` stores `amount`, `method`, `note` and
  `created_at` only, so the Plan column shows the method and every row reads
  `paid` (which it is — these are recorded receipts).

## 9. Other deliberate choices

- **Icons: `lucide-react`**, as the spec specifies. It tree-shakes to only the
  ~25 icons used and lands in the lazy admin chunks. Deliberately *not* added to
  the Material Symbols subset in `index.html` — that font is shared by the whole
  app, and growing it for an admin-only surface would cost every user.
- **Geist Mono** added to the existing Google Fonts preload in `index.html`
  (Geist was already loaded). No new network request: same stylesheet URL.
- **The console has its own toast.** The app's global `ToastContext` stacks
  unlimited toasts in the old CSS design system. The spec calls for one dark
  toast at a time, positioned above the mobile tab bar, so `SaToastProvider`
  is local to the console. The global provider is untouched.
- **Overlay plumbing is hand-rolled** (`hooks/useOverlay.js`): scroll lock,
  focus trap, focus restore and a module-level Esc stack so only the topmost
  overlay closes. The repo has no `headlessui` or `focus-trap-react`, and this
  is ~100 lines.
- **`SuperAdminLayout` wraps each route** rather than being an `<Outlet/>`
  layout route. `AnimatedRoutes` in `App.jsx` keys `<Routes>` by pathname, which
  would remount a layout route on every navigation anyway; wrapping matches how
  `OwnerShell` already works. The page transition lives inside the layout, so
  the sidebar and tab bar do not fade with the content.
- **The gym list loads every gym** (two collection reads, joined in memory)
  instead of the previous N+1 `getDoc` per row. Search across name/owner/city,
  the city facet, "12 of 46" counts and sort-by-members all need the full set.
  This is fine into the low thousands of gyms; past that it needs server-side
  search.
- **Plan gym-counts** come from one pass over that same loaded gym list rather
  than a `getCountFromServer` per plan.

## 10. Removed

`src/pages/Admin/SuperAdminDashboard.jsx`, `BroadcastsPage.jsx`,
`BroadcastsPage.css` and `PlansPage.css` — superseded, and nothing imported them
after the routes were rewired. `SuperAdminDashboard.css` stays because
`ViewAsOwner.jsx` uses it.

## 11. Verified / not verified

Verified: production build, every module transforms and resolves under Vite,
and every `sa-*` utility used in the source is present in the built CSS (a
typo'd Tailwind token fails silently, so this is checked mechanically).

**Not verified: nothing has been exercised against live data or a browser.**
The console is behind the `super_admin` claim, so no screen has been rendered.
Still to do by hand, at 375 / 768 / 1280:

- [ ] Every screen against the design board
- [ ] Loading, empty and error states (simulate by throwing in the `lib/api.js` fetchers)
- [ ] Keyboard-only navigation, focus order, Esc on each overlay
- [ ] The broadcast unsaved-changes guard: tab change, route change, tab close
- [ ] Draft save → edit → publish, after the functions are deployed
- [ ] Settings save, after the functions and rules are deployed
