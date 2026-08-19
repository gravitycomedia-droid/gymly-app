# Gymloop frontend — integration guide

How this prototype is put together, what every screen contains, and how to move
it into your existing web app. Source: `GYMLOOP-FULL-SOURCE.md` (all code inlined)
and `src/` (raw files).

---

## 1. How the prototype is structured

Three files, clean separation — port them in this order:

| File | What it is | Port it? |
|---|---|---|
| `Gymloop Owner Prototype.dc.html` | State machine, seed data, routing, wizards, settings definitions, device frames | Logic yes, frames no |
| `GymloopApp.dc.html` | Every screen's markup and styling, driven purely by props | **Yes — this is the UI** |
| `MembershipCard.dc.html` | Membership card, style-driven from settings | Yes |
| `support.js` | Prototype runtime | No |
| `Gymloop Auth & Onboarding.dc.html` | Auth state machine + device frames | Logic yes, frames no |
| `GymloopAuth.dc.html` | Sign in, PIN, OTP, sign up, 4-step setup, done | **Yes** — see `AUTH-ONBOARDING.md` |

`GymloopApp` is a **pure presentational component**: it receives one `app` object
plus an `actions` object and renders whatever route it's told to. That means the
port is mechanical — replace the prototype's in-memory state with your API layer,
keep the same prop shape, and the UI works unchanged.

```
Prototype:   Owner Prototype (state)  ->  GymloopApp (props)  ->  screens
Your app:    router + API/store       ->  GymloopApp (props)  ->  screens
```

### The `app` prop contract

```js
{
  route: 'dashboard',          // current screen id (see route table below)
  param: null,                 // route argument, e.g. member id
  mode: 'desktop' | 'mobile',  // layout switch
  lang: 'en' | 'te' | 'kn',    // UI language
  role: 'owner' | 'manager' | 'receptionist' | 'trainer',
  members: [ /* member records */ ],
  stats: { revenue, active, expiring, inGym, dueCount, dueTotal },
  q, filter, sort, limit,      // members list controls
  wizard: { title, steps, step, fields, data, errors, summaryRows, done },
  listScreen: { title, sub, kpis, chart, rows, primary, emptyTitle, emptySub },
  settingsDef, settingsValues,
  leadRows, leadStats, leadTabs, newLeads,
  planMix, heat,               // analytics
  cardStyle, profileLayout, stepIndicator,   // design options
  toast, loading, quickOpen, searchOpen, quickViewMember
}
```

### The `actions` prop contract

```js
{
  go(route, param, filter),  setQuery(q),  setFilter(f),  setSort(s),  more(),
  wizNext(),  wizBack(),  wizSet(key, value),  wizFinish(),
  setSetting(key, value),  saveSettings(),
  openQuickView(id), closeQuickView(), toggleQuick(), toggleSearch(),
  recordPayment(id), sendReminder(id), deleteMember(id), restoreMember(id),
  advanceLead(id), setLeadTab(id), toggleSetup(i), setLang(l), setRole(r),
  toastMsg(text), exportCsv(which)
}
```

Wire each of these to a real call (REST/GraphQL/store dispatch). Nothing in
`GymloopApp` touches storage, timers or network.

### Member record shape

```js
{ id, enrollment: 'IPF-1001', name, phone, dob, plan, status: 'active'|'expiring'|'expired',
  expiry, due, lastVisit, initials, color, recent: [{ label, date, method, amount }] }
```

Enrollment numbers are generated on create (`IPF-` + sequence) and are shown in
the member list, the profile header and on the membership card.

---

## 2. Route map

| Route | Screen | Notes |
|---|---|---|
| `dashboard` | Owner home | KPI row, action queue, quick actions, setup card |
| `setup` | Gym setup checklist | Progress %, tickable items |
| `leads` | Inquiries / leads | Tabs by stage, stat row, advance-stage action |
| `members` | Member list | Search, status filter chips, sort, pagination, quick view |
| `member` | Member profile | Header w/ enrollment + edit/delete icons, stats, payments, then membership card |
| `addMember` | Add member wizard | 3 steps: Member → Plan & payment → Summary |
| `editMember` | Edit member wizard | Same fields, pre-filled |
| `memberPayments` | Member payment history | Linked from profile instead of repeating history |
| `payments` | Payments list | Revenue chart, KPI row, per-payment rows |
| `paymentDetail` | Single payment | Lifetime value, count, outstanding |
| `addPayment` | Record payment wizard | Member → amount/method → confirm |
| `analytics` | Business analytics | Revenue KPIs, plan mix bars |
| `attendance` | Attendance | Check-in KPIs, 7×12 hour heat grid |
| `scanner` | QR check-in scanner | Camera frame + recent check-ins |
| `kiosk` | Kiosk devices | Paired tablets/phones, status tags |
| `tablet` | Pair a device | Pairing code screen |
| `staff` | Team & access | Role tags, permissions |
| `addStaff` | Add staff wizard | Name/phone → role → confirm |
| `whatsapp` | WhatsApp message log | Sent/delivered/replies, per-message rows |
| `plans` | Membership plans | Price + member count per plan |
| `recycleBin` | Recycle bin | 30-day restore |
| `subscription` | Gymloop subscription & billing | Plan, invoices, payment method |
| `signin` `signin/verify` `signin/pin` `signup` | Auth | Spec'd in `AUTH-ONBOARDING.md` |
| `setup/step-1…4`, `setup/done` | Onboarding | Shares the setup record with the dashboard checklist |
| `settings` | Settings hub | 5 groups (below) |
| `set:<id>` | Settings detail | Generated from `settingsDef` — sections of text/select/toggle fields |

### Settings groups

- **Gym setup** — Gym Profile, Gym Gallery, Membership Plans, Membership Card Design, Notices & Announcements, Diet & Workout Templates
- **Money & business** — Tax & Invoice, Discounts & Offers, Payment Methods, Expenses, WhatsApp/Communications, Subscription & Billing
- **People & operations** — Team & Access, Attendance & Check-in Rules, Kiosk devices, Attendance, Recycle Bin
- **Account & app** — Account, Language, Notifications, Backup/Export/Restore, Data & Privacy
- **Support & about** — Help & Support, Share Gymloop, About

Settings detail screens are **data-driven**: one `settingsDef` object of
`{ sections: [{ label, fields: [{ key, label, type, options, value }] }] }`
renders any settings page. Add a page by adding a definition — no new UI code.

---

## 3. Design tokens

Lift these into your CSS variables / theme:

```
Primary        #6C63C7      Primary deep    #4A438F
Primary tint   #F0EFFA      Primary mid     #9089D8 / #C9C5EC
Ink            #14152B      Muted ink       #5A5E76 / #8A8FA6
Border         #E3E5EE      Divider         #C9CCDC
Surface        #FFFFFF      App background  #FAFAFD
Success/active #1E7A4B on #E7F5EE
Warning        #8A4B00 / #D08700 on #FDF3E2
Danger         #C1362C / #A62C22 on #FBEBE9
Radius         10 / 14 / 18 / 22px      Card shadow  0 1px 2px rgba(20,21,43,.06)
```

Layout: mobile ≤ 430px with bottom tab bar + FAB; desktop with a fixed left rail,
top bar (search + **Check-in scan** primary action + role chip) and 1200px content
column. Language lives in Settings, not the top bar.

---

## 4. Porting recipe

1. **Take the markup.** Each screen in `GymloopApp.dc.html` is a self-contained
   block with inline styles — copy it into a component of the same name
   (`Dashboard`, `MembersList`, `MemberProfile`, `Wizard`, `ListScreen`,
   `SettingsHub`, `SettingsDetail`, `Analytics`, `Scanner`, …).
2. **Replace holes.** `{{ value }}` → your template syntax; the `renderVals()`
   block at the bottom of the logic class shows exactly how every value is
   derived, including status colours, filters, sorting and formatting.
3. **Replace control flow.** `<sc-for list as>` → `.map()`, `<sc-if value>` →
   conditional render.
4. **Swap the state.** Delete the prototype's seed arrays; feed the same
   `app` object from your API. Keep the field names and nothing else changes.
5. **Keep 4 generic screens.** `ListScreen`, `Wizard`, `SettingsDetail` and
   `MemberProfile` cover ~15 routes between them — build these four well and the
   rest is configuration.
6. **Permissions.** `role` drives `canEdit`, `canDelete`, `showFullActions`,
   `isReadOnly`. Enforce the same rules server-side.
7. **i18n.** Strings live in one `T = { en, te, kn }` dictionary near the top of
   `GymloopApp.dc.html` — move it to your i18n library as-is.

### Suggested component tree (React)

```
<AppShell mode role lang>            // rail/tabbar, top bar, FAB, toast
  <Dashboard/> <Leads/> <Setup/>
  <MembersList/> <MemberProfile/>    // + <MembershipCard/>
  <ListScreen def/>                  // payments, staff, whatsapp, plans, kiosk, bin
  <Wizard def/>                      // addMember, editMember, addStaff, addPayment
  <Analytics/> <Attendance/> <Scanner/> <TabletPair/>
  <SettingsHub/> <SettingsDetail def/> <Subscription/>
</AppShell>
```

---

## 5. Known gaps to close in production

- Settings labels were reconstructed from common gym-owner patterns — reconcile
  with your existing Settings screen before shipping.
- Delete flow shows a toast; add a real confirm dialog + undo window.
- Charts are CSS/SVG mock-ups — swap for your charting library, keeping the
  KPI-row + chart layout.
- Scanner is a static frame — wire to a real camera/QR library.
