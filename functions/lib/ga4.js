/**
 * functions/lib/ga4.js — GA4 Measurement Protocol sender (CommonJS).
 *
 * Server-side counterpart to src/lib/analytics.js. Posts events that the
 * browser cannot observe: a Razorpay purchase confirmed by webhook, a trial
 * starting or expiring, a turnstile scan processed on a kiosk.
 *
 * Three rules govern everything here:
 *
 *  1. FIRE AND FORGET. sendGa4Events() never throws and never rejects. A
 *     failed, slow or misconfigured Measurement Protocol call must not fail
 *     the parent function, and must never delay a Razorpay webhook response —
 *     Razorpay retries any webhook it does not get a prompt 2xx for, and a
 *     retry storm would be far worse than a missing analytics event.
 *
 *  2. NO PII. Only tenant-scoped, non-identifying values: gym_id, plan tier,
 *     bucketed counts, status strings. Never a member name, phone, email or
 *     Firestore document ID.
 *
 *  3. OFF BY DEFAULT. With no GA_API_SECRET the module is inert. Removing the
 *     secret is the server-side kill switch — see ANALYTICS.md.
 */

const crypto = require("crypto");

const MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID;
const API_SECRET = process.env.GA_API_SECRET;

// Server kill switch, mirroring VITE_ANALYTICS_ENABLED on the client. Unset or
// absent secret means every export below is a no-op.
const ENABLED =
  process.env.GA_ANALYTICS_ENABLED !== "false" &&
  !!MEASUREMENT_ID &&
  !!API_SECRET;

const ENDPOINT = "https://www.google-analytics.com/mp/collect";
// The /debug/ endpoint VALIDATES a payload and returns validationMessages, but
// does NOT record the event. Use GA_VALIDATE while checking payload shape;
// use GA_DEBUG to make real events visible in DebugView.
const DEBUG_ENDPOINT = "https://www.google-analytics.com/debug/mp/collect";
const DEBUG_MODE = process.env.GA_DEBUG === "true";
const VALIDATE_ONLY = process.env.GA_VALIDATE === "true";
const TIMEOUT_MS = 3000;

// Node 20 ships global fetch; node-fetch@2 is kept as a fallback so this works
// if the functions runtime is ever pinned lower.
function getFetch() {
  if (typeof fetch === "function") return fetch;
  try {
    return require("node-fetch");
  } catch (_) {
    return null;
  }
}

/**
 * A stable, non-reversible pseudo client_id for a gym, used when no real
 * browser client_id is available (webhooks, cron jobs, kiosk scans).
 *
 * GA4 expects the "<random>.<timestamp>" shape. Salting and hashing means the
 * gym_id itself is never transmitted as the identifier, while the same gym
 * still maps to the same client_id across calls — so server events from one
 * gym group into one GA4 user rather than scattering into thousands.
 */
function pseudoClientId(gymId) {
  const salt = process.env.GA_CLIENT_ID_SALT || "gymloop-mp-v1";
  const hash = crypto
    .createHash("sha256")
    .update(`${gymId || "unknown"}:${salt}`)
    .digest("hex");
  const a = parseInt(hash.slice(0, 8), 16) % 1000000000;
  const b = parseInt(hash.slice(8, 16), 16) % 1000000000;
  return `${a}.${b}`;
}

// Mirrors the client denylist. Server payloads are hand-written so this is a
// backstop, not the primary defence — but it is cheap and it fails closed.
const PII_KEYS = ["name", "phone", "email", "mobile", "address", "memberid"];

function stripPii(params, eventName) {
  const out = {};
  if (!params || typeof params !== "object") return out;
  Object.keys(params).forEach((key) => {
    const value = params[key];
    if (value === undefined || value === null) return;
    const flat = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (PII_KEYS.some((bad) => flat.includes(bad))) {
      console.warn(`ga4: refused PII param "${key}" on "${eventName}"`);
      return;
    }
    out[key] = value;
  });
  return out;
}

/**
 * Posts events to the Measurement Protocol.
 *
 * @param {object}   opts
 * @param {string}  [opts.client_id] real browser client_id when one is known
 * @param {string}  [opts.gym_id]    tenant, used to derive a pseudo client_id
 * @param {object}  [opts.user_properties]
 * @param {Array}    opts.events     [{ name, params }]
 * @returns {Promise<void>} resolves always, rejects never
 */
function sendGa4Events(opts) {
  if (!ENABLED) return Promise.resolve();

  try {
    const options = opts || {};
    const events = Array.isArray(options.events) ? options.events : [];
    if (events.length === 0) return Promise.resolve();

    const gymId = options.gym_id;
    const clientId = options.client_id || pseudoClientId(gymId);

    const userProperties = {};
    if (gymId) userProperties.gym_id = { value: String(gymId) };
    userProperties.traffic_type = { value: "server" };
    Object.keys(options.user_properties || {}).forEach((k) => {
      userProperties[k] = { value: String(options.user_properties[k]) };
    });

    const payload = {
      client_id: clientId,
      non_personalized_ads: true,
      user_properties: userProperties,
      events: events.slice(0, 25).map((e) => {
        const params = stripPii(e.params, e.name);
        // debug_mode surfaces the event in GA4 DebugView.
        if (DEBUG_MODE) params.debug_mode = true;
        return { name: e.name, params };
      }),
    };

    const doFetch = getFetch();
    if (!doFetch) return Promise.resolve();

    const base = VALIDATE_ONLY ? DEBUG_ENDPOINT : ENDPOINT;
    const url =
      `${base}?measurement_id=${encodeURIComponent(MEASUREMENT_ID)}` +
      `&api_secret=${encodeURIComponent(API_SECRET)}`;

    // AbortController bounds the call so a hanging Google endpoint can never
    // hold a function instance open.
    const controller =
      typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), TIMEOUT_MS)
      : null;

    return doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined,
    })
      .then((res) => {
        // In validate mode, print what GA4 thinks of the payload.
        if (VALIDATE_ONLY && res && typeof res.json === "function") {
          return res.json().then((body) => {
            console.log("ga4 validation:", JSON.stringify(body));
          }).catch(() => undefined);
        }
        return undefined;
      })
      .catch((err) => {
        console.warn("ga4: measurement protocol send failed:", err && err.message);
      })
      .then(() => {
        if (timer) clearTimeout(timer);
      });
  } catch (err) {
    // Never let analytics surface an error into a business function.
    console.warn("ga4: send skipped:", err && err.message);
    return Promise.resolve();
  }
}

/**
 * GA4 ecommerce `purchase`. Razorpay reports paise; GA4 wants rupees.
 */
function sendPurchase(opts) {
  const o = opts || {};
  const value = typeof o.amountPaise === "number" ? o.amountPaise / 100 : o.value;
  const tier = o.plan_tier || "UNKNOWN";

  return sendGa4Events({
    gym_id: o.gym_id,
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: o.transaction_id,
          value,
          currency: "INR",
          plan_tier: tier,
          items: [
            {
              item_id: tier,
              item_name: `Gymloop ${tier}`,
              item_category: "subscription",
              price: value,
              quantity: 1,
            },
          ],
        },
      },
    ],
  });
}

module.exports = {
  sendGa4Events,
  sendPurchase,
  pseudoClientId,
  GA4_ENABLED: ENABLED,
};
