// src/lib/analytics.js
// GA4 telemetry for Gymloop, via Firebase Analytics.
//
// Firebase Analytics IS GA4. There is no gtag.js, react-ga4 or any second
// analytics script in this app and none may be added — this module is the
// single initialisation path.
//
// Invariants enforced here rather than at call sites, so no caller can
// accidentally break them:
//
//   · Nothing is sent outside a production build (import.meta.env.PROD).
//   · Nothing is sent unless isSupported() resolves true. Safari private mode,
//     some in-app browsers and content blockers all make Analytics unavailable;
//     every export degrades to a no-op — never a throw — so a blocked or failed
//     SDK can never break app render.
//   · No PII leaves the client. Param keys are screened against a denylist and
//     dynamic route IDs are stripped from page_path before it is sent.
//   · Automatic page_view collection is DISABLED at init. Left on, gtag would
//     report window.location.href verbatim — which on /owner/members/<docId>
//     ships a member document ID to Google. Page views are sent manually by
//     trackPageView() so redaction cannot be bypassed.

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

// ── KILL SWITCH ─────────────────────────────────────────────────────────────
// This whole integration is designed to be switched off without a code change
// and removed without a trace. See ANALYTICS.md for both procedures.
//
// Off in one step, either of:
//   · set VITE_ANALYTICS_ENABLED=false   (explicit — preferred)
//   · delete VITE_GA_MEASUREMENT_ID      (implicit)
// ...in the Vercel dashboard, then redeploy. Every export below becomes a
// no-op: no SDK load, no network, no events, no user properties. Call sites
// stay in place and stay harmless.
//
// Dev builds still run validation (so PII and casing mistakes surface as
// console warnings while developing) but never reach the network.
const ENABLED =
  import.meta.env.PROD &&
  import.meta.env.VITE_ANALYTICS_ENABLED !== 'false' &&
  !!MEASUREMENT_ID;

let sdk = null;          // the firebase/analytics module namespace
let analytics = null;    // the Analytics instance
let initPromise = null;  // set once — makes initAnalytics() idempotent

// Events raised before identity is known are held so that gym_id / user_role
// are always attached to the session before the first event lands (GA4 applies
// user properties to subsequent events only, never retroactively).
let identityResolved = false;
let queue = [];
const MAX_QUEUE = 50;
const IDENTITY_TIMEOUT_MS = 5000;

// Merged across calls: plan_tier resolves from a separate Firestore listener
// well after uid/gym_id/user_role, so setAnalyticsUser() must support partial
// updates without clearing what was already set.
let userProps = {};

const devWarn = (...args) => {
  if (import.meta.env.DEV) console.warn(...args);
};

// ── PII denylist ────────────────────────────────────────────────────────────
// Matched against the key with all non-alphanumerics removed, so member_id,
// memberId and memberID all collapse to the same token. Substring matching is
// deliberate: display_name, member_name and user_email are all caught. A hit
// drops the ENTIRE event rather than just the offending key — failing closed is
// the only safe direction for PII.
const PII_KEYS = ['name', 'phone', 'email', 'mobile', 'address', 'memberid'];

const flatten = (key) => String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
const isPiiKey = (key) => {
  const flat = flatten(key);
  return PII_KEYS.some((bad) => flat.includes(bad));
};

// ── snake_case enforcement ──────────────────────────────────────────────────
const SNAKE = /^[a-z][a-z0-9_]*$/;
const toSnake = (key) =>
  String(key).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

// GA4 truncates string params at 100 chars; do it here so the value we send is
// the value we reasoned about.
const clampValue = (value) =>
  typeof value === 'string' && value.length > 100 ? value.slice(0, 100) : value;

// ── Route redaction map ─────────────────────────────────────────────────────
// Every route carrying a dynamic segment, from the Gate 0 router audit. Literal
// sibling segments (/owner/members/add, /trainer/workout-plans/create,
// /owner/payments/add) are excluded by lookahead so they stay readable in GA4.
const REDACTIONS = [
  [/^\/public\/member\/[^/]+$/, '/public/member/:id'],
  [/^\/gym\/[^/]+\/plans$/, '/gym/:gymId/plans'],
  [/^\/gym\/[^/]+$/, '/gym/:gymId'],
  [/^\/owner\/members\/(?!add$)[^/]+\/edit$/, '/owner/members/:id/edit'],
  [/^\/owner\/members\/(?!add$)[^/]+$/, '/owner/members/:id'],
  [/^\/manager\/members\/(?!add$)[^/]+$/, '/manager/members/:id'],
  [/^\/receptionist\/members\/(?!add$)[^/]+\/edit$/, '/receptionist/members/:id/edit'],
  [/^\/receptionist\/members\/(?!add$)[^/]+$/, '/receptionist/members/:id'],
  [/^\/trainer\/members\/[^/]+$/, '/trainer/members/:id'],
  [/^\/trainer\/workout-plans\/(?!create$)[^/]+$/, '/trainer/workout-plans/:planId'],
  [/^\/trainer\/assign\/[^/]+$/, '/trainer/assign/:id'],
  [/^\/owner\/payments\/member\/[^/]+$/, '/owner/payments/member/:memberId'],
  [/^\/owner\/payments\/(?!add$|member$)[^/]+$/, '/owner/payments/:id'],
  [/^\/owner\/plans\/edit\/[^/]+$/, '/owner/plans/edit/:planId'],
];

// Backstop for routes added after this map was written: Firestore auto-IDs are
// 20 chars and Auth UIDs 28, both mixed-case alphanumeric. Any segment that
// looks like one is redacted even if no rule above matched it.
const ID_LIKE = /^(?=.*[0-9])(?=.*[a-zA-Z])[A-Za-z0-9_-]{16,}$/;

export function redactPath(rawPath) {
  let path = String(rawPath || '/');
  // Query strings and hashes are never part of a page_path we control, and may
  // carry anything — drop them outright.
  path = path.split('?')[0].split('#')[0];
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

  for (const [pattern, replacement] of REDACTIONS) {
    if (pattern.test(path)) return replacement;
  }

  const swept = path
    .split('/')
    .map((segment) => (ID_LIKE.test(segment) ? ':id' : segment))
    .join('/');

  if (swept !== path) {
    devWarn(`analytics: redacted an unmapped ID segment in "${path}" — add it to REDACTIONS`);
  }
  return swept;
}

// ── Init ────────────────────────────────────────────────────────────────────
function detectDisplayMode() {
  try {
    if (typeof window === 'undefined') return 'browser';
    if (window.matchMedia?.('(display-mode: standalone)')?.matches) return 'standalone';
    if (window.navigator?.standalone) return 'standalone'; // iOS Safari PWA
    return 'browser';
  } catch {
    return 'browser';
  }
}

/**
 * Boots Firebase Analytics. Safe to call repeatedly — the first call wins and
 * every later call returns the same promise. Resolves to null (never rejects)
 * when analytics is disabled, unsupported or blocked.
 */
export function initAnalytics() {
  if (initPromise) return initPromise;

  if (!ENABLED) {
    initPromise = Promise.resolve(null);
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const { default: app } = await import('../firebase/config');
      if (!app) return null; // Firebase init itself failed — stay silent

      const mod = await import('firebase/analytics');
      if (!(await mod.isSupported())) return null;

      // initializeAnalytics (not getAnalytics) so send_page_view can be turned
      // off. Automatic page views would report the raw URL and defeat redaction.
      // VITE_GA_DEBUG=true routes this client's events into GA4 DebugView.
      // Needed for QA on kiosks and the mobile PWA, where the Google Analytics
      // Debugger Chrome extension cannot be installed. Turn it off after
      // testing — debug traffic is excluded from normal reports.
      const debugMode = import.meta.env.VITE_GA_DEBUG === 'true';
      analytics = mod.initializeAnalytics(app, {
        config: {
          send_page_view: false,
          anonymize_ip: true,
          ...(debugMode ? { debug_mode: true } : {}),
        },
      });
      sdk = mod;

      applyUserProps({ display_mode: detectDisplayMode() });
      return analytics;
    } catch {
      // Unsupported environment, blocked request, offline — analytics is
      // optional infrastructure and must never surface an error to the app.
      return null;
    }
  })();

  // If auth never resolves (hung network, stalled claim refresh) release the
  // queue anyway rather than losing the whole session. Events flushed this way
  // may lack gym_id; that is strictly better than sending nothing.
  if (typeof setTimeout === 'function') {
    setTimeout(() => resolveIdentity(), IDENTITY_TIMEOUT_MS);
  }

  return initPromise;
}

// ── Delivery ────────────────────────────────────────────────────────────────
function resolveIdentity() {
  if (identityResolved) return;
  identityResolved = true;
  const pending = queue;
  queue = [];
  for (const [name, params] of pending) dispatch(name, params);
}

async function dispatch(name, params) {
  try {
    await initAnalytics();
    if (!analytics || !sdk) return;
    sdk.logEvent(analytics, name, params);
  } catch {
    /* never throw out of analytics */
  }
}

function enqueue(name, params) {
  if (identityResolved) {
    dispatch(name, params);
    return;
  }
  if (queue.length >= MAX_QUEUE) return;
  queue.push([name, params]);
}

async function applyUserProps(patch) {
  const clean = sanitiseParams(patch, 'user_properties');
  if (!clean || Object.keys(clean).length === 0) return;
  userProps = { ...userProps, ...clean };
  if (!ENABLED) return;
  try {
    await initAnalytics();
    if (!analytics || !sdk) return;
    sdk.setUserProperties(analytics, clean);
  } catch {
    /* no-op */
  }
}

// ── Param sanitising ────────────────────────────────────────────────────────
// Returns null when the event must be refused outright.
function sanitiseParams(params, eventName) {
  const out = {};
  if (!params || typeof params !== 'object') return out;

  for (const [rawKey, value] of Object.entries(params)) {
    if (value === undefined) continue; // GA4 rejects undefined outright

    if (isPiiKey(rawKey)) {
      devWarn(
        `analytics: refused PII param "${rawKey}" on "${eventName}" — event not sent`
      );
      return null;
    }

    const key = toSnake(rawKey);
    if (!SNAKE.test(key) || key.length > 40) {
      devWarn(
        `analytics: dropped param "${rawKey}" on "${eventName}" — must be snake_case, <=40 chars`
      );
      continue;
    }

    out[key] = clampValue(value);
  }

  return out;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Identifies the signed-in account. uid MUST be the Firebase Auth UID — staff
 * and member Firestore docs are created with addDoc() and their random doc IDs
 * are NOT identity, so they must never be passed here.
 *
 * Partial calls are supported: plan_tier arrives from a separate subscriptions
 * listener after auth resolves, and passing it alone will not clear the rest.
 */
export function setAnalyticsUser({ uid, gym_id, user_role, plan_tier } = {}) {
  applyUserProps({
    gym_id,
    user_role,
    plan_tier,
    traffic_type: 'app',
    display_mode: detectDisplayMode(),
  });

  if (uid && ENABLED) {
    initAnalytics()
      .then(() => {
        if (analytics && sdk) sdk.setUserId(analytics, uid);
      })
      .catch(() => {});
  }

  resolveIdentity();
}

/**
 * Tags an unauthenticated kiosk session. Deliberately does NOT call setUserId:
 * kiosks sign in anonymously and are shared, high-volume devices — attaching a
 * user identity to them would be both meaningless and a privacy risk.
 */
export function setKioskSession({ gym_id } = {}) {
  applyUserProps({
    gym_id,
    user_role: 'kiosk',
    traffic_type: 'kiosk',
    display_mode: detectDisplayMode(),
  });
  resolveIdentity();
}

/** Drops all identity on logout. GA4 clears a user property when set to null. */
export function clearAnalyticsUser() {
  userProps = {};

  if (!ENABLED) {
    resolveIdentity();
    return;
  }

  initAnalytics()
    .then(() => {
      if (!analytics || !sdk) return;
      sdk.setUserId(analytics, null);
      sdk.setUserProperties(analytics, {
        gym_id: null,
        user_role: null,
        plan_tier: null,
      });
    })
    .catch(() => {});

  resolveIdentity();
}

/** Sends a GA4 event. Silently refuses anything carrying a PII-shaped key. */
export function trackEvent(name, params = {}) {
  const eventName = toSnake(name);

  if (!SNAKE.test(eventName) || eventName.length > 40) {
    devWarn(`analytics: dropped event "${name}" — must be snake_case, <=40 chars`);
    return;
  }

  const clean = sanitiseParams(params, eventName);
  if (clean === null) return; // PII refused — already warned

  if (!ENABLED) return; // validated in dev, never sent (T9)
  enqueue(eventName, clean);
}

/** Sends page_view with the redaction map applied to the path. */
export function trackPageView(path, title) {
  const page_path = redactPath(path);

  // page_location is built from the REDACTED path, never window.location.href,
  // which still holds the raw member ID.
  let page_location = page_path;
  try {
    if (typeof window !== 'undefined' && window.location?.origin) {
      page_location = `${window.location.origin}${page_path}`;
    }
  } catch {
    /* keep the relative path */
  }

  trackEvent('page_view', {
    page_path,
    page_location,
    page_title: title || (typeof document !== 'undefined' ? document.title : undefined),
  });
}

// ── Bucketing ───────────────────────────────────────────────────────────────
// Exact counts and exact rupee amounts are never sent — a precise figure plus a
// timestamp plus a gym can single out one transaction, and therefore one person.
// Callers bucket first.

function bucketise(value, ladder, topLabel) {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined; // stripped rather than sent as garbage
  if (n <= 0) return '0';
  for (const [ceiling, label] of ladder) {
    if (n <= ceiling) return label;
  }
  return topLabel;
}

// Counts of things — members on a gym's roster.
const COUNT_BUCKETS = [
  [25, '1-25'],
  [100, '26-100'],
  [500, '101-500'],
];

// Rupee amounts need their own ladder. The count ladder tops out at 500, and
// essentially every real gym payment in INR exceeds ₹500 — a monthly membership,
// a quarterly renewal and an annual package would all collapse into one '500+'
// bucket, making the reported data uniform and therefore meaningless. These
// bands separate monthly / quarterly / half-yearly / annual behaviour instead.
const AMOUNT_BUCKETS = [
  [1000, '1-1000'],
  [3000, '1001-3000'],
  [8000, '3001-8000'],
  [20000, '8001-20000'],
];

/** Bucket a COUNT: '1-25' | '26-100' | '101-500' | '500+'. */
export function toBucket(value) {
  return bucketise(value, COUNT_BUCKETS, '500+');
}

/**
 * Bucket a RUPEE AMOUNT:
 * '1-1000' | '1001-3000' | '3001-8000' | '8001-20000' | '20000+'.
 */
export function toAmountBucket(value) {
  return bucketise(value, AMOUNT_BUCKETS, '20000+');
}
