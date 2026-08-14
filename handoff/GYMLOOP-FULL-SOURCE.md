# Gymloop frontend — full source bundle

Every file of the prototype, inlined. Raw copies live in `src/`.
Read `INTEGRATION.md` for the page-by-page spec and porting notes.

| File | Lines | Role |
|---|---|---|
| `Gymloop Owner Prototype.dc.html` | 565 | State machine + data + device frames (the "backend" of the prototype) |
| `GymloopApp.dc.html` | 1322 | All screens/UI (the part you port to React/your framework) |
| `MembershipCard.dc.html` | 102 | Membership card component |
| `support.js` | 1912 | Prototype runtime — do not port |


---

## Gymloop Owner Prototype.dc.html

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet data-dc-atomics>
<meta name="design_doc_mode" content="canvas">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Noto+Sans+Kannada:wght@400;500;700;800&family=Noto+Sans+Telugu:wght@400;500;700;800&display=swap">
<style>
*{box-sizing:border-box}
body{margin:0;background:#E9EAF0;font-family:Manrope,'Noto Sans Telugu','Noto Sans Kannada',system-ui,sans-serif}
a{color:#4A438F}a:hover{color:#332D6E}
button,input,select{font-family:inherit}
input:focus-visible,select:focus-visible,button:focus-visible{outline:2px solid #6C63C7;outline-offset:2px}
::-webkit-scrollbar{width:9px;height:9px}::-webkit-scrollbar-thumb{background:#CFD2E0;border-radius:5px}
@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes slideIn{from{transform:translateX(18px);opacity:.4}to{transform:none;opacity:1}}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}
</style>
</helmet>

<div style="min-height:100vh;padding:20px 22px 40px">

  <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:18px">
    <div style="display:flex;align-items:baseline;gap:9px">
      <h1 style="margin:0;font-size:17px;font-weight:800;letter-spacing:-.3px;color:#14152B">Gymloop · Owner section</h1>
      <span style="font-size:12.5px;color:#5A5E76;font-weight:600">clickable prototype</span>
    </div>
    <div style="display:flex;gap:6px;padding:3px;border-radius:11px;background:#fff;border:1px solid #D9DCE8">
      <sc-for list="{{ viewTabs }}" as="v" hint-placeholder-count="3">
        <button type="button" onClick="{{ v.go }}" style="min-height:36px;padding:0 13px;border-radius:8px;border:0;cursor:pointer;font:inherit;font-size:13px;font-weight:700;background:{{ v.bg }};color:{{ v.fg }}">{{ v.label }}</button>
      </sc-for>
    </div>
    <div style="display:flex;gap:6px;padding:3px;border-radius:11px;background:#fff;border:1px solid #D9DCE8">
      <sc-for list="{{ roleTabs }}" as="rt" hint-placeholder-count="4">
        <button type="button" onClick="{{ rt.go }}" style="min-height:36px;padding:0 12px;border-radius:8px;border:0;cursor:pointer;font:inherit;font-size:13px;font-weight:700;background:{{ rt.bg }};color:{{ rt.fg }}">{{ rt.label }}</button>
      </sc-for>
    </div>
    <p style="margin:0;font-size:12.5px;color:#5A5E76;max-width:420px;line-height:1.4">Role switcher is prototype chrome only. Language now lives in Settings → Language; the header carries check-in scan instead.</p>
  </div>

  <div style="display:flex;gap:26px;align-items:flex-start;flex-wrap:wrap">

    <sc-if value="{{ showDesktop }}" hint-placeholder-val="{{ true }}">
      <div style="flex:none">
        <p style="margin:0 0 8px;font-size:12px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:#8A8FA6">Desktop · ≥1024px · sidebar shell</p>
        <div style="width:1180px;border-radius:14px;overflow:hidden;background:#fff;border:1px solid #CFD2E0;box-shadow:0 6px 24px rgba(20,21,43,.09)">
          <div style="display:flex;align-items:center;gap:8px;height:38px;padding:0 13px;background:#F1F2F7;border-bottom:1px solid #E3E5EE">
            <span style="width:11px;height:11px;border-radius:6px;background:#E0808A"></span>
            <span style="width:11px;height:11px;border-radius:6px;background:#E5C069"></span>
            <span style="width:11px;height:11px;border-radius:6px;background:#8FC79D"></span>
            <span style="margin-left:10px;font-size:12px;font-weight:600;color:#5A5E76">app.gymloop.in/owner/{{ routeSlug }}</span>
          </div>
          <div style="height:772px;position:relative;overflow:hidden">
            <dc-import name="GymloopApp" mode="desktop" app="{{ app }}" actions="{{ actions }}" style="position:absolute;inset:0" hint-size="100%,772px"></dc-import>
          </div>
        </div>
      </div>
    </sc-if>

    <sc-if value="{{ showMobile }}" hint-placeholder-val="{{ true }}">
      <div style="flex:none">
        <p style="margin:0 0 8px;font-size:12px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:#8A8FA6">Mobile · &lt;1024px · bottom nav</p>
        <div style="width:393px;border-radius:34px;padding:11px;background:#14152B;box-shadow:0 8px 28px rgba(20,21,43,.22)">
          <div style="height:812px;border-radius:25px;overflow:hidden;background:#fff;position:relative">
            <dc-import name="GymloopApp" mode="mobile" app="{{ app }}" actions="{{ actions }}" style="position:absolute;inset:0" hint-size="100%,812px"></dc-import>
          </div>
        </div>
      </div>
    </sc-if>

  </div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props="{&quot;dashboardLayout&quot;:{&quot;editor&quot;:&quot;enum&quot;,&quot;options&quot;:[&quot;priority&quot;,&quot;kpi&quot;],&quot;default&quot;:&quot;priority&quot;,&quot;tsType&quot;:&quot;'priority'|'kpi'&quot;,&quot;section&quot;:&quot;Design variations&quot;},&quot;quickActionStyle&quot;:{&quot;editor&quot;:&quot;enum&quot;,&quot;options&quot;:[&quot;fab&quot;,&quot;sheet&quot;,&quot;bar&quot;],&quot;default&quot;:&quot;fab&quot;,&quot;tsType&quot;:&quot;'fab'|'sheet'|'bar'&quot;,&quot;section&quot;:&quot;Design variations&quot;},&quot;cardStyle&quot;:{&quot;editor&quot;:&quot;enum&quot;,&quot;options&quot;:[&quot;brand&quot;,&quot;light&quot;,&quot;dark&quot;],&quot;default&quot;:&quot;brand&quot;,&quot;tsType&quot;:&quot;'brand'|'light'|'dark'&quot;,&quot;section&quot;:&quot;Design variations&quot;},&quot;stepIndicator&quot;:{&quot;editor&quot;:&quot;enum&quot;,&quot;options&quot;:[&quot;numbered&quot;,&quot;dots&quot;,&quot;progress&quot;],&quot;default&quot;:&quot;numbered&quot;,&quot;tsType&quot;:&quot;'numbered'|'dots'|'progress'&quot;,&quot;section&quot;:&quot;Design variations&quot;},&quot;profileLayout&quot;:{&quot;editor&quot;:&quot;enum&quot;,&quot;options&quot;:[&quot;split&quot;,&quot;stacked&quot;],&quot;default&quot;:&quot;split&quot;,&quot;tsType&quot;:&quot;'split'|'stacked'&quot;,&quot;section&quot;:&quot;Design variations&quot;}}">
const FIRST = ['Arjun','Sai','Kavya','Rakesh','Divya','Naveen','Sneha','Praveen','Lakshmi','Manoj','Harika','Vikram','Anitha','Rohit','Swathi','Ganesh','Meghana','Kiran','Bhavani','Suresh','Deepika','Chandra','Pooja','Ramesh','Ashwini','Vinay','Sruthi','Girish','Nandini','Sandeep','Keerthi','Mahesh','Varsha','Prashanth','Yamini','Tejas','Anjali','Raghu','Shilpa','Dinesh'];
const LAST = ['Reddy','Rao','Gowda','Nair','Shetty','Kumar','Prasad','Naidu','Hegde','Iyer','Sharma','Patil','Bhat','Varma','Chowdary','Murthy','Raju','Kulkarni','Devi','Sastry'];
const PLANS = ['Monthly Gym','Quarterly Gym','Half-yearly Gym','Annual Gym','Monthly + Cardio','Personal Training'];
const AVATAR = ['#6C63C7','#3E7CB1','#2E8B6E','#B5643C','#8A5AA8','#3F7A8C','#A8523C','#4E6BB5'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function buildMembers() {
  const rnd = mulberry(20260809);
  const out = [];
  for (let i = 0; i < 124; i++) {
    const name = FIRST[Math.floor(rnd() * FIRST.length)] + ' ' + LAST[Math.floor(rnd() * LAST.length)];
    const plan = PLANS[Math.floor(rnd() * PLANS.length)];
    const roll = rnd();
    const status = roll < 0.72 ? 'active' : roll < 0.88 ? 'expiring' : 'expired';
    const dayOffset = status === 'expired' ? -Math.floor(rnd() * 40) - 1 : status === 'expiring' ? Math.floor(rnd() * 7) + 1 : Math.floor(rnd() * 120) + 10;
    const d = new Date(2026, 7, 9 + dayOffset);
    const due = status === 'expired' ? Math.floor(rnd() * 5 + 1) * 500 : rnd() < 0.12 ? 500 : 0;
    out.push({
      id: i + 1, name, plan, status, due,
      enrollNo: 'IPF-' + String(1000 + i + 1),
      phone: '9' + String(Math.floor(rnd() * 900000000) + 100000000),
      expiry: d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(),
      expiryIdx: dayOffset,
      lastVisit: status === 'expired' ? String(Math.floor(rnd() * 30) + 8) + ' days ago' : (rnd() < .4 ? 'Today' : String(Math.floor(rnd() * 6) + 1) + ' days ago'),
      initials: name.split(' ').map(w => w[0]).join(''),
      color: AVATAR[i % AVATAR.length],
      recent: [
        { label: plan + ' renewal', date: '12 Jul 2026', method: 'UPI', amount: 2400 },
        { label: plan + ' renewal', date: '12 Apr 2026', method: 'Cash', amount: 2400 },
        { label: 'Joining fee', date: '12 Jan 2026', method: 'UPI', amount: 1000 }
      ]
    });
  }
  return out;
}

const WIZ = {
  addMember: { title: 'Add member', done: 'Member added', summaryAt: 2,
    steps: ['Member', 'Plan & payment', 'Summary'],
    fields: [
      [{ key:'name', label:'Full name', type:'text', placeholder:'e.g. Kavya Reddy', required:true },
       { key:'phone', label:'Mobile number', type:'text', placeholder:'10-digit number', required:true, phone:true },
       { key:'dob', label:'Date of birth', type:'text', placeholder:'DD/MM/YYYY — skip if you don\u2019t have it' }],
      [{ key:'plan', label:'Membership plan', type:'select', options:['Not now'].concat(PLANS) },
       { key:'discount', label:'Discount (₹)', type:'text', placeholder:'0' },
       { key:'method', label:'Payment method', type:'select', options:['Not collected yet','UPI','Cash','Card','Bank transfer'] },
       { key:'amount', label:'Amount collected (₹)', type:'text', placeholder:'2400' }],
      []
    ] },
  addStaff: { title: 'Add staff member', done: 'Staff member added',
    steps: ['Personal info', 'Role & permissions', 'Compensation', 'Confirm'],
    fields: [
      [{ key:'name', label:'Full name', type:'text', required:true, placeholder:'e.g. Ganesh Rao' },
       { key:'phone', label:'Mobile number', type:'text', required:true, phone:true, placeholder:'10-digit number' }],
      [{ key:'role', label:'Role', type:'select', options:['Manager','Trainer','Receptionist'], required:true },
       { key:'access', label:'Can collect payments', type:'select', options:['Yes','No'] },
       { key:'branch', label:'Branch', type:'select', options:['Kukatpally','Madhapur'] }],
      [{ key:'salary', label:'Monthly salary (₹)', type:'text', required:true, placeholder:'18000' },
       { key:'payday', label:'Pay day', type:'select', options:['1st','5th','10th','Last working day'] }],
      [{ key:'confirm', label:'Review', type:'note', placeholder:'The staff member gets an SMS invite to set their own password.' }]
    ] },
  addPlan: { title: 'Create membership plan', done: 'Plan created',
    steps: ['Basic details', 'Pricing', 'Perks', 'Access & limits', 'Confirm'],
    fields: [
      [{ key:'name', label:'Plan name', type:'text', required:true, placeholder:'e.g. Quarterly Gym' },
       { key:'duration', label:'Duration', type:'select', options:['1 month','3 months','6 months','12 months'] }],
      [{ key:'price', label:'Price (₹)', type:'text', required:true, placeholder:'6000' },
       { key:'joining', label:'Joining fee (₹)', type:'text', placeholder:'1000' },
       { key:'tax', label:'Tax treatment', type:'select', options:['Inclusive of GST','Exclusive of GST','No GST'] }],
      [{ key:'perks', label:'Perks included', type:'text', placeholder:'Cardio, steam, 1 free PT session' }],
      [{ key:'batch', label:'Allowed batches', type:'select', options:['All day','Morning only','Evening only'] },
       { key:'freeze', label:'Freeze days allowed', type:'text', placeholder:'15' }],
      [{ key:'confirm', label:'Review', type:'note', placeholder:'The plan becomes selectable in Add Member as soon as you confirm.' }]
    ] },
  addPayment: { title: 'Record payment', done: 'Payment recorded',
    steps: ['Member', 'Amount', 'Confirm'],
    fields: [
      [{ key:'member', label:'Member name or phone', type:'text', required:true, placeholder:'Start typing a name' }],
      [{ key:'amount', label:'Amount (₹)', type:'text', required:true, placeholder:'2400' },
       { key:'method', label:'Method', type:'select', options:['UPI','Cash','Card','Bank transfer'] },
       { key:'date', label:'Date', type:'text', placeholder:'09/08/2026' }],
      [{ key:'confirm', label:'Review', type:'note', placeholder:'A receipt goes out on WhatsApp once you confirm.' }]
    ] },
  addLead: { title: 'Add lead', done: 'Lead added',
    steps: ['Lead details'],
    fields: [
      [{ key:'name', label:'Name', type:'text', required:true, placeholder:'e.g. Sneha Nair' },
       { key:'phone', label:'Mobile number', type:'text', required:true, phone:true, placeholder:'10-digit number' },
       { key:'source', label:'How did they reach you', type:'select', options:['Walk-in','Phone call','Instagram','Referral','Website'] },
       { key:'interest', label:'Interested in', type:'select', options:PLANS }]
    ] },
  editMember: { title: 'Edit member', done: 'Changes saved',
    steps: ['Member details'],
    fields: [
      [{ key:'name', label:'Full name', type:'text', required:true },
       { key:'phone', label:'Mobile number', type:'text', required:true, phone:true },
       { key:'plan', label:'Membership plan', type:'select', options:PLANS },
       { key:'expiry', label:'Expiry date', type:'text' }]
    ] }
};

const SETTINGS = {
  profile: { title:'Gym Profile', sub:'Details, opening hours, social links and map — one page instead of three sheets.', sections:[
    { label:'Details', fields:[{key:'gymName',label:'Gym name',type:'text',value:'Iron Peak Fitness'},{key:'phone',label:'Contact number',type:'text',value:'9848012345'},{key:'address',label:'Address',type:'text',value:'Plot 42, KPHB Phase 3, Hyderabad'}] },
    { label:'Opening hours', fields:[{key:'weekday',label:'Mon–Sat',type:'text',value:'5:00 AM – 10:00 PM'},{key:'sunday',label:'Sunday',type:'text',value:'6:00 AM – 12:00 PM'},{key:'holiday',label:'Show holiday notice on public page',type:'toggle'}] },
    { label:'Social & maps', fields:[{key:'insta',label:'Instagram',type:'text',value:'@ironpeak.hyd'},{key:'maps',label:'Google Maps link',type:'text',value:'maps.app.goo.gl/ironpeak'}] } ] },
  gallery: { title:'Gym Gallery', sub:'Photos shown on your public page — its own route now, not an inline grid.', sections:[
    { label:'Gallery', fields:[{key:'galleryOn',label:'Show gallery on public page',type:'toggle'},{key:'cover',label:'Cover photo caption',type:'text',value:'Main floor'},{key:'order',label:'Sort photos by',type:'select',options:['Newest first','Manual order']}] } ] },
  numbering: { title:'Plan & Enrollment Numbering', sub:'How member IDs and receipt numbers are generated.', sections:[
    { label:'Member IDs', fields:[{key:'prefix',label:'Prefix',type:'text',value:'IPF-'},{key:'next',label:'Next number',type:'text',value:'1125'},{key:'pad',label:'Pad with zeros',type:'toggle'}] },
    { label:'Receipts', fields:[{key:'rprefix',label:'Receipt prefix',type:'text',value:'RC/26-27/'},{key:'reset',label:'Reset every',type:'select',options:['Financial year','Never','Calendar year']}] } ] },
  card: { title:'Membership Card Design', sub:'Pick the design — the same card then shows on the member profile, the share link and the dashboard.', showCard:true, sections:[
    { label:'Design', fields:[{key:'cardVariant',label:'Card design',type:'select',options:['Brand purple','Light','Dark'],value:'Brand purple'},{key:'showQr',label:'Show QR code',type:'toggle'},{key:'showExpiry',label:'Show expiry date',type:'toggle'},{key:'footer',label:'Footer line',type:'text',value:'Carry this on your phone — no plastic card needed.'}] } ] },
  batches: { title:'Batches & Timings', sub:'Slots members can be assigned to, and how many fit in each.', sections:[
    { label:'Batches', fields:[{key:'bMorning',label:'Morning batch',type:'text',value:'5:00 AM – 10:00 AM'},{key:'bEvening',label:'Evening batch',type:'text',value:'4:00 PM – 10:00 PM'},{key:'bCap',label:'Members per batch',type:'text',value:'60'},{key:'bLadies',label:'Ladies-only hour',type:'toggle'}] } ] },
  announcements: { title:'Notices & Announcements', sub:'A short message shown to members in their app.', sections:[
    { label:'Current notice', fields:[{key:'annOn',label:'Show notice to members',type:'toggle'},{key:'annText',label:'Notice',type:'text',value:'Gym closed on 15 Aug for Independence Day.'},{key:'annUntil',label:'Show until',type:'text',value:'16/08/2026'}] } ] },
  workout: { title:'Diet & Workout Templates', sub:'Plans your trainers can assign to members.', sections:[
    { label:'Templates', fields:[{key:'wtBeginner',label:'Beginner 3-day split',type:'toggle'},{key:'wtFatloss',label:'Fat-loss 6-day split',type:'toggle'},{key:'wtDiet',label:'Veg diet chart',type:'toggle'},{key:'wtOwner',label:'Only trainers can assign plans',type:'toggle'}] } ] },
  discounts: { title:'Discounts & Offers', sub:'Standing discounts and coupon codes used at enrolment.', sections:[
    { label:'Standing offers', fields:[{key:'dStudent',label:'Student discount (%)',type:'text',value:'10'},{key:'dCouple',label:'Couple discount (%)',type:'text',value:'15'},{key:'dRefer',label:'Referral reward (₹)',type:'text',value:'300'},{key:'dMax',label:'Staff may exceed these limits',type:'toggle'}] } ] },
  gateway: { title:'Payment Methods & UPI', sub:'How money reaches you, and which methods staff can pick.', sections:[
    { label:'Collection', fields:[{key:'upi',label:'UPI ID',type:'text',value:'ironpeak@okhdfcbank'},{key:'payCash',label:'Allow cash',type:'toggle'},{key:'payCard',label:'Allow card machine',type:'toggle'},{key:'payOnline',label:'Accept online payments from members',type:'toggle'}] } ] },
  expenses: { title:'Expenses & Payroll', sub:'Monthly outgoings, so profit is real and not just collections.', sections:[
    { label:'Recurring', fields:[{key:'eRent',label:'Rent (₹)',type:'text',value:'85000'},{key:'eSalary',label:'Salaries (₹)',type:'text',value:'86000'},{key:'ePower',label:'Electricity (₹)',type:'text',value:'22000'},{key:'eRemind',label:'Remind me on pay day',type:'toggle'}] } ] },
  checkin: { title:'Attendance & Check-in Rules', sub:'How the scanner behaves at the door.', sections:[
    { label:'Rules', fields:[{key:'ciOne',label:'One check-in per member per day',type:'toggle'},{key:'ciExpired',label:'Allow expired members to check in',type:'toggle'},{key:'ciGrace',label:'Grace days after expiry',type:'text',value:'3'},{key:'ciAlert',label:'Alert me when a dues member checks in',type:'toggle'}] } ] },
  language: { title:'Language', sub:'Moved here from the top bar — it is a set-once choice, not a daily one.', sections:[
    { label:'Language', fields:[{key:'appLang',label:'App language',type:'select',options:['English','తెలుగు','ಕನ್ನಡ'],value:'English'},{key:'msgLang',label:'Member message language',type:'select',options:['English','తెలుగు','ಕನ್ನಡ'],value:'English'}] } ] },
  notifications: { title:'Notifications', sub:'What Gymloop pings you about.', sections:[
    { label:'Push alerts', fields:[{key:'nExpiry',label:'Memberships expiring this week',type:'toggle'},{key:'nDues',label:'New dues added',type:'toggle'},{key:'nLead',label:'New enquiry received',type:'toggle'},{key:'nDaily',label:'Daily 9 PM summary',type:'toggle'}] } ] },
  backup: { title:'Backup, Export & Restore', sub:'Your data, in your hands.', sections:[
    { label:'Backups', fields:[{key:'autoExport',label:'Email me a monthly CSV backup',type:'toggle'},{key:'bWhen',label:'Backup frequency',type:'select',options:['Monthly','Weekly','Daily']},{key:'bMail',label:'Send backups to',type:'text',value:'ravi@ironpeak.in'}] } ] },
  equipment: { title:'Gym Equipment', sub:'Inventory, quantities and service dates.', sections:[
    { label:'Inventory', fields:[{key:'treadmills',label:'Treadmills',type:'text',value:'6'},{key:'benches',label:'Benches',type:'text',value:'8'},{key:'service',label:'Next service due',type:'text',value:'22 Sep 2026'},{key:'showEquip',label:'Show equipment list publicly',type:'toggle'}] } ] },
  tax: { title:'Tax & Invoice Settings', sub:'GST details and what prints on every receipt.', sections:[
    { label:'GST', fields:[{key:'gstin',label:'GSTIN',type:'text',value:'36AABCU9603R1ZX'},{key:'rate',label:'Default rate',type:'select',options:['18%','12%','5%','Exempt']},{key:'inclusive',label:'Prices include tax',type:'toggle'}] },
    { label:'Receipt', fields:[{key:'invHeader',label:'Receipt header',type:'text',value:'Iron Peak Fitness, KPHB Phase 3'},{key:'invFooter',label:'Receipt footer',type:'text',value:'Fees once paid are not refundable.'},{key:'invSign',label:'Print signature line',type:'toggle'}] } ] },
  landing: { title:'Landing Page / Public Profile', sub:'What people see when they open your gym link.', sections:[
    { label:'Page', fields:[{key:'headline',label:'Headline',type:'text',value:'Train at Iron Peak, KPHB'},{key:'showPlans',label:'Show plans and prices',type:'toggle'},{key:'showEnq',label:'Show enquiry form',type:'toggle'}] } ] },
  account: { title:'Account', sub:'Your login and password. Language has its own page now.', sections:[
    { label:'You', fields:[{key:'ownerName',label:'Name',type:'text',value:'Ravi Teja'},{key:'ownerPhone',label:'Login number',type:'text',value:'9848011111'},{key:'ownerEmail',label:'Email',type:'text',value:'ravi@ironpeak.in'}] },
    { label:'Security', fields:[{key:'pin',label:'Owner PIN (exits kiosk mode)',type:'text',value:'4821'},{key:'bio',label:'Unlock with fingerprint',type:'toggle'}] } ] },
  data: { title:'Data & Privacy', sub:'How long we keep things, and closing the account.', sections:[
    { label:'Data', fields:[{key:'retain',label:'Keep deleted members for',type:'select',options:['30 days','60 days','90 days']},{key:'shareAnon',label:'Share anonymous usage stats',type:'toggle'}] } ] },
  metrics: { title:'Choose lead metrics', sub:'This replaces the old placeholder "Add Metric" button — pick which numbers sit at the top of Leads.', sections:[
    { label:'Show on Leads', fields:[{key:'mNew',label:'New enquiries',type:'toggle'},{key:'mConv',label:'Conversion rate',type:'toggle'},{key:'mResp',label:'Average response time',type:'toggle'},{key:'mSource',label:'Top source',type:'toggle'}] } ] },
  whatsappSettings: { title:'WhatsApp / Communications', sub:'Templates and when messages may go out.', sections:[
    { label:'Sending', fields:[{key:'waOn',label:'Send renewal reminders automatically',type:'toggle'},{key:'waWindow',label:'Sending window',type:'select',options:['9 AM – 8 PM','10 AM – 6 PM','Any time']},{key:'waDays',label:'Remind this many days before expiry',type:'text',value:'5'}] } ] }
};

class Component extends DCLogic {
  constructor(props) {
    super(props);
    const members = buildMembers();
    const rnd = mulberry(77);
    this.state = {
      view: 'both', route: 'dashboard', param: null, lang: 'en', role: 'owner',
      members, q: '', gq: '', filter: 'all', sort: 'name', limit: 20, sel: [],
      quickOpen: false, searchOpen: false, quickViewId: null, profileId: members[3].id,
      toast: '', loading: false, leadTab: 'new', showSetup: true,
      wizKey: null, wizStep: 0, wizData: {}, wizErrors: {}, wizDone: false,
      settingsValues: { holiday:true, galleryOn:true, pad:true, showQr:true, showExpiry:true, inclusive:true, showPlans:true, showEnq:true, waOn:true, mNew:true, mConv:true, mResp:false, mSource:false, autoExport:false, showEquip:false,
        bLadies:true, annOn:true, wtBeginner:true, wtFatloss:true, wtDiet:false, wtOwner:true, dMax:false,
        payCash:true, payCard:true, payOnline:false, eRemind:true, ciOne:true, ciExpired:false, ciAlert:true,
        nExpiry:true, nDues:true, nLead:true, nDaily:false, invSign:true, bio:true, shareAnon:false },
      setup: [
        { label:'Add your gym details', sub:'Name, address, opening hours', done:true },
        { label:'Create membership plans', sub:'At least one plan to enrol members', done:true },
        { label:'Add your first member', sub:'Or import from a spreadsheet', done:true },
        { label:'Set up WhatsApp reminders', sub:'Renewals go out automatically', done:false },
        { label:'Pair a check-in device', sub:'Tablet or phone at the front desk', done:false },
        { label:'Publish your public page', sub:'Share the link on Instagram', done:false }
      ],
      revenue: Array.from({ length: 12 }, () => Math.floor(rnd() * 40000) + 55000),
      heat: Array.from({ length: 84 }, (_, i) => { const h = i % 12; return (h < 3 || h > 9) ? rnd() * .9 : rnd() * .45; }),
      leads: [
        { id:1, name:'Sneha Nair', meta:'Walk-in · 2 days ago · Quarterly Gym', status:'New' },
        { id:2, name:'Vikram Shetty', meta:'Instagram · 3 days ago · Personal Training', status:'New' },
        { id:3, name:'Harika Rao', meta:'Referral · 4 days ago · Monthly Gym', status:'Contacted' },
        { id:4, name:'Dinesh Kumar', meta:'Phone call · 6 days ago · Annual Gym', status:'Contacted' },
        { id:5, name:'Meghana Bhat', meta:'Website · 8 days ago · Monthly + Cardio', status:'Joined' },
        { id:6, name:'Tejas Patil', meta:'Walk-in · 9 days ago · Quarterly Gym', status:'Joined' }
      ],
      staff: [
        { name:'Ganesh Rao', role:'Manager', phone:'9848022222' },
        { name:'Swathi Naidu', role:'Receptionist', phone:'9848033333' },
        { name:'Kiran Hegde', role:'Trainer', phone:'9848044444' },
        { name:'Bhavani Devi', role:'Trainer', phone:'9848055555' },
        { name:'Prashanth Iyer', role:'Receptionist', phone:'9848066666' }
      ],
      deleted: [
        { name:'Anitha Sharma', sub:'Deleted 3 days ago · Monthly Gym' },
        { name:'Raghu Varma', sub:'Deleted 11 days ago · Annual Gym' },
        { name:'Pooja Kulkarni', sub:'Deleted 26 days ago · Quarterly Gym' }
      ]
    };
  }

  componentWillUnmount() { clearTimeout(this._t); clearTimeout(this._l); }

  money(n) { return '₹' + Number(n).toLocaleString('en-IN'); }

  toast(msg, haptic) {
    if (haptic && navigator.vibrate) { try { navigator.vibrate(18); } catch (e) {} }
    clearTimeout(this._t);
    this.setState({ toast: msg });
    this._t = setTimeout(() => this.setState({ toast: '' }), 2400);
  }

  go = (route, param, filter) => {
    const next = { route, param: param != null ? param : null, quickOpen: false, searchOpen: false, quickViewId: null, loading: true, limit: 20 };
    if (filter) next.filter = filter;
    if (route === 'member' && param) next.profileId = param;
    if (WIZ[route]) {
      next.wizKey = route; next.wizStep = 0; next.wizErrors = {}; next.wizDone = false;
      const m = this.state.members.find(x => x.id === this.state.profileId);
      next.wizData = route === 'editMember' && m ? { name:m.name, phone:m.phone, plan:m.plan, expiry:m.expiry } : {};
    }
    clearTimeout(this._l);
    this.setState(next);
    this._l = setTimeout(() => this.setState({ loading: false }), 170);
  };

  csv(rows, name) {
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  wizDef() { return WIZ[this.state.wizKey] || null; }

  wizNext = () => {
    const def = this.wizDef(); if (!def) return;
    const fields = def.fields[this.state.wizStep] || [];
    const errors = {};
    fields.forEach(f => {
      const v = (this.state.wizData[f.key] || '').trim();
      if (f.required && !v) errors[f.key] = 'This is required.';
      else if (f.phone && v && !/^[6-9]\d{9}$/.test(v)) errors[f.key] = 'Enter a valid 10-digit Indian mobile number.';
    });
    if (Object.keys(errors).length) { this.setState({ wizErrors: errors }); return; }
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
    if (this.state.wizStep >= def.steps.length - 1) { this.setState({ wizDone: true, wizErrors: {} }); return; }
    this.setState({ wizStep: this.state.wizStep + 1, wizErrors: {} });
  };

  render_() {}

  renderVals() {
    const s = this.state;
    const P = this.props;
    const members = s.members;
    const money = n => this.money(n);

    const active = members.filter(m => m.status === 'active').length;
    const expiring = members.filter(m => m.status === 'expiring').length;
    const dueMembers = members.filter(m => m.due > 0);
    const stats = {
      revenue: 386500, active, expiring, inGym: 24, checkins: 118,
      dueCount: dueMembers.length, dueTotal: dueMembers.reduce((a, m) => a + m.due, 0)
    };

    // ---------- list screens
    const tag = (label, bg, fg) => ({ tag: label, bg, fg });
    let listScreen = null;
    if (s.route === 'staff') {
      const q = s.q.toLowerCase();
      listScreen = { title: 'Staff', sub: s.staff ? '' : '', kpis: [
        { label:'Team members', value: String(s.staff.length) },
        { label:'Trainers', value: String(s.staff.filter(x => x.role === 'Trainer').length) },
        { label:'Monthly payroll', value: money(86000) }
      ], primary: { label:'+ Add staff', route:'addStaff' },
      rows: s.staff.filter(x => !q || x.name.toLowerCase().indexOf(q) >= 0 || x.role.toLowerCase().indexOf(q) >= 0)
        .map((x, i) => Object.assign({ title:x.name, sub:x.phone + ' · ' + x.role, initials:x.name.split(' ').map(w => w[0]).join(''), color:AVATAR[i % AVATAR.length] }, tag(x.role, '#F0EFFA', '#4A438F'))),
      emptyTitle:'No staff match that', emptySub:'Try another name or role.' };
      listScreen.sub = 'Grouped by role · ' + s.staff.length + ' people';
    } else if (s.route === 'payments') {
      const q = s.q.toLowerCase();
      listScreen = { title: 'Payments', sub: 'Every rupee collected, newest first', chart: true, kpis: [
        { label:'Collected this month', value: money(stats.revenue) },
        { label:'Outstanding dues', value: money(stats.dueTotal) },
        { label:'Payments today', value: '17' }
      ], primary: { label:'+ Record payment', route:'addPayment' },
      rows: members.slice(0, 24).filter(m => !q || m.name.toLowerCase().indexOf(q) >= 0)
        .map(m => ({ title:m.name, sub:m.recent[0].date + ' · ' + m.recent[0].method + ' · ' + m.plan, amount: money(m.recent[0].amount), initials:m.initials, color:m.color, cta:'Details', route:'paymentDetail', param:m.id })),
      emptyTitle:'No payments match that', emptySub:'Try a different member name.' };
    } else if (s.route === 'paymentDetail' || s.route === 'memberPayments') {
      const m = members.find(x => x.id === (s.param || s.profileId)) || members[0];
      listScreen = { title: s.route === 'memberPayments' ? m.name + ' · payment history' : 'Payment detail',
        sub: 'The full history — Member Profile links here instead of repeating it',
        kpis: [{ label:'Lifetime value', value: money(9200) }, { label:'Payments', value:'7' }, { label:'Outstanding', value: money(m.due) }],
        rows: m.recent.concat(m.recent.map(p => Object.assign({}, p, { date:'12 Oct 2025' })))
          .map(p => ({ title:p.label, sub:p.date + ' · ' + p.method, amount: money(p.amount) })) };
    } else if (s.route === 'whatsapp') {
      listScreen = { title:'WhatsApp message log', sub:'What went out, to whom, and whether it landed',
        kpis: [{ label:'Sent this month', value:'642' }, { label:'Delivered', value:'96%' }, { label:'Replies', value:'88' }],
        primary: { label:'Message settings', route:'set:whatsappSettings' },
        rows: members.slice(0, 14).map((m, i) => Object.assign({ title:m.name, sub:(i % 3 === 0 ? 'Renewal reminder' : i % 3 === 1 ? 'Payment receipt' : 'Welcome message') + ' · 8 Aug 2026', initials:m.initials, color:m.color }, tag(i % 5 === 0 ? 'Read' : 'Delivered', i % 5 === 0 ? '#EAF6EF' : '#F0EFFA', i % 5 === 0 ? '#0F5E3C' : '#4A438F'))) };
    } else if (s.route === 'kiosk') {
      listScreen = { title:'Kiosk devices', sub:'Tablets and phones paired for check-in',
        kpis: [{ label:'Paired devices', value:'3' }, { label:'Check-ins today', value:'118' }, { label:'Offline', value:'1' }],
        primary: { label:'+ Pair a device', route:'tablet' },
        rows: [
          Object.assign({ title:'Front desk tablet', sub:'Lenovo M10 · last seen 2 min ago' }, tag('Online', '#EAF6EF', '#0F5E3C')),
          Object.assign({ title:'Entry gate phone', sub:'Redmi 12 · last seen 5 min ago' }, tag('Online', '#EAF6EF', '#0F5E3C')),
          Object.assign({ title:'Studio tablet', sub:'Samsung A8 · last seen 2 days ago' }, tag('Offline', '#FBEBE9', '#A62C22'))
        ] };
    } else if (s.route === 'recycleBin') {
      listScreen = { title:'Recycle bin', sub:'Deleted members, kept for 30 days — reachable on mobile from Members and from Settings',
        rows: s.deleted.map((d, i) => ({ title:d.name, sub:d.sub, initials:d.name.split(' ').map(w => w[0]).join(''), color:AVATAR[i % AVATAR.length], cta:'Restore', route:'members' })),
        emptyTitle:'Recycle bin is empty', emptySub:'Deleted members show up here for 30 days.' };
    } else if (s.route === 'plans') {
      listScreen = { title:'Membership plans', sub:'Six plans · used by Add Member and your public page',
        primary: { label:'+ Create plan', route:'addPlan' },
        rows: PLANS.map((p, i) => ({ title:p, sub:(i % 2 ? '3 months' : '1 month') + ' · ' + members.filter(m => m.plan === p).length + ' members', amount: money([1800, 4800, 8800, 15000, 2400, 6000][i]), cta:'Edit', route:'addPlan' })) };
    }

    // ---------- settings detail
    let settingsDef = null;
    if (s.route.indexOf('set:') === 0) settingsDef = SETTINGS[s.route.slice(4)] || SETTINGS.profile;

    // ---------- global search
    const gq = s.gq.trim().toLowerCase();
    let globalResults = [];
    if (gq) {
      globalResults = members.filter(m => m.name.toLowerCase().indexOf(gq) >= 0 || m.phone.indexOf(gq) >= 0).slice(0, 5)
        .map(m => ({ kind:'Member', title:m.name, sub:m.phone + ' · ' + m.plan, route:'member', param:m.id }));
      s.staff.filter(x => x.name.toLowerCase().indexOf(gq) >= 0).slice(0, 3)
        .forEach(x => globalResults.push({ kind:'Staff', title:x.name, sub:x.role, route:'staff' }));
      if ('payments'.indexOf(gq) === 0) globalResults.push({ kind:'Page', title:'Payments', sub:'All collections', route:'payments' });
    }

    const wizDef = this.wizDef();
    const wd = s.wizData;
    const fill = k => (wd[k] || '').trim();
    const nextEnroll = 'IPF-' + String(1000 + members.length + 1);
    const row = (label, v, fb) => ({ label, value: v || fb, muted: !v });
    const planPicked = fill('plan') && fill('plan') !== 'Not now' ? fill('plan') : '';
    const methodPicked = fill('method') && fill('method') !== 'Not collected yet' ? fill('method') : '';
    const summaryRows = [
      row('Name', fill('name'), '—'),
      row('Mobile number', fill('phone'), '—'),
      row('Date of birth', fill('dob'), 'Not provided'),
      { label:'Enrollment number', value: nextEnroll },
      row('Plan', planPicked, 'No plan yet'),
      row('Discount', fill('discount') ? money(Number(fill('discount')) || 0) : '', 'None'),
      row('Payment method', methodPicked, 'Not collected yet'),
      row('Amount collected', fill('amount') ? money(Number(fill('amount')) || 0) : '', '₹0')
    ];
    const wiz = wizDef ? {
      title: wizDef.title, steps: wizDef.steps, step: s.wizStep,
      stepTitle: wizDef.steps[s.wizStep], fields: wizDef.fields[s.wizStep] || [],
      data: s.wizData, errors: s.wizErrors, done: s.wizDone,
      isSummary: wizDef.summaryAt === s.wizStep,
      summaryRows: wizDef.summaryAt === s.wizStep ? summaryRows : [],
      nextLabel: s.wizStep >= wizDef.steps.length - 1 ? (wizDef.summaryAt != null ? 'Confirm & add member' : 'Confirm') : 'Next',
      doneTitle: wizDef.done, doneSub: s.wizKey === 'addMember' ? 'Enrollment number ' + nextEnroll + ' · a WhatsApp welcome with their card link has gone out.' : 'A WhatsApp confirmation has gone out. You can undo this from the recycle bin.'
    } : {};

    const leadTabs = [{ id:'new', label:'New' }, { id:'contacted', label:'Contacted' }, { id:'joined', label:'Joined' }, { id:'all', label:'All' }];
    const leadRows = s.leads.filter(l => s.leadTab === 'all' || l.status.toLowerCase() === s.leadTab).map(l => ({
      id:l.id, name:l.name, meta:l.meta, status:l.status,
      bg: l.status === 'New' ? '#F0EFFA' : l.status === 'Contacted' ? '#FDF1E2' : '#EAF6EF',
      fg: l.status === 'New' ? '#4A438F' : l.status === 'Contacted' ? '#8A4B00' : '#0F5E3C',
      cta: l.status === 'New' ? 'Mark contacted' : l.status === 'Contacted' ? 'Convert' : 'View member'
    }));
    const leadMetricDefs = [
      { key:'mNew', label:'New enquiries', value:String(s.leads.filter(l => l.status === 'New').length) },
      { key:'mConv', label:'Conversion rate', value:'34%' },
      { key:'mResp', label:'Avg. response time', value:'4h' },
      { key:'mSource', label:'Top source', value:'Walk-in' }
    ];

    const setupDone = s.setup.filter(x => x.done).length;

    const actions = {
      go: this.go,
      setQ: v => this.setState({ q: v, limit: 20 }),
      setGq: v => this.setState({ gq: v }),
      setFilter: f => this.setState({ filter: f, limit: 20 }),
      cycleSort: () => this.setState({ sort: s.sort === 'name' ? 'expiry' : s.sort === 'expiry' ? 'due' : 'name' }),
      resetFilters: () => this.setState({ q: '', filter: 'all' }),
      loadMore: () => this.setState({ limit: s.limit + 20 }),
      toggleSel: id => this.setState({ sel: s.sel.indexOf(id) >= 0 ? s.sel.filter(x => x !== id) : s.sel.concat([id]) }),
      clearSel: () => this.setState({ sel: [] }),
      bulkRemind: () => { this.setState({ sel: [] }); this.toast('Reminder sent to ' + s.sel.length + ' members on WhatsApp', true); },
      remind: name => this.toast('WhatsApp reminder sent to ' + name, true),
      quickView: id => this.setState({ quickViewId: id }),
      closeQuickView: () => this.setState({ quickViewId: null }),
      openSearch: () => this.setState({ searchOpen: true }),
      closeSearch: () => this.setState({ searchOpen: false, gq: '' }),
      toggleQuick: () => this.setState({ quickOpen: !s.quickOpen }),
      closeQuick: () => this.setState({ quickOpen: false }),
      cycleLang: () => this.setState({ lang: s.lang === 'en' ? 'te' : s.lang === 'te' ? 'kn' : 'en' }),
      exportCsv: which => {
        const rows = which === 'members'
          ? ['Name,Phone,Plan,Status,Expiry,Dues'].concat(members.map(m => [m.name, m.phone, m.plan, m.status, m.expiry, m.due].join(',')))
          : ['Title,Detail'].concat((listScreen ? listScreen.rows : []).map(r => [r.title, r.sub].join(',')));
        this.csv(rows, which + '-gymloop.csv');
        this.toast('CSV downloaded');
      },
      dismissSetup: () => this.setState({ showSetup: false }),
      toggleSetup: i => { const next = s.setup.slice(); next[i] = Object.assign({}, next[i], { done: !next[i].done }); this.setState({ setup: next }); },
      setLeadTab: id => this.setState({ leadTab: id }),
      advanceLead: id => {
        const next = s.leads.map(l => l.id !== id ? l : Object.assign({}, l, { status: l.status === 'New' ? 'Contacted' : 'Joined' }));
        this.setState({ leads: next }); this.toast('Lead updated', true);
      },
      openKpiPicker: () => this.go('set:metrics'),
      wizSet: (k, v) => this.setState({ wizData: Object.assign({}, s.wizData, { [k]: v }), wizErrors: Object.assign({}, s.wizErrors, { [k]: '' }) }),
      wizNext: this.wizNext,
      wizBack: () => this.setState({ wizStep: Math.max(0, s.wizStep - 1), wizErrors: {} }),
      cancelWizard: () => this.go(s.wizKey === 'addStaff' ? 'staff' : s.wizKey === 'editMember' ? 'member' : s.wizKey === 'addLead' ? 'leads' : s.wizKey === 'addPlan' ? 'plans' : 'members'),
      finishWizard: () => { const k = s.wizKey; this.go(k === 'addStaff' ? 'staff' : k === 'addPayment' ? 'payments' : k === 'addLead' ? 'leads' : k === 'addPlan' ? 'plans' : 'members'); this.toast(WIZ[k].done, true); },
      setSetting: (k, v) => {
        const next = Object.assign({}, s.settingsValues, { [k]: v });
        const patch = { settingsValues: next };
        if (k === 'appLang') patch.lang = { 'English':'en', 'తెలుగు':'te', 'ಕನ್ನಡ':'kn' }[v] || 'en';
        this.setState(patch);
      },
      toastMsg: msg => this.toast(msg, true),
      shareCard: () => this.toast('Card link sent on WhatsApp', true),
      saveSettings: () => { this.toast('Saved', true); },
      deleteMember: () => { this.go('members'); this.toast('Member moved to recycle bin', true); },
      simulateScan: () => this.toast('Kavya Reddy checked in · Annual Gym, valid', true),
      overrideCheckin: () => this.toast('Manual check-in recorded', true),
      launchTablet: () => this.toast('Tablet mode launched — exit with owner PIN'),
      toastUpgrade: () => this.toast('Opening secure billing…')
    };

    const app = {
      lang: s.lang, role: s.role, route: s.route, loading: s.loading, members,
      q: s.q, gq: s.gq, filter: s.filter, sort: s.sort, limit: s.limit, sel: s.sel,
      stats, revenue: s.revenue, heat: s.heat,
      planMix: PLANS.slice(0, 5).map((p, i) => { const c = members.filter(m => m.plan === p).length; return { label:p, count:c, pct: Math.round(c / members.length * 100), color:['#6C63C7','#8A83D6','#3E7CB1','#2E8B6E','#B5643C'][i] }; }),
      todayLine: 'Sunday, 9 August 2026 · Iron Peak Fitness, KPHB',
      newLeads: s.leads.filter(l => l.status === 'New').length,
      leadTab: s.leadTab, leadTabs, leadRows,
      leadStats: leadMetricDefs.filter(m => s.settingsValues[m.key]).map(m => ({ label:m.label, value:m.value })),
      showSetupCard: s.showSetup && setupDone < s.setup.length,
      setupLine: setupDone + ' of ' + s.setup.length + ' steps done',
      setupPct: Math.round(setupDone / s.setup.length * 100), setupItems: s.setup,
      profileMember: members.find(m => m.id === s.profileId) || members[0],
      quickViewMember: s.quickViewId ? members.find(m => m.id === s.quickViewId) : null,
      quickOpen: s.quickOpen, searchOpen: s.searchOpen, globalResults, toast: s.toast,
      listScreen, settingsDef, settingsValues: s.settingsValues,
      analyticsKpis: s.route === 'attendance'
        ? [{ label:'Check-ins today', value:'118' }, { label:'Peak hour', value:'7 PM' }, { label:'In gym now', value:'24' }, { label:'7-day streaks', value:'19' }]
        : [{ label:'Revenue this month', value: money(stats.revenue) }, { label:'New members', value:'23' }, { label:'Retention', value:'87%' }, { label:'Avg. plan value', value: money(3120) }],
      invoices: [
        { date:'1 Aug 2026', id:'INV-2026-0142', amount:'₹2,499' },
        { date:'1 Jul 2026', id:'INV-2026-0119', amount:'₹2,499' },
        { date:'1 Jun 2026', id:'INV-2026-0097', amount:'₹2,499' },
        { date:'1 May 2026', id:'INV-2026-0074', amount:'₹2,499' }
      ],
      wiz,
      dashboardLayout: P.dashboardLayout || 'priority',
      quickActionStyle: P.quickActionStyle || 'fab',
      cardStyle: { 'Brand purple':'brand', 'Light':'light', 'Dark':'dark' }[s.settingsValues.cardVariant] || P.cardStyle || 'brand',
      stepIndicator: P.stepIndicator || 'numbered',
      profileLayout: P.profileLayout || 'split'
    };

    const seg = (list, cur, set) => list.map(([id, label]) => ({
      label, go: () => set(id),
      bg: cur === id ? '#6C63C7' : 'transparent', fg: cur === id ? '#fff' : '#3A3E55'
    }));

    return {
      app, actions,
      routeSlug: s.route.replace('set:', 'settings/'),
      showDesktop: s.view !== 'mobile', showMobile: s.view !== 'desktop',
      viewTabs: seg([['both','Both'],['desktop','Desktop'],['mobile','Mobile']], s.view, v => this.setState({ view: v })),
      roleTabs: seg([['owner','Owner'],['manager','Manager'],['receptionist','Receptionist'],['trainer','Trainer']], s.role, v => this.setState({ role: v }))
    };
  }
}
</script>
</body>
</html>

```


---

## GymloopApp.dc.html

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<div style="height:100%;min-height:0;display:flex;flex-direction:column;background:#F5F6FA;color:#14152B;font-family:Manrope,'Noto Sans Telugu','Noto Sans Kannada',system-ui,sans-serif;font-size:16px;position:relative;overflow:hidden">

  <header style="flex:none;display:flex;align-items:center;gap:12px;padding:10px 16px;background:#FFFFFF;border-bottom:1px solid #E3E5EE;min-height:60px">
    <div style="display:flex;align-items:center;gap:9px;flex:none">
      <span style="width:34px;height:34px;border-radius:11px;background:#6C63C7;display:flex;align-items:center;justify-content:center;flex:none">
        <svg width="26" height="26" viewBox="0 0 44 44" fill="none" aria-label="Gymloop">
          <path d="M26.8 8.8A14 14 0 1 1 17.2 8.8" stroke="#fff" stroke-width="4.2" stroke-linecap="round"></path>
          <path d="M21 7.4 18.3 11.8 16.1 5.8Z" fill="#fff"></path>
          <rect x="15" y="20" width="14" height="4" rx="2" fill="#fff"></rect>
          <rect x="12.4" y="17.5" width="4" height="9" rx="2" fill="#fff"></rect>
          <rect x="27.6" y="17.5" width="4" height="9" rx="2" fill="#fff"></rect>
        </svg>
      </span>
      <sc-if value="{{ isDesktop }}" hint-placeholder-val="{{ true }}">
        <div style="display:flex;flex-direction:column;line-height:1.15">
          <span style="font-weight:800;font-size:15px;letter-spacing:-.2px">Gymloop</span>
          <span style="font-size:11px;color:#5A5E76;font-weight:600">Iron Peak Fitness</span>
        </div>
      </sc-if>
    </div>

    <button type="button" onClick="{{ openSearch }}" style="flex:1;min-width:0;display:flex;align-items:center;gap:8px;height:44px;padding:0 12px;background:#F5F6FA;border:1px solid #E3E5EE;border-radius:10px;cursor:pointer;text-align:left;font:inherit;font-size:14px;color:#5A5E76" style-hover="border-color:#6C63C7">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#5A5E76" stroke-width="2" style="flex:none"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ t.search }}</span>
    </button>

    <div style="display:flex;align-items:center;gap:6px;flex:none">
      <button type="button" onClick="{{ goScanner }}" style="display:flex;align-items:center;gap:7px;height:44px;padding:0 13px;background:#6C63C7;border:1px solid #6C63C7;border-radius:10px;cursor:pointer;font:inherit;font-size:13.5px;font-weight:800;color:#fff" style-hover="background:#5A52B5">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"></path><path d="M3 12h18"></path></svg>
        <sc-if value="{{ isDesktop }}" hint-placeholder-val="{{ true }}"><span>Check-in scan</span></sc-if>
      </button>
      <button type="button" onClick="{{ toggleNotif }}" style="position:relative;display:flex;align-items:center;gap:6px;height:44px;padding:0 10px;background:#fff;border:1px solid #E3E5EE;border-radius:10px;cursor:pointer;font:inherit;font-size:13px;font-weight:700;color:#14152B" style-hover="border-color:#6C63C7">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#14152B" stroke-width="2"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"></path><path d="M10 20h4"></path></svg>
        <sc-if value="{{ isDesktop }}" hint-placeholder-val="{{ true }}"><span>Alerts</span></sc-if>
        <span style="position:absolute;top:5px;right:5px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:#C1362C;color:#fff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center">{{ alertCount }}</span>
      </button>
    </div>
  </header>

  <div style="flex:1;min-height:0;display:flex">
    <sc-if value="{{ isDesktop }}" hint-placeholder-val="{{ true }}">
      <nav aria-label="Primary" style="flex:none;width:236px;background:#FFFFFF;border-right:1px solid #E3E5EE;display:flex;flex-direction:column;padding:14px 12px;gap:4px;overflow-y:auto">
        <p style="margin:0 0 6px;padding:0 8px;font-size:11px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:#8A8FA6">Menu</p>
        <sc-for list="{{ navItems }}" as="n" hint-placeholder-count="5">
          <button type="button" onClick="{{ n.go }}" style="display:flex;align-items:center;gap:11px;min-height:44px;padding:0 10px;border-radius:10px;border:0;cursor:pointer;font:inherit;font-size:14.5px;font-weight:700;text-align:left;width:100%;background:{{ n.bg }};color:{{ n.fg }}" style-hover="background:#F0EFFA">
            <span style="flex:none;width:20px;height:20px;display:flex;align-items:center;justify-content:center" dangerouslySetInnerHTML="{{ n.icon }}"></span>
            <span style="min-width:0">{{ n.label }}</span>
          </button>
        </sc-for>

        <p style="margin:16px 0 6px;padding:0 8px;font-size:11px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:#8A8FA6">{{ t.quickActions }}</p>
        <sc-for list="{{ quickItems }}" as="q" hint-placeholder-count="4">
          <button type="button" onClick="{{ q.go }}" style="display:flex;align-items:center;gap:11px;min-height:44px;padding:0 10px;border-radius:10px;border:1px solid #E3E5EE;cursor:pointer;font:inherit;font-size:14px;font-weight:700;text-align:left;width:100%;background:#fff;color:#14152B" style-hover="border-color:#6C63C7;background:#F7F6FD">
            <span style="flex:none;width:20px;height:20px;display:flex;align-items:center;justify-content:center" dangerouslySetInnerHTML="{{ q.icon }}"></span>
            <span style="min-width:0;flex:1">{{ q.label }}</span>
            <sc-if value="{{ q.badge }}" hint-placeholder-val="{{ false }}">
              <span style="flex:none;min-width:22px;height:20px;padding:0 6px;border-radius:10px;background:#6C63C7;color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center">{{ q.badge }}</span>
            </sc-if>
          </button>
        </sc-for>

        <div style="margin-top:auto;padding-top:14px">
          <div style="padding:11px;border-radius:12px;background:#F7F6FD;border:1px solid #E0DDF6">
            <p style="margin:0 0 2px;font-size:12px;font-weight:800;color:#4A438F">{{ roleLabel }} view</p>
            <p style="margin:0;font-size:12px;line-height:1.4;color:#5A5E76">{{ roleNote }}</p>
          </div>
        </div>
      </nav>
    </sc-if>

    <main style="flex:1;min-width:0;min-height:0;height:100%;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding-bottom:{{ mainPadBottom }}">

      <sc-if value="{{ loading }}" hint-placeholder-val="{{ false }}">
        <div style="padding:18px 18px 0">
          <div style="height:26px;width:180px;border-radius:8px;background:#E6E8F0;margin-bottom:16px"></div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px">
            <div style="height:92px;border-radius:14px;background:#E6E8F0"></div>
            <div style="height:92px;border-radius:14px;background:#E6E8F0"></div>
            <div style="height:92px;border-radius:14px;background:#E6E8F0"></div>
          </div>
          <div style="height:260px;border-radius:14px;background:#E6E8F0"></div>
        </div>
      </sc-if>

      <sc-if value="{{ ready }}" hint-placeholder-val="{{ true }}">
        <div style="padding:18px">

          <!-- DASHBOARD -->
          <sc-if value="{{ isDashboard }}" hint-placeholder-val="{{ true }}">
            <section data-screen-label="Dashboard">
              <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px">
                <div>
                  <h1 style="margin:0;font-size:24px;font-weight:800;letter-spacing:-.4px">{{ t.dashboard }}</h1>
                  <p style="margin:3px 0 0;font-size:14px;color:#5A5E76">{{ todayLine }}</p>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <button type="button" onClick="{{ goAddMember }}" style="min-height:44px;padding:0 15px;border-radius:10px;border:0;background:#6C63C7;color:#fff;font:inherit;font-size:14px;font-weight:700;cursor:pointer" style-hover="background:#5A52B5">+ {{ t.addMember }}</button>
                  <button type="button" onClick="{{ goRecordPayment }}" style="min-height:44px;padding:0 15px;border-radius:10px;border:1px solid #E3E5EE;background:#fff;color:#14152B;font:inherit;font-size:14px;font-weight:700;cursor:pointer" style-hover="border-color:#6C63C7">{{ t.recordPayment }}</button>
                </div>
              </div>

              <sc-if value="{{ showSetupCard }}" hint-placeholder-val="{{ true }}">
                <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:14px 16px;border-radius:14px;background:#FFFFFF;border:1px solid #E0DDF6;border-left:0;margin-bottom:14px">
                  <div style="flex:1;min-width:200px">
                    <p style="margin:0 0 4px;font-size:15px;font-weight:800">Finish setting up your gym</p>
                    <p style="margin:0 0 8px;font-size:13.5px;color:#5A5E76">{{ setupLine }}</p>
                    <div style="height:8px;border-radius:5px;background:#EDEEF5;overflow:hidden"><div style="height:100%;background:#6C63C7;width:{{ setupPct }}"></div></div>
                  </div>
                  <div style="display:flex;gap:8px">
                    <button type="button" onClick="{{ goSetup }}" style="min-height:44px;padding:0 14px;border-radius:10px;border:0;background:#6C63C7;color:#fff;font:inherit;font-size:14px;font-weight:700;cursor:pointer">Continue setup</button>
                    <button type="button" onClick="{{ dismissSetup }}" style="min-height:44px;padding:0 12px;border-radius:10px;border:1px solid #E3E5EE;background:#fff;color:#5A5E76;font:inherit;font-size:14px;font-weight:700;cursor:pointer">Hide</button>
                  </div>
                </div>
              </sc-if>

              <sc-if value="{{ dashPriorityFirst }}" hint-placeholder-val="{{ true }}">
                <div style="padding:16px;border-radius:14px;background:#fff;border:1px solid #E3E5EE;margin-bottom:14px">
                  <p style="margin:0 0 10px;font-size:12px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:#8A8FA6">Needs attention today</p>
                  <div style="display:flex;flex-direction:column;gap:8px">
                    <sc-for list="{{ actionItems }}" as="a" hint-placeholder-count="3">
                      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:11px 12px;border-radius:11px;background:#FAFAFD;border:1px solid #EDEEF5">
                        <span style="flex:none;width:9px;height:9px;border-radius:5px;background:{{ a.dot }}"></span>
                        <div style="flex:1;min-width:150px">
                          <p style="margin:0;font-size:14.5px;font-weight:700">{{ a.title }}</p>
                          <p style="margin:2px 0 0;font-size:13px;color:#5A5E76">{{ a.sub }}</p>
                        </div>
                        <button type="button" onClick="{{ a.go }}" style="min-height:44px;padding:0 13px;border-radius:9px;border:1px solid #E3E5EE;background:#fff;font:inherit;font-size:13.5px;font-weight:700;color:#4A438F;cursor:pointer" style-hover="border-color:#6C63C7">{{ a.cta }}</button>
                      </div>
                    </sc-for>
                  </div>
                </div>
              </sc-if>

              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:12px;margin-bottom:14px">
                <sc-for list="{{ dashStats }}" as="s" hint-placeholder-count="4">
                  <div style="padding:14px;border-radius:14px;background:#fff;border:1px solid #E3E5EE">
                    <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#5A5E76;line-height:1.3">{{ s.label }}</p>
                    <p style="margin:0;font-size:30px;font-weight:800;letter-spacing:-1px;line-height:1;color:{{ s.color }}">{{ s.value }}</p>
                    <p style="margin:6px 0 0;font-size:12.5px;color:#5A5E76">{{ s.delta }}</p>
                  </div>
                </sc-for>
              </div>

              <sc-if value="{{ dashKpiFirst }}" hint-placeholder-val="{{ false }}">
                <div style="padding:16px;border-radius:14px;background:#fff;border:1px solid #E3E5EE;margin-bottom:14px">
                  <p style="margin:0 0 10px;font-size:12px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:#8A8FA6">Needs attention today</p>
                  <div style="display:flex;flex-direction:column;gap:8px">
                    <sc-for list="{{ actionItems }}" as="a" hint-placeholder-count="3">
                      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:11px 12px;border-radius:11px;background:#FAFAFD;border:1px solid #EDEEF5">
                        <span style="flex:none;width:9px;height:9px;border-radius:5px;background:{{ a.dot }}"></span>
                        <div style="flex:1;min-width:150px">
                          <p style="margin:0;font-size:14.5px;font-weight:700">{{ a.title }}</p>
                          <p style="margin:2px 0 0;font-size:13px;color:#5A5E76">{{ a.sub }}</p>
                        </div>
                        <button type="button" onClick="{{ a.go }}" style="min-height:44px;padding:0 13px;border-radius:9px;border:1px solid #E3E5EE;background:#fff;font:inherit;font-size:13.5px;font-weight:700;color:#4A438F;cursor:pointer">{{ a.cta }}</button>
                      </div>
                    </sc-for>
                  </div>
                </div>
              </sc-if>

              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px">
                <div style="padding:16px;border-radius:14px;background:#fff;border:1px solid #E3E5EE">
                  <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:4px">
                    <p style="margin:0;font-size:15px;font-weight:800">{{ t.revenue }} · last 12 weeks</p>
                    <a href="#analytics" onClick="{{ goAnalytics }}" style="font-size:13px;font-weight:700;text-decoration:none">{{ t.viewAll }}</a>
                  </div>
                  <p style="margin:0 0 10px;font-size:32px;font-weight:800;letter-spacing:-1px">{{ revTotal }}</p>
                  <svg viewBox="0 0 320 120" preserveAspectRatio="none" style="width:100%;height:130px;display:block">
                    <path d="{{ revArea }}" fill="#EFEDFA"></path>
                    <polyline points="{{ revLine }}" fill="none" stroke="#6C63C7" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></polyline>
                  </svg>
                  <div style="display:flex;justify-content:space-between;font-size:12px;color:#5A5E76;margin-top:6px"><span>12 wks ago</span><span>This week</span></div>
                </div>

                <div style="padding:16px;border-radius:14px;background:#fff;border:1px solid #E3E5EE">
                  <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:10px">
                    <p style="margin:0;font-size:15px;font-weight:800">Expiring this week</p>
                    <a href="#members" onClick="{{ goExpiring }}" style="font-size:13px;font-weight:700;text-decoration:none">{{ t.viewAll }}</a>
                  </div>
                  <div style="display:flex;flex-direction:column;gap:8px">
                    <sc-for list="{{ expiringSoon }}" as="m" hint-placeholder-count="4">
                      <div style="display:flex;align-items:center;gap:11px;flex-wrap:wrap;padding:9px;border-radius:11px;border:1px solid #EDEEF5">
                        <span style="flex:none;width:38px;height:38px;border-radius:19px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;background:{{ m.color }}">{{ m.initials }}</span>
                        <div style="flex:1;min-width:120px">
                          <button type="button" onClick="{{ m.open }}" style="border:0;background:none;padding:0;font:inherit;font-size:14.5px;font-weight:700;color:#14152B;cursor:pointer;text-align:left">{{ m.name }}</button>
                          <p style="margin:2px 0 0;font-size:12.5px;color:#5A5E76">{{ m.expiryLine }}</p>
                        </div>
                        <button type="button" onClick="{{ m.remind }}" style="min-height:44px;padding:0 12px;border-radius:9px;border:0;background:#EAF6EF;color:#0F5E3C;font:inherit;font-size:13px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:6px" style-hover="background:#D9EFE3">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0F5E3C" stroke-width="2"><path d="M21 11.5A8.5 8.5 0 1 1 12.5 3 8.5 8.5 0 0 1 21 11.5Z"></path><path d="M3.5 20.5 5 16"></path></svg>
                          Send reminder
                        </button>
                      </div>
                    </sc-for>
                  </div>
                </div>
              </div>
            </section>
          </sc-if>

          <!-- LEADS -->
          <sc-if value="{{ isLeads }}" hint-placeholder-val="{{ false }}">
            <section data-screen-label="Leads">
              <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px">
                <div>
                  <h1 style="margin:0;font-size:24px;font-weight:800;letter-spacing:-.4px">{{ t.inquiries }}</h1>
                  <p style="margin:3px 0 0;font-size:14px;color:#5A5E76">Walk-ins, calls and web enquiries</p>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <button type="button" onClick="{{ openAddLead }}" style="min-height:44px;padding:0 15px;border-radius:10px;border:0;background:#6C63C7;color:#fff;font:inherit;font-size:14px;font-weight:700;cursor:pointer">+ Add lead</button>
                  <button type="button" onClick="{{ openKpiPicker }}" style="min-height:44px;padding:0 15px;border-radius:10px;border:1px solid #E3E5EE;background:#fff;font:inherit;font-size:14px;font-weight:700;cursor:pointer;color:#14152B">Choose metrics</button>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:12px;margin-bottom:14px">
                <sc-for list="{{ leadStats }}" as="s" hint-placeholder-count="3">
                  <div style="padding:14px;border-radius:14px;background:#fff;border:1px solid #E3E5EE">
                    <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#5A5E76">{{ s.label }}</p>
                    <p style="margin:0;font-size:30px;font-weight:800;letter-spacing:-1px;line-height:1">{{ s.value }}</p>
                  </div>
                </sc-for>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
                <sc-for list="{{ leadTabs }}" as="tb" hint-placeholder-count="4">
                  <button type="button" onClick="{{ tb.go }}" style="min-height:44px;padding:0 14px;border-radius:22px;border:1px solid {{ tb.bd }};background:{{ tb.bg }};color:{{ tb.fg }};font:inherit;font-size:14px;font-weight:700;cursor:pointer">{{ tb.label }}</button>
                </sc-for>
              </div>
              <div style="border-radius:14px;background:#fff;border:1px solid #E3E5EE;overflow:hidden">
                <sc-for list="{{ leadRows }}" as="l" hint-placeholder-count="6">
                  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 14px;border-bottom:1px solid #EDEEF5">
                    <div style="flex:1;min-width:150px">
                      <p style="margin:0;font-size:15px;font-weight:700">{{ l.name }}</p>
                      <p style="margin:2px 0 0;font-size:13px;color:#5A5E76">{{ l.meta }}</p>
                    </div>
                    <span style="flex:none;padding:5px 10px;border-radius:20px;font-size:12.5px;font-weight:800;background:{{ l.bg }};color:{{ l.fg }}">{{ l.status }}</span>
                    <button type="button" onClick="{{ l.advance }}" style="min-height:44px;padding:0 12px;border-radius:9px;border:1px solid #E3E5EE;background:#fff;font:inherit;font-size:13.5px;font-weight:700;color:#4A438F;cursor:pointer">{{ l.cta }}</button>
                  </div>
                </sc-for>
              </div>
            </section>
          </sc-if>

          <!-- MEMBERS LIST -->
          <sc-if value="{{ isMembers }}" hint-placeholder-val="{{ false }}">
            <section data-screen-label="Member List">
              <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px">
                <div>
                  <h1 style="margin:0;font-size:24px;font-weight:800;letter-spacing:-.4px">{{ t.members }}</h1>
                  <p style="margin:3px 0 0;font-size:14px;color:#5A5E76">{{ memberCountLine }}</p>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <sc-if value="{{ canEdit }}" hint-placeholder-val="{{ true }}">
                    <button type="button" onClick="{{ goAddMember }}" style="min-height:44px;padding:0 15px;border-radius:10px;border:0;background:#6C63C7;color:#fff;font:inherit;font-size:14px;font-weight:700;cursor:pointer">+ {{ t.addMember }}</button>
                  </sc-if>
                  <button type="button" onClick="{{ exportMembers }}" style="min-height:44px;padding:0 13px;border-radius:10px;border:1px solid #E3E5EE;background:#fff;font:inherit;font-size:14px;font-weight:700;cursor:pointer;color:#14152B">Export CSV</button>
                  <button type="button" onClick="{{ goRecycle }}" style="min-height:44px;padding:0 13px;border-radius:10px;border:1px solid #E3E5EE;background:#fff;font:inherit;font-size:14px;font-weight:700;cursor:pointer;color:#14152B">{{ t.recycleBin }}</button>
                </div>
              </div>

              <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px">
                <input type="search" value="{{ q }}" onChange="{{ onSearch }}" placeholder="{{ t.searchMembers }}" style="width:100%;min-height:44px;padding:0 13px;border-radius:11px;border:1px solid #E3E5EE;background:#fff;font:inherit;font-size:15px;color:#14152B" />
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <sc-for list="{{ filterChips }}" as="f" hint-placeholder-count="4">
                    <button type="button" onClick="{{ f.go }}" style="min-height:44px;padding:0 14px;border-radius:22px;border:1px solid {{ f.bd }};background:{{ f.bg }};color:{{ f.fg }};font:inherit;font-size:14px;font-weight:700;cursor:pointer">{{ f.label }}</button>
                  </sc-for>
                  <button type="button" onClick="{{ cycleSort }}" style="min-height:44px;padding:0 14px;border-radius:22px;border:1px solid #E3E5EE;background:#fff;color:#14152B;font:inherit;font-size:14px;font-weight:700;cursor:pointer">Sort: {{ sortLabel }}</button>
                </div>
              </div>

              <sc-if value="{{ hasSelection }}" hint-placeholder-val="{{ false }}">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 13px;border-radius:12px;background:#F0EFFA;border:1px solid #D9D5F2;margin-bottom:10px">
                  <span style="font-size:14px;font-weight:800;color:#4A438F">{{ selCount }} selected</span>
                  <button type="button" onClick="{{ bulkRemind }}" style="min-height:44px;padding:0 12px;border-radius:9px;border:0;background:#6C63C7;color:#fff;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer">Send reminder</button>
                  <button type="button" onClick="{{ clearSel }}" style="min-height:44px;padding:0 12px;border-radius:9px;border:1px solid #D9D5F2;background:#fff;font:inherit;font-size:13.5px;font-weight:700;color:#4A438F;cursor:pointer">Clear</button>
                </div>
              </sc-if>

              <div style="border-radius:14px;background:#fff;border:1px solid #E3E5EE;overflow:hidden">
                <sc-if value="{{ noResults }}" hint-placeholder-val="{{ false }}">
                  <div style="padding:38px 20px;text-align:center">
                    <p style="margin:0 0 6px;font-size:17px;font-weight:800">No members match that</p>
                    <p style="margin:0 0 14px;font-size:14.5px;color:#5A5E76">Try a different name or phone number, or clear the filters.</p>
                    <button type="button" onClick="{{ resetFilters }}" style="min-height:44px;padding:0 16px;border-radius:10px;border:1px solid #E3E5EE;background:#fff;font:inherit;font-weight:700;cursor:pointer;color:#14152B">Clear filters</button>
                  </div>
                </sc-if>
                <sc-if value="{{ isMobile }}" hint-placeholder-val="{{ false }}">
                <sc-for list="{{ memberRows }}" as="m" hint-placeholder-count="8">
                    <div style="display:flex;flex-direction:column;gap:7px;padding:10px 13px;border-bottom:1px solid #EDEEF5">
                      <div style="display:flex;align-items:center;gap:10px">
                        <button type="button" onClick="{{ m.toggleSel }}" aria-label="Select member" style="flex:none;width:44px;height:44px;display:flex;align-items:center;justify-content:center;border:0;background:none;cursor:pointer">
                          <span style="width:20px;height:20px;border-radius:6px;border:2px solid {{ m.selBd }};background:{{ m.selBg }};display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:900">{{ m.selMark }}</span>
                        </button>
                        <span style="flex:none;width:40px;height:40px;border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:13.5px;font-weight:800;color:#fff;background:{{ m.color }}">{{ m.initials }}</span>
                        <button type="button" onClick="{{ m.open }}" style="flex:1;min-width:0;border:0;background:none;padding:0;text-align:left;cursor:pointer;font:inherit">
                          <span style="display:inline-block;margin-bottom:3px;padding:2px 7px;border-radius:6px;background:#F0EFFA;color:#4A438F;font-family:ui-monospace,'SFMono-Regular',Menlo,monospace;font-size:12px;font-weight:700;letter-spacing:.4px">{{ m.enrollNo }}</span>
                          <p style="margin:0;font-size:16px;font-weight:700;color:#14152B;line-height:1.25;overflow-wrap:anywhere">{{ m.name }}</p>
                          <p style="margin:2px 0 0;font-size:13.5px;color:#5A5E76;line-height:1.3;overflow-wrap:anywhere">{{ m.sub }}</p>
                        </button>
                      </div>
                      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-left:54px">
                        <span style="padding:5px 10px;border-radius:20px;font-size:12.5px;font-weight:800;background:{{ m.bg }};color:{{ m.fg }}">{{ m.statusLabel }}</span>
                        <span style="font-size:13px;color:#5A5E76;font-weight:600">{{ m.expiryLine }}</span>
                        <button type="button" onClick="{{ m.quick }}" style="margin-left:auto;min-height:44px;padding:0 12px;border-radius:9px;border:1px solid #E3E5EE;background:#fff;font:inherit;font-size:13.5px;font-weight:700;color:#4A438F;cursor:pointer;white-space:nowrap">Quick view</button>
                      </div>
                    </div>
                </sc-for>
                </sc-if>
                <sc-if value="{{ isDesktop }}" hint-placeholder-val="{{ true }}">
                <sc-for list="{{ memberRows }}" as="m" hint-placeholder-count="8">
                  <div style="display:flex;align-items:center;gap:11px;padding:10px 13px;border-bottom:1px solid #EDEEF5">
                    <button type="button" onClick="{{ m.toggleSel }}" aria-label="Select member" style="flex:none;width:44px;height:44px;display:flex;align-items:center;justify-content:center;border:0;background:none;cursor:pointer">
                      <span style="width:20px;height:20px;border-radius:6px;border:2px solid {{ m.selBd }};background:{{ m.selBg }};display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:900">{{ m.selMark }}</span>
                    </button>
                    <span style="flex:none;width:40px;height:40px;border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:13.5px;font-weight:800;color:#fff;background:{{ m.color }}">{{ m.initials }}</span>
                    <span style="flex:none;width:86px;padding:4px 0;font-family:ui-monospace,'SFMono-Regular',Menlo,monospace;font-size:13px;font-weight:700;color:#4A438F;letter-spacing:.4px">{{ m.enrollNo }}</span>
                    <button type="button" onClick="{{ m.open }}" style="flex:1;min-width:0;border:0;background:none;padding:0;text-align:left;cursor:pointer;font:inherit">
                      <p style="margin:0;font-size:15px;font-weight:700;color:#14152B;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ m.name }}</p>
                      <p style="margin:2px 0 0;font-size:13px;color:#5A5E76;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ m.sub }}</p>
                    </button>
                    <span style="flex:none;padding:5px 10px;border-radius:20px;font-size:12.5px;font-weight:800;background:{{ m.bg }};color:{{ m.fg }}">{{ m.statusLabel }}</span>
                    <button type="button" onClick="{{ m.quick }}" style="flex:none;min-height:44px;padding:0 11px;border-radius:9px;border:1px solid #E3E5EE;background:#fff;font:inherit;font-size:13px;font-weight:700;color:#4A438F;cursor:pointer" style-hover="border-color:#6C63C7">Quick view</button>
                  </div>
                </sc-for>
                </sc-if>
              </div>
              <sc-if value="{{ hasMore }}" hint-placeholder-val="{{ true }}">
                <button type="button" onClick="{{ loadMore }}" style="width:100%;min-height:48px;margin-top:12px;border-radius:11px;border:1px solid #E3E5EE;background:#fff;font:inherit;font-size:14.5px;font-weight:700;color:#4A438F;cursor:pointer">Load more members</button>
              </sc-if>
            </section>
          </sc-if>

          <!-- MEMBER PROFILE -->
          <sc-if value="{{ isMember }}" hint-placeholder-val="{{ false }}">
            <section data-screen-label="Member Profile">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                <button type="button" onClick="{{ goMembers }}" style="flex:1;min-width:0;min-height:44px;padding:0 12px 0 6px;border-radius:9px;border:0;background:none;font:inherit;font-size:14px;font-weight:700;color:#4A438F;cursor:pointer;display:flex;align-items:center;gap:6px">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#4A438F" stroke-width="2.2" style="flex:none"><path d="m14 6-6 6 6 6"></path></svg>{{ t.members }}
                </button>
                <sc-if value="{{ canEdit }}" hint-placeholder-val="{{ true }}">
                  <button type="button" onClick="{{ goEditMember }}" aria-label="Edit member" title="Edit member" style="flex:none;width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:11px;border:1px solid #E3E5EE;background:#fff;cursor:pointer" style-hover="border-color:#6C63C7;background:#F7F6FD">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#4A438F" stroke-width="2"><path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z"></path><path d="m14 6 4 4"></path></svg>
                  </button>
                </sc-if>
                <sc-if value="{{ canDelete }}" hint-placeholder-val="{{ true }}">
                  <button type="button" onClick="{{ deleteThis }}" aria-label="Move to recycle bin" title="Move to recycle bin" style="flex:none;width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:11px;border:1px solid #F0D5D2;background:#fff;cursor:pointer" style-hover="border-color:#C1362C;background:#FDF4F3">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#C1362C" stroke-width="2"><path d="M4 7h16"></path><path d="M9 7V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8V7"></path><path d="M6 7l1 12.2a1.8 1.8 0 0 0 1.8 1.8h6.4a1.8 1.8 0 0 0 1.8-1.8L18 7"></path><path d="M10.5 11v6M13.5 11v6"></path></svg>
                  </button>
                </sc-if>
              </div>

              <div style="display:grid;gap:14px;align-items:start;grid-template-columns:{{ profileCols }}">
                <div style="padding:16px;border-radius:14px;background:#fff;border:1px solid #E3E5EE">
                  <div style="display:flex;align-items:center;gap:13px;margin-bottom:14px">
                    <span style="flex:none;width:60px;height:60px;border-radius:30px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff;background:{{ mp.color }}">{{ mp.initials }}</span>
                    <div style="min-width:0">
                      <span style="display:inline-block;margin-bottom:4px;padding:3px 8px;border-radius:7px;background:#F0EFFA;color:#4A438F;font-family:ui-monospace,'SFMono-Regular',Menlo,monospace;font-size:13px;font-weight:700;letter-spacing:.5px">{{ mp.enrollNo }}</span>
                      <h1 style="margin:0;font-size:21px;font-weight:800;letter-spacing:-.3px">{{ mp.name }}</h1>
                      <p style="margin:3px 0 0;font-size:14px;color:#5A5E76">{{ mp.phone }} · {{ mp.plan }}</p>
                    </div>
                  </div>

                  <sc-if value="{{ isReadOnly }}" hint-placeholder-val="{{ false }}">
                    <div style="padding:11px 13px;border-radius:11px;background:#F5F6FA;border:1px solid #E3E5EE;font-size:13.5px;color:#5A5E76;margin-bottom:14px">Read-only view. Trainers can see member details but cannot edit, collect payments or delete.</div>
                  </sc-if>

                    <sc-if value="{{ showFullActions }}" hint-placeholder-val="{{ true }}">
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
                      <button type="button" onClick="{{ goRecordPayment }}" style="min-height:44px;padding:0 14px;border-radius:10px;border:0;background:#6C63C7;color:#fff;font:inherit;font-size:14px;font-weight:700;cursor:pointer">{{ t.recordPayment }}</button>
                      <button type="button" onClick="{{ remindThis }}" style="min-height:44px;padding:0 14px;border-radius:10px;border:1px solid #E3E5EE;background:#fff;font:inherit;font-size:14px;font-weight:700;color:#14152B;cursor:pointer">Send reminder</button>
                    </div>
                  </sc-if>
                  <sc-if value="{{ isRestricted }}" hint-placeholder-val="{{ false }}">
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
                      <button type="button" onClick="{{ goRecordPayment }}" style="min-height:44px;padding:0 14px;border-radius:10px;border:0;background:#6C63C7;color:#fff;font:inherit;font-size:14px;font-weight:700;cursor:pointer">{{ t.recordPayment }}</button>
                      <button type="button" onClick="{{ remindThis }}" style="min-height:44px;padding:0 14px;border-radius:10px;border:1px solid #E3E5EE;background:#fff;font:inherit;font-size:14px;font-weight:700;color:#14152B;cursor:pointer">Send reminder</button>
                    </div>
                  </sc-if>

                  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px">
                    <sc-for list="{{ mp.stats }}" as="s" hint-placeholder-count="4">
                      <div style="padding:11px;border-radius:11px;background:#FAFAFD;border:1px solid #EDEEF5">
                        <p style="margin:0 0 4px;font-size:12.5px;font-weight:700;color:#5A5E76">{{ s.label }}</p>
                        <p style="margin:0;font-size:20px;font-weight:800;letter-spacing:-.4px">{{ s.value }}</p>
                      </div>
                    </sc-for>
                  </div>
                </div>

                <div style="display:flex;flex-direction:column;gap:14px">
                  <div style="padding:16px;border-radius:14px;background:#fff;border:1px solid #E3E5EE">
                    <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:10px">
                      <p style="margin:0;font-size:15px;font-weight:800">Recent payments</p>
                      <a href="#history" onClick="{{ goMemberPayments }}" style="font-size:13px;font-weight:700;text-decoration:none">{{ t.viewAll }}</a>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:7px">
                      <sc-for list="{{ mp.payments }}" as="p" hint-placeholder-count="3">
                        <div style="display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:10px;border:1px solid #EDEEF5">
                          <div style="flex:1;min-width:0">
                            <p style="margin:0;font-size:14px;font-weight:700">{{ p.label }}</p>
                            <p style="margin:2px 0 0;font-size:12.5px;color:#5A5E76">{{ p.date }} · {{ p.method }}</p>
                          </div>
                          <span style="font-size:16px;font-weight:800;letter-spacing:-.3px">{{ p.amount }}</span>
                        </div>
                      </sc-for>
                    </div>
                  </div>
                </div>
              </div>
              <div style="padding:16px;border-radius:14px;background:#fff;border:1px solid #E3E5EE;margin-top:14px">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:11px">
                  <p style="margin:0;font-size:12px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:#8A8FA6">Membership card · {{ cardStyleLabel }} style from Settings</p>
                  <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <button type="button" onClick="{{ shareCard }}" style="min-height:44px;padding:0 13px;border-radius:10px;border:0;background:#EAF6EF;color:#0F5E3C;font:inherit;font-size:13.5px;font-weight:800;cursor:pointer">Share card</button>
                    <button type="button" onClick="{{ goCardDesign }}" style="min-height:44px;padding:0 13px;border-radius:10px;border:1px solid #E3E5EE;background:#fff;color:#14152B;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer" style-hover="border-color:#6C63C7">Change design</button>
                  </div>
                </div>
                <div style="max-width:460px">
                  <dc-import name="MembershipCard" member="{{ mp }}" variant="{{ cardStyle }}" gym="Iron Peak Fitness" hint-size="100%,196px"></dc-import>
                </div>
              </div>
            </section>
          </sc-if>

          <!-- ADD / EDIT MEMBER, ADD STAFF (wizard) -->
          <sc-if value="{{ isWizard }}" hint-placeholder-val="{{ false }}">
            <section data-screen-label="Wizard">
              <button type="button" onClick="{{ cancelWizard }}" style="min-height:44px;padding:0 12px 0 6px;margin-bottom:10px;border-radius:9px;border:0;background:none;font:inherit;font-size:14px;font-weight:700;color:#4A438F;cursor:pointer;display:flex;align-items:center;gap:6px">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#4A438F" stroke-width="2.2"><path d="m14 6-6 6 6 6"></path></svg>{{ t.cancel }}
              </button>
              <h1 style="margin:0 0 14px;font-size:24px;font-weight:800;letter-spacing:-.4px">{{ wizTitle }}</h1>

              <sc-if value="{{ stepDots }}" hint-placeholder-val="{{ true }}">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:16px;flex-wrap:wrap">
                  <sc-for list="{{ wizSteps }}" as="s" hint-placeholder-count="5">
                    <div style="display:flex;align-items:center;gap:6px">
                      <span style="width:11px;height:11px;border-radius:6px;background:{{ s.dot }}"></span>
                      <span style="font-size:13px;font-weight:700;color:{{ s.fg }}">{{ s.label }}</span>
                    </div>
                  </sc-for>
                </div>
              </sc-if>
              <sc-if value="{{ stepNumbered }}" hint-placeholder-val="{{ false }}">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">
                  <sc-for list="{{ wizSteps }}" as="s" hint-placeholder-count="5">
                    <div style="display:flex;align-items:center;gap:7px;padding:6px 11px 6px 6px;border-radius:22px;background:{{ s.chipBg }};border:1px solid {{ s.chipBd }}">
                      <span style="width:24px;height:24px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:800;background:{{ s.dot }};color:{{ s.numFg }}">{{ s.num }}</span>
                      <span style="font-size:13px;font-weight:700;color:{{ s.fg }}">{{ s.label }}</span>
                    </div>
                  </sc-for>
                </div>
              </sc-if>
              <sc-if value="{{ stepProgress }}" hint-placeholder-val="{{ false }}">
                <div style="margin-bottom:16px">
                  <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:6px"><span>{{ wizStepLabel }}</span><span style="color:#5A5E76">{{ wizStepCount }}</span></div>
                  <div style="height:8px;border-radius:5px;background:#EDEEF5;overflow:hidden"><div style="height:100%;background:#6C63C7;width:{{ wizPct }}"></div></div>
                </div>
              </sc-if>

              <div style="padding:16px;border-radius:14px;background:#fff;border:1px solid #E3E5EE;max-width:640px">
                <sc-if value="{{ wizDone }}" hint-placeholder-val="{{ false }}">
                  <div style="text-align:center;padding:16px 6px">
                    <div style="width:56px;height:56px;border-radius:28px;background:#EAF6EF;display:flex;align-items:center;justify-content:center;margin:0 auto 12px">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0F5E3C" stroke-width="2.6"><path d="m5 13 4 4 10-10"></path></svg>
                    </div>
                    <p style="margin:0 0 6px;font-size:19px;font-weight:800">{{ wizDoneTitle }}</p>
                    <p style="margin:0 0 16px;font-size:15px;color:#5A5E76">{{ wizDoneSub }}</p>
                    <button type="button" onClick="{{ finishWizard }}" style="min-height:48px;padding:0 20px;border-radius:11px;border:0;background:#6C63C7;color:#fff;font:inherit;font-size:15px;font-weight:700;cursor:pointer">Done</button>
                  </div>
                </sc-if>
                <sc-if value="{{ wizActive }}" hint-placeholder-val="{{ true }}">
                  <div style="display:flex;flex-direction:column;gap:14px">
                    <p style="margin:0;font-size:17px;font-weight:800">{{ wizStepTitle }}</p>

                    <sc-if value="{{ wizIsSummary }}" hint-placeholder-val="{{ false }}">
                      <div style="display:flex;flex-direction:column;gap:0;border-radius:12px;border:1px solid #EDEEF5;overflow:hidden">
                        <sc-for list="{{ wizSummaryRows }}" as="r" hint-placeholder-count="6">
                          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:14px;padding:11px 13px;border-bottom:1px solid #EDEEF5;background:{{ r.rowBg }}">
                            <span style="font-size:13.5px;font-weight:700;color:#5A5E76">{{ r.label }}</span>
                            <span style="font-size:15px;font-weight:800;color:{{ r.fg }};text-align:right;overflow-wrap:anywhere">{{ r.value }}</span>
                          </div>
                        </sc-for>
                      </div>
                      <p style="margin:0;font-size:13.5px;color:#5A5E76;line-height:1.45">Only the name and mobile number are required. Anything left blank can be added later from the member's profile.</p>
                    </sc-if>

                    <sc-for list="{{ wizFields }}" as="f" hint-placeholder-count="4">
                      <label style="display:flex;flex-direction:column;gap:6px">
                        <span style="display:flex;align-items:baseline;gap:7px;font-size:13.5px;font-weight:700;color:#3A3E55">
                          <span>{{ f.label }}</span>
                          <sc-if value="{{ f.optional }}" hint-placeholder-val="{{ false }}">
                            <span style="font-size:11.5px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#8A8FA6">Optional</span>
                          </sc-if>
                          <sc-if value="{{ f.required }}" hint-placeholder-val="{{ false }}">
                            <span style="font-size:11.5px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#A62C22">Required</span>
                          </sc-if>
                        </span>
                        <sc-if value="{{ f.isSelect }}" hint-placeholder-val="{{ false }}">
                          <select value="{{ f.value }}" onChange="{{ f.onChange }}" style="min-height:46px;padding:0 11px;border-radius:11px;border:1px solid {{ f.bd }};background:#fff;font:inherit;font-size:15px;color:#14152B">
                            <sc-for list="{{ f.options }}" as="o" hint-placeholder-count="3">
                              <option value="{{ o.value }}">{{ o.label }}</option>
                            </sc-for>
                          </select>
                        </sc-if>
                        <sc-if value="{{ f.isText }}" hint-placeholder-val="{{ true }}">
                          <input type="text" value="{{ f.value }}" onChange="{{ f.onChange }}" placeholder="{{ f.placeholder }}" style="min-height:46px;padding:0 11px;border-radius:11px;border:1px solid {{ f.bd }};background:#fff;font:inherit;font-size:15px;color:#14152B" />
                        </sc-if>
                        <sc-if value="{{ f.isNote }}" hint-placeholder-val="{{ false }}">
                          <div style="padding:13px;border-radius:11px;border:1px dashed #D6D9E6;background:#FAFAFD;font-size:14px;color:#5A5E76">{{ f.placeholder }}</div>
                        </sc-if>
                        <sc-if value="{{ f.error }}" hint-placeholder-val="{{ false }}">
                          <span style="font-size:13px;font-weight:700;color:#C1362C">{{ f.error }}</span>
                        </sc-if>
                      </label>
                    </sc-for>
                    <div style="display:flex;gap:9px;flex-wrap:wrap;padding-top:4px">
                      <sc-if value="{{ wizCanBack }}" hint-placeholder-val="{{ false }}">
                        <button type="button" onClick="{{ wizBack }}" style="min-height:48px;padding:0 18px;border-radius:11px;border:1px solid #E3E5EE;background:#fff;font:inherit;font-size:15px;font-weight:700;color:#14152B;cursor:pointer">{{ t.back }}</button>
                      </sc-if>
                      <button type="button" onClick="{{ wizNext }}" style="flex:1;min-width:140px;min-height:48px;padding:0 18px;border-radius:11px;border:0;background:#6C63C7;color:#fff;font:inherit;font-size:15px;font-weight:700;cursor:pointer" style-hover="background:#5A52B5">{{ wizNextLabel }}</button>
                    </div>
                  </div>
                </sc-if>
              </div>
            </section>
          </sc-if>

          <!-- GENERIC LIST SCREENS: staff, payments, whatsapp, kiosk, recycle bin, member payments -->
          <sc-if value="{{ isListScreen }}" hint-placeholder-val="{{ false }}">
            <section data-screen-label="{{ listTitle }}">
              <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px">
                <div>
                  <h1 style="margin:0;font-size:24px;font-weight:800;letter-spacing:-.4px">{{ listTitle }}</h1>
                  <p style="margin:3px 0 0;font-size:14px;color:#5A5E76">{{ listSub }}</p>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <sc-if value="{{ listHasPrimary }}" hint-placeholder-val="{{ true }}">
                    <button type="button" onClick="{{ listPrimary }}" style="min-height:44px;padding:0 15px;border-radius:10px;border:0;background:#6C63C7;color:#fff;font:inherit;font-size:14px;font-weight:700;cursor:pointer">{{ listPrimaryLabel }}</button>
                  </sc-if>
                  <button type="button" onClick="{{ exportList }}" style="min-height:44px;padding:0 13px;border-radius:10px;border:1px solid #E3E5EE;background:#fff;font:inherit;font-size:14px;font-weight:700;cursor:pointer;color:#14152B">Export CSV</button>
                </div>
              </div>

              <sc-if value="{{ listHasKpis }}" hint-placeholder-val="{{ true }}">
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:12px;margin-bottom:14px">
                  <sc-for list="{{ listKpis }}" as="s" hint-placeholder-count="3">
                    <div style="padding:14px;border-radius:14px;background:#fff;border:1px solid #E3E5EE">
                      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#5A5E76">{{ s.label }}</p>
                      <p style="margin:0;font-size:29px;font-weight:800;letter-spacing:-1px;line-height:1">{{ s.value }}</p>
                    </div>
                  </sc-for>
                </div>
              </sc-if>

              <sc-if value="{{ listHasChart }}" hint-placeholder-val="{{ false }}">
                <div style="padding:16px;border-radius:14px;background:#fff;border:1px solid #E3E5EE;margin-bottom:14px">
                  <p style="margin:0 0 2px;font-size:15px;font-weight:800">Revenue trend · last 12 weeks</p>
                  <p style="margin:0 0 10px;font-size:30px;font-weight:800;letter-spacing:-1px">{{ revTotal }}</p>
                  <svg viewBox="0 0 320 120" preserveAspectRatio="none" style="width:100%;height:120px;display:block">
                    <path d="{{ revArea }}" fill="#EFEDFA"></path>
                    <polyline points="{{ revLine }}" fill="none" stroke="#6C63C7" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></polyline>
                  </svg>
                </div>
              </sc-if>

              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
                <input type="search" value="{{ q }}" onChange="{{ onSearch }}" placeholder="Search {{ listTitle }}" style="flex:1;min-width:180px;min-height:44px;padding:0 13px;border-radius:11px;border:1px solid #E3E5EE;background:#fff;font:inherit;font-size:15px;color:#14152B" />
                <button type="button" onClick="{{ cycleSort }}" style="min-height:44px;padding:0 14px;border-radius:11px;border:1px solid #E3E5EE;background:#fff;color:#14152B;font:inherit;font-size:14px;font-weight:700;cursor:pointer">Sort: {{ sortLabel }}</button>
              </div>

              <div style="border-radius:14px;background:#fff;border:1px solid #E3E5EE;overflow:hidden">
                <sc-if value="{{ listEmpty }}" hint-placeholder-val="{{ false }}">
                  <div style="padding:38px 20px;text-align:center">
                    <p style="margin:0 0 6px;font-size:17px;font-weight:800">{{ listEmptyTitle }}</p>
                    <p style="margin:0;font-size:14.5px;color:#5A5E76">{{ listEmptySub }}</p>
                  </div>
                </sc-if>
                <sc-if value="{{ isMobile }}" hint-placeholder-val="{{ false }}">
                <sc-for list="{{ listRows }}" as="r" hint-placeholder-count="6">
                    <div style="display:flex;flex-direction:column;gap:7px;padding:11px 13px;border-bottom:1px solid #EDEEF5">
                      <div style="display:flex;align-items:center;gap:10px">
                        <sc-if value="{{ r.initials }}" hint-placeholder-val="{{ true }}">
                          <span style="flex:none;width:40px;height:40px;border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:13.5px;font-weight:800;color:#fff;background:{{ r.color }}">{{ r.initials }}</span>
                        </sc-if>
                        <div style="flex:1;min-width:0">
                          <p style="margin:0;font-size:16px;font-weight:700;line-height:1.25;overflow-wrap:anywhere">{{ r.title }}</p>
                          <p style="margin:2px 0 0;font-size:13.5px;color:#5A5E76;line-height:1.3;overflow-wrap:anywhere">{{ r.sub }}</p>
                        </div>
                      </div>
                      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-left:50px">
                        <sc-if value="{{ r.tag }}" hint-placeholder-val="{{ false }}">
                          <span style="padding:5px 10px;border-radius:20px;font-size:12.5px;font-weight:800;background:{{ r.bg }};color:{{ r.fg }}">{{ r.tag }}</span>
                        </sc-if>
                        <sc-if value="{{ r.amount }}" hint-placeholder-val="{{ false }}">
                          <span style="font-size:18px;font-weight:800;letter-spacing:-.4px">{{ r.amount }}</span>
                        </sc-if>
                        <sc-if value="{{ r.cta }}" hint-placeholder-val="{{ false }}">
                          <button type="button" onClick="{{ r.go }}" style="margin-left:auto;min-height:44px;padding:0 12px;border-radius:9px;border:1px solid #E3E5EE;background:#fff;font:inherit;font-size:13.5px;font-weight:700;color:#4A438F;cursor:pointer;white-space:nowrap">{{ r.cta }}</button>
                        </sc-if>
                      </div>
                    </div>
                </sc-for>
                </sc-if>
                <sc-if value="{{ isDesktop }}" hint-placeholder-val="{{ true }}">
                <sc-for list="{{ listRows }}" as="r" hint-placeholder-count="6">
                  <div style="display:flex;align-items:center;gap:11px;padding:11px 13px;border-bottom:1px solid #EDEEF5">
                    <sc-if value="{{ r.initials }}" hint-placeholder-val="{{ true }}">
                      <span style="flex:none;width:40px;height:40px;border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:13.5px;font-weight:800;color:#fff;background:{{ r.color }}">{{ r.initials }}</span>
                    </sc-if>
                    <div style="flex:1;min-width:0">
                      <p style="margin:0;font-size:15px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ r.title }}</p>
                      <p style="margin:2px 0 0;font-size:13px;color:#5A5E76;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ r.sub }}</p>
                    </div>
                    <sc-if value="{{ r.amount }}" hint-placeholder-val="{{ false }}">
                      <span style="flex:none;font-size:17px;font-weight:800;letter-spacing:-.4px">{{ r.amount }}</span>
                    </sc-if>
                    <sc-if value="{{ r.tag }}" hint-placeholder-val="{{ false }}">
                      <span style="flex:none;padding:5px 10px;border-radius:20px;font-size:12.5px;font-weight:800;background:{{ r.bg }};color:{{ r.fg }}">{{ r.tag }}</span>
                    </sc-if>
                    <sc-if value="{{ r.cta }}" hint-placeholder-val="{{ false }}">
                      <button type="button" onClick="{{ r.go }}" style="flex:none;min-height:44px;padding:0 12px;border-radius:9px;border:1px solid #E3E5EE;background:#fff;font:inherit;font-size:13px;font-weight:700;color:#4A438F;cursor:pointer">{{ r.cta }}</button>
                    </sc-if>
                  </div>
                </sc-for>
                </sc-if>
              </div>
            </section>
          </sc-if>

          <!-- ANALYTICS / ATTENDANCE -->
          <sc-if value="{{ isAnalytics }}" hint-placeholder-val="{{ false }}">
            <section data-screen-label="Analytics">
              <h1 style="margin:0 0 3px;font-size:24px;font-weight:800;letter-spacing:-.4px">{{ analyticsTitle }}</h1>
              <p style="margin:0 0 14px;font-size:14px;color:#5A5E76">{{ analyticsSub }}</p>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:12px;margin-bottom:14px">
                <sc-for list="{{ listKpis }}" as="s" hint-placeholder-count="4">
                  <div style="padding:14px;border-radius:14px;background:#fff;border:1px solid #E3E5EE">
                    <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#5A5E76">{{ s.label }}</p>
                    <p style="margin:0;font-size:29px;font-weight:800;letter-spacing:-1px;line-height:1">{{ s.value }}</p>
                  </div>
                </sc-for>
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px">
                <div style="padding:16px;border-radius:14px;background:#fff;border:1px solid #E3E5EE">
                  <p style="margin:0 0 2px;font-size:15px;font-weight:800">{{ t.revenue }} · last 12 weeks</p>
                  <p style="margin:0 0 10px;font-size:30px;font-weight:800;letter-spacing:-1px">{{ revTotal }}</p>
                  <svg viewBox="0 0 320 120" preserveAspectRatio="none" style="width:100%;height:130px;display:block">
                    <path d="{{ revArea }}" fill="#EFEDFA"></path>
                    <polyline points="{{ revLine }}" fill="none" stroke="#6C63C7" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></polyline>
                  </svg>
                </div>
                <div style="padding:16px;border-radius:14px;background:#fff;border:1px solid #E3E5EE">
                  <p style="margin:0 0 10px;font-size:15px;font-weight:800">Check-ins by hour</p>
                  <div style="display:grid;grid-template-columns:auto repeat(12,1fr);gap:3px;align-items:center">
                    <sc-for list="{{ heatCells }}" as="c" hint-placeholder-count="24">
                      <sc-if value="{{ c.isLabel }}" hint-placeholder-val="{{ false }}">
                        <span style="font-size:11px;font-weight:700;color:#5A5E76;padding-right:5px">{{ c.label }}</span>
                      </sc-if>
                      <sc-if value="{{ c.isCell }}" hint-placeholder-val="{{ true }}">
                        <span title="{{ c.title }}" style="height:19px;border-radius:4px;background:{{ c.bg }}"></span>
                      </sc-if>
                    </sc-for>
                  </div>
                  <div style="display:flex;align-items:center;gap:7px;margin-top:11px;font-size:12px;color:#5A5E76">
                    <span>Quiet</span>
                    <span style="width:16px;height:12px;border-radius:3px;background:#F0EFFA"></span>
                    <span style="width:16px;height:12px;border-radius:3px;background:#C9C5EC"></span>
                    <span style="width:16px;height:12px;border-radius:3px;background:#9089D8"></span>
                    <span style="width:16px;height:12px;border-radius:3px;background:#6C63C7"></span>
                    <span>Busy</span>
                  </div>
                </div>
                <div style="padding:16px;border-radius:14px;background:#fff;border:1px solid #E3E5EE">
                  <p style="margin:0 0 11px;font-size:15px;font-weight:800">Plan mix</p>
                  <div style="display:flex;flex-direction:column;gap:11px">
                    <sc-for list="{{ planMix }}" as="p" hint-placeholder-count="4">
                      <div>
                        <div style="display:flex;justify-content:space-between;font-size:13.5px;font-weight:700;margin-bottom:5px"><span>{{ p.label }}</span><span style="color:#5A5E76">{{ p.count }}</span></div>
                        <div style="height:9px;border-radius:5px;background:#EDEEF5;overflow:hidden"><div style="height:100%;background:{{ p.color }};width:{{ p.pct }}"></div></div>
                      </div>
                    </sc-for>
                  </div>
                </div>
              </div>
            </section>
          </sc-if>

          <!-- SETTINGS HUB -->
          <sc-if value="{{ isSettingsHub }}" hint-placeholder-val="{{ false }}">
            <section data-screen-label="Settings">
              <h1 style="margin:0 0 3px;font-size:24px;font-weight:800;letter-spacing:-.4px">{{ t.settings }}</h1>
              <p style="margin:0 0 14px;font-size:14px;color:#5A5E76">Everything that isn't a daily one-tap job lives here.</p>
              <sc-for list="{{ settingsGroups }}" as="g" hint-placeholder-count="3">
                <div style="margin-bottom:16px">
                  <p style="margin:0 0 8px;font-size:12px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:#8A8FA6">{{ g.label }}</p>
                  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px">
                    <sc-for list="{{ g.items }}" as="s" hint-placeholder-count="4">
                      <button type="button" onClick="{{ s.go }}" style="display:flex;align-items:center;gap:12px;text-align:left;min-height:64px;padding:12px 14px;border-radius:13px;border:1px solid #E3E5EE;background:#fff;cursor:pointer;font:inherit;width:100%" style-hover="border-color:#6C63C7;background:#FAFAFD">
                        <span style="flex:none;width:34px;height:34px;border-radius:10px;background:#F0EFFA;display:flex;align-items:center;justify-content:center" dangerouslySetInnerHTML="{{ s.icon }}"></span>
                        <span style="flex:1;min-width:0">
                          <span style="display:block;font-size:15px;font-weight:700;color:#14152B">{{ s.label }}</span>
                          <span style="display:block;margin-top:2px;font-size:13px;color:#5A5E76">{{ s.sub }}</span>
                        </span>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8A8FA6" stroke-width="2.2" style="flex:none"><path d="m10 6 6 6-6 6"></path></svg>
                      </button>
                    </sc-for>
                  </div>
                </div>
              </sc-for>
            </section>
          </sc-if>

          <!-- SETTINGS DETAIL (generic form) -->
          <sc-if value="{{ isSettingsDetail }}" hint-placeholder-val="{{ false }}">
            <section data-screen-label="Settings detail">
              <button type="button" onClick="{{ goSettings }}" style="min-height:44px;padding:0 12px 0 6px;margin-bottom:10px;border-radius:9px;border:0;background:none;font:inherit;font-size:14px;font-weight:700;color:#4A438F;cursor:pointer;display:flex;align-items:center;gap:6px">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#4A438F" stroke-width="2.2"><path d="m14 6-6 6 6 6"></path></svg>{{ t.settings }}
              </button>
              <h1 style="margin:0 0 3px;font-size:24px;font-weight:800;letter-spacing:-.4px">{{ setTitle }}</h1>
              <p style="margin:0 0 14px;font-size:14px;color:#5A5E76">{{ setSub }}</p>

              <sc-if value="{{ setShowCard }}" hint-placeholder-val="{{ false }}">
                <div style="padding:16px;border-radius:14px;background:#fff;border:1px solid #E3E5EE;margin-bottom:14px;max-width:640px">
                  <p style="margin:0 0 11px;font-size:12px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:#8A8FA6">Live preview · same component used on profile, share link and dashboard</p>
                  <dc-import name="MembershipCard" member="{{ sampleMember }}" variant="{{ cardStyle }}" gym="Iron Peak Fitness" hint-size="100%,196px"></dc-import>
                </div>
              </sc-if>

              <div style="max-width:640px;display:flex;flex-direction:column;gap:14px">
                <sc-for list="{{ setSections }}" as="sec" hint-placeholder-count="2">
                  <div style="padding:16px;border-radius:14px;background:#fff;border:1px solid #E3E5EE">
                    <p style="margin:0 0 13px;font-size:15px;font-weight:800">{{ sec.label }}</p>
                    <div style="display:flex;flex-direction:column;gap:13px">
                      <sc-for list="{{ sec.fields }}" as="f" hint-placeholder-count="3">
                        <sc-if value="{{ f.isToggle }}" hint-placeholder-val="{{ false }}">
                          <button type="button" onClick="{{ f.onToggle }}" style="display:flex;align-items:center;gap:12px;min-height:44px;padding:0;border:0;background:none;cursor:pointer;font:inherit;text-align:left;width:100%">
                            <span style="flex:1;min-width:0;font-size:15px;font-weight:600;color:#14152B">{{ f.label }}</span>
                            <span style="flex:none;width:46px;height:26px;border-radius:14px;padding:3px;background:{{ f.trackBg }};display:flex;justify-content:{{ f.knobPos }}">
                              <span style="width:20px;height:20px;border-radius:10px;background:#fff"></span>
                            </span>
                          </button>
                        </sc-if>
                        <sc-if value="{{ f.isText }}" hint-placeholder-val="{{ true }}">
                          <label style="display:flex;flex-direction:column;gap:6px">
                            <span style="font-size:13.5px;font-weight:700;color:#3A3E55">{{ f.label }}</span>
                            <input type="text" value="{{ f.value }}" onChange="{{ f.onChange }}" style="min-height:46px;padding:0 11px;border-radius:11px;border:1px solid #E3E5EE;background:#fff;font:inherit;font-size:15px;color:#14152B" />
                          </label>
                        </sc-if>
                        <sc-if value="{{ f.isSelect }}" hint-placeholder-val="{{ false }}">
                          <label style="display:flex;flex-direction:column;gap:6px">
                            <span style="font-size:13.5px;font-weight:700;color:#3A3E55">{{ f.label }}</span>
                            <select value="{{ f.value }}" onChange="{{ f.onChange }}" style="min-height:46px;padding:0 11px;border-radius:11px;border:1px solid #E3E5EE;background:#fff;font:inherit;font-size:15px;color:#14152B">
                              <sc-for list="{{ f.options }}" as="o" hint-placeholder-count="3">
                                <option value="{{ o.value }}">{{ o.label }}</option>
                              </sc-for>
                            </select>
                          </label>
                        </sc-if>
                      </sc-for>
                    </div>
                  </div>
                </sc-for>
                <div style="display:flex;gap:9px;flex-wrap:wrap">
                  <button type="button" onClick="{{ saveSettings }}" style="min-height:48px;padding:0 20px;border-radius:11px;border:0;background:#6C63C7;color:#fff;font:inherit;font-size:15px;font-weight:700;cursor:pointer">{{ t.save }}</button>
                  <button type="button" onClick="{{ goSettings }}" style="min-height:48px;padding:0 18px;border-radius:11px;border:1px solid #E3E5EE;background:#fff;font:inherit;font-size:15px;font-weight:700;color:#14152B;cursor:pointer">{{ t.cancel }}</button>
                </div>
              </div>
            </section>
          </sc-if>

          <!-- SCANNER / TABLET / SETUP / SUBSCRIPTION -->
          <sc-if value="{{ isScanner }}" hint-placeholder-val="{{ false }}">
            <section data-screen-label="Scanner">
              <h1 style="margin:0 0 3px;font-size:24px;font-weight:800;letter-spacing:-.4px">{{ t.scan }}</h1>
              <p style="margin:0 0 14px;font-size:14px;color:#5A5E76">Point the camera at a member's QR code. Inside the app shell — you can leave any time.</p>
              <div style="max-width:420px;aspect-ratio:1;border-radius:16px;background:#1B1C2E;display:flex;align-items:center;justify-content:center;position:relative;margin-bottom:14px">
                <div style="width:62%;aspect-ratio:1;border-radius:14px;border:3px solid rgba(255,255,255,.85)"></div>
                <p style="position:absolute;bottom:16px;left:0;right:0;text-align:center;margin:0;font-size:14px;font-weight:700;color:rgba(255,255,255,.9)">Camera preview</p>
              </div>
              <div style="display:flex;gap:9px;flex-wrap:wrap">
                <button type="button" onClick="{{ simulateScan }}" style="min-height:48px;padding:0 18px;border-radius:11px;border:0;background:#6C63C7;color:#fff;font:inherit;font-size:15px;font-weight:700;cursor:pointer">Simulate a scan</button>
                <button type="button" onClick="{{ overrideCheckin }}" style="min-height:48px;padding:0 18px;border-radius:11px;border:1px solid #E3E5EE;background:#fff;font:inherit;font-size:15px;font-weight:700;color:#14152B;cursor:pointer">Manual check-in override</button>
              </div>
            </section>
          </sc-if>

          <sc-if value="{{ isTablet }}" hint-placeholder-val="{{ false }}">
            <section data-screen-label="Tablet mode">
              <h1 style="margin:0 0 3px;font-size:24px;font-weight:800;letter-spacing:-.4px">Tablet check-in mode</h1>
              <p style="margin:0 0 14px;font-size:14px;color:#5A5E76">Front-desk always-on display. Launching it hides the shell until you exit with the owner PIN.</p>
              <div style="border-radius:16px;background:#14152B;color:#fff;padding:26px;margin-bottom:14px">
                <p style="margin:0 0 5px;font-size:15px;font-weight:700;color:rgba(255,255,255,.7)">Iron Peak Fitness</p>
                <p style="margin:0 0 18px;font-size:44px;font-weight:800;letter-spacing:-1.6px;line-height:1">Scan to check in</p>
                <div style="display:flex;gap:22px;flex-wrap:wrap">
                  <div><p style="margin:0;font-size:13px;color:rgba(255,255,255,.6);font-weight:700">{{ t.inGym }}</p><p style="margin:3px 0 0;font-size:36px;font-weight:800;letter-spacing:-1px">{{ inGymCount }}</p></div>
                  <div><p style="margin:0;font-size:13px;color:rgba(255,255,255,.6);font-weight:700">Check-ins today</p><p style="margin:3px 0 0;font-size:36px;font-weight:800;letter-spacing:-1px">{{ checkinsToday }}</p></div>
                </div>
              </div>
              <button type="button" onClick="{{ launchTablet }}" style="min-height:48px;padding:0 18px;border-radius:11px;border:0;background:#6C63C7;color:#fff;font:inherit;font-size:15px;font-weight:700;cursor:pointer">Launch on this device</button>
            </section>
          </sc-if>

          <sc-if value="{{ isSetup }}" hint-placeholder-val="{{ false }}">
            <section data-screen-label="Setup checklist">
              <h1 style="margin:0 0 3px;font-size:24px;font-weight:800;letter-spacing:-.4px">Setup checklist</h1>
              <p style="margin:0 0 14px;font-size:14px;color:#5A5E76">{{ setupLine }}</p>
              <div style="max-width:620px;border-radius:14px;background:#fff;border:1px solid #E3E5EE;overflow:hidden">
                <sc-for list="{{ setupItems }}" as="s" hint-placeholder-count="6">
                  <button type="button" onClick="{{ s.toggle }}" style="display:flex;align-items:center;gap:12px;width:100%;min-height:60px;padding:12px 14px;border:0;border-bottom:1px solid #EDEEF5;background:#fff;cursor:pointer;font:inherit;text-align:left" style-hover="background:#FAFAFD">
                    <span style="flex:none;width:26px;height:26px;border-radius:13px;border:2px solid {{ s.bd }};background:{{ s.bg }};display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:900">{{ s.mark }}</span>
                    <span style="flex:1;min-width:0">
                      <span style="display:block;font-size:15px;font-weight:700;color:{{ s.fg }}">{{ s.label }}</span>
                      <span style="display:block;margin-top:2px;font-size:13px;color:#5A5E76">{{ s.sub }}</span>
                    </span>
                  </button>
                </sc-for>
              </div>
            </section>
          </sc-if>

          <sc-if value="{{ isSubscription }}" hint-placeholder-val="{{ false }}">
            <section data-screen-label="Subscription">
              <button type="button" onClick="{{ goSettings }}" style="min-height:44px;padding:0 12px 0 6px;margin-bottom:10px;border-radius:9px;border:0;background:none;font:inherit;font-size:14px;font-weight:700;color:#4A438F;cursor:pointer;display:flex;align-items:center;gap:6px">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#4A438F" stroke-width="2.2"><path d="m14 6-6 6 6 6"></path></svg>{{ t.settings }}
              </button>
              <h1 style="margin:0 0 3px;font-size:24px;font-weight:800;letter-spacing:-.4px">{{ t.subscription }} &amp; billing</h1>
              <p style="margin:0 0 14px;font-size:14px;color:#5A5E76">Your Gymloop plan, invoices and payment method.</p>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;align-items:start">
                <div style="padding:18px;border-radius:14px;background:#fff;border:1px solid #E3E5EE">
                  <p style="margin:0 0 5px;font-size:13px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:#8A8FA6">Current plan</p>
                  <p style="margin:0;font-size:27px;font-weight:800;letter-spacing:-.6px">Growth</p>
                  <p style="margin:4px 0 14px;font-size:15px;color:#5A5E76">₹2,499 / month · renews 2 Sep 2026</p>
                  <div style="display:flex;gap:9px;flex-wrap:wrap">
                    <button type="button" onClick="{{ toastUpgrade }}" style="min-height:44px;padding:0 15px;border-radius:10px;border:0;background:#6C63C7;color:#fff;font:inherit;font-size:14px;font-weight:700;cursor:pointer">Change plan</button>
                    <button type="button" onClick="{{ toastUpgrade }}" style="min-height:44px;padding:0 15px;border-radius:10px;border:1px solid #E3E5EE;background:#fff;font:inherit;font-size:14px;font-weight:700;color:#14152B;cursor:pointer">Update payment method</button>
                  </div>
                </div>
                <div style="padding:18px;border-radius:14px;background:#fff;border:1px solid #E3E5EE">
                  <p style="margin:0 0 11px;font-size:15px;font-weight:800">Invoices</p>
                  <div style="display:flex;flex-direction:column;gap:8px">
                    <sc-for list="{{ invoices }}" as="i" hint-placeholder-count="4">
                      <div style="display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:10px;border:1px solid #EDEEF5">
                        <div style="flex:1;min-width:0"><p style="margin:0;font-size:14px;font-weight:700">{{ i.date }}</p><p style="margin:2px 0 0;font-size:12.5px;color:#5A5E76">{{ i.id }}</p></div>
                        <span style="font-size:15px;font-weight:800">{{ i.amount }}</span>
                      </div>
                    </sc-for>
                  </div>
                </div>
              </div>
            </section>
          </sc-if>

        </div>
      </sc-if>
    </main>
  </div>

  <sc-if value="{{ isMobile }}" hint-placeholder-val="{{ false }}">
    <div style="position:absolute;left:0;right:0;bottom:0;z-index:30">
      <sc-if value="{{ qaBar }}" hint-placeholder-val="{{ false }}">
        <div style="display:flex;gap:7px;padding:8px 10px;background:#FFFFFF;border-top:1px solid #E3E5EE;overflow-x:auto">
          <sc-for list="{{ quickItems }}" as="q" hint-placeholder-count="4">
            <button type="button" onClick="{{ q.go }}" style="flex:none;display:flex;align-items:center;gap:7px;min-height:44px;padding:0 12px;border-radius:22px;border:1px solid #E0DDF6;background:#F7F6FD;color:#4A438F;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer">
              <span style="flex:none;width:17px;height:17px;display:flex" dangerouslySetInnerHTML="{{ q.icon }}"></span>{{ q.label }}
            </button>
          </sc-for>
        </div>
      </sc-if>

      <sc-if value="{{ qaFab }}" hint-placeholder-val="{{ true }}">
        <div style="position:absolute;right:14px;bottom:82px;display:flex;flex-direction:column;align-items:flex-end;gap:9px">
          <sc-if value="{{ quickOpen }}" hint-placeholder-val="{{ false }}">
            <sc-for list="{{ quickItems }}" as="q" hint-placeholder-count="4">
              <button type="button" onClick="{{ q.go }}" style="display:flex;align-items:center;gap:8px;min-height:44px;padding:0 14px;border-radius:22px;border:1px solid #E3E5EE;background:#fff;color:#14152B;font:inherit;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(20,21,43,.1)">
                <span style="flex:none;width:18px;height:18px;display:flex" dangerouslySetInnerHTML="{{ q.icon }}"></span>{{ q.label }}
              </button>
            </sc-for>
          </sc-if>
          <button type="button" onClick="{{ toggleQuick }}" style="display:flex;align-items:center;gap:8px;min-height:52px;padding:0 18px;border-radius:26px;border:0;background:#6C63C7;color:#fff;font:inherit;font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 3px 12px rgba(108,99,199,.34)">
            <span style="font-size:19px;line-height:1">{{ quickGlyph }}</span>{{ t.quickActions }}
          </button>
        </div>
      </sc-if>

      <sc-if value="{{ qaSheet }}" hint-placeholder-val="{{ false }}">
        <div style="padding:8px 10px;background:#fff;border-top:1px solid #E3E5EE">
          <button type="button" onClick="{{ toggleQuick }}" style="width:100%;min-height:46px;border-radius:23px;border:0;background:#6C63C7;color:#fff;font:inherit;font-size:15px;font-weight:800;cursor:pointer">{{ t.quickActions }}</button>
        </div>
      </sc-if>

      <nav aria-label="Primary" style="display:flex;background:#FFFFFF;border-top:1px solid #E3E5EE;padding:4px 4px 6px">
        <sc-for list="{{ navItems }}" as="n" hint-placeholder-count="5">
          <button type="button" onClick="{{ n.go }}" style="flex:1;min-width:0;min-height:56px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:0;background:none;cursor:pointer;font:inherit;padding:4px 2px;color:{{ n.fg }}">
            <span style="width:21px;height:21px;display:flex;align-items:center;justify-content:center" dangerouslySetInnerHTML="{{ n.icon }}"></span>
            <span style="font-size:11px;font-weight:700;line-height:1.15;text-align:center;overflow-wrap:anywhere">{{ n.label }}</span>
          </button>
        </sc-for>
      </nav>
    </div>
  </sc-if>

  <sc-if value="{{ quickSheetOpen }}" hint-placeholder-val="{{ false }}">
    <div style="position:absolute;inset:0;z-index:60;background:rgba(20,21,43,.34);display:flex;align-items:flex-end" onClick="{{ closeQuick }}">
      <div style="width:100%;background:#fff;border-radius:18px 18px 0 0;padding:16px 14px 20px">
        <p style="margin:0 0 12px;font-size:17px;font-weight:800">{{ t.quickActions }}</p>
        <div style="display:flex;flex-direction:column;gap:9px">
          <sc-for list="{{ quickItems }}" as="q" hint-placeholder-count="4">
            <button type="button" onClick="{{ q.go }}" style="display:flex;align-items:center;gap:12px;min-height:52px;padding:0 14px;border-radius:12px;border:1px solid #E3E5EE;background:#fff;color:#14152B;font:inherit;font-size:15px;font-weight:700;cursor:pointer;text-align:left">
              <span style="flex:none;width:20px;height:20px;display:flex" dangerouslySetInnerHTML="{{ q.icon }}"></span>
              <span style="flex:1">{{ q.label }}</span>
              <sc-if value="{{ q.badge }}" hint-placeholder-val="{{ false }}">
                <span style="min-width:22px;height:20px;padding:0 6px;border-radius:10px;background:#6C63C7;color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center">{{ q.badge }}</span>
              </sc-if>
            </button>
          </sc-for>
        </div>
      </div>
    </div>
  </sc-if>

  <sc-if value="{{ searchOpen }}" hint-placeholder-val="{{ false }}">
    <div style="position:absolute;inset:0;z-index:70;background:rgba(20,21,43,.34);display:flex;justify-content:center;padding:56px 14px 14px" onClick="{{ closeSearch }}">
      <div style="width:100%;max-width:560px;height:fit-content;max-height:100%;overflow:auto;background:#fff;border-radius:16px;border:1px solid #E3E5EE;padding:14px">
        <input type="search" value="{{ gq }}" onChange="{{ onGlobalSearch }}" placeholder="{{ t.search }}" autoFocus="{{ true }}" style="width:100%;min-height:48px;padding:0 13px;border-radius:11px;border:1px solid #E3E5EE;font:inherit;font-size:16px;color:#14152B;margin-bottom:11px" />
        <div style="display:flex;flex-direction:column;gap:6px">
          <sc-for list="{{ globalResults }}" as="g" hint-placeholder-count="4">
            <button type="button" onClick="{{ g.go }}" style="display:flex;align-items:center;gap:11px;min-height:52px;padding:0 11px;border-radius:11px;border:1px solid #EDEEF5;background:#fff;cursor:pointer;font:inherit;text-align:left">
              <span style="flex:none;padding:4px 8px;border-radius:8px;background:#F0EFFA;color:#4A438F;font-size:11.5px;font-weight:800">{{ g.kind }}</span>
              <span style="flex:1;min-width:0"><span style="display:block;font-size:15px;font-weight:700">{{ g.title }}</span><span style="display:block;font-size:13px;color:#5A5E76">{{ g.sub }}</span></span>
            </button>
          </sc-for>
        </div>
        <sc-if value="{{ noGlobalResults }}" hint-placeholder-val="{{ true }}">
          <p style="margin:14px 4px;font-size:14.5px;color:#5A5E76">Start typing a member, staff or payment to jump straight there.</p>
        </sc-if>
      </div>
    </div>
  </sc-if>

  <sc-if value="{{ quickViewOpen }}" hint-placeholder-val="{{ false }}">
    <div style="position:absolute;inset:0;z-index:65;background:rgba(20,21,43,.34);display:flex;justify-content:flex-end" onClick="{{ closeQuickView }}">
      <aside style="width:min(100%,380px);height:100%;background:#fff;border-left:1px solid #E3E5EE;padding:16px;overflow-y:auto;animation:slideIn 180ms ease-out">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
          <span style="flex:none;width:52px;height:52px;border-radius:26px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff;background:{{ qv.color }}">{{ qv.initials }}</span>
          <div style="min-width:0">
            <p style="margin:0;font-size:19px;font-weight:800;letter-spacing:-.3px">{{ qv.name }}</p>
            <p style="margin:2px 0 0;font-size:14px;color:#5A5E76">{{ qv.phone }}</p>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
          <sc-for list="{{ qv.stats }}" as="s" hint-placeholder-count="4">
            <div style="padding:11px;border-radius:11px;background:#FAFAFD;border:1px solid #EDEEF5">
              <p style="margin:0 0 4px;font-size:12.5px;font-weight:700;color:#5A5E76">{{ s.label }}</p>
              <p style="margin:0;font-size:19px;font-weight:800;letter-spacing:-.4px">{{ s.value }}</p>
            </div>
          </sc-for>
        </div>
        <div style="display:flex;gap:9px;flex-wrap:wrap">
          <button type="button" onClick="{{ qv.open }}" style="flex:1;min-height:48px;border-radius:11px;border:0;background:#6C63C7;color:#fff;font:inherit;font-size:15px;font-weight:700;cursor:pointer">Open profile</button>
          <button type="button" onClick="{{ closeQuickView }}" style="min-height:48px;padding:0 16px;border-radius:11px;border:1px solid #E3E5EE;background:#fff;font:inherit;font-size:15px;font-weight:700;color:#14152B;cursor:pointer">Close</button>
        </div>
      </aside>
    </div>
  </sc-if>

  <sc-if value="{{ toast }}" hint-placeholder-val="{{ false }}">
    <div style="position:absolute;left:14px;right:14px;bottom:{{ toastBottom }};z-index:90;display:flex;justify-content:center;pointer-events:none">
      <div style="display:flex;align-items:center;gap:9px;max-width:420px;padding:12px 15px;border-radius:12px;background:#14152B;color:#fff;font-size:14.5px;font-weight:700;animation:fadeUp 160ms ease-out">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#7BE3AE" stroke-width="2.6" style="flex:none"><path d="m5 13 4 4 10-10"></path></svg>
        <span>{{ toast }}</span>
      </div>
    </div>
  </sc-if>

</div>
</x-dc>
<script type="text/x-dc" data-dc-script>
const ICON = {
  dashboard: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7.5" height="8" rx="2"/><rect x="13.5" y="3" width="7.5" height="5" rx="2"/><rect x="13.5" y="10.5" width="7.5" height="10.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/></svg>',
  members: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.6"/><path d="M2.5 20c.6-3.7 3.3-5.6 6.5-5.6s5.9 1.9 6.5 5.6"/><path d="M17 5.2a3.2 3.2 0 0 1 0 6.2M18.4 14.6c2 .7 3.1 2.5 3.4 5.4"/></svg>',
  payments: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19"/></svg>',
  analytics: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  settings: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2.6M12 18.9v2.6M21.5 12h-2.6M5.1 12H2.5M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8M18.7 18.7l-1.8-1.8M7.1 7.1 5.3 5.3"/></svg>',
  scan: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6C63C7" stroke-width="2"><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M3 12h18"/></svg>',
  add: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6C63C7" stroke-width="2"><circle cx="10" cy="8" r="3.6"/><path d="M3.5 20c.6-3.7 3.3-5.6 6.5-5.6 1 0 2 .2 2.8.5M18 14v6M15 17h6"/></svg>',
  rupee: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6C63C7" stroke-width="2"><path d="M7 4h10M7 8.5h10M15.5 4c0 4.2-2.6 6.2-6 6.2h-.7L16 20"/></svg>',
  inbox: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6C63C7" stroke-width="2"><path d="M3 13h5l1.6 2.6h4.8L16 13h5"/><path d="M4.4 5.6 3 13v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4l-1.4-7.4A2 2 0 0 0 17.6 4H6.4a2 2 0 0 0-2 1.6Z"/></svg>',
  gear: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6C63C7" stroke-width="2"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.4M12 18.6V21M21 12h-2.4M5.4 12H3"/></svg>'
};

const T = {
  en: { dashboard:'Dashboard', members:'Members', payments:'Payments', analytics:'Analytics', settings:'Settings',
    scan:'Scan QR', addMember:'Add Member', recordPayment:'Record Payment', inquiries:'Inquiries',
    search:'Search members, staff, payments', searchMembers:'Search by name or phone', quickActions:'Quick actions',
    staff:'Staff', attendance:'Attendance', whatsapp:'WhatsApp', recycleBin:'Recycle Bin', subscription:'Subscription',
    viewAll:'View all', save:'Save changes', next:'Next', back:'Back', cancel:'Cancel',
    active:'Active', expiring:'Expiring', expired:'Expired', revenue:'Revenue', dues:'Dues', inGym:'In gym now' },
  te: { dashboard:'డాష్‌బోర్డ్', members:'సభ్యులు', payments:'చెల్లింపులు', analytics:'విశ్లేషణలు', settings:'సెట్టింగ్‌లు',
    scan:'QR స్కాన్', addMember:'సభ్యుడిని జోడించండి', recordPayment:'చెల్లింపు నమోదు', inquiries:'విచారణలు',
    search:'సభ్యులు, సిబ్బంది, చెల్లింపులు వెతకండి', searchMembers:'పేరు లేదా ఫోన్‌తో వెతకండి', quickActions:'త్వరిత చర్యలు',
    staff:'సిబ్బంది', attendance:'హాజరు', whatsapp:'వాట్సాప్', recycleBin:'రీసైకిల్ బిన్', subscription:'సబ్‌స్క్రిప్షన్',
    viewAll:'అన్నీ చూడండి', save:'మార్పులు సేవ్ చేయండి', next:'తదుపరి', back:'వెనుకకు', cancel:'రద్దు',
    active:'క్రియాశీల', expiring:'గడువు ముగుస్తోంది', expired:'గడువు ముగిసింది', revenue:'ఆదాయం', dues:'బకాయిలు', inGym:'ఇప్పుడు జిమ్‌లో' },
  kn: { dashboard:'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್', members:'ಸದಸ್ಯರು', payments:'ಪಾವತಿಗಳು', analytics:'ವಿಶ್ಲೇಷಣೆ', settings:'ಸೆಟ್ಟಿಂಗ್‌ಗಳು',
    scan:'QR ಸ್ಕ್ಯಾನ್', addMember:'ಸದಸ್ಯರನ್ನು ಸೇರಿಸಿ', recordPayment:'ಪಾವತಿ ದಾಖಲಿಸಿ', inquiries:'ವಿಚಾರಣೆಗಳು',
    search:'ಸದಸ್ಯರು, ಸಿಬ್ಬಂದಿ, ಪಾವತಿ ಹುಡುಕಿ', searchMembers:'ಹೆಸರು ಅಥವಾ ಫೋನ್‌ನಿಂದ ಹುಡುಕಿ', quickActions:'ತ್ವರಿತ ಕ್ರಿಯೆಗಳು',
    staff:'ಸಿಬ್ಬಂದಿ', attendance:'ಹಾಜರಾತಿ', whatsapp:'ವಾಟ್ಸಾಪ್', recycleBin:'ಮರುಬಳಕೆ ತೊಟ್ಟಿ', subscription:'ಚಂದಾದಾರಿಕೆ',
    viewAll:'ಎಲ್ಲವನ್ನೂ ನೋಡಿ', save:'ಬದಲಾವಣೆ ಉಳಿಸಿ', next:'ಮುಂದೆ', back:'ಹಿಂದೆ', cancel:'ರದ್ದು',
    active:'ಸಕ್ರಿಯ', expiring:'ಅವಧಿ ಮುಗಿಯುತ್ತಿದೆ', expired:'ಅವಧಿ ಮುಗಿದಿದೆ', revenue:'ಆದಾಯ', dues:'ಬಾಕಿ', inGym:'ಈಗ ಜಿಮ್‌ನಲ್ಲಿ' }
};

const STATUS = {
  active:   { bg:'#EAF6EF', fg:'#0F5E3C' },
  expiring: { bg:'#FDF1E2', fg:'#8A4B00' },
  expired:  { bg:'#FBEBE9', fg:'#A62C22' }
};

class Component extends DCLogic {
  html(s) { return { __html: s }; }

  renderVals() {
    const P = this.props || {};
    const a = P.app || {}, act = P.actions || {};
    const mode = P.mode || 'desktop', isDesktop = mode === 'desktop';
    const t = T[a.lang || 'en'] || T.en;
    const r = a.route || 'dashboard';
    const role = a.role || 'owner';
    const money = n => '₹' + Number(n).toLocaleString('en-IN');

    const nav = [
      ['dashboard', t.dashboard, ICON.dashboard],
      ['members', t.members, ICON.members],
      ['payments', t.payments, ICON.payments],
      ['analytics', t.analytics, ICON.analytics],
      ['settings', t.settings, ICON.settings]
    ];
    const group = { dashboard:['dashboard','leads','setup'], members:['members','member','addMember','editMember','recycleBin','memberPayments'],
      payments:['payments','addPayment','paymentDetail'], analytics:['analytics','attendance','kiosk'],
      settings:['settings','subscription','staff','addStaff','whatsapp','scanner','tablet'] };
    const activeTop = Object.keys(group).find(k => group[k].includes(r)) || (r.indexOf('set:') === 0 ? 'settings' : 'dashboard');

    const navItems = nav.map(([id, label, icon]) => ({
      id, label, icon: this.html(icon), go: () => act.go(id),
      bg: activeTop === id ? '#F0EFFA' : 'transparent',
      fg: activeTop === id ? '#4A438F' : '#3A3E55'
    }));

    const quickItems = [
      { id:'scanner', label:t.scan, icon:this.html(ICON.scan), go:() => act.go('scanner') },
      { id:'addMember', label:t.addMember, icon:this.html(ICON.add), go:() => act.go('addMember') },
      { id:'addPayment', label:t.recordPayment, icon:this.html(ICON.rupee), go:() => act.go('addPayment') },
      { id:'leads', label:t.inquiries, icon:this.html(ICON.inbox), go:() => act.go('leads'), badge: a.newLeads }
    ];

    const members = a.members || [];
    const decorate = m => Object.assign({}, m, {
      color: m.color, statusLabel: t[m.status], bg: STATUS[m.status].bg, fg: STATUS[m.status].fg,
      sub: m.phone + ' · ' + m.plan,
      expiryLine: m.status === 'expired' ? 'Expired ' + m.expiry : 'Expires ' + m.expiry,
      open: () => act.go('member', m.id),
      quick: () => act.quickView(m.id),
      remind: () => act.remind(m.name),
      toggleSel: () => act.toggleSel(m.id),
      selMark: (a.sel || []).indexOf(m.id) >= 0 ? '✓' : '',
      selBd: (a.sel || []).indexOf(m.id) >= 0 ? '#6C63C7' : '#C9CCDC',
      selBg: (a.sel || []).indexOf(m.id) >= 0 ? '#6C63C7' : '#fff'
    });

    // ---- filtering / sorting
    const q = (a.q || '').toLowerCase();
    let filtered = members.filter(m => {
      if (a.filter !== 'all' && m.status !== a.filter) return false;
      if (!q) return true;
      return m.name.toLowerCase().indexOf(q) >= 0 || m.phone.indexOf(q) >= 0 || m.plan.toLowerCase().indexOf(q) >= 0;
    });
    const sortLabels = { name:'Name', expiry:'Expiry', due:'Dues' };
    filtered = filtered.slice().sort((x, y) =>
      a.sort === 'name' ? x.name.localeCompare(y.name) :
      a.sort === 'expiry' ? x.expiryIdx - y.expiryIdx : y.due - x.due);
    const limit = a.limit || 20;
    const memberRows = filtered.slice(0, limit).map(decorate);

    const chips = [['all','All'],['active',t.active],['expiring',t.expiring],['expired',t.expired]];
    const filterChips = chips.map(([id, label]) => ({
      id, label, go: () => act.setFilter(id),
      bd: a.filter === id ? '#6C63C7' : '#E3E5EE',
      bg: a.filter === id ? '#6C63C7' : '#fff',
      fg: a.filter === id ? '#fff' : '#14152B'
    }));

    // ---- revenue series
    const series = a.revenue || [];
    const max = Math.max.apply(null, series.concat([1]));
    const pts = series.map((v, i) => [i * (320 / Math.max(series.length - 1, 1)), 116 - (v / max) * 100]);
    const revLine = pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const revArea = 'M0,120 ' + pts.map(p => 'L' + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + ' L320,120 Z';

    const stats = a.stats || {};
    const dashStats = [
      { label:'Revenue this month', value: money(stats.revenue || 0), delta:'+12% vs last month', color:'#14152B' },
      { label: t.active, value: String(stats.active || 0), delta:'of ' + members.length + ' total', color:'#14152B' },
      { label: t.expiring + ' (7 days)', value: String(stats.expiring || 0), delta:'needs a reminder', color:'#8A4B00' },
      { label: t.inGym, value: String(stats.inGym || 0), delta:'live check-ins', color:'#4A438F' }
    ];

    const expiringSoon = members.filter(m => m.status === 'expiring').slice(0, 4).map(decorate);

    const actionItems = [
      { dot:'#C1362C', title: (stats.dueCount || 0) + ' members have unpaid dues', sub: money(stats.dueTotal || 0) + ' outstanding', cta:'Collect', go:() => act.go('payments') },
      { dot:'#D08700', title: (stats.expiring || 0) + ' memberships expire this week', sub:'Send WhatsApp reminders', go:() => act.go('members', null, 'expiring'), cta:'Review' },
      { dot:'#6C63C7', title: (a.newLeads || 0) + ' new enquiries waiting', sub:'Oldest is 2 days old', cta:'Open', go:() => act.go('leads') }
    ];

    // ---- wizard
    const wiz = a.wiz || {};
    const wizSteps = (wiz.steps || []).map((label, i) => ({
      label, num: String(i + 1),
      dot: i < wiz.step ? '#6C63C7' : i === wiz.step ? '#6C63C7' : '#D6D9E6',
      fg: i <= wiz.step ? '#14152B' : '#8A8FA6',
      numFg: i <= wiz.step ? '#fff' : '#5A5E76',
      chipBg: i === wiz.step ? '#F0EFFA' : '#fff',
      chipBd: i === wiz.step ? '#D9D5F2' : '#E3E5EE'
    }));
    const wizFields = (wiz.fields || []).map(f => ({
      label: f.label, value: (wiz.data || {})[f.key] || '', placeholder: f.placeholder || '',
      isText: f.type === 'text', isSelect: f.type === 'select', isNote: f.type === 'note',
      required: !!f.required, optional: !f.required && f.type !== 'note',
      options: (f.options || []).map(o => ({ value:o, label:o })),
      error: (wiz.errors || {})[f.key] || '',
      bd: (wiz.errors || {})[f.key] ? '#C1362C' : '#E3E5EE',
      onChange: e => act.wizSet(f.key, e.target.value)
    }));

    // ---- settings hub
    const S = (id, label, sub, icon) => ({ id, label, sub, icon: this.html(icon || ICON.gear), go: () => act.go('set:' + id) });
    const R = (route, label, sub, icon) => ({ id: route, label, sub, icon: this.html(icon || ICON.gear), go: () => act.go(route) });
    const A = (label, sub, msg, icon) => ({ id: label, label, sub, icon: this.html(icon || ICON.gear), go: () => act.toastMsg(msg) });
    const settingsGroups = [
      { label:'Gym setup', items:[
        S('profile','Gym Profile','Name, address, contact, hours, social & map'),
        S('gallery','Gym Gallery','Photos shown on your public page'),
        R('plans','Membership Plans','Create, price and retire plans'),
        S('batches','Batches & Timings','Morning / evening slots and capacity'),
        S('numbering','Plan & Enrollment Numbering','Enrollment ID format and next number'),
        S('card','Membership Card Design','Pick the card used everywhere'),
        S('equipment','Gym Equipment','Inventory, quantities and service dates'),
        S('announcements','Notices & Announcements','Message shown to members in the app'),
        S('workout','Diet & Workout Templates','Plans trainers can assign') ] },
      { label:'Money & business', items:[
        S('tax','Tax & Invoice Settings','GSTIN, rate, receipt header and footer'),
        S('discounts','Discounts & Offers','Standing offers and coupon codes'),
        S('gateway','Payment Methods & UPI','UPI ID, cash, card and online collection'),
        S('expenses','Expenses & Payroll','Rent, salaries, electricity and upkeep'),
        S('landing','Landing Page / Public Profile','What visitors see on your gym link'),
        R('whatsapp','WhatsApp / Communications','Message log, templates, sending window', ICON.inbox),
        R('subscription', t.subscription + ' & Billing','Your Gymloop plan, invoices and payment method', ICON.rupee) ] },
      { label:'People & operations', items:[
        R('staff','Team & Access','Staff list, roles and permissions', ICON.members),
        S('checkin','Attendance & Check-in Rules','Scan window, duplicate entries, grace period'),
        R('kiosk','Kiosk Devices','Pair and manage check-in tablets', ICON.scan),
        R('attendance', t.attendance,'Occupancy, logs and streaks', ICON.analytics),
        R('recycleBin', t.recycleBin,'Restore members deleted in the last 30 days') ] },
      { label:'Account & app', items:[
        S('account','Account','Your name, login number and password'),
        S('language','Language','App language and member message language'),
        S('notifications','Notifications','What you get alerted about, and when'),
        S('backup','Backup, Export & Restore','CSV exports and automatic backups'),
        S('data','Data & Privacy','Data retention and closing your gym account') ] },
      { label:'Support & about', items:[
        A('Help & Support','Call, WhatsApp or email the Gymloop team','Opening support chat…'),
        A('Share Gymloop','Send the app to another gym owner','Share link copied'),
        A('Rate the app','Leave a rating on the Play Store','Opening the Play Store…'),
        A('Terms & Privacy Policy','What we do with your gym data','Opening terms & privacy…'),
        A('About Gymloop','Version 3.2.1 · build 418','Gymloop 3.2.1 · build 418'),
        A('Log out','Sign out on this device only','Logged out of this device'),
        A('Delete gym account','Permanently remove your gym and its data','Deleting an account needs an OTP — we sent one to your number') ] }
    ];

    const setDef = a.settingsDef || null;
    const setSections = setDef ? (setDef.sections || []).map(sec => ({
      label: sec.label,
      fields: (sec.fields || []).map(f => ({
        label: f.label,
        value: (a.settingsValues || {})[f.key] != null ? (a.settingsValues || {})[f.key] : (f.value || ''),
        isText: f.type === 'text', isSelect: f.type === 'select', isToggle: f.type === 'toggle',
        options: (f.options || []).map(o => ({ value:o, label:o })),
        trackBg: (a.settingsValues || {})[f.key] ? '#6C63C7' : '#C9CCDC',
        knobPos: (a.settingsValues || {})[f.key] ? 'flex-end' : 'flex-start',
        onToggle: () => act.setSetting(f.key, !(a.settingsValues || {})[f.key]),
        onChange: e => act.setSetting(f.key, e.target.value)
      }))
    })) : [];

    // ---- generic list screens
    const L = a.listScreen || null;
    const listRows = L ? (L.rows || []).map(row => Object.assign({}, row, { go: row.route ? () => act.go(row.route, row.param) : null })) : [];

    // ---- attendance heat grid
    const heat = a.heat || [];
    const heatCells = [];
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    days.forEach((d, di) => {
      heatCells.push({ isLabel:true, label:d });
      for (let h = 0; h < 12; h++) {
        const v = heat[di * 12 + h] || 0;
        const bg = v > .75 ? '#6C63C7' : v > .5 ? '#9089D8' : v > .25 ? '#C9C5EC' : '#F0EFFA';
        heatCells.push({ isCell:true, bg, title: d + ' ' + (h + 6) + ':00' });
      }
    });

    const planMix = (a.planMix || []).map(p => ({ label:p.label, count:p.count + ' members', pct:p.pct + '%', color:p.color }));

    const qvm = a.quickViewMember;
    const mpm = a.profileMember;
    const wrap = m => m ? Object.assign({}, decorate(m), {
      stats: [
        { label:'Plan', value:m.plan.split(' ')[0] },
        { label:'Expires', value:m.expiry },
        { label:'Dues', value: money(m.due) },
        { label:'Last visit', value:m.lastVisit }
      ],
      payments: (m.recent || []).map(p => ({ label:p.label, date:p.date, method:p.method, amount: money(p.amount) }))
    }) : null;

    const qaStyle = a.quickActionStyle || 'fab';

    return {
      t, isDesktop, isMobile: !isDesktop, navItems, quickItems,
      langLabel: { en:'EN', te:'తె', kn:'ಕ' }[a.lang || 'en'],
      roleLabel: { owner:'Owner', manager:'Manager', receptionist:'Receptionist', trainer:'Trainer' }[role],
      roleNote: { owner:'Full access to every screen and action.', manager:'Full member and payment actions, no billing.',
        receptionist:'Can add members and take payments; cannot delete.', trainer:'Read-only member information.' }[role],
      alertCount: String(a.newLeads || 0),
      loading: !!a.loading, ready: !a.loading,
      isDashboard: r === 'dashboard', isLeads: r === 'leads', isMembers: r === 'members', isMember: r === 'member',
      isWizard: ['addMember','editMember','addStaff','addPayment'].indexOf(r) >= 0,
      isListScreen: !!L, isAnalytics: r === 'analytics' || r === 'attendance',
      isSettingsHub: r === 'settings', isSettingsDetail: r.indexOf('set:') === 0,
      isScanner: r === 'scanner', isTablet: r === 'tablet', isSetup: r === 'setup', isSubscription: r === 'subscription',
      dashPriorityFirst: (a.dashboardLayout || 'priority') === 'priority',
      dashKpiFirst: (a.dashboardLayout || 'priority') === 'kpi',
      todayLine: a.todayLine, dashStats, actionItems, expiringSoon,
      revLine, revArea, revTotal: money(series.reduce((s, v) => s + v, 0)),
      showSetupCard: !!a.showSetupCard, setupLine: a.setupLine, setupPct: a.setupPct + '%',
      setupItems: (a.setupItems || []).map((s, i) => ({
        label:s.label, sub:s.sub, mark: s.done ? '✓' : '', bd: s.done ? '#6C63C7' : '#C9CCDC',
        bg: s.done ? '#6C63C7' : '#fff', fg: s.done ? '#5A5E76' : '#14152B', toggle: () => act.toggleSetup(i)
      })),
      leadStats: a.leadStats || [], leadRows: (a.leadRows || []).map(l => Object.assign({}, l, { advance: () => act.advanceLead(l.id) })),
      leadTabs: (a.leadTabs || []).map(tb => ({ label:tb.label, go:() => act.setLeadTab(tb.id),
        bd: a.leadTab === tb.id ? '#6C63C7' : '#E3E5EE', bg: a.leadTab === tb.id ? '#6C63C7' : '#fff', fg: a.leadTab === tb.id ? '#fff' : '#14152B' })),
      q: a.q || '', memberRows, filterChips, sortLabel: sortLabels[a.sort] || 'Name',
      memberCountLine: filtered.length + ' of ' + members.length + ' members',
      noResults: filtered.length === 0, hasMore: filtered.length > limit,
      hasSelection: (a.sel || []).length > 0, selCount: (a.sel || []).length,
      mp: wrap(mpm) || {}, qv: wrap(qvm) || {}, sampleMember: wrap(members[0]) || {},
      cardStyle: a.cardStyle || 'brand',
      cardStyleLabel: { brand:'Brand purple', light:'Light', dark:'Dark' }[a.cardStyle || 'brand'],
      profileCols: (a.profileLayout || 'split') === 'stacked' ? '1fr' : 'repeat(auto-fit,minmax(290px,1fr))',
      isReadOnly: role === 'trainer', showFullActions: role === 'owner' || role === 'manager',
      isRestricted: role === 'receptionist', canDelete: role === 'owner', canEdit: role !== 'trainer',
      wizTitle: wiz.title, wizSteps, wizFields, wizStepTitle: wiz.stepTitle,
      wizCanBack: wiz.step > 0, wizNextLabel: wiz.nextLabel || t.next,
      wizDone: !!wiz.done, wizActive: !wiz.done, wizDoneTitle: wiz.doneTitle, wizDoneSub: wiz.doneSub,
      wizIsSummary: !!wiz.isSummary,
      wizSummaryRows: (wiz.summaryRows || []).map(r => ({ label:r.label, value:r.value, fg: r.muted ? '#8A8FA6' : '#14152B', rowBg: r.muted ? '#FAFAFD' : '#fff' })),
      wizStepLabel: wiz.stepTitle, wizStepCount: 'Step ' + ((wiz.step || 0) + 1) + ' of ' + ((wiz.steps || []).length || 1),
      wizPct: Math.round(((wiz.step || 0) + 1) / Math.max((wiz.steps || []).length, 1) * 100) + '%',
      stepDots: (a.stepIndicator || 'numbered') === 'dots',
      stepNumbered: (a.stepIndicator || 'numbered') === 'numbered',
      stepProgress: (a.stepIndicator || 'numbered') === 'progress',
      listTitle: L ? L.title : '', listSub: L ? L.sub : '', listKpis: L ? (L.kpis || []) : (a.analyticsKpis || []),
      listHasKpis: !!(L && L.kpis), listHasChart: !!(L && L.chart), listRows,
      listHasPrimary: !!(L && L.primary), listPrimaryLabel: L && L.primary ? L.primary.label : '',
      listPrimary: L && L.primary ? () => act.go(L.primary.route) : null,
      listEmpty: !!(L && listRows.length === 0), listEmptyTitle: L ? (L.emptyTitle || 'Nothing here yet') : '',
      listEmptySub: L ? (L.emptySub || '') : '',
      analyticsTitle: r === 'attendance' ? t.attendance : t.analytics,
      analyticsSub: r === 'attendance' ? 'Occupancy, check-in logs and streaks' : 'Revenue, growth, retention and plan mix',
      heatCells, planMix,
      settingsGroups, setTitle: setDef ? setDef.title : '', setSub: setDef ? setDef.sub : '',
      setSections, setShowCard: !!(setDef && setDef.showCard),
      invoices: a.invoices || [], inGymCount: String(stats.inGym || 0), checkinsToday: String(stats.checkins || 0),
      qaFab: qaStyle === 'fab', qaBar: qaStyle === 'bar', qaSheet: qaStyle === 'sheet',
      quickOpen: !!a.quickOpen, quickGlyph: a.quickOpen ? '×' : '+',
      quickSheetOpen: qaStyle === 'sheet' && !!a.quickOpen,
      mainPadBottom: isDesktop ? '18px' : (qaStyle === 'fab' ? '96px' : '146px'),
      toastBottom: isDesktop ? '20px' : '150px',
      searchOpen: !!a.searchOpen, gq: a.gq || '', globalResults: (a.globalResults || []).map(g => Object.assign({}, g, { go: () => act.go(g.route, g.param) })),
      noGlobalResults: (a.globalResults || []).length === 0,
      quickViewOpen: !!qvm, toast: a.toast || '',
      openSearch: act.openSearch, closeSearch: act.closeSearch, onGlobalSearch: e => act.setGq(e.target.value),
      closeQuickView: act.closeQuickView, toggleQuick: act.toggleQuick, closeQuick: act.closeQuick,
      toggleNotif: () => act.go('leads'), goScanner: () => act.go('scanner'),
      shareCard: act.shareCard, goCardDesign: () => act.go('set:card'),
      onSearch: e => act.setQ(e.target.value), cycleSort: act.cycleSort, resetFilters: act.resetFilters,
      loadMore: act.loadMore, exportMembers: () => act.exportCsv('members'), exportList: () => act.exportCsv('list'),
      clearSel: act.clearSel, bulkRemind: act.bulkRemind,
      goMembers: () => act.go('members'), goAddMember: () => act.go('addMember'), goEditMember: () => act.go('editMember'),
      goRecordPayment: () => act.go('addPayment'), goRecycle: () => act.go('recycleBin'),
      goAnalytics: () => act.go('analytics'), goExpiring: () => act.go('members', null, 'expiring'),
      goMemberPayments: () => act.go('memberPayments'), goSettings: () => act.go('settings'), goSetup: () => act.go('setup'),
      dismissSetup: act.dismissSetup, toggleSetup: act.toggleSetup,
      openAddLead: () => act.go('addLead'), openKpiPicker: act.openKpiPicker,
      remindThis: () => act.remind(mpm ? mpm.name : ''), deleteThis: act.deleteMember,
      wizNext: act.wizNext, wizBack: act.wizBack, cancelWizard: act.cancelWizard, finishWizard: act.finishWizard,
      saveSettings: act.saveSettings, simulateScan: act.simulateScan, overrideCheckin: act.overrideCheckin,
      launchTablet: act.launchTablet, toastUpgrade: act.toastUpgrade
    };
  }
}
</script>
</body>
</html>

```


---

## MembershipCard.dc.html

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<div style="width:100%;font-family:Manrope,'Noto Sans Telugu','Noto Sans Kannada',system-ui,sans-serif">

  <sc-if value="{{ isBrand }}" hint-placeholder-val="{{ true }}">
    <div style="border-radius:16px;background:#6C63C7;color:#fff;padding:18px;display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
        <div style="min-width:0">
          <p style="margin:0;font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.75)">{{ gym }}</p>
          <p style="margin:5px 0 0;font-size:22px;font-weight:800;letter-spacing:-.4px;line-height:1.15">{{ name }}</p>
        </div>
        <div style="flex:none;width:52px;height:52px;border-radius:10px;background:#fff;display:grid;grid-template-columns:repeat(5,1fr);grid-template-rows:repeat(5,1fr);gap:2px;padding:5px">
          <sc-for list="{{ qr }}" as="c" hint-placeholder-count="25">
            <span style="border-radius:1px;background:{{ c.bg }}"></span>
          </sc-for>
        </div>
      </div>
      <div style="display:flex;gap:20px;flex-wrap:wrap">
        <div><p style="margin:0;font-size:11.5px;font-weight:700;color:rgba(255,255,255,.72)">Plan</p><p style="margin:3px 0 0;font-size:15px;font-weight:800">{{ plan }}</p></div>
        <div><p style="margin:0;font-size:11.5px;font-weight:700;color:rgba(255,255,255,.72)">Valid till</p><p style="margin:3px 0 0;font-size:15px;font-weight:800">{{ expiry }}</p></div>
        <div><p style="margin:0;font-size:11.5px;font-weight:700;color:rgba(255,255,255,.72)">Member ID</p><p style="margin:3px 0 0;font-size:15px;font-weight:800">{{ memberId }}</p></div>
      </div>
    </div>
  </sc-if>

  <sc-if value="{{ isLight }}" hint-placeholder-val="{{ false }}">
    <div style="border-radius:16px;background:#fff;border:1px solid #E3E5EE;padding:18px;display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;align-items:center;gap:12px">
        <span style="flex:none;width:48px;height:48px;border-radius:24px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;background:{{ color }}">{{ initials }}</span>
        <div style="flex:1;min-width:0">
          <p style="margin:0;font-size:11.5px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#8A8FA6">{{ gym }}</p>
          <p style="margin:3px 0 0;font-size:20px;font-weight:800;letter-spacing:-.4px;color:#14152B">{{ name }}</p>
        </div>
        <div style="flex:none;width:48px;height:48px;border-radius:9px;border:1px solid #E3E5EE;display:grid;grid-template-columns:repeat(5,1fr);grid-template-rows:repeat(5,1fr);gap:2px;padding:5px">
          <sc-for list="{{ qr }}" as="c" hint-placeholder-count="25">
            <span style="border-radius:1px;background:{{ c.bgDark }}"></span>
          </sc-for>
        </div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <span style="padding:7px 12px;border-radius:10px;background:#F5F6FA;font-size:13.5px;font-weight:700;color:#14152B">{{ plan }}</span>
        <span style="padding:7px 12px;border-radius:10px;background:#F5F6FA;font-size:13.5px;font-weight:700;color:#14152B">Valid till {{ expiry }}</span>
        <span style="padding:7px 12px;border-radius:10px;background:#F5F6FA;font-size:13.5px;font-weight:700;color:#14152B">{{ memberId }}</span>
      </div>
    </div>
  </sc-if>

  <sc-if value="{{ isDark }}" hint-placeholder-val="{{ false }}">
    <div style="border-radius:16px;background:#14152B;color:#fff;padding:18px;display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <p style="margin:0;font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.6)">{{ gym }}</p>
        <span style="padding:5px 10px;border-radius:20px;background:#6C63C7;font-size:11.5px;font-weight:800">{{ plan }}</span>
      </div>
      <p style="margin:0;font-size:30px;font-weight:800;letter-spacing:-1px;line-height:1.05">{{ name }}</p>
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px">
        <div style="display:flex;gap:20px;flex-wrap:wrap">
          <div><p style="margin:0;font-size:11.5px;font-weight:700;color:rgba(255,255,255,.6)">Valid till</p><p style="margin:3px 0 0;font-size:16px;font-weight:800">{{ expiry }}</p></div>
          <div><p style="margin:0;font-size:11.5px;font-weight:700;color:rgba(255,255,255,.6)">Member ID</p><p style="margin:3px 0 0;font-size:16px;font-weight:800">{{ memberId }}</p></div>
        </div>
        <div style="flex:none;width:50px;height:50px;border-radius:9px;background:#fff;display:grid;grid-template-columns:repeat(5,1fr);grid-template-rows:repeat(5,1fr);gap:2px;padding:5px">
          <sc-for list="{{ qr }}" as="c" hint-placeholder-count="25">
            <span style="border-radius:1px;background:{{ c.bgDark }}"></span>
          </sc-for>
        </div>
      </div>
    </div>
  </sc-if>

</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props="{&quot;$preview&quot;:{&quot;width&quot;:420,&quot;height&quot;:200},&quot;member&quot;:{&quot;editor&quot;:null,&quot;tsType&quot;:&quot;{ id:number; name:string; plan:string; expiry:string; initials:string; color:string }&quot;},&quot;variant&quot;:{&quot;editor&quot;:&quot;enum&quot;,&quot;options&quot;:[&quot;brand&quot;,&quot;light&quot;,&quot;dark&quot;],&quot;default&quot;:&quot;brand&quot;,&quot;tsType&quot;:&quot;'brand'|'light'|'dark'&quot;},&quot;gym&quot;:{&quot;editor&quot;:&quot;text&quot;,&quot;default&quot;:&quot;Iron Peak Fitness&quot;,&quot;tsType&quot;:&quot;string&quot;}}">
class Component extends DCLogic {
  renderVals() {
    const m = this.props.member || {};
    const v = this.props.variant || 'brand';
    const seed = (m.id || 1) * 2654435761 % 4294967296;
    let x = seed || 12345;
    const qr = [];
    for (let i = 0; i < 25; i++) {
      x = (x * 1103515245 + 12345) % 2147483648;
      const on = ((x >> 8) & 1) === 1 || i === 0 || i === 4 || i === 20;
      qr.push({ bg: on ? '#14152B' : 'rgba(20,21,43,.12)', bgDark: on ? '#14152B' : '#E3E5EE' });
    }
    return {
      isBrand: v === 'brand', isLight: v === 'light', isDark: v === 'dark',
      name: m.name || 'Member name', plan: m.plan || 'Monthly', expiry: m.expiry || '—',
      initials: m.initials || 'M', color: m.color || '#6C63C7',
      memberId: m.enrollNo || ('IPF-' + String(1000 + (m.id || 0))), gym: this.props.gym || 'Your gym', qr
    };
  }
}
</script>
</body>
</html>

```


---

## support.js

```html
// GENERATED from dc-runtime/src/*.ts — do not edit. Rebuild with `cd dc-runtime && bun run build`.
"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/react.ts
  function getReact() {
    const R = window.React;
    if (!R) throw new Error("dc-runtime: window.React is not available yet");
    return R;
  }
  function getReactDOM() {
    const RD = window.ReactDOM;
    if (!RD) throw new Error("dc-runtime: window.ReactDOM is not available yet");
    return RD;
  }
  var h = ((...args) => getReact().createElement(
    ...args
  ));

  // src/parse.ts
  function parseDcDocument(doc) {
    const dc = doc.querySelector("x-dc");
    if (!dc) return null;
    const scriptEl = doc.querySelector("script[data-dc-script]");
    const { props, preview } = parseDataProps(
      scriptEl?.getAttribute("data-props") ?? null
    );
    return {
      template: dc.innerHTML,
      js: scriptEl ? scriptEl.textContent || "" : "",
      props,
      preview
    };
  }
  function parseDcText(src) {
    const openMatch = /<x-dc(?:\s[^>]*)?>/.exec(src);
    if (!openMatch) return null;
    const close = src.lastIndexOf("</x-dc>");
    if (close === -1 || close < openMatch.index) return null;
    const template = src.slice(openMatch.index + openMatch[0].length, close);
    const doc = new DOMParser().parseFromString(src, "text/html");
    const scriptEl = doc.querySelector("script[data-dc-script]");
    const { props, preview } = parseDataProps(
      scriptEl?.getAttribute("data-props") ?? null
    );
    return {
      template,
      js: scriptEl ? scriptEl.textContent || "" : "",
      props,
      preview
    };
  }
  function parseDataProps(raw) {
    if (!raw) return { props: null, preview: null };
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { props: null, preview: null };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { props: null, preview: null };
    }
    const obj = parsed;
    const preview = obj.$preview && typeof obj.$preview === "object" ? obj.$preview : null;
    const rest = {};
    for (const k of Object.keys(obj)) {
      if (k[0] !== "$") rest[k] = obj[k];
    }
    return { props: Object.keys(rest).length ? rest : null, preview };
  }
  function dcNameFromPath(pathname) {
    let p = pathname || "";
    try {
      p = decodeURIComponent(p);
    } catch {
    }
    const base = p.split("/").pop() || "Root";
    return base.replace(/\.dc\.html$/, "").replace(/\.html?$/, "") || "Root";
  }

  // src/boot.ts
  var BASE_CSS = `
    .sc-placeholder{background:color-mix(in srgb,currentColor 8%,transparent);
      border:1px solid color-mix(in srgb,currentColor 50%,transparent);
      border-radius:2px;box-sizing:border-box;overflow:hidden}
    @keyframes sc-shine{0%{background-position:100% 50%}100%{background-position:0% 50%}}
    html.sc-dc-streaming .sc-placeholder,
    html.sc-dc-streaming .sc-interp.sc-missing{position:relative;
      background:color-mix(in srgb,currentColor 5%,transparent);
      border-color:transparent}
    html.sc-dc-streaming .sc-placeholder::before,
    html.sc-dc-streaming .sc-interp.sc-missing::before{content:'';
      position:absolute;inset:0;pointer-events:none;
      background:linear-gradient(90deg,rgba(217,119,87,0) 25%,rgba(247,225,211,.95) 37%,rgba(217,119,87,0) 63%);
      background-size:400% 100%;animation:sc-shine 1.4s ease infinite}
    html.sc-dc-streaming .sc-placeholder:nth-child(n+9 of .sc-placeholder)::before,
    html.sc-dc-streaming .sc-interp.sc-missing:nth-child(n+9 of .sc-interp.sc-missing)::before{animation:none;
      background:color-mix(in srgb,currentColor 8%,transparent)}
    .sc-placeholder-error{padding:4px 8px;font:11px/1.4 ui-monospace,monospace;
      color:color-mix(in srgb,currentColor 70%,transparent);word-break:break-word}
    .sc-interp.sc-missing{display:inline-block;width:2em;height:1em;overflow:hidden;
      vertical-align:text-bottom;background:rgba(255,255,255,.3);border:1px solid rgba(0,0,0,.5);
      border-radius:2px;box-sizing:border-box;color:transparent;
      user-select:none}
    .sc-interp.sc-unresolved{font-family:ui-monospace,monospace;font-size:.85em;
      color:color-mix(in srgb,currentColor 50%,transparent);
      background:color-mix(in srgb,currentColor 10%,transparent);border-radius:3px;
      padding:0 3px}
    .sc-host.sc-has-error{position:relative}
    .sc-logic-error{position:absolute;top:8px;left:8px;z-index:2147483647;max-width:60ch;
      padding:6px 10px;background:#b00020;color:#fff;font:12px/1.4 ui-monospace,monospace;
      border-radius:4px;white-space:pre-wrap;pointer-events:none}
    /* Mirrors PRINT_BASELINE_CSS in apps/web deck-stage-export.ts \u2014 keep both
       in sync until dc-runtime regains a build step. */
    @media print {
      @page { margin: 0.5cm; }
      figure, table { break-inside: avoid; }
      #dc-root, #dc-root > .sc-host { height: auto; }
      *, *::before, *::after {
        print-color-adjust: exact; -webkit-print-color-adjust: exact;
        backdrop-filter: none !important; -webkit-backdrop-filter: none !important;
        animation-delay: -99s !important; animation-duration: .001s !important;
        animation-iteration-count: 1 !important; animation-fill-mode: both !important;
        animation-play-state: running !important; transition-duration: 0s !important;
      }
    }
  `;
  var FULL_PAGE_CSS = "html,body{height:100%;margin:0}#dc-root,#dc-root>.sc-host{height:100%}";
  function rootNameForDocument(doc, loc) {
    let bootPath = loc.pathname || "";
    if (!/\.dc\.html?$/i.test(safeDecode(bootPath))) {
      try {
        bootPath = new URL(doc.baseURI || "/").pathname;
      } catch {
      }
    }
    return dcNameFromPath(bootPath);
  }
  function safeDecode(s) {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  }
  function boot(runtime, doc = document) {
    const parsed = parseDcDocument(doc);
    if (!parsed) return null;
    const React = getReact();
    const rootName = rootNameForDocument(doc, location);
    runtime.markFetched(rootName);
    runtime.setRootName(rootName);
    runtime.adoptParsed(rootName, parsed);
    if (!window.__resources) {
      fetch(location.href).then((res) => res.ok ? res.text() : "").then((t) => {
        const raw = t ? parseDcText(t) : null;
        if (raw?.template) runtime.updateHtml(rootName, raw.template);
      }).catch(() => {
      });
    }
    const dc = doc.querySelector("x-dc");
    const hostEl = doc.createElement("div");
    hostEl.id = "dc-root";
    dc.replaceWith(hostEl);
    if (!parsed.preview) {
      const s = doc.createElement("style");
      s.textContent = FULL_PAGE_CSS;
      doc.head.appendChild(s);
    }
    const Root = runtime.getDC(rootName);
    const entry = runtime.registry.get(rootName);
    function StandaloneRoot() {
      const [, setTick] = React.useState(0);
      React.useEffect(() => {
        const sub = () => setTick((n) => n + 1);
        entry.subs.add(sub);
        return () => {
          entry.subs.delete(sub);
        };
      }, []);
      const defaults = React.useMemo(() => {
        const d = {};
        for (const k in entry.propsMeta || {}) {
          const v = entry.propsMeta?.[k]?.default;
          if (v !== void 0) d[k] = v;
        }
        return d;
      }, [entry.propsMeta]);
      return h(Root, { ...defaults, ...entry.propOverrides || {} });
    }
    const ReactDOM = getReactDOM();
    if (ReactDOM.createRoot)
      ReactDOM.createRoot(hostEl).render(h(StandaloneRoot));
    else ReactDOM.render(h(StandaloneRoot), hostEl);
    return rootName;
  }

  // src/expr.ts
  var IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*/;
  var NUMBER_RE = /^-?\d+(\.\d+)?$/;
  function resolve(vals, src) {
    const expr = String(src).trim();
    if (!expr) return void 0;
    if (expr[0] === "(" && expr[expr.length - 1] === ")" && parensWrapWhole(expr)) {
      return resolve(vals, expr.slice(1, -1));
    }
    const eq = findTopLevelEquality(expr);
    if (eq) {
      const lv = resolve(vals, expr.slice(0, eq.index));
      const rv = resolve(vals, expr.slice(eq.index + eq.op.length));
      switch (eq.op) {
        case "===":
          return lv === rv;
        case "!==":
          return lv !== rv;
        case "==":
          return lv == rv;
        default:
          return lv != rv;
      }
    }
    if (expr[0] === "!") return !resolve(vals, expr.slice(1));
    if (expr === "true") return true;
    if (expr === "false") return false;
    if (expr === "null") return null;
    if (expr === "undefined") return void 0;
    if (NUMBER_RE.test(expr)) return Number(expr);
    if (expr.length >= 2 && (expr[0] === '"' || expr[0] === "'") && expr[expr.length - 1] === expr[0]) {
      return expr.slice(1, -1);
    }
    return resolvePath(vals, expr);
  }
  function parensWrapWhole(expr) {
    let depth = 0;
    for (let i = 0; i < expr.length - 1; i++) {
      if (expr[i] === "(") depth++;
      else if (expr[i] === ")") {
        depth--;
        if (depth === 0) return false;
      }
    }
    return true;
  }
  function findTopLevelEquality(expr) {
    let depth = 0;
    for (let i = 0; i < expr.length; i++) {
      const c = expr[i];
      if (c === "[" || c === "(") depth++;
      else if (c === "]" || c === ")") depth--;
      else if (depth === 0 && (c === "=" || c === "!") && expr[i + 1] === "=") {
        if (i > 0 && (expr[i - 1] === "=" || expr[i - 1] === "!")) continue;
        if (!expr.slice(0, i).trim()) continue;
        const op = expr[i + 2] === "=" ? c + "==" : c + "=";
        return { index: i, op };
      }
    }
    return null;
  }
  function resolvePath(vals, expr) {
    const head = expr.match(IDENT_RE);
    if (!head) return void 0;
    let cur = vals == null ? void 0 : vals[head[0]];
    let i = head[0].length;
    while (i < expr.length) {
      if (expr[i] === ".") {
        const m = expr.slice(i + 1).match(IDENT_RE) || expr.slice(i + 1).match(/^\d+/);
        if (!m) return void 0;
        cur = cur == null ? void 0 : cur[m[0]];
        i += 1 + m[0].length;
      } else if (expr[i] === "[") {
        let depth = 1;
        let j = i + 1;
        while (j < expr.length && depth > 0) {
          if (expr[j] === "[") depth++;
          else if (expr[j] === "]") {
            depth--;
            if (depth === 0) break;
          }
          j++;
        }
        if (depth !== 0) return void 0;
        const key = resolve(vals, expr.slice(i + 1, j));
        cur = cur == null ? void 0 : cur[key];
        i = j + 1;
      } else {
        return void 0;
      }
    }
    return cur;
  }

  // src/encode.ts
  var CAMEL_ATTR = "sc-camel-";
  var INLINE_TEXT_TAGS = new Set(
    "a abbr b bdi bdo br cite code del dfn em i ins kbd mark q s samp small span strike strong sub sup u var wbr".split(
      " "
    )
  );
  var RAW_WRAP = {
    select: "sc-raw-select",
    table: "sc-raw-table",
    tbody: "sc-raw-tbody",
    thead: "sc-raw-thead",
    tfoot: "sc-raw-tfoot",
    tr: "sc-raw-tr",
    td: "sc-raw-td",
    th: "sc-raw-th",
    caption: "sc-raw-caption"
  };
  var RAW_UNWRAP = Object.fromEntries(
    Object.entries(RAW_WRAP).map(([k, v]) => [v, k])
  );
  var EVENT_MAP = {
    onclick: "onClick",
    onchange: "onChange",
    oninput: "onInput",
    onsubmit: "onSubmit",
    onkeydown: "onKeyDown",
    onkeyup: "onKeyUp",
    onkeypress: "onKeyPress",
    onmousedown: "onMouseDown",
    onmouseup: "onMouseUp",
    onmouseenter: "onMouseEnter",
    onmouseleave: "onMouseLeave",
    onfocus: "onFocus",
    onblur: "onBlur",
    ondoubleclick: "onDoubleClick",
    oncontextmenu: "onContextMenu",
    onmousemove: "onMouseMove",
    onmouseover: "onMouseOver",
    onmouseout: "onMouseOut",
    onpointerdown: "onPointerDown",
    onpointerup: "onPointerUp",
    onpointermove: "onPointerMove",
    onpointerenter: "onPointerEnter",
    onpointerleave: "onPointerLeave",
    onpointercancel: "onPointerCancel",
    onpointerover: "onPointerOver",
    onpointerout: "onPointerOut",
    ongotpointercapture: "onGotPointerCapture",
    onlostpointercapture: "onLostPointerCapture",
    ontouchstart: "onTouchStart",
    ontouchend: "onTouchEnd",
    ontouchmove: "onTouchMove",
    ontouchcancel: "onTouchCancel",
    ondragstart: "onDragStart",
    ondragend: "onDragEnd",
    ondragenter: "onDragEnter",
    ondragleave: "onDragLeave",
    ondragover: "onDragOver",
    onanimationstart: "onAnimationStart",
    onanimationend: "onAnimationEnd",
    onanimationiteration: "onAnimationIteration",
    ontransitionend: "onTransitionEnd"
  };
  var ATTRS = `(?:[^>"']|"[^"]*"|'[^']*')*`;
  var IMPORT_SELF_CLOSE_RE = new RegExp(
    "<(x-import|dc-import)(" + ATTRS + ")/>",
    "gi"
  );
  var CAMEL_ATTR_RE = /(\s)([a-z]+[A-Z][A-Za-z0-9]*)(\s*=)/g;
  function encodeCamelAttrs(html) {
    return html.replace(
      CAMEL_ATTR_RE,
      (_, sp, name, eq) => sp + CAMEL_ATTR + name.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()) + eq
    );
  }
  function encodeCase(html) {
    html = html.replace(
      IMPORT_SELF_CLOSE_RE,
      (_, t, a) => "<" + t + a + "></" + t + ">"
    );
    html = html.replace(/<helmet(\s|>)/gi, "<sc-helmet$1");
    html = html.replace(/<\/helmet\s*>/gi, "</sc-helmet>");
    html = encodeCamelAttrs(html);
    for (const [real, alias] of Object.entries(RAW_WRAP)) {
      html = html.replace(
        new RegExp("(</?)" + real + "(?=[\\s>])", "gi"),
        "$1" + alias
      );
    }
    return html;
  }
  function kebabToCamel(s) {
    return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }
  function cssToObj(css) {
    const o = {};
    for (const decl of css.split(";")) {
      const i = decl.indexOf(":");
      if (i < 0) continue;
      const prop = decl.slice(0, i).trim();
      o[prop.startsWith("--") ? prop : kebabToCamel(prop)] = decl.slice(i + 1).trim();
    }
    return o;
  }
  function compileAttr(raw) {
    const whole = raw.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/);
    if (whole) {
      const path = whole[1];
      return (vals) => resolve(vals, path);
    }
    if (raw.includes("{{")) {
      const parts = raw.split(/\{\{([\s\S]+?)\}\}/g);
      return (vals) => parts.map((s, i) => i & 1 ? resolve(vals, s) ?? "" : s).join("");
    }
    return () => raw;
  }

  // src/compile.ts
  function collectProps(node, kind, host) {
    const propGetters = [];
    const pseudoClasses = [];
    let hintSize = null;
    for (const { name, value } of [...node.attributes]) {
      if (name === "sc-name" || name === "data-dc-tpl") continue;
      let key = name;
      if (key.startsWith(CAMEL_ATTR))
        key = kebabToCamel(key.slice(CAMEL_ATTR.length));
      if (key === "hint-size") {
        hintSize = value;
        continue;
      }
      if (key.startsWith("style-")) {
        pseudoClasses.push(host.pseudoClass(key.slice(6), value));
        continue;
      }
      if (kind !== "dom") {
        if (key.includes("-") && !(kind === "x-import" && (key.startsWith("aria-") || key.startsWith("data-"))))
          key = kebabToCamel(key);
      } else {
        if (key === "class") key = "className";
        else if (key === "for") key = "htmlFor";
        else if (key.startsWith("on"))
          key = EVENT_MAP[key] || "on" + key[2].toUpperCase() + key.slice(3);
      }
      propGetters.push([key, compileAttr(value)]);
    }
    return { propGetters, pseudoClasses, hintSize };
  }
  var HOST_STYLE_PROPS = /* @__PURE__ */ new Set([
    "position",
    "left",
    "right",
    "top",
    "bottom",
    "inset",
    "width",
    "height",
    "z-index",
    "transform"
  ]);
  function hostPositionStyle(style) {
    const all = typeof style === "string" ? cssToObj(style) : style != null && typeof style === "object" ? style : null;
    if (!all) return void 0;
    const out = {};
    for (const [k, v] of Object.entries(all)) {
      const kebab = k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
      if (HOST_STYLE_PROPS.has(kebab)) out[k] = v;
    }
    return Object.keys(out).length ? out : void 0;
  }
  function compileTemplate(html, host) {
    const tpl = document.createElement("template");
    //! nosemgrep: direct-inner-html-assignment
    tpl.innerHTML = encodeCase(html);
    let tplN = 0;
    (function stamp(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        node.setAttribute("data-dc-tpl", String(tplN++));
      }
      for (const c of node.childNodes) stamp(c);
    })(tpl.content);
    const builders = walkChildren(tpl.content, host);
    const render = ((vals, ctx) => builders.map((b, i) => b(vals || {}, ctx, i)));
    render.__annotated = tpl.innerHTML;
    return render;
  }
  function walkChildren(node, host) {
    return [...node.childNodes].map((c) => walk(c, host)).filter((b) => b != null);
  }
  var SLIDE_ID_VALUE_RE = /^[0-9a-f]{8}$/;
  var DECK_CONTROL_FLOW_RE = /^(sc-if|sc-for|sc-else|dc-import|x-import)$/;
  var DECK_AUX_RE = /^(template|script|style|sc-helmet|helmet)$/;
  function isDeckMountTag(el) {
    if (el.localName === "deck-stage") return true;
    return el.localName === "x-import" && (el.getAttribute("component-from-global-scope") || "") === "deck-stage";
  }
  function walkDeckChildren(el, host) {
    const pairs = [...el.childNodes].map((c) => ({ c, b: walk(c, host) })).filter((p) => p.b !== null);
    const kids = pairs.map((p) => p.b);
    const seen = /* @__PURE__ */ new Set();
    const wsSeen = /* @__PURE__ */ new Map();
    const keys = [];
    const nextSlideId = new Array(pairs.length);
    {
      let upcoming = null;
      for (let j = pairs.length - 1; j >= 0; j--) {
        const n = pairs[j].c;
        if (n.nodeType === Node.ELEMENT_NODE) {
          const t = n.localName;
          upcoming = !DECK_AUX_RE.test(t) && !DECK_CONTROL_FLOW_RE.test(t) ? n.getAttribute("data-om-slide-id") : null;
        }
        nextSlideId[j] = upcoming;
      }
    }
    for (let j = 0; j < pairs.length; j++) {
      const { c } = pairs[j];
      if (c.nodeType === Node.TEXT_NODE) {
        if ((c.nodeValue ?? "").trim() === "") {
          const base = nextSlideId[j] ? "omid-ws:" + nextSlideId[j] : "omid-ws:aux";
          const n = wsSeen.get(base) ?? 0;
          wsSeen.set(base, n + 1);
          keys.push(n === 0 ? base : base + ":" + n);
          continue;
        }
        return { kids, keys: null };
      }
      if (c.nodeType !== Node.ELEMENT_NODE) {
        keys.push(j);
        continue;
      }
      const child = c;
      const tag = child.localName;
      if (DECK_AUX_RE.test(tag)) {
        keys.push(j);
        continue;
      }
      if (DECK_CONTROL_FLOW_RE.test(tag)) return { kids, keys: null };
      const v = child.getAttribute("data-om-slide-id");
      if (!v || !SLIDE_ID_VALUE_RE.test(v) || seen.has(v)) {
        return { kids, keys: null };
      }
      seen.add(v);
      keys.push("omid:" + v);
    }
    return { kids, keys };
  }
  function renderDeckKids(kids, kidKeys, vals, ctx) {
    return kids.map((b, j) => {
      const k = kidKeys ? kidKeys[j] : j;
      const out = b(vals, ctx, k);
      return kidKeys != null && typeof out === "string" ? h(getReact().Fragment, { key: k }, out) : out;
    });
  }
  function walk(node, host) {
    if (node.nodeType === Node.TEXT_NODE) return walkText(node);
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node;
    const tag = el.tagName.toLowerCase();
    if (tag === "sc-for") return walkFor(el, host);
    if (tag === "sc-if") return walkIf(el, host);
    if (tag === "x-import") return walkXImport(el, host);
    if (tag === "sc-helmet") return host.helmet(el);
    if (tag === "dc-import") return walkComponent(el, host);
    return walkElement(el, host);
  }
  var warnedHoles = /* @__PURE__ */ new Set();
  function warnUnresolved(ctx, what) {
    const key = (ctx?.__name || "?") + "\0" + what;
    if (warnedHoles.has(key)) return;
    warnedHoles.add(key);
    console.warn("[dc-runtime] " + (ctx?.__name || "template") + ": " + what);
  }
  function walkText(node) {
    const txt = node.nodeValue ?? "";
    if (!txt.includes("{{")) {
      if (!txt.trim() && !txt.includes(" ")) return null;
      return () => txt;
    }
    const parts = txt.split(/\{\{([\s\S]+?)\}\}/g);
    return (vals, ctx, key) => h(
      getReact().Fragment,
      { key },
      ...parts.map((p, i) => {
        if (!(i & 1)) return p;
        const v = resolve(vals, p);
        if (v === void 0) {
          if (!ctx?.__streamingNow) {
            if (document.body?.hasAttribute("data-dc-editor-on")) {
              return h(
                "span",
                { key: i, className: "sc-interp sc-unresolved" },
                "{{ " + p.trim() + " }}"
              );
            }
            warnUnresolved(
              ctx,
              "{{ " + p.trim() + " }} never resolved \u2014 rendered as empty"
            );
            return null;
          }
          return h(
            "span",
            { key: i, className: "sc-interp sc-missing" },
            p.trim()
          );
        }
        if (getReact().isValidElement(v) || Array.isArray(v)) {
          return h(getReact().Fragment, { key: i }, v);
        }
        if (v === null || typeof v === "boolean") return null;
        return h("span", { key: i, className: "sc-interp" }, String(v));
      })
    );
  }
  function walkFor(el, host) {
    const listGet = compileAttr(el.getAttribute("list") || "");
    const asName = el.getAttribute("as") || "item";
    const hintN = parseInt(el.getAttribute("hint-placeholder-count") || "0", 10);
    const kids = walkChildren(el, host);
    const listSrc = el.getAttribute("list") || "";
    return (vals, ctx, key) => {
      let list = listGet(vals);
      if (!Array.isArray(list)) {
        if (!ctx?.__streamingNow) {
          if (list !== void 0 && list !== null) {
            warnUnresolved(
              ctx,
              'sc-for list="' + listSrc + '" is not an array (' + typeof list + ")"
            );
          }
          list = [];
        } else {
          list = hintN > 0 ? Array(hintN).fill(void 0) : [];
        }
      }
      return h(
        getReact().Fragment,
        { key },
        list.map((item, i) => {
          const sub = { ...vals, [asName]: item, $index: i };
          return h(
            getReact().Fragment,
            { key: i },
            kids.map((b, j) => b(sub, ctx, j))
          );
        })
      );
    };
  }
  function walkIf(el, host) {
    const valGet = compileAttr(el.getAttribute("value") || "");
    const hintRaw = el.getAttribute("hint-placeholder-val");
    const hintGet = hintRaw != null ? compileAttr(hintRaw) : null;
    const kids = walkChildren(el, host);
    return (vals, ctx, key) => {
      let v = valGet(vals);
      if (v === void 0 && hintGet && ctx?.__streamingNow) v = hintGet(vals);
      return v ? h(
        getReact().Fragment,
        { key },
        kids.map((b, j) => b(vals, ctx, j))
      ) : null;
    };
  }
  function walkComponent(el, host) {
    const name = el.getAttribute("name") || el.getAttribute("component") || "";
    el.removeAttribute("name");
    el.removeAttribute("component");
    const tplId = el.getAttribute("data-dc-tpl");
    const styleRaw = el.getAttribute("style");
    el.removeAttribute("style");
    const styleGet = styleRaw != null ? compileAttr(styleRaw) : null;
    const { propGetters, hintSize } = collectProps(el, "dc-import", host);
    const kids = walkChildren(el, host);
    return (vals, ctx, key) => {
      const props = {
        key,
        __hintSize: hintSize,
        __tplId: tplId,
        __hostStyle: styleGet ? hostPositionStyle(styleGet(vals)) : void 0
      };
      for (const [k, g] of propGetters) {
        const v = g(vals);
        if (k === "dcProps") {
          if (v && typeof v === "object") Object.assign(props, v);
          continue;
        }
        props[k] = v;
      }
      if (kids.length) props.children = kids.map((b, j) => b(vals, ctx, j));
      return h(host.component(name), props);
    };
  }
  function walkXImport(el, host) {
    const globalNameGet = compileAttr(
      el.getAttribute("component-from-global-scope") || ""
    );
    const exportNameGet = compileAttr(
      el.getAttribute("component") || el.getAttribute("name") || ""
    );
    const fromRaw = el.getAttribute("from") || (el.getAttribute("component-from-global-scope") ? "" : el.getAttribute("src") || el.getAttribute("import") || "");
    const urls = fromRaw.trim() ? fromRaw.trim().split(/\s+/) : [];
    const url = urls.length ? urls[urls.length - 1] : "";
    const kindOf = (u) => /\.(jsx|tsx)(\?|#|$)/i.test(u) ? "jsx" : "js";
    const tplId = el.getAttribute("data-dc-tpl");
    const styleRaw = el.getAttribute("style");
    el.removeAttribute("style");
    const styleGet = styleRaw != null ? compileAttr(styleRaw) : null;
    const wrap = tplId != null || styleGet != null;
    const { propGetters, hintSize } = collectProps(el, "x-import", host);
    const hasContent = el.children.length > 0 || !!(el.textContent || "").trim();
    const deckKeyed = hasContent && isDeckMountTag(el) ? walkDeckChildren(el, host) : null;
    const kids = deckKeyed ? deckKeyed.kids : hasContent ? walkChildren(el, host) : [];
    const kidKeys = deckKeyed?.keys ?? null;
    const urlBindable = fromRaw.includes("{{");
    if (urls.length && !urlBindable) {
      let prev;
      for (const u of urls) prev = host.loadExternal(kindOf(u), u, prev);
    }
    const evalName = (g, vals) => {
      const v = g(vals);
      const s = v == null ? "" : String(v);
      return s.includes("{{") ? "" : s;
    };
    return (vals, ctx, key) => {
      const globalName = evalName(globalNameGet, vals);
      const name = globalName || evalName(exportNameGet, vals);
      const C = !name || urlBindable ? null : globalName ? host.resolveExternalGlobal(url, globalName) : host.resolveExternal(url, name);
      const hostStyle = styleGet ? hostPositionStyle(styleGet(vals)) : void 0;
      const wrapper = wrap ? {
        key,
        className: "sc-host-x",
        "data-dc-tpl": tplId,
        style: hostStyle || { display: "contents" }
      } : null;
      if (!C) {
        const error = urlBindable ? "x-import `from` cannot contain {{ \u2026 }} \u2014 module URLs are resolved at parse time; use a literal URL" : host.resolveExternalError(url, name);
        const ph = host.placeholder({
          key: wrapper ? void 0 : key,
          name,
          hintSize,
          error
        });
        return wrapper ? h("div", wrapper, ph) : ph;
      }
      const props = wrapper ? {} : { key };
      let unresolvedHole = false;
      for (const [k, g] of propGetters) {
        if (k === "component" || k === "componentFromGlobalScope" || k === "from") {
          continue;
        }
        const v = g(vals);
        if (v === void 0) unresolvedHole = true;
        if (k === "dcProps") {
          if (v && typeof v === "object") Object.assign(props, v);
          continue;
        }
        props[k] = v;
      }
      if (unresolvedHole && ctx?.__htmlStreamingNow) {
        const ph = host.placeholder({
          key: wrapper ? void 0 : key,
          name,
          hintSize,
          error: null
        });
        return wrapper ? h("div", wrapper, ph) : ph;
      }
      if (kids.length) {
        props.children = renderDeckKids(kids, kidKeys, vals, ctx);
      }
      return wrapper ? h("div", wrapper, h(C, props)) : h(C, props);
    };
  }
  function contentKey(el) {
    const clone = el.cloneNode(true);
    for (const d of clone.querySelectorAll("*")) {
      while (d.attributes.length) d.removeAttribute(d.attributes[0].name);
    }
    const s = clone.innerHTML;
    let h2 = 5381;
    for (let i = 0; i < s.length; i++) h2 = (h2 << 5) + h2 + s.charCodeAt(i) | 0;
    return s.length + "." + (h2 >>> 0).toString(36);
  }
  var NEVER_CONTENT_KEYED = new Set(
    "script style textarea option title select canvas iframe video audio".split(
      " "
    )
  );
  var NOT_INLINE_SELECTOR = ":not(" + [...INLINE_TEXT_TAGS].join(",") + ")";
  function walkElement(el, host) {
    const realTag = RAW_UNWRAP[el.localName] || el.localName;
    const tplId = el.getAttribute("data-dc-tpl");
    const inlineOnly = el.childNodes.length > 0 && !NEVER_CONTENT_KEYED.has(realTag) && el.querySelector(NOT_INLINE_SELECTOR) === null;
    const keySuffix = inlineOnly ? "|" + contentKey(el) : "";
    const { propGetters, pseudoClasses } = collectProps(el, "dom", host);
    const deckKeyed = isDeckMountTag(el) ? walkDeckChildren(el, host) : null;
    const kids = deckKeyed ? deckKeyed.kids : walkChildren(el, host);
    const kidKeys = deckKeyed?.keys ?? null;
    return (vals, ctx, key) => {
      const props = {
        key: key + keySuffix,
        "data-dc-tpl": tplId
      };
      for (const [k, g] of propGetters) {
        let v = g(vals);
        if (k === "style" && typeof v === "string") v = cssToObj(v);
        if ((k === "value" || k === "checked") && v === void 0) {
          v = k === "checked" ? false : "";
        }
        props[k] = v;
      }
      if (pseudoClasses.length) {
        props.className = [props.className, ...pseudoClasses].filter(Boolean).join(" ");
      }
      return h(realTag, props, ...renderDeckKids(kids, kidKeys, vals, ctx));
    };
  }

  // src/logic.ts
  var StreamableLogic = class {
    constructor(props) {
      __publicField(this, "props");
      __publicField(this, "state", {});
      /** Back-pointer to the wrapper component, installed after construction. */
      __publicField(this, "__host");
      this.props = props || {};
    }
    setState(update, cb) {
      this.__host && this.__host.__setLogicState(update, cb);
    }
    forceUpdate() {
      this.__host && this.__host.forceUpdate();
    }
    componentDidMount() {
    }
    componentDidUpdate(_prevProps) {
    }
    componentWillUnmount() {
    }
    /** The flat object the template renders against (merged over props). */
    renderVals() {
      return {};
    }
  };
  function evalDcLogic(src) {
    //! nosemgrep: eval-and-function-constructor
    const fn = new Function(
      "DCLogic",
      "StreamableLogic",
      "React",
      src + '\n;return (typeof Component!=="undefined"&&Component)||undefined;'
    );
    return fn(StreamableLogic, StreamableLogic, getReact());
  }

  // src/component.ts
  function shallowEqual(a, b) {
    if (!b) return false;
    const ak = Object.keys(a).filter((k) => k !== "children");
    const bk = Object.keys(b).filter((k) => k !== "children");
    if (ak.length !== bk.length) return false;
    for (const k of ak) if (a[k] !== b[k]) return false;
    return true;
  }
  function Placeholder({
    name,
    hintSize,
    streaming,
    error
  }) {
    const [w, hgt] = (hintSize || "100%,60px").split(",");
    return h(
      "div",
      {
        className: "sc-placeholder" + (streaming ? " sc-streaming" : ""),
        style: { width: w.trim(), height: hgt && hgt.trim() },
        title: name
      },
      error ? h(
        "div",
        { className: "sc-placeholder-error" },
        (name ? name + ": " : "") + error
      ) : null
    );
  }
  function hintToMin(hint) {
    if (!hint) return void 0;
    const [w, hgt] = hint.split(",");
    return { minWidth: w.trim(), minHeight: hgt && hgt.trim() };
  }
  function createComponentFactory(registry, ensureFetched) {
    const React = getReact();
    const AncestorContext = React.createContext([]);
    class StreamableComponent extends React.Component {
      constructor(props) {
        super(props);
        __publicField(this, "__name");
        __publicField(this, "__sub");
        __publicField(this, "__needsDidMount", false);
        /** Snapshot of the registry's streaming flags taken at render time —
         *  builders read it off the RenderCtx (this) to pick placeholder vs
         *  render-nothing for unresolved values. */
        __publicField(this, "__streamingNow", false);
        __publicField(this, "__htmlStreamingNow", false);
        /** When a construct throws, remember the (class, registry.ver, props)
         *  triple so render-time reconcile doesn't re-attempt it on every parent
         *  re-render. A registry bump (new class, template, external module
         *  resolving via bumpAll) changes `ver` and breaks the memo so an
         *  env-dependent constructor can self-heal. */
        __publicField(this, "__failedLogic", null);
        __publicField(this, "__failedUserProps", null);
        __publicField(this, "__failedVer", -1);
        /** Per-instance constructor error — kept here (not on the registry entry)
         *  so one instance's successful construct can't hide a sibling's failure,
         *  and a construct can never wipe an eval error `updateJs` recorded on
         *  `r.logicError`. */
        __publicField(this, "__ctorError", null);
        __publicField(this, "logic");
        this.__name = props.__name;
        this.state = { __v: 0, __err: null };
        this.__sub = () => {
          if (this.state.__err) this.setState({ __err: null });
          this.forceUpdate();
        };
        this.__makeLogic(registry.get(this.__name).Logic, null);
        ensureFetched(this.__name);
      }
      /** Error-boundary hook: a render crash anywhere in this DC's subtree
       *  (its own template, an x-import'd component, a child DC without its
       *  own deeper boundary) lands here instead of unmounting the page. */
      static getDerivedStateFromError(e) {
        return { __err: e instanceof Error && e.message ? e.message : String(e) };
      }
      componentDidCatch(e, info) {
        console.error(
          "[dc-runtime] render error in <" + this.__name + ">:",
          e,
          info?.componentStack || ""
        );
      }
      /** Instantiate the logic class (or the no-op base) and adopt `prevState`
       *  over its initial state — used both at mount and on hot-swap. */
      __makeLogic(Logic, prevState) {
        const L = Logic || StreamableLogic;
        try {
          this.logic = new L(this.__userProps());
          this.__failedLogic = null;
          this.__failedUserProps = null;
          this.__ctorError = null;
        } catch (e) {
          console.error(e);
          this.__failedLogic = Logic;
          this.__failedUserProps = this.__userProps();
          this.__failedVer = registry.get(this.__name).ver;
          this.__ctorError = this.__name + ": " + (e instanceof Error && e.message ? e.message : String(e));
          this.logic = new StreamableLogic(
            this.__userProps()
          );
        }
        this.logic.__host = this;
        if (prevState)
          this.logic.state = { ...this.logic.state || {}, ...prevState };
      }
      /** The props the author's logic + template see — internal __-prefixed
       *  wiring stripped. */
      __userProps() {
        const { __name, __hintSize, __tplId, __hostStyle, ...rest } = this.props;
        return rest;
      }
      __setLogicState(update, cb) {
        const prev = this.logic.state;
        const patch = typeof update === "function" ? update(prev) : update;
        this.logic.state = { ...prev, ...patch };
        this.setState((s) => ({ __v: s.__v + 1 }), cb);
      }
      /** Swap the logic instance when the registry's Logic class changed
       *  (streaming completion, hot reload). State carries over; didMount
       *  re-fires after the swap commits so refs exist. */
      __reconcileLogic() {
        const r = registry.get(this.__name);
        const Next = r.Logic;
        const Cur = this.logic.constructor;
        if (Next === Cur || !Next && Cur === StreamableLogic || Next === this.__failedLogic && r.ver === this.__failedVer && shallowEqual(this.__userProps(), this.__failedUserProps)) {
          return;
        }
        if (!this.__needsDidMount) {
          try {
            this.logic.componentWillUnmount();
          } catch (e) {
            console.error(e);
          }
        }
        this.__makeLogic(Next, this.logic.state);
        this.__needsDidMount = true;
      }
      componentDidMount() {
        registry.get(this.__name).subs.add(this.__sub);
        try {
          this.logic.componentDidMount();
        } catch (e) {
          console.error(e);
        }
      }
      componentDidUpdate(prevProps) {
        this.logic.props = this.__userProps();
        if (this.__needsDidMount) {
          if (this.state.__err || !registry.get(this.__name).tpl) return;
          this.__needsDidMount = false;
          try {
            this.logic.componentDidMount();
          } catch (e) {
            console.error(e);
          }
        } else {
          try {
            this.logic.componentDidUpdate(prevProps);
          } catch (e) {
            console.error(e);
          }
        }
      }
      componentWillUnmount() {
        registry.get(this.__name).subs.delete(this.__sub);
        if (!this.__needsDidMount) {
          try {
            this.logic.componentWillUnmount();
          } catch (e) {
            console.error(e);
          }
        }
      }
      render() {
        const r = registry.get(this.__name);
        const cls = "sc-host" + (r.htmlStreaming ? " sc-streaming-html" : "") + (r.jsStreaming ? " sc-streaming-js" : "");
        const hintStyle = r.htmlStreaming ? hintToMin(this.props.__hintSize) : void 0;
        const hostStyle = this.props.__hostStyle || hintStyle ? { ...hintStyle || {}, ...this.props.__hostStyle || {} } : void 0;
        const hostBase = {
          className: cls,
          style: hostStyle,
          "data-sc-name": this.__name,
          "data-dc-tpl": this.props.__tplId
        };
        const chain = Array.isArray(this.context) ? this.context : [];
        if (chain.includes(this.__name)) {
          const cycle = [
            ...chain.slice(chain.indexOf(this.__name)),
            this.__name
          ].join(" \u2192 ");
          return h(
            "div",
            { ...hostBase, className: cls + " sc-has-error" },
            h(Placeholder, {
              name: this.__name,
              hintSize: this.props.__hintSize,
              error: "circular import: " + cycle
            })
          );
        }
        if (this.state.__err) {
          return h(
            "div",
            { ...hostBase, className: cls + " sc-has-error" },
            h(
              "div",
              { className: "sc-logic-error", "data-omelette-chrome": "" },
              this.__name + ": " + this.state.__err
            ),
            h(Placeholder, {
              name: this.__name,
              hintSize: this.props.__hintSize,
              error: this.state.__err
            })
          );
        }
        this.__reconcileLogic();
        if (!r.tpl) {
          return h(
            "div",
            hostBase,
            h(Placeholder, { name: this.__name, hintSize: this.props.__hintSize })
          );
        }
        const userProps = this.__userProps();
        this.logic.props = userProps;
        let vals = userProps;
        let renderErr = r.logicError || this.__ctorError;
        try {
          vals = { ...userProps, ...this.logic.renderVals() || {} };
        } catch (e) {
          console.error(e);
          renderErr = this.__name + ".renderVals(): " + (e instanceof Error && e.message ? e.message : String(e));
        }
        this.__streamingNow = !!(r.htmlStreaming || r.jsStreaming);
        this.__htmlStreamingNow = !!r.htmlStreaming;
        return h(
          "div",
          { ...hostBase, className: cls + (renderErr ? " sc-has-error" : "") },
          renderErr && h(
            "div",
            { className: "sc-logic-error", "data-omelette-chrome": "" },
            renderErr
          ),
          h(
            AncestorContext.Provider,
            { value: [...chain, this.__name] },
            r.tpl(vals, this)
          )
        );
      }
    }
    __publicField(StreamableComponent, "contextType", AncestorContext);
    const named = /* @__PURE__ */ new Map();
    function getDC(name) {
      const hit = named.get(name);
      if (hit) return hit;
      function Dispatcher(p) {
        const [, setTick] = React.useState(0);
        React.useEffect(() => {
          const sub = () => setTick((n) => n + 1);
          registry.get(name).subs.add(sub);
          return () => {
            registry.get(name).subs.delete(sub);
          };
        }, []);
        ensureFetched(name);
        return h(StreamableComponent, { ...p, __name: name });
      }
      Dispatcher.displayName = name;
      named.set(name, Dispatcher);
      return Dispatcher;
    }
    return {
      getDC,
      StreamableComponent
    };
  }

  // src/bundled.ts
  function bundledBlob(url) {
    const blobs = window.__resourceBlobs;
    const b = blobs ? blobs[url.split("#")[0]] : void 0;
    return b instanceof Blob ? b : null;
  }

  // src/cdn.ts
  var REACT_URL = "https://unpkg.com/react@18.3.1/umd/react.production.min.js";
  var REACT_SRI = "sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z";
  var REACT_DOM_URL = "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js";
  var REACT_DOM_SRI = "sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1";
  var BABEL_URL = "https://unpkg.com/@babel/standalone@7.29.0/babel.min.js";
  var BABEL_SRI = "sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y";
  function cdnScriptFor(url, sri) {
    const res = window.__resources;
    const v = res ? res[url] : void 0;
    return typeof v === "string" && v ? { src: v } : { src: url, integrity: sri };
  }

  // src/external.ts
  var isCustomElementName = (n) => !n.includes(".") && n.includes("-");
  function isRenderableType(g) {
    if (typeof g === "function") return !isElementClass(g);
    return typeof g === "object" && g !== null && typeof g.$$typeof === "symbol";
  }
  function resolveDottedPath(root, name) {
    let cur = root;
    for (const seg of name.split(".")) {
      if (cur == null) return void 0;
      cur = cur[seg];
    }
    return cur;
  }
  var GLOBAL_POLL_INTERVAL_MS = 50;
  var GLOBAL_POLL_TIMEOUT_MS = 3e4;
  function createExternalModules(onResolved) {
    const cache = /* @__PURE__ */ new Map();
    let babelLoading = null;
    const reportedMissing = /* @__PURE__ */ new Map();
    const polling = /* @__PURE__ */ new Set();
    function ensureBabel() {
      if (window.Babel) return Promise.resolve();
      if (babelLoading) return babelLoading;
      const babel = cdnScriptFor(BABEL_URL, BABEL_SRI);
      babelLoading = new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = babel.src;
        if (babel.integrity) {
          s.integrity = babel.integrity;
          s.crossOrigin = "anonymous";
        }
        s.onload = () => res();
        s.onerror = rej;
        document.head.appendChild(s);
      });
      return babelLoading;
    }
    const pending = /* @__PURE__ */ new Map();
    function load(kind, url, after) {
      const existing = pending.get(url);
      if (existing) return existing;
      cache.set(url, null);
      console.info("[dc-runtime] x-import: loading", url, "(" + kind + ")");
      const ready = Promise.all([
        kind === "jsx" ? ensureBabel() : Promise.resolve(),
        after ?? Promise.resolve()
      ]);
      const p = ready.then(() => {
        const pre = bundledBlob(url);
        if (pre) return pre.text();
        return fetch(url).then((r) => {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.text();
        });
      }).then((src) => {
        const code = kind === "jsx" ? window.Babel.transform(src, {
          filename: url,
          presets: ["react", "typescript"]
        }).code : src;
        const module = { exports: {} };
        const before = new Set(Object.keys(window));
        //! nosemgrep: eval-and-function-constructor
        new Function("React", "module", "exports", "require", code)(
          getReact(),
          module,
          module.exports,
          () => ({})
        );
        const globals = {};
        for (const k of Object.keys(window)) {
          if (!before.has(k) && typeof window[k] === "function") {
            globals[k] = window[k];
          }
        }
        cache.set(url, { mod: module.exports, globals });
        console.info(
          "[dc-runtime] x-import: loaded",
          url,
          "\u2014 exports:",
          Object.keys(module.exports),
          "window globals:",
          Object.keys(globals)
        );
        onResolved();
      }).catch((e) => {
        cache.set(url, {
          mod: {},
          globals: {},
          error: "failed to load: " + (e instanceof Error && e.message ? e.message : String(e))
        });
        console.error(
          "[dc-runtime] x-import: FAILED to load",
          url,
          "(" + kind + ")",
          e
        );
        onResolved();
      });
      pending.set(url, p);
      return p;
    }
    function resolve2(url, name) {
      const entry = cache.get(url);
      if (!entry) return null;
      const { mod, globals } = entry;
      const C = mod && mod[name] || globals && globals[name] || typeof window !== "undefined" && window[name] || mod && mod.default;
      if (typeof C === "function") return C;
      const key = url + "\0" + name;
      if (!reportedMissing.has(key)) {
        reportedMissing.set(
          key,
          entry.error || 'no export named "' + name + '" (has: ' + Object.keys(mod).join(", ") + ")"
        );
        console.error(
          "[dc-runtime] x-import: module",
          url,
          "loaded but has no component named",
          JSON.stringify(name),
          "\u2014 available exports:",
          Object.keys(mod),
          "window globals:",
          Object.keys(globals),
          ". The module must `module.exports = {" + name + "}` or set `window." + name + "`."
        );
      }
      return null;
    }
    function waitForGlobal(name) {
      if (polling.has(name)) return;
      polling.add(name);
      const started = Date.now();
      const isCE = isCustomElementName(name);
      const tick = () => {
        const found = isCE ? customElements.get(name) : isRenderableType(resolveDottedPath(window, name));
        if (found) {
          polling.delete(name);
          onResolved();
          return;
        }
        if (Date.now() - started >= GLOBAL_POLL_TIMEOUT_MS) {
          console.warn(
            "[dc-runtime] x-import: global",
            JSON.stringify(name),
            "never appeared on window after " + GLOBAL_POLL_TIMEOUT_MS + "ms"
          );
          return;
        }
        setTimeout(tick, GLOBAL_POLL_INTERVAL_MS);
      };
      setTimeout(tick, GLOBAL_POLL_INTERVAL_MS);
    }
    function resolveGlobal(url, name) {
      const isCE = isCustomElementName(name);
      if (!url) {
        if (isCE) {
          if (customElements.get(name)) return name;
          waitForGlobal(name);
          return null;
        }
        const g2 = resolveDottedPath(window, name);
        if (isRenderableType(g2)) return g2;
        waitForGlobal(name);
        return null;
      }
      const entry = cache.get(url);
      if (!entry) return null;
      if (isCE && customElements.get(name)) return name;
      const g = entry.globals[name] ?? resolveDottedPath(window, name);
      if (isRenderableType(g)) return g;
      if (name.includes(".")) return null;
      const key = url + "\0global\0" + name;
      if (!reportedMissing.has(key)) {
        reportedMissing.set(key, null);
        if (isCE && !customElements.get(name)) {
          console.warn(
            "[dc-runtime] x-import:",
            url,
            "loaded but no custom element",
            JSON.stringify(name),
            "is registered and window." + name + " is not a function \u2014 rendering <" + name + "> as an unknown element."
          );
        }
      }
      return name;
    }
    function getError(url, name) {
      const entry = cache.get(url);
      if (entry?.error) return entry.error;
      return reportedMissing.get(url + "\0" + name) || null;
    }
    return { load, resolve: resolve2, resolveGlobal, getError };
  }
  function isElementClass(g) {
    try {
      return typeof g === "function" && typeof HTMLElement !== "undefined" && g.prototype instanceof HTMLElement;
    } catch {
      return false;
    }
  }

  // src/atomics.ts
  var ATOMIC_CSS = (
    // layout
    ".fx{display:flex}.col{display:flex;flex-direction:column}.grid{display:grid}.ac{align-items:center}.jc{justify-content:center}.jb{justify-content:space-between}.f1{flex:1}.noshrink{flex-shrink:0}.wrap{flex-wrap:wrap}.fw5{font-weight:500}.fw6{font-weight:600}.fw7{font-weight:700}.fw8{font-weight:800}.fs11{font-size:11px}.fs12{font-size:12px}.fs13{font-size:13px}.fs14{font-size:14px}.fs15{font-size:15px}.fs16{font-size:16px}.fs20{font-size:20px}.fs22{font-size:22px}.upper{text-transform:uppercase}.tc{text-align:center}.nowrap{white-space:nowrap}.gap8{gap:8px}.gap10{gap:10px}.gap12{gap:12px}.gap16{gap:16px}.gap24{gap:24px}.m0{margin:0}.mt8{margin-top:8px}.mt12{margin-top:12px}.mt16{margin-top:16px}.mb8{margin-bottom:8px}.mb12{margin-bottom:12px}.mb16{margin-bottom:16px}.posrel{position:relative}.posabs{position:absolute}.round{border-radius:50%}.ohide{overflow:hidden}.bbox{box-sizing:border-box}.pointer{cursor:pointer}.w100{width:100%}.b0{border:none}"
  );

  // src/helmet.ts
  var DESIGN_DOC_MODE_RE = /<meta\b[^>]*\bname\s*=\s*["']design_doc_mode["'][^>]*\b(?:content|value)\s*=\s*["'](\w+)["']/i;
  var CANVAS_BG_LIGHT = "#f0eee6";
  var CANVAS_BG_DARK = "#2e2c26";
  function createHelmetManager(doc, isStreaming) {
    const mounted = /* @__PURE__ */ new Set();
    const live = /* @__PURE__ */ new Map();
    let designDocMode = null;
    let canvasStyleEl = null;
    let appTheme = "light";
    try {
      const ds = doc.documentElement.dataset.theme;
      appTheme = ds === "dark" || ds === "light" ? ds : new URLSearchParams(doc.defaultView?.location.search ?? "").get(
        "theme"
      ) === "dark" ? "dark" : "light";
    } catch {
    }
    function applyCanvasBg() {
      if (!canvasStyleEl) return;
      const bg = appTheme === "dark" ? CANVAS_BG_DARK : CANVAS_BG_LIGHT;
      canvasStyleEl.textContent = `html,body{background:${bg}}#dc-root>.sc-host{position:relative}`;
    }
    function postDesignMode(mode) {
      if (window.parent === window) return;
      try {
        window.parent.postMessage({ type: "__dc_design_mode", mode }, "*");
      } catch {
      }
    }
    function setDesignDocMode(mode) {
      if (mode === designDocMode) return;
      designDocMode = mode;
      postDesignMode(mode);
      if (mode === "canvas") {
        doc.documentElement.setAttribute("data-dc-canvas", "");
        canvasStyleEl = doc.createElement("style");
        canvasStyleEl.setAttribute("data-dc-canvas", "");
        applyCanvasBg();
        doc.head.appendChild(canvasStyleEl);
      } else {
        doc.documentElement.removeAttribute("data-dc-canvas");
        canvasStyleEl?.remove();
        canvasStyleEl = null;
      }
    }
    window.addEventListener("message", (e) => {
      const type = e.data && e.data.type;
      if (type === "__dc_theme") {
        const t = e.data.theme;
        if (t === "light" || t === "dark") {
          appTheme = t;
          applyCanvasBg();
        }
        return;
      }
      if (!designDocMode || type !== "__dc_probe") return;
      postDesignMode(designDocMode);
    });
    function compile(node) {
      const raw = [...node.children];
      const helmetClosed = node.nextSibling != null || node.parentNode?.nextSibling != null;
      if (node.hasAttribute("data-dc-atomics") && !mounted.has("__dc-atomics")) {
        mounted.add("__dc-atomics");
        const el = doc.createElement("style");
        el.id = "__dc-atomics";
        el.textContent = ATOMIC_CSS;
        doc.head.appendChild(el);
      }
      return (_vals, ctx) => {
        const name = ctx && ctx.__name || "";
        const streaming = !!(name && isStreaming(name));
        for (let i = 0; i < raw.length; i++) {
          const child = raw[i];
          const tag = child.tagName;
          const mayBePartial = streaming && !helmetClosed && i === raw.length - 1;
          if (tag === "SCRIPT") {
            if (mayBePartial) continue;
            const key = "SCRIPT|" + (child.getAttribute("src") || child.textContent || "");
            if (mounted.has(key)) continue;
            mounted.add(key);
            const el = doc.createElement("script");
            for (const { name: an, value } of [...child.attributes])
              el.setAttribute(an, value);
            if (child.textContent) el.textContent = child.textContent;
            doc.head.appendChild(el);
          } else if (tag === "LINK" || tag === "META") {
            if (mayBePartial) continue;
            const key = tag + "|" + (child.getAttribute("href") || child.getAttribute("src") || child.outerHTML);
            if (mounted.has(key)) continue;
            mounted.add(key);
            if (tag === "LINK") {
              const rel = (child.getAttribute("rel") || "").toLowerCase().split(/\s+/);
              const href = (child.getAttribute("href") || "").trim();
              const res = window.__resources;
              const pre = res && rel.includes("stylesheet") && !rel.includes("alternate") ? res[href] : void 0;
              const blob = typeof pre === "string" && pre ? bundledBlob(pre) : null;
              if (blob) {
                const el = doc.createElement("style");
                if (child.hasAttribute("disabled")) {
                  el.setAttribute("media", "not all");
                } else if (child.getAttribute("media")) {
                  el.setAttribute("media", child.getAttribute("media"));
                }
                if (child.getAttribute("title"))
                  el.setAttribute("title", child.getAttribute("title"));
                void blob.text().then((css) => {
                  el.textContent = css;
                });
                doc.head.appendChild(el);
                continue;
              }
            }
            doc.head.appendChild(child.cloneNode(true));
          } else {
            const key = name + "|" + i;
            let el = live.get(key);
            if (!el || el.tagName !== tag) {
              if (el) el.remove();
              el = doc.createElement(tag.toLowerCase());
              live.set(key, el);
              doc.head.appendChild(el);
            }
            for (const { name: an, value } of [...child.attributes]) {
              if (el.getAttribute(an) !== value) el.setAttribute(an, value);
            }
            if (el.textContent !== child.textContent)
              el.textContent = child.textContent;
          }
        }
        return null;
      };
    }
    return { compile, setDesignDocMode };
  }

  // src/pseudo.ts
  function scanUnquotedUrl(css, i) {
    if (css[i] !== "u" && css[i] !== "U" || css.slice(i, i + 4).toLowerCase() !== "url(" || /[a-z0-9_-]/i.test(css[i - 1] ?? "")) {
      return -1;
    }
    let j = i + 4;
    while (j < css.length && /\s/.test(css[j])) j++;
    if (css[j] === '"' || css[j] === "'") return -1;
    while (j < css.length && css[j] !== ")") {
      if (css[j] === "\\") j++;
      j++;
    }
    return j < css.length ? j + 1 : css.length;
  }
  function stripComments(css) {
    let out = "";
    let quote = "";
    for (let i = 0; i < css.length; i++) {
      const c = css[i];
      if (quote) {
        if (c === "\\") {
          out += c + (css[i + 1] ?? "");
          i++;
          continue;
        }
        if (c === quote) quote = "";
        out += c;
      } else if (c === "'" || c === '"') {
        quote = c;
        out += c;
      } else if (c === "/" && css[i + 1] === "*") {
        const end = css.indexOf("*/", i + 2);
        i = end === -1 ? css.length : end + 1;
        out += " ";
      } else {
        const end = scanUnquotedUrl(css, i);
        if (end === -1) out += c;
        else {
          out += css.slice(i, end);
          i = end - 1;
        }
      }
    }
    return out;
  }
  function importantify(css) {
    css = stripComments(css);
    const decls = [];
    let start = 0;
    let depth = 0;
    let quote = "";
    for (let i = 0; i < css.length; i++) {
      const c = css[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = "";
      } else if (c === "'" || c === '"') quote = c;
      else if (c === "(") depth++;
      else if (c === ")") depth = Math.max(0, depth - 1);
      else if (c === ";" && depth === 0) {
        decls.push(css.slice(start, i));
        start = i + 1;
      } else {
        const end = scanUnquotedUrl(css, i);
        if (end !== -1) i = end - 1;
      }
    }
    decls.push(css.slice(start));
    return decls.map((d) => d.trim()).filter(Boolean).map((d) => /!\s*important$/i.test(d) ? d : d + " !important").join(";");
  }
  function createPseudoSheet(doc) {
    let el = null;
    const cache = /* @__PURE__ */ new Map();
    let n = 0;
    return (pseudo, css) => {
      const k = pseudo + "|" + css;
      const hit = cache.get(k);
      if (hit) return hit;
      if (!el) {
        el = doc.createElement("style");
        doc.head.appendChild(el);
      }
      const cls = "scp" + (n++).toString(36);
      const isPseudoElement = pseudo === "before" || pseudo === "after";
      const sel = isPseudoElement ? "." + cls + "::" + pseudo : "." + cls + ":" + pseudo;
      el.sheet.insertRule(
        sel + "{" + (isPseudoElement ? css : importantify(css)) + "}",
        el.sheet.cssRules.length
      );
      cache.set(k, cls);
      return cls;
    };
  }

  // src/registry.ts
  function createRegistry() {
    const entries = /* @__PURE__ */ Object.create(null);
    function get(name) {
      return entries[name] || (entries[name] = {
        html: "",
        tpl: null,
        Logic: null,
        jsStreaming: false,
        htmlStreaming: false,
        ver: 0,
        subs: /* @__PURE__ */ new Set(),
        fetched: false
      });
    }
    function bump(name) {
      const r = get(name);
      r.ver++;
      for (const fn of r.subs) fn();
    }
    return {
      entries,
      get,
      bump,
      bumpAll() {
        for (const n in entries) bump(n);
      }
    };
  }

  // src/runtime.ts
  var COMPONENT_DIR = ".";
  function createRuntime(doc = document) {
    const registry = createRegistry();
    const pseudoClass = createPseudoSheet(doc);
    const helmet = createHelmetManager(
      doc,
      (name) => registry.get(name).htmlStreaming
    );
    const external = createExternalModules(() => registry.bumpAll());
    const factory = createComponentFactory(registry, ensureFetched);
    const host = {
      component: (name) => factory.getDC(name),
      placeholder: (props) => h(Placeholder, props),
      helmet: (node) => helmet.compile(node),
      loadExternal: (kind, url, after) => external.load(kind, url, after),
      resolveExternal: (url, name) => external.resolve(url, name),
      resolveExternalGlobal: (url, name) => external.resolveGlobal(url, name),
      resolveExternalError: (url, name) => external.getError(url, name),
      pseudoClass
    };
    function ensureFetched(name) {
      const r = registry.get(name);
      if (r.fetched) return;
      r.fetched = true;
      const url = COMPONENT_DIR + "/" + encodeURIComponent(name) + ".dc.html";
      const res = window.__resources;
      const pre = res ? res[url] : void 0;
      const target = typeof pre === "string" && pre ? pre : url;
      const blob = bundledBlob(target);
      (blob ? blob.text() : fetch(target).then((res2) => {
        if (!res2.ok) {
          console.error(
            '[dc-runtime] sibling fetch for "' + name + '" failed:',
            url,
            "returned",
            res2.status,
            "\u2014 the reference renders as an empty placeholder."
          );
          return "";
        }
        return res2.text();
      })).then((t) => {
        if (!t) return;
        const parsed = parseDcText(t);
        if (!parsed) {
          console.error(
            '[dc-runtime] sibling fetch for "' + name + '":',
            url,
            "has no <x-dc> block \u2014 not a Design Component."
          );
          return;
        }
        if (parsed.props) r.propsMeta = parsed.props;
        if (parsed.preview) r.preview = parsed.preview;
        if (parsed.template && !r.html) updateHtml(name, parsed.template);
        if (parsed.js && !r.Logic) updateJs(name, parsed.js);
      }).catch(
        (e) => console.error(
          '[dc-runtime] sibling fetch for "' + name + '" threw:',
          url,
          e
        )
      );
    }
    let rootName = null;
    function updateHtml(name, html) {
      const r = registry.get(name);
      r.html = html;
      if (name === rootName) {
        const mode = DESIGN_DOC_MODE_RE.exec(html)?.[1] ?? null;
        if (mode || !r.htmlStreaming) helmet.setDesignDocMode(mode);
      }
      try {
        r.tpl = compileTemplate(html, host);
      } catch (e) {
        console.error("[dc-runtime] template compile FAILED for", name, e);
      }
      registry.bump(name);
    }
    function updateJs(name, src) {
      const r = registry.get(name);
      const seq = r.jsSeq = (r.jsSeq || 0) + 1;
      try {
        const Cls = evalDcLogic(src);
        if (r.jsSeq !== seq) return;
        if (typeof Cls !== "function") {
          r.logicError = name + ".dc.html: <script data-dc-script> must define `class Component extends DCLogic`";
        } else {
          r.logicError = null;
          r.Logic = Cls;
        }
      } catch (e) {
        if (r.jsSeq !== seq) return;
        console.error(
          "[dc-runtime] logic class eval FAILED for",
          name,
          "\u2014 the template renders with props only.",
          e
        );
        r.logicError = name + ": " + (e instanceof Error && e.message ? e.message : String(e));
      }
      registry.bump(name);
    }
    function setStreaming(name, kind, on) {
      const r = registry.get(name);
      if (kind === "html") r.htmlStreaming = !!on;
      else r.jsStreaming = !!on;
      let any = false;
      for (const n in registry.entries) {
        const e = registry.entries[n];
        if (e && (e.htmlStreaming || e.jsStreaming)) {
          any = true;
          break;
        }
      }
      doc.documentElement.classList.toggle("sc-dc-streaming", any);
      registry.bump(name);
    }
    function dcUpdate(name, kind, content, streaming) {
      if (streaming) registry.get(name).fetched = true;
      if (kind === "html") {
        setStreaming(name, "html", !!streaming);
        updateHtml(name, content);
      } else if (kind === "js") {
        setStreaming(name, "js", !!streaming);
        if (!streaming) updateJs(name, content);
      } else if (kind === "props") {
        const { props, preview } = parseDataProps(content);
        const r = registry.get(name);
        r.propsMeta = props ?? void 0;
        r.preview = preview;
        registry.bump(name);
      }
    }
    function setProps(name, overrides) {
      registry.get(name).propOverrides = overrides && typeof overrides === "object" ? { ...overrides } : null;
      registry.bump(name);
    }
    function adoptParsed(name, parsed) {
      if (!parsed) return;
      const r = registry.get(name);
      if (parsed.props) r.propsMeta = parsed.props;
      if (parsed.preview) r.preview = parsed.preview;
      if (parsed.template) updateHtml(name, parsed.template);
      if (parsed.js) updateJs(name, parsed.js);
    }
    return {
      registry,
      getDC: factory.getDC,
      updateHtml,
      updateJs,
      dcUpdate,
      setProps,
      adoptParsed,
      setRootName: (name) => {
        rootName = name;
      },
      markFetched: (name) => {
        registry.get(name).fetched = true;
      },
      annotatedTemplate: (name) => {
        const r = registry.get(name);
        return r.tpl && r.tpl.__annotated || null;
      },
      templateSource: (name) => registry.get(name).html || null,
      StreamableLogic
    };
  }

  // src/stream-state.ts
  function createStreamTracker(staleMs = 6e4, now = Date.now) {
    const since = /* @__PURE__ */ new Map();
    const liveOne = (n) => {
      const t = since.get(n);
      if (t === void 0) return false;
      if (now() - t > staleMs) {
        since.delete(n);
        return false;
      }
      return true;
    };
    return {
      push(name, streaming, viewportKey) {
        if (viewportKey === "dc-model") return;
        if (streaming) since.set(name, now());
        else since.delete(name);
      },
      live(name) {
        if (name !== void 0) return liveOne(name);
        for (const n of [...since.keys()]) if (liveOne(n)) return true;
        return false;
      }
    };
  }

  // src/index.ts
  function hideRawTemplate() {
    const s = document.createElement("style");
    s.textContent = "x-dc{display:none!important}";
    document.head.appendChild(s);
  }
  function loadScript(src, integrity) {
    return new Promise((resolve2, reject) => {
      //! nosemgrep: create-script-element
      const s = document.createElement("script");
      s.src = src;
      if (integrity) {
        s.integrity = integrity;
        s.crossOrigin = "anonymous";
      }
      s.async = false;
      s.onload = () => resolve2();
      s.onerror = () => reject(new Error(`failed to load ${src}`));
      document.head.appendChild(s);
    });
  }
  function loadReactUmd() {
    const w = window;
    if (w.React && w.ReactDOM) return Promise.resolve();
    const react = cdnScriptFor(REACT_URL, REACT_SRI);
    const reactDom = cdnScriptFor(REACT_DOM_URL, REACT_DOM_SRI);
    return Promise.all([
      loadScript(react.src, react.integrity),
      loadScript(reactDom.src, reactDom.integrity)
    ]).then(() => void 0);
  }
  function init() {
    const runtime = createRuntime(document);
    let rootName = "Root";
    const baseCss = document.createElement("style");
    baseCss.textContent = BASE_CSS;
    document.head.prepend(baseCss);
    const notifyHost = () => {
      if (window.parent === window) return;
      const r = runtime.registry.entries[rootName];
      try {
        window.parent.postMessage(
          {
            type: "__dc_booted",
            rootName,
            propsMeta: r && r.propsMeta || null,
            preview: r && r.preview || null
          },
          "*"
        );
      } catch {
      }
    };
    const streams = createStreamTracker();
    const api = {
      __dcUpdate: (name, kind, content, streaming, viewportKey) => {
        streams.push(name, streaming, viewportKey);
        runtime.dcUpdate(name, kind, content, streaming);
        if (name === rootName && !streaming && kind === "props") notifyHost();
      },
      __dcStreaming: (name) => streams.live(name),
      __dcSetProps: (name, overrides) => runtime.setProps(name, overrides),
      /** Name of the component currently mounted as the page root — DC tools
       *  push their template-stream here when targeting "the open page". */
      __dcRootName: () => rootName,
      /** Editor bridge — the encoded, `data-dc-tpl`-annotated template source.
       *  The host editor parses this into its own template DOM so it can map a
       *  rendered node (carrying the same `data-dc-tpl`) back to the source
       *  node that emitted it. Returns the encoded form (`sc-camel-*` attrs,
       *  `<sc-raw-*>`/`<sc-helmet>` tags); the editor decodes on serialize. */
      __dcAnnotatedTemplate: (name) => runtime.annotatedTemplate(name),
      /** Editor bridge — the *original* (decoded) template source. */
      __dcTemplateSource: (name) => runtime.templateSource(name),
      __dcBoot: () => {
        rootName = boot(runtime, document) ?? rootName;
        notifyHost();
      },
      __dcRegistry: runtime.registry.entries,
      getDC: (name) => runtime.getDC(name),
      // `DCLogic` is the documented base class name; `StreamableLogic` is the
      // implementation alias kept for any project that already references it.
      DCLogic: runtime.StreamableLogic,
      StreamableLogic: runtime.StreamableLogic
    };
    Object.assign(window, api);
    window.__dcContentKeyed = true;
    if (document.readyState !== "loading") api.__dcBoot();
    else document.addEventListener("DOMContentLoaded", () => api.__dcBoot());
  }
  hideRawTemplate();
  loadReactUmd().then(init).catch((err) => {
    console.error("[dc] failed to load React or boot:", err);
    throw err;
  });
})();

```
