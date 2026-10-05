# Handoff: Gymloop Super Admin Console (v1)

Target: existing Gymloop React app — **React 19 + Vite + Tailwind CSS 3 + Framer Motion + Firebase**, PWA.
Implementer: Antigravity (AI coding agent). Start with `ANTIGRAVITY_PROMPT.md`, then use this README as the spec.

---

## 1. Overview
This replaces the current desktop-only Super Admin page (a single list of gyms) with a small, fully responsive console under `/superadmin`:

| Route | Screen |
|---|---|
| `/superadmin` | Dashboard: 4 KPI cards + gyms list |
| `/superadmin/gyms/:gymId` | Gym detail (read-only) |
| `/superadmin/broadcasts` | Broadcasts: Compose · Drafts · Sent (`?tab=`) |
| `/superadmin/plans` | Manage Gymloop subscription plans |
| `/superadmin/settings` | Contact details + logout |
| — | Logout (confirmation dialog → existing sign-out) |

One operator, one role. No permissions UI.

## 2. About the design files
The files in `design/` are **design references built in HTML**. They show the intended look and behaviour. They are **not production code to copy**. Rebuild them in the existing React codebase using its patterns: router, Firebase hooks, folder layout and any shared UI already there. Use Tailwind utilities and Framer Motion as specified below.

- `design/Gymloop Console.dc.html` — the **clickable prototype**. Open it in a browser. It's fully responsive: resize the window to see 375 / 768 / 1280 behaviour. All routes, tabs, dialogs, sheets, validation and toasts work with mock data.
- `design/Gymloop Super Admin Handoff.dc.html` — the **design board**: tokens, component sheet, every screen at 375/768/1280, every state (loading/empty/error/success/overlays), and per-screen implementation notes.
- `design/support.js` — the runtime that the two HTML files need to open. Ignore it for implementation.

The prototype keeps its logic in a `class Component` inside the HTML (mock data generator, validation rules, derived values). Read it for exact rules. Don't port the mock data.

## 3. Fidelity
**High fidelity.** Colours, type, spacing, radii, copy and interactions are final. Recreate them pixel-accurately with the Tailwind tokens in §5. If Gymloop's existing brand tokens clash, keep the structure and states from this spec and map the colours to the existing brand. **Keep one accent colour.**

---

## 4. Breakpoints & shell (applies to every screen)

| Name | Width | Tailwind | Shell |
|---|---|---|---|
| Mobile | < 768 | base | 56px top app bar + 64px bottom tab bar |
| Tablet | 768–1023 | `md:` | 72px icon rail (collapsed by default, expandable to 240px) |
| Desktop | ≥ 1024 | `lg:` | 240px sidebar, collapsible to 72px (persist in `localStorage`) |

**No horizontal page scroll at any width.** Add `min-w-0` to every flex/grid child that holds text. Every tap target must be at least 44×44 on mobile.

### Layout skeleton
```
<div class="flex h-dvh overflow-hidden bg-canvas text-ink">
  <Sidebar class="hidden md:flex" />                    // 72px or 240px, border-r border-line, bg-surface
  <div class="flex min-w-0 flex-1 flex-col">
    <TopBar class="md:hidden" />                        // h-14
    <main class="flex-1 overflow-y-auto overflow-x-hidden">
      <div class="mx-auto max-w-[1200px] px-4 pt-4 pb-6 md:p-6 lg:px-8 lg:pt-8 lg:pb-12">
        <Outlet />                                       // wrapped in motion page transition
      </div>
    </main>
    <BottomTabBar class="md:hidden" />                  // h-16, pb-[env(safe-area-inset-bottom)]
  </div>
</div>
```
The main content column scrolls, not the window. That keeps the desktop table's sticky header working (`sticky top-0` inside `<main>`).

### Sidebar (md+)
- Header, h-16, `px-5 border-b border-line-soft`: logo tile `size-8 rounded-lg bg-accent text-white font-bold` ("G" placeholder — use the real Gymloop mark) + "Gymloop" (15/20 600) + "SUPER ADMIN" (11/14 500, uppercase, `tracking-[.06em] text-ink-3`). The label is hidden when collapsed.
- Nav, `p-3 flex flex-col gap-1`. Items in order: Dashboard (grid icon), Broadcasts (megaphone), Plans (layers), Settings (sliders).
- NavItem: `h-10 px-2.5 rounded-lg flex items-center gap-3 text-sm`.
  - Default: `text-ink-2 font-medium`.
  - Hover: `bg-muted`.
  - Active: `bg-accent-soft text-accent-ink font-semibold` + `aria-current="page"`.
  - Focus: `focus-visible:outline-2 outline-offset-2 outline-accent`.
  - Collapsed: centre the icon and use the label as the `title` tooltip.
  - The Dashboard item is also active on `/superadmin/gyms/:id`.
- Footer, `p-3 border-t border-line-soft`: "Collapse" toggle (panel icon, ghost) + "Log out" (`text-danger hover:bg-danger-soft`), pinned to the bottom.

### Top bar (mobile)
`h-14 bg-surface border-b border-line flex items-center gap-1 pl-2 pr-1`:
- Left, 44×44:
  - Logo tile (`size-7 rounded-[7px]`) on top-level screens.
  - On Gym detail, a back arrow button instead (`aria-label="Back to dashboard"`).
- Title: 17/24 600, truncate. Titles are "Dashboard", "Gym details", "Broadcasts", "Plans", "Settings".
- Right: avatar button, 44×44 hit area, 32px circle `bg-accent-soft text-accent-ink text-xs font-semibold` "SA".
  - Tapping it opens the **account menu**: a popover at `top-[52px] right-2 w-[220px] rounded-xl border border-line bg-surface shadow-md p-1.5`.
  - Menu header: "Super Admin" / email.
  - Menu items (44px tall): Settings, and Log out (`text-danger`).
  - Clicking outside closes the menu.

### Bottom tab bar (mobile)
`h-16 grid grid-cols-4 bg-surface border-t border-line`. Each tab stacks a 44×28 pill containing a 20px icon above an 11/14 label.
- Active tab: the pill gets `bg-accent-soft`, and the icon and label turn `text-accent-ink font-semibold`.
- Inactive tab: `text-[#5B606B] font-medium`.
- Pressed: `active:bg-canvas`.

### Page header (md+ only; on mobile the top bar carries the title)
```
<header class="flex flex-wrap items-end justify-between gap-4">
  <div><h1 class="text-2xl/8 font-semibold tracking-[-0.01em]">Dashboard</h1>
       <p class="mt-1 text-ink-3">Every gym on Gymloop, at a glance.</p></div>
  …right-side action…
</header>
```
Subtitles:
- Dashboard: "Every gym on Gymloop, at a glance." (right side: "As of 24 Sep 2026")
- Broadcasts: "In-app announcements shown to gym owners."
- Plans: "Gymloop subscription plans that gyms can choose from." (right side: "New plan" button)
- Settings: "Your Super Admin contact details and account."

Vertical gap between page blocks: `gap-4 md:gap-6`.

---

## 5. Design tokens

### tailwind.config.js (extend)
```js
module.exports = {
  theme: { extend: {
    fontFamily: { sans: ['Geist','ui-sans-serif','system-ui'], mono: ['Geist Mono','ui-monospace'] },
    colors: {
      canvas: '#F6F6F3', surface: '#FFFFFF', subtle: '#FAFAF8', muted: '#F1F1EC',
      line: { DEFAULT: '#E6E5E0', soft: '#EFEEE9', strong: '#D4D3CC' },
      ink: { DEFAULT: '#16181D', 2: '#4A4F5A', 3: '#6B7080', disabled: '#8A8F9C' },
      accent: { DEFAULT: '#0B7A57', 700: '#08664A', 800: '#065239', ink: '#07573F', soft: '#E4F2EC', tint: '#F2F9F6', line: '#8CC3AD' },
      success: { DEFAULT: '#17703A', soft: '#E5F3EA', dot: '#1F9D55' },
      info:    { DEFAULT: '#1D5FB8', soft: '#E8F0FB', dot: '#3B7DDD' },
      warning: { DEFAULT: '#8A5300', soft: '#FDF1DC', dot: '#D08A1A', line: '#F2D7A6' },
      danger:  { DEFAULT: '#B42318', 700: '#962018', 800: '#7A1A12', soft: '#FDECEA', dot: '#D92D20', line: '#F6C9C4' },
      neutral: { DEFAULT: '#3F3F46', soft: '#EEEEF0', dot: '#52525B' },
    },
    boxShadow: {
      sm: '0 1px 2px rgba(16,24,40,.06)', md: '0 4px 12px rgba(16,24,40,.08)',
      lg: '0 16px 40px rgba(16,24,40,.18)', toast: '0 8px 24px rgba(16,24,40,.24)',
      seg: '0 1px 2px rgba(16,24,40,.08), 0 0 0 1px rgba(16,24,40,.06)',
    },
    keyframes: { shimmer: { '0%': { backgroundPosition: '200% 0' }, '100%': { backgroundPosition: '-200% 0' } } },
    animation: { shimmer: 'shimmer 1.4s linear infinite' },
  } },
};
```
Fonts: load Geist and Geist Mono (Google Fonts, weights 400/500/600/700 and 400/500/600). Use `font-variant-numeric: tabular-nums` (`tabular-nums`) on **every** number, amount and date.

### Colour usage
| Token | Hex | Use |
|---|---|---|
| canvas | #F6F6F3 | app background |
| surface | #FFFFFF | cards, bars, inputs |
| subtle | #FAFAF8 | table header, stat tiles, form footer |
| muted | #F1F1EC | hover fill, empty-state icon tile |
| line / soft / strong | #E6E5E0 / #EFEEE9 / #D4D3CC | card border / row divider / input & secondary-button border |
| ink / 2 / 3 / disabled | #16181D / #4A4F5A / #6B7080 / #8A8F9C | text levels (ink-3 = 4.8:1 on white) |
| accent | #0B7A57 (hover 700 #08664A, pressed 800 #065239) | primary buttons, focus ring, toggles, active chart bar |
| accent-ink / soft / tint / line | #07573F / #E4F2EC / #F2F9F6 / #8CC3AD | active nav, chips, selected filter / radio |
| Backdrop | `rgba(22,24,29,.48)` (sent-detail panel .40) | modal/sheet scrim |

### Type scale (Geist)
| Role | Size/LH | Weight |
|---|---|---|
| KPI value | 28/34 desktop · 20/23 mobile · `tracking-[-0.02em]` | 600 |
| Page h1 | 24/32 · `tracking-[-0.01em]` | 600 |
| Stat value, 404 title | 20/28 | 600 |
| Dialog title | 17/24 (confirm) · 18/26 (plan form) | 600 |
| Section title | 16/24 | 600 |
| Card/list title | 15/22 (mobile list 15/20) | 600 |
| Body / controls | 14/20 | 400–600 |
| Small / helper / errors | 13/18 | 400–500 |
| Caption, badge, table head | 12/16 (table head uppercase `tracking-[.04em]`; card section labels uppercase `tracking-[.05em]` 13/18 ink-3) | 500–600 |
| Tab-bar label | 11/14 | 500/600 |
| Plan ID | Geist Mono 13 (table) / 14 (input) / 12 (mobile card) | 400 |

### Spacing, radius, shadow
- Spacing: 4px base. Common values are 4, 6, 8, 10, 12, 14, 16, 20, 24, 32 and 48.
- Card padding: `p-4` on mobile, `p-5` on md+. KPI cards: `p-3.5` mobile, `p-5` md+.
- Radius:
  - 6px: plan badge, skeleton lines
  - 8px: buttons, inputs, selects, banners
  - 10px: radio cards, dropdown list, toast
  - 12px: cards, modals
  - 16px: sheet top corners, "logged-out" card
  - full: status badges, chips, toggles, avatar
- Shadows: `shadow-md` for popovers and the gym picker, `shadow-lg` for modals and sheets, `shadow-toast` for toasts, `shadow-seg` for the active segmented item. Cards have **no shadow**, only a 1px `border-line`.

### Motion (Framer Motion)
| What | Spec |
|---|---|
| Page change | `initial {opacity:0,y:6}` → `{opacity:1,y:0}`, 200ms, easeOut (key by pathname) |
| Modal (md+) | scale .96→1 + opacity, 160ms easeOut |
| Bottom/full sheet (mobile) | y `100%`→0, `type:'spring', stiffness:400, damping:40` |
| Side panel (md+) | x `100%`→0, 220ms `[0.2,0.8,0.2,1]` |
| Backdrop | opacity 0→1, 150ms |
| Toast | y 8→0 + opacity, 180ms; auto-dismiss 3.2s |
| Account menu | scale .96→1, origin top-right, 140ms |
| Toggle knob | translateX 0↔16px, 150ms easeOut (CSS transition OK) |
| Skeleton | `bg-[linear-gradient(90deg,#EEEDE8_25%,#F7F6F2_50%,#EEEDE8_75%)] bg-[length:200%_100%] animate-shimmer` |

Wrap overlays in `<AnimatePresence>`. Honour `useReducedMotion()`: drop transforms and keep the fades.

---

## 6. Shared components (build once in `src/features/superadmin/components/`)

### Button
| Variant | Default | Hover | Pressed | Disabled |
|---|---|---|---|---|
| primary | `bg-accent text-white` | `bg-accent-700` | `bg-accent-800` | `bg-line text-ink-disabled cursor-not-allowed` |
| secondary | `bg-surface border border-line-strong text-ink` | `bg-canvas` | `bg-line-soft` | `text-ink-disabled border-line` |
| ghost | `bg-transparent text-ink-2` | `bg-muted text-ink` | `bg-line` | `text-[#9CA0A9]` |
| danger | `bg-danger text-white` | `bg-danger-700` | `bg-danger-800` | `bg-[#F3D3CF]` |

- Base: `inline-flex items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold h-11 md:h-10 whitespace-nowrap focus-visible:outline-2 outline-offset-2 outline-accent`.
- Loading: keep the width, show a 16px spinner (`size-4 rounded-full border-2 border-white/35 border-t-white animate-spin`) plus the loading label ("Saving…"), and set `aria-busy` and `disabled`.
- Small (inline retry): `h-8 px-2.5 text-[13px] font-medium`.

### StatusBadge
`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full text-xs font-semibold` with a `size-1.5 rounded-full` dot and **always a text label**.

| Status | bg | text | dot |
|---|---|---|---|
| Active | success-soft | success | success-dot |
| Trial | info-soft | info | info-dot |
| Expired | danger-soft | danger | danger-dot |
| Suspended | neutral-soft | neutral | neutral-dot |
| Inactive | muted | #5B606B | #9CA0A9 |
| Draft | warning-soft | warning | warning-dot |
| Published | accent-soft | accent-ink | accent |
| Paid / Failed / Pending | = Active / Expired / Draft colours | | |

### PlanBadge
`inline-flex items-center h-[22px] px-2 border border-line-strong rounded-md text-xs font-medium text-ink`. It's neutral on purpose, so status colour stays the only colour signal in a row.

### Inputs
- **TextInput**: `h-11 md:h-10 px-3 rounded-lg border border-line-strong bg-surface text-sm`.
  - Placeholder: `placeholder:text-ink-disabled`.
  - Error: `border-danger-dot`, with an error line underneath (`text-[13px] text-danger`, `role="alert"`) and `aria-invalid`.
  - Label: 14 500 above, gap 6px. A required field shows `*` in danger (`aria-hidden`).
- **TextareaWithCounter**: the counter sits right-aligned on the label row, 12px tabular.
  - Counter colour is ink-3 by default, warning at ≥90% of max, danger at max.
  - Enforce `maxLength`. The textarea is `min-h-[136px] resize-y py-2.5`.
- **PhoneInput**: a joined field, `flex h-11 md:h-10 max-w-[360px] rounded-lg border overflow-hidden`.
  - Prefix: `+91` on `bg-canvas border-r border-line px-3 font-medium text-ink-2`, then the input.
  - Input: `type="tel" inputMode="numeric" autoComplete="tel-national"`. Strip non-digits, max 10.
- **CurrencyInput**: the same joined pattern at `max-w-[240px]`.
  - Prefix: `₹` in a `w-10` box. Suffix: `/month` (13px ink-3).
  - Display the value with Indian grouping while typing (`1,25,000`) and store digits only.
  - Helper below: "₹1,999 per month", or "Whole rupees, charged monthly" when empty.
- **Locked input**: `bg-canvas border-line text-ink-2 cursor-not-allowed readOnly`, with a lock icon absolutely positioned on the right (`pr-10`).
  - Helper text: "Locked after creation — gym subscriptions and payment records reference this ID."
- **Switch**: `role="switch" aria-checked`. Track `w-10 h-6 rounded-full p-0.5`: on = accent, off = `#C9C8C1`. Knob `size-5 rounded-full bg-white shadow-sm`, translate 16px.
  - Always put a text label next to it: "Active" / "Inactive". Hit area ≥44px on mobile.
- **SearchInput**: 18px search icon at `left-3`, `pl-[38px]`. A clear "×" button (36×36) appears when there's a value.
- **FilterSelect**: a styled native `<select>` with `appearance-none pr-8`, a chevron at `right-2.5` (`pointer-events-none`) and a visually hidden label.
  - When a value is set, use the selected style: `border-accent-line bg-accent-tint`.
- **FilterChip** (removable): `h-11 md:h-8 rounded-full border border-[#BFDDD0] bg-accent-soft text-accent-ink text-[13px] font-medium pl-3 pr-2`, with an × icon and `aria-label="Remove filter …"`.
  - Chip labels: `“query”`, `Plan: Growth`, `Status: Trial`, `City: Pune`. Follow the chips with an underlined ghost "Clear all".
- **SegmentedControl**: `grid grid-cols-3 gap-0.5 p-[3px] rounded-[10px] bg-line-soft`. Items are `h-[38px] md:h-[34px] rounded-lg`.
  - Active item: `bg-surface shadow-seg font-semibold text-ink`. Inactive: `text-[#5B606B]`. Each item shows a count (12px ink-3), e.g. "Active 4".
- **Tabs** (Broadcasts): `role="tablist"`, underline style. Each tab is `h-11 px-3 -mb-px border-b-2`.
  - Active: `border-accent text-ink font-semibold`. Inactive: `border-transparent text-ink-3`.
  - Count pill: `min-w-5 h-5 px-1.5 rounded-full bg-line-soft text-xs font-semibold`.
- **RadioCard**: `role="radio"`, `p-3 rounded-[10px] border`. A 18px ring with an 8px inner dot, a title (600) and a sub line (12/16 ink-3).
  - Selected: `border-accent bg-accent-tint`, ring and dot turn accent.
  - Unselected: `border-line-strong`; hover `border-accent-line`.
- **GymMultiSelect**: selected chips first (`h-8 rounded-full bg-accent-soft pl-2.5`, with a 28px × button) plus "Clear". Below them, a combobox input with search icon.
  - While focused, a listbox opens underneath: `rounded-[10px] border border-line shadow-md p-1`.
  - Options are 44px rows: an 18px checkbox (checked = accent fill + white check), then name (500) and meta line ("Pune · Growth", 12px).
  - Show a maximum of 6 results. After them, a footer "+N more — keep typing to narrow down". With no matches: "No gyms match that search."
  - Use `onMouseDown={e=>e.preventDefault()}` on options so the input keeps focus.

### Cards, KPI, states
- **Card**: `bg-surface border border-line rounded-xl` (no shadow).
- **KpiCard**: `p-3.5 md:p-5 min-h-[104px] md:min-h-[128px] flex flex-col justify-between gap-2`.
  - Contents: label (13/18 500 ink-2), value, and a secondary line (12/16 ink-3) with its lead token in 600.
  - Secondary-line lead colours: accent-ink for "+N", ink for "X%" and "₹X", ink-3 for "Across".
  - Loading: two shimmer bars, `h-6 w-[70%]` and `h-3 w-[45%]`.
  - Error: an alert icon + "Couldn’t load" in danger, plus a small secondary "Retry" button with a refresh icon.
  - Grid: `grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4`. On mobile it's a 2×2 compact grid, **not** a horizontal scroller: all four totals stay visible with no hidden content.
- **EmptyState**: centred, `py-12 px-6 gap-2`. A 48px `rounded-xl bg-muted text-ink-3` icon tile, a 16/24 600 title, a max-w-[360px] ink-3 body, and an optional secondary CTA (`mt-2`).
- **ErrorState**: the same layout with a `bg-danger-soft text-danger` tile and a secondary "Try again" button (refresh icon). Use `role="alert"`.
- **Inline section error** (e.g. payments): a banner with `m-4 p-4 rounded-lg bg-danger-soft`: an alert icon + message in danger 500 on the left, a secondary "Retry" on the right.
- **NotFound (404)**: a card with `py-16`. Show "404" (Geist Mono 13 600 ink-3 `tracking-[.08em]`), then "Gym not found" (20/28), then "This gym may have been removed, or the link is incorrect.", then a primary "Back to dashboard" button.
- **Skeleton**: shimmer blocks sized like the real content, so the layout doesn't shift. Set `aria-busy="true"` on the container.
- **Pagination**:
  - Left: range label "1–20 of 46" (13px ink-3).
  - Right: prev and next icon buttons (40 or 44px square, secondary style, `opacity-40` + `disabled` at the ends).
  - Between the arrows: page-number buttons on md+ (active one `bg-ink text-white border-ink`, `aria-current="page"`); on mobile, the text "Page 1 of 3" instead.
- **Toast**: `bg-ink text-white rounded-[10px] shadow-toast pl-3.5 pr-2 py-2.5 flex gap-2.5`, `role="status" aria-live="polite"`.
  - Icon: success check-circle `#6FD3A8`, error alert `#FF9A8F`. A 32px dismiss ×.
  - Position: mobile `left-4 right-4 bottom-20` (above the tab bar); md+ `right-6 bottom-6 w-[380px]`.

### Overlays
- **ConfirmDialog** (`role="alertdialog"`):
  - Contents: a 40px round icon (`bg-accent-soft text-accent-ink`, or `bg-danger-soft text-danger` if destructive), a title (17/24 600), a body (ink-2), optional summary rows, and buttons.
  - Summary rows: `dl` with `bg-subtle border border-line-soft rounded-[10px] px-3.5`. Each row is `py-2.5` with a divider, key on the left (13 ink-3), value on the right (13 500).
  - Buttons: Cancel (secondary), an optional alt action (secondary), and Confirm (primary, or danger if destructive).
  - md+: a centred modal, `max-w-[440px] rounded-xl p-6 shadow-lg`, with buttons in a row aligned right.
  - Mobile: a bottom sheet, `rounded-t-2xl px-4 pt-5 pb-[calc(16px+env(safe-area-inset-bottom))]`, with a 36×4 grab handle and buttons stacked full-width (`flex-col-reverse`, so the confirm button sits on top).
- **Modal ↔ Sheet** (plan form):
  - md+: `max-w-[480px] rounded-xl`, max height `calc(100%-48px)`.
  - Mobile: **full-screen** (`h-full rounded-none`).
  - Structure: a header (title + sub + 44px close ×, `border-b`), a scrolling body (`p-5 gap-[18px]`), and a footer (`border-t`, Cancel + primary).
- **SidePanel** (sent detail):
  - md+: right-docked, `w-full max-w-[460px] h-full`, slides in from the right.
  - Mobile: full-screen sheet.
  - Header: h-14 with the label "SENT BROADCAST" and a close ×.
- Every overlay: backdrop click closes it, **Esc** closes the topmost one, focus is trapped (Headless UI `Dialog` or `focus-trap-react`), and focus returns to the trigger. Body scroll is locked while open.

### Icons
The prototype uses 24×24 stroke icons (1.8 stroke, round caps) matching **lucide-react**. Map them to lucide: `LayoutGrid, Megaphone, Layers, SlidersHorizontal, LogOut, Search, ChevronLeft/Right/Down, X, Check, Lock, Phone, Mail, Plus, Eye, TriangleAlert, Trash2, PencilLine, PanelLeft, RefreshCw, Users, Inbox, ArrowLeft, CircleCheck`. Sizes: 20px in nav, 18px inline, 16px in small buttons and chevrons.

---

## 7. Screens

### 7.1 Dashboard — `/superadmin`
**A. KPI strip** (see KpiCard). Cards in order:
| Label | Value | Secondary |
|---|---|---|
| Total gyms | count | **+N** this month (created in current calendar month) |
| Active gyms | count with status `active` | **X%** of total (rounded) |
| Total members | Σ memberCount | **Across** N gyms |
| Total collected | Σ paid payments, all-time, `₹` | **₹X** this month |

**B. Gyms card**
- Header row, `p-4 md:p-5 border-b border-line-soft`: "Gyms" (16/24 600) on the left.
  - Count on the right: "46 total", or "12 of 46" when filtered.
- Toolbar grid (`gap-2`):
  - Mobile `grid-cols-2`: search spans both columns; below it Plan / Status / City / Sort.
  - Tablet `grid-cols-4`: search spans the full row.
  - Desktop `grid-cols-[minmax(200px,1fr)_repeat(4,minmax(0,148px))]`, everything in one row.
- Search placeholder: "Search gym, owner or city". It matches gym name, owner name or city (case-insensitive, substring).
- Selects:
  - Plan: All plans + each plan.
  - Status: All statuses / Active / Trial / Expired / Suspended.
  - City: All cities + distinct cities, sorted.
  - Sort: "Sort: Newest" (createdAt desc, the default) / "Sort: Name A–Z" / "Sort: Most members".
- Active filter chips row, then "Clear all".
- **Table (md+)**: `role="table"`, a CSS-grid row layout.
  - Header: `sticky top-0 z-[2] h-10 bg-subtle border-b border-line-soft`, 12px uppercase `text-[#5B606B]`.
  - Columns, desktop: `grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_88px]` → Gym | City | Owner | Plan | Status | Members (right-aligned).
  - Columns, tablet: drop the City column and show city as a 12px ink-3 second line under the gym name: `grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_76px]`.
  - Rows: `min-h-14 px-5 gap-4 border-t border-line-soft hover:bg-[#FAFAF7] cursor-pointer`. The whole row is clickable, has `tabIndex=0`, and opens on Enter/Space. Truncate text with an ellipsis.
- **Cards (mobile)**: a divided list with no inner borders. Each item is a full-width `<button>` with `px-4 py-3.5 gap-1.5`:
  - Row 1: gym name (15/20 600, truncated) + StatusBadge.
  - Row 2: "Pune · Rohan Deshmukh" (13/18 ink-2).
  - Row 3: PlanBadge on the left, "**248** members" on the right.
- Pagination footer: 20 per page (`px-4 py-3 border-t`).
- States:
  - Loading: 6 skeleton rows.
  - Error: ErrorState "Couldn’t load gyms" / "Something went wrong while fetching the gyms list. Check your connection and try again."
  - Empty: "No gyms yet" / "Gyms appear here as soon as an owner signs up for Gymloop." (inbox icon).
  - No results: "No gyms match “{q}”" (or "No gyms match these filters") / "Try a different name, owner or city, or clear your filters." + "Clear filters".
- **State persistence**: keep `q, plan, status, city, sort, page` in the URL search params (`useSearchParams`), so Back from Gym detail restores them. Reset `page` to 1 on any filter change.

### 7.2 Gym detail — `/superadmin/gyms/:gymId` (read-only)
- md+: a ghost back button, "← Dashboard" (h-9). Mobile: the back arrow in the top bar. Both use `navigate(-1)` if the previous page was the dashboard, otherwise `/superadmin`, and preserve the query.
- **Header**: gym name (24/32 600) + StatusBadge (h-6), then "Pune · Joined 12 Mar 2025" (14 ink-3).
- Grid: `grid md:grid-cols-2 gap-4`.
  - **Owner card**:
    - Section label "OWNER".
    - A 40px initials avatar (`bg-muted`) + owner name (16/24 600).
    - Two 44px rows with top dividers: phone link `tel:+91…` ("+91 98765 43210", phone icon) and email link `mailto:` (mail icon, truncated). Hover `text-accent-ink`.
  - **Subscription card**:
    - Label "SUBSCRIPTION", plus an info badge "Free trial" if on trial.
    - Plan name (18/26 600), with "₹1,999/month" on the right.
    - A 2-col `dl`: "Started" / "Trial started" and "Renews on" / "Trial ends" / "Expired on".
    - **Days-remaining banner** (`rounded-lg border px-3 py-2.5`):
      - ≥7 days: neutral `bg-canvas border-line`, "23 days remaining".
      - 0–6 days: `bg-warning-soft border-warning-line text-warning` + alert icon, "5 days remaining" / "Renewal is due soon." (for trials, "Trial ends soon.").
      - Past: `bg-danger-soft border-danger-line text-danger` + icon, "Expired 12 days ago" / "Access is limited until the gym renews."
      - Due today: "Expires today".
- **Payments to Gymloop** (full width):
  - Label, then two tiles (`grid-cols-2`, `bg-subtle border-line-soft rounded-lg p-3`): "Total paid to date" (₹) and "Last payment" (₹ + "on 04 Sep 2026").
  - History, md+: a table with columns `grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_96px]` → Date | Amount | Plan | Status (Paid/Failed/Pending badge). Rows are 44px.
  - History, mobile: rows with date (500) + plan (12 ink-3) on the left, and amount (600) + a small badge (h-5, 11px) on the right.
  - Show the latest 6, then a full-width ghost accent button "Show all N payments" / "Show fewer".
  - Trial with no payments: "No payments yet — this gym is on a free trial."
  - Error: the inline section error "Couldn’t load payment history" + Retry.
- **Member summary** (full width):
  - Label "MEMBER SUMMARY", with "Aggregates only · no individual member data" on the right.
  - Stat tiles, `grid-cols-2 md:grid-cols-3 lg:grid-cols-5`:
    - Total members / All time
    - Active / "82% of total"
    - Expired / Membership lapsed
    - New this month / "+24" / "Since 01 Sep 2026"
    - Revenue this month / ₹ / Collected from members
  - Chart titled "Members, last 6 months": 6 flex bars, `h-[150px]`, `max-w-11 rounded-t-md rounded-b-sm`.
    - Bar height = `16 + value/max*84` px. The current month is accent; previous months are `#BFDDD0`.
    - Value label above each bar and month label below (12px). `role="img"` with an aria-label. No chart library needed.
- States:
  - Whole-page skeleton: title bar, meta bar, two 168px blocks, one 220px block.
  - 404 when the gym doesn't exist.
  - Per-section error with retry.
- **Never** render individual member data.

### 7.3 Broadcasts — `/superadmin/broadcasts?tab=compose|drafts|sent`
Tabs: Compose · Drafts (count) · Sent (count).

**Compose**
- Layout:
  - lg: `grid-cols-[minmax(0,1fr)_360px] gap-6 items-start`, with the preview `sticky top-0`.
  - Below lg: form only.
- When editing a draft, show a banner (`bg-warning-soft text-warning rounded-lg`): "**Editing draft** · last saved 23 Sep 2026, 5:20 PM", with an underlined "Start a new broadcast" on the right.
- Title: required, max 80, counter "12/80". Placeholder "e.g. Scheduled maintenance on 28 Sep".
- Message: required, max 1000, counter, 6 rows. Placeholder "Write what gym owners need to know…".
- Audience: a fieldset of 3 RadioCards (1 col mobile, 3 cols md+):
  - All gyms / Every gym on Gymloop
  - By plan / Gyms on selected plans
  - Specific gyms / Hand-pick individual gyms
- By plan: a chip multi-select of all plans (`role="checkbox"`). Selected = accent-soft + check icon. Each chip shows its gym count, e.g. "Growth 14 gyms".
- Specific gyms: GymMultiSelect.
- **Reach banner** (`aria-live="polite"`): users icon + "Will reach **N gyms**".
  - N > 0: `bg-accent-soft text-accent-ink`. N = 0: `bg-canvas text-ink-3`.
  - Reach rules: `all` → all gyms; `plans` → gyms whose planId is in the selection; `gyms` → the number of gyms selected.
- Actions (footer, `border-t pt-4`):
  - md+: "Save as draft" (secondary) and "Publish" (primary), right-aligned, max 180px each.
  - Mobile: a full-width "Preview" (muted fill, eye icon), then Save as draft | Publish at 50/50.
  - Tablet: "Preview" as a ghost button on the left.
- **Preview**:
  - lg: an inline side panel titled "Live preview · gym owner’s app". Inside a `bg-line-soft rounded-2xl p-4` frame sits the announcement card (`rounded-xl shadow-sm p-4`):
    - Header: 28px megaphone tile, "Announcement from Gymloop" (12 600 accent-ink), "Just now" on the right.
    - Title (16/22 600), message (14/20 ink-2, `whitespace-pre-wrap`), and a faux "Got it" button.
    - Empty placeholders in `#9CA0A9`: "Your announcement title" / "Your message will appear here as gym owners will see it."
    - Footnote: "Shown once in the owner’s notification feed, and pinned on their dashboard for 7 days." *(confirm this behaviour with product; drop the footnote if it's not true)*
  - Below lg: "Preview" opens a bottom sheet (mobile, max-h 90%) or a modal (tablet) with the same card + "Audience: N gyms".
- Validation, on submit only; errors then update live:
  - Title empty → "Add a title".
  - Message empty → "Write a message" (publish only).
  - `By plan` with none selected → "Pick at least one plan". `Specific gyms` with none → "Pick at least one gym".
  - **Save as draft only requires the title.**
- **Publish** opens a ConfirmDialog (primary, megaphone icon):
  - Title: "Publish this broadcast?"
  - Body: "It will appear immediately in the Gymloop app for every gym owner in the audience. Published broadcasts can’t be edited."
  - Summary rows: Title / Audience ("All gyms" · "2 plans · Growth, Pro" · "12 gyms") / Reach.
  - Confirm label: "Publish to N gyms".
  - On confirm: write the broadcast (`status:'published'`, `publishedAt`, `reachCount`), delete the source draft if there was one, reset Compose, switch to the Sent tab, and toast "Broadcast published to N gyms".
- **Save as draft**: create or update the draft, stay in Compose in editing mode, toast "Draft saved".
- **Unsaved-changes guard**: Compose becomes dirty on any field change. Leaving the Compose tab or the route while dirty opens a ConfirmDialog (danger):
  - Title: "Discard unsaved changes?" / Body: "Your broadcast in Compose hasn’t been saved."
  - Buttons: **Keep editing** · **Save as draft** · **Discard**.
  - Also use `useBlocker` (React Router) and `beforeunload`.

**Drafts**
- One card per draft, sorted by `updatedAt` desc: Draft badge + title (15/22 600), a 2-line clamped preview (`line-clamp-2`), and the meta line "2 plans · Growth, Pro · Edited 23 Sep 2026".
- Actions, right-aligned; they wrap below the text on narrow widths:
  - Delete: an icon button (danger ghost).
  - Edit: secondary. Loads the draft into Compose; runs the guard first if Compose is dirty.
  - Publish: primary. Opens the publish confirm directly. If the draft fails publish validation, it opens in Compose with the errors shown instead.
- Delete confirm (danger, trash icon): "Delete this draft?" / "“{title}” will be permanently deleted. This can’t be undone." / confirm "Delete draft" → toast "Draft deleted".
- Empty: "No drafts" / "Broadcasts you save without publishing will show up here." + "Compose a broadcast". Also loading and error states.

**Sent**
- Toolbar: search by title + a date-range select (All time / Last 7 days / Last 30 days / Last 90 days).
- List (one card, divided rows), reverse-chronological. Each row: title (15/22 600), a 1-line preview (truncated), meta "All gyms · 22 Sep 2026, 6:30 PM", and a chevron.
- Click opens a **SidePanel / full-screen sheet** containing:
  - "Published" badge, title (20/28), and timestamp "22 Sep 2026 at 6:30 PM".
  - The full message (pre-wrap).
  - Audience section: summary + "Reached N gyms", then a list of plans (with current gym counts) or gyms (name + city). For All gyms: "Every gym on Gymloop at the time of publishing."
- Empty: "No broadcasts sent yet". No results: "No broadcasts match" + "Clear filters". Also loading and error states.

### 7.4 Plans — `/superadmin/plans`
- Toolbar:
  - SegmentedControl "All 6 · Active 4 · Inactive 2" (max-w 360 md+, full width on mobile).
  - Sort select on the right: Amount low→high (default) / Amount high→low / Name A–Z.
  - Mobile: add a full-width primary "+ New plan". On md+ it lives in the page header.
- **Table (md+)**:
  - Columns: `grid-cols-[minmax(0,1.4fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,.7fr)_minmax(0,1.1fr)_88px]` → Plan ID (mono ink-2) | Display name (500) | Monthly (right, "₹1,999") | Gyms (right) | Status (Switch + "Active"/"Inactive" label) | Edit (ghost, pencil icon).
  - Rows are `min-h-14`.
- **Cards (mobile)**:
  - Top: name (15/22 600) + mono ID (12px), with the label + Switch on the right.
  - Bottom (after a divider): "**₹1,999**/month · 14 gyms", with an "Edit" ghost accent button on the right.
- Toggle behaviour:
  - Activate: immediate, toast "{name} activated".
  - Deactivate with **gymCount > 0**: ConfirmDialog (danger, alert icon), "Deactivate {name}?" / "**N gyms are on this plan. They keep it until renewal; new gyms can’t select it.**" / confirm "Deactivate plan".
  - Deactivate with 0 gyms: immediate. Toast "{name} deactivated".
- **Add / edit** (Modal ↔ full-screen Sheet):
  - Title: "New plan" / "Edit plan". Sub: "Gyms can subscribe to this plan once it’s active." / "Changes apply to new subscriptions and renewals."
  - Plan ID:
    - Required, `^[a-z0-9_]+$`, unique. Mono font, placeholder "e.g. growth_monthly".
    - Helper: "Lowercase letters, numbers and underscores. Can’t be changed later."
    - Errors: "Plan ID is required" / "Use lowercase letters, numbers and underscores only" / "Plan ID already exists". The "already exists" error shows live as soon as the ID matches an existing one.
    - **Edit mode**: read-only with a lock icon + the locked helper text.
  - Display name: required, max 40, counter. Errors: "Display name is required".
  - Monthly amount: CurrencyInput, whole rupees > 0. Errors: "Monthly amount is required" / "Amount must be more than ₹0".
  - Active switch row (`min-h-14 rounded-[10px] border bg-subtle px-3`): "Active" + "Active — gyms can select this plan" / "Inactive — hidden from gyms". Default on.
  - Validation shows errors on blur, or for every field once submit has been attempted. Enter submits the form.
  - Primary: "Create plan" / "Save changes" → loading "Saving…" (close/Esc disabled while saving) → close + toast "Plan created" / "Changes saved".
  - Uniqueness must also be enforced server-side (use `planId` as the Firestore doc id + a transaction, or a rules check).
- States:
  - Loading: 4 skeleton rows.
  - Empty: "No plans yet" / "Create your first plan so gyms can subscribe to Gymloop." + "Create plan".
  - Filtered empty: "No inactive plans" + "Show all plans".
  - Error.

### 7.5 Settings — `/superadmin/settings`
- Column max-w 720.
- **Contact details** card (a `<form>`):
  - Title (16/24 600) + sub "Used for platform alerts and shown to gym owners on support screens." *(confirm this copy with product)*
  - Fields: Phone (PhoneInput) and Email (`type=email autoComplete=email`, max-w 360).
  - Validation, on blur and on submit:
    - Phone must match `^[6-9]\d{9}$`, else "Enter a 10-digit mobile number starting with 6, 7, 8 or 9" (empty: "Phone number is required").
    - Email must match `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`, else "Enter a valid email address, like name@example.com" (empty: "Email address is required").
  - Footer (`bg-subtle border-t rounded-b-xl px-4 md:px-5 py-3`):
    - Left: hint "No changes to save" / "You have unsaved changes".
    - Right: "Discard" (ghost, shown only when dirty) + "Save changes".
    - Save changes is **disabled until a value differs from the saved value**. While saving it shows "Saving…".
  - Success: toast "Contact details saved".
  - Failure: an inline banner at the top of the card (`bg-danger-soft text-danger`, "Couldn’t save your changes. Check your connection and try again.") + error toast. The typed values are kept.
- **Account** card: "Account" / "Signed in as Super Admin on this device." + a danger "Log out" button (logout icon). It opens the same logout confirm as the nav.

### 7.6 Logout
ConfirmDialog (danger, logout icon):
- Title: "Log out of Super Admin?" / Body: "You’ll need to sign in again to manage gyms, broadcasts and plans."
- Buttons: **Cancel** / **Log out**.
- On confirm: call `signOut(auth)` and redirect to the existing sign-in route.

It can be triggered from three places: the sidebar footer, the mobile account menu, and Settings → Account.

---

## 8. Formatting (Indian locale)
```js
export const formatINR = (n) => '₹' + Math.round(n).toLocaleString('en-IN');         // ₹1,25,000
export const formatNum = (n) => Math.round(n).toLocaleString('en-IN');              // 13,439
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const formatDate = (d) => `${String(d.getDate()).padStart(2,'0')} ${MON[d.getMonth()]} ${d.getFullYear()}`; // 24 Sep 2026
export const formatTime = (d) => d.toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:'Asia/Kolkata'}).replace('am','AM').replace('pm','PM'); // 6:30 PM
export const formatPhone = (p10) => `+91 ${p10.slice(0,5)} ${p10.slice(5)}`;       // +91 98765 43210
export const daysBetween = (a,b) => Math.round((startOfDay(b)-startOfDay(a))/864e5);
```
Pluralise every count, e.g. "1 gym" / "2 gyms" and "1 day" / "5 days".

## 9. Data model (Firestore) — adapt names to what already exists
```
gyms/{gymId}
  name: string, city: string, ownerName: string, ownerPhone: string (10 digits), ownerEmail: string
  planId: string, status: 'active'|'trial'|'expired'|'suspended', createdAt: Timestamp
  subscription: { startAt: Timestamp, endAt: Timestamp, isTrial: boolean }
  stats: { totalMembers, activeMembers, expiredMembers, newMembersThisMonth, revenueThisMonth: number,
           history: [{ month: 'YYYY-MM', count: number }] }   // aggregates only — maintained by Cloud Function
gyms/{gymId}/payments/{paymentId}
  amount: number (₹), paidAt: Timestamp, planId: string, planName: string, status: 'paid'|'failed'|'pending'
platform/stats  (Cloud Function or aggregate queries)
  totalGyms, newGymsThisMonth, activeGyms, totalMembers, totalCollected, collectedThisMonth
plans/{planId}          // doc id IS the Plan ID → uniqueness + immutability for free
  displayName: string (≤40), monthlyAmount: number (int ₹ > 0), isActive: boolean, createdAt, updatedAt
  gymCount → getCountFromServer(query(gyms, where('planId','==',id)))
broadcasts/{id}
  title (≤80), message (≤1000), status: 'draft'|'published'
  audience: { type: 'all'|'plans'|'gyms', planIds: string[], gymIds: string[] }
  reachCount: number (snapshot at publish), createdAt, updatedAt, publishedAt: Timestamp|null
superAdmin/profile
  phone: string (10 digits), email: string, updatedAt
```
Gym-owner app: query `broadcasts` where `status=='published'` and the audience matches (all / planId in planIds / gymId in gymIds).

## 10. State management (per screen)
- **Dashboard**:
  - URL params: `q, plan, status, city, sort, page`.
  - Queries: `stats` and `gyms`, each with `{data, loading, error, refetch}`. Each KPI card reads its own slice, so its error and retry stay independent.
- **Gym detail**: `gym`, `payments`, `showAllPayments`. Fetch payments separately so the section can fail on its own.
- **Broadcasts**:
  - URL `tab`. `draft` form state: `{title, message, audienceType, planIds, gymIds, editingId, dirty, submitted}`.
  - `pickerQuery`, `pickerOpen`, `previewOpen`, `sentSearch`, `sentRange`, `selectedSentId`.
  - Lists: `drafts` and `sent`.
- **Plans**: `filter` (all/active/inactive), `sort`, `plans`, `editor` (`{mode, id, name, amount, active, touched, submitted, saving}` or null), `confirm`.
- **Settings**: `saved`, `form {phone, email}`, `touched`, `submitted`, `saving`, `error`.
- **Global**: `toast` (one at a time), `confirmDialog` (a context/provider with `confirm({...}) → Promise<boolean>`), `sidebarCollapsed` (localStorage).

## 11. Accessibility checklist
- Visible focus ring on every interactive element: `focus-visible:outline-2 outline-offset-2 outline-accent`.
- Logical tab order. Esc closes the topmost overlay. Enter submits forms.
- Labelled fields (`<label for>`). Selects without a visible label use an `sr-only` label.
- Errors use `role="alert"` and fields use `aria-invalid`.
- Status is never shown by colour alone: badges carry text, and days-remaining carries text + icon.
- Contrast is AA: ink-3 #6B7080 on white is 4.8:1, and white on accent #0B7A57 is 5.3:1.
- Mobile tap targets are ≥44×44, including the pager, chips, switches and the × buttons in chips (28px visual inside a 44px row).

## 12. Non-goals (don't build)
- Member lists, member profiles, or any individual member data.
- Editing gyms, suspending gyms, or changing a gym's plan.
- The membership plans that gyms sell to their own members.
- WhatsApp, SMS, email or push delivery.
- Scheduling.
- Multiple admins, roles or audit logs.
- Auth screens.
- Extra analytics.

## 13. Files in this bundle
- `README.md` — this spec
- `ANTIGRAVITY_PROMPT.md` — paste-ready task prompt with a build order
- `design/Gymloop Console.dc.html` — clickable responsive prototype (open directly in a browser)
- `design/Gymloop Super Admin Handoff.dc.html` — design board: tokens, components, all screens and states at 375/768/1280, notes
- `design/support.js` — runtime needed to open the two HTML files

Assets: no images. The logo tile is a placeholder, so use the real Gymloop logo. Icons come from lucide-react. Fonts are Geist and Geist Mono (Google Fonts, or the `geist` npm package).
