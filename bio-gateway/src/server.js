"use strict";

// bio-gateway — the only thing a ZKTeco/eSSL device talks to.
//
// Device-facing rules (master §1):
//  T1  every /iclock/* reply is text/plain: `OK`, a handshake/config text, or
//      a command list. No JSON, HTML, redirects or compression.
//  T6  data-bearing requests are acked only after Firestore commits; a
//      transient failure → 500 (device retries); an unclaimed/inactive SN
//      → 503 (device keeps the data); an oversized body → logged + `OK`.
//  T9  every route also answers with a `.aspx` suffix, and with an optional
//      `/d/{token}` prefix.
// Caddy terminates HTTP/HTTPS on 80/443/8081 and proxies to 127.0.0.1:8080.

const express = require("express");
const { adapterFor, ac3, ta2 } = require("./protocol/adapters");
const { buildHandshake } = require("./protocol/handshake");
const { parseDeviceCmd } = require("./protocol/devicecmd");
const caps = require("./protocol/caps");
const { createHealth } = require("./health");
const log = require("./log");

const SN_RE = /^[A-Za-z0-9]{6,32}$/;
const ICLOCK_RE = /^(?:\/d\/([^/]+))?\/iclock\/([A-Za-z]+)(?:\.aspx)?\/?$/;
const MAX_BODY = "10mb";
const UNKNOWN_LOG_THROTTLE_MS = 10 * 60 * 1000;

function sendText(res, status, body) {
  res.status(status);
  res.set("Content-Type", "text/plain");
  res.set("Cache-Control", "no-store");
  res.send(body);
}
const ok = (res) => sendText(res, 200, "OK");

function clientIp(req) {
  const fwd = req.get("x-forwarded-for");
  // Caddy appends the real peer address last.
  const parts = fwd ? fwd.split(",") : [];
  return (parts.length ? parts[parts.length - 1] : req.socket.remoteAddress || "").trim() || null;
}

// Fixed-window per-IP limiter for /iclock/* (120 req/min by default).
function createRateLimiter({ limit = 120, windowMs = 60000, now = () => Date.now() } = {}) {
  const hits = new Map();
  return function rateLimited(ip) {
    const t = now();
    const h = hits.get(ip);
    if (!h || t - h.start >= windowMs) {
      hits.set(ip, { start: t, n: 1 });
      if (hits.size > 10000) {
        for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
      }
      return false;
    }
    h.n += 1;
    return h.n > limit;
  };
}

function createApp({ db, caches, store, now = () => Date.now(), rateLimit = {} }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("etag", false);
  app.set("trust proxy", false);

  const health = createHealth({ db, caches });
  app.get("/health", health);

  const rateLimited = createRateLimiter({ ...rateLimit, now });
  const unknownLogged = new Map();

  // Raw text body for every device route — no JSON/urlencoded parsers (§5.2).
  const rawBody = express.text({ type: () => true, limit: MAX_BODY, defaultCharset: "utf-8" });

  app.use((req, res, next) => {
    if (!req.path.startsWith("/iclock/") && !req.path.startsWith("/d/")) return next();
    if (rateLimited(clientIp(req))) return sendText(res, 503, "BUSY");
    rawBody(req, res, (err) => {
      if (err) {
        if (err.type === "entity.too.large") {
          // Never make a device retry an identical oversized body forever.
          log.warn("body_too_large", { path: req.path, sn: req.query.SN || req.query.sn });
          return ok(res);
        }
        log.warn("body_parse_error", { path: req.path, err });
        return ok(res);
      }
      handleIclock(req, res).catch((e) => {
        log.error("iclock_handler_error", { path: req.path, err: e, stack: e && e.stack });
        if (!res.headersSent) sendText(res, 500, "ERROR");
      });
    });
  });

  app.use((req, res) => sendText(res, 404, "Not found"));

  async function handleIclock(req, res) {
    const m = ICLOCK_RE.exec(req.path);
    const body = typeof req.body === "string" ? req.body : "";
    if (!m) {
      log.info("iclock_unknown_path", { path: req.path });
      return ok(res);
    }
    const token = m[1] ? decodeURIComponent(m[1]) : null;
    const endpoint = m[2].toLowerCase();
    const sn = String(req.query.SN || req.query.sn || "");
    const ip = clientIp(req);

    if (!SN_RE.test(sn)) {
      log.info("iclock_bad_sn", { path: req.path, sn: sn.slice(0, 40) });
      return ok(res);
    }

    let device = caches.devices.get(sn) || null;
    if (device) device = { ...device };

    if (token && device && device.deviceToken && token !== device.deviceToken) {
      log.warn("iclock_bad_token", { sn });
      return sendText(res, 401, "UNAUTHORIZED");
    }

    // Claim window: the first contact from a pending SN activates it, from
    // ANY endpoint (a device already in its getrequest loop may not handshake
    // again until it restarts — T8).
    if (device && device.status === "pending_claim") {
      const exp = device.claimExpiresAt && device.claimExpiresAt.toMillis ? device.claimExpiresAt.toMillis() : 0;
      if (exp > now()) {
        await store.activateDevice(device, {
          ip,
          capsPatch: { ...caps.capsFromQuery(req.query), ...caps.capsFromEndpoint(endpoint) },
        });
      } else {
        device = null; // expired claim → treated as unknown
      }
    }
    const active = device && device.status === "active" && device.gym_id;
    if (active) await store.touchDevice(device, ip);

    switch (endpoint) {
      case "cdata":
        if (req.method === "GET") return handshake(req, res, sn, device, active);
        return upload(req, res, sn, device, active, body);
      case "getrequest":
        return getRequest(req, res, sn, device, active);
      case "devicecmd":
        return deviceCmd(req, res, sn, device, active, body);
      case "querydata":
        // AC 3.x query results arrive here; same handling as a cdata upload.
        return upload(req, res, sn, device, active, body);
      case "registry":
        return registry(req, res, sn, device, active, body);
      case "push":
        return push(req, res, sn, device, active);
      case "ping":
        return ok(res);
      default:
        // fdata (photos), test, … — log and ack.
        if (active) await store.writeRawLog({ sn, path: req.path, query: req.query, body, status: 200, note: "unhandled_endpoint" });
        return ok(res);
    }
  }

  async function logUnknown(sn, req, body, note) {
    const last = unknownLogged.get(sn) || 0;
    if (now() - last < UNKNOWN_LOG_THROTTLE_MS) return;
    unknownLogged.set(sn, now());
    await store.writeRawLog({ sn, path: req.path, query: req.query, body, status: 200, note });
  }

  // GET /iclock/cdata?SN=..&options=all
  async function handshake(req, res, sn, device, active) {
    const q = Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k.toLowerCase(), v]));
    if (!q.options && !q.pushver && q.type) {
      // e.g. ?type=time — nothing to say; keep the device looping.
      return ok(res);
    }
    if (!active) {
      await logUnknown(sn, req, "", device ? `status_${device.status}` : "unknown_sn");
      return sendText(res, 200, buildHandshake(sn, {}));
    }
    await store.updateCaps(device, caps.capsFromQuery(req.query));
    return sendText(res, 200, buildHandshake(sn, device));
  }

  // POST /iclock/cdata?SN=..&table=..&Stamp=..
  async function upload(req, res, sn, device, active, body) {
    const table = String(req.query.table || req.query.Table || "").trim();
    if (!active) {
      await logUnknown(sn, req, body, device ? `upload_while_${device.status}` : "upload_unknown_sn");
      return sendText(res, 503, "UNAVAILABLE"); // device keeps the data (T6)
    }
    const deviceCaps = caps.currentCaps(device);
    const adapter = adapterFor(deviceCaps);
    // A table name from the "other" protocol family still routes correctly.
    let kind = adapter.tableKind(table);
    if (kind === "other") kind = (adapter === ac3 ? ta2 : ac3).tableKind(table);
    const stamp = req.query.Stamp || req.query.stamp || null;

    if (kind === "punches") {
      const parsed = String(table).toLowerCase() === "rtlog" ? ac3.parseRtlog(body) : adapter.parsePunches(body);
      if (parsed.errors.length) {
        log.warn("punch_lines_rejected", { sn, count: parsed.errors.length, reasons: parsed.errors.map((e) => e.reason) });
        await store.writeRawLog({ sn, path: req.path, query: req.query, body: parsed.errors.map((e) => e.line).join("\n"), status: 200, note: "malformed_punch_lines" });
      }
      const counts = await store.writePunches(device, parsed.records);
      log.info("punches", { sn, table, lines: parsed.records.length, ...counts });
      if (stamp && table.toUpperCase() === "ATTLOG") await store.updateDevice(sn, { attlogStamp: String(stamp) });
      return ok(res);
    }

    if (kind === "roster") {
      const items = adapter.parseRoster(body, table);
      const capsPatches = [];
      for (const it of items) {
        if (it.kind === "USER" && it.dialect) capsPatches.push(caps.capsFromUserLine(it.dialect));
        if (it.kind === "BIODATA") capsPatches.push(caps.capsFromBiodataUpload(it));
      }
      if (capsPatches.length) await store.updateCaps(device, ...capsPatches);
      const templates = items.filter((it) => it.kind === "FP" || it.kind === "BIODATA" || it.kind === "TEMPLATEV10");
      const counts = templates.length ? await store.storeTemplates(device, templates) : {};
      const other = items.filter((it) => !["FP", "BIODATA", "TEMPLATEV10", "USER"].includes(it.kind));
      if (other.length) {
        await store.writeRawLog({ sn, path: req.path, query: req.query, body: other.map((o) => o.rawLine).join("\n"), status: 200, note: `roster_other_${table}` });
      }
      log.info("roster", { sn, table, items: items.length, ...counts });
      if (stamp && table.toUpperCase() === "OPERLOG") await store.updateDevice(sn, { operlogStamp: String(stamp) });
      return ok(res);
    }

    if (kind === "options") {
      const kv = adapter.parseOptions(body);
      await store.updateCaps(device, caps.capsFromInfo(kv));
      return ok(res);
    }

    // ATTPHOTO and anything else: log and ack.
    await store.writeRawLog({ sn, path: req.path, query: req.query, body, status: 200, note: `table_${table || "none"}` });
    return ok(res);
  }

  // GET /iclock/getrequest?SN=.. — served from memory (zero reads).
  const inFlight = new Set();
  async function getRequest(req, res, sn, device, active) {
    if (!active) return ok(res);
    if (req.query.INFO) await store.updateCaps(device, caps.capsFromInfoParam(req.query.INFO));
    if (inFlight.has(sn)) return ok(res);
    inFlight.add(sn);
    try {
      const { deliver, expire } = store.selectCommands(sn);
      if (expire.length) await store.expireCommands(device, expire);
      if (!deliver.length) return ok(res);
      try {
        await store.markSent(sn, deliver);
      } catch (err) {
        // Never hand out a command we failed to mark as sent.
        log.error("mark_sent_failed", { sn, err });
        return ok(res);
      }
      const text = deliver.map((c) => `C:${c.seq}:${c.cmd}`).join("\n") + "\n";
      log.info("commands_sent", { sn, seqs: deliver.map((c) => c.seq) });
      return sendText(res, 200, text);
    } finally {
      inFlight.delete(sn);
    }
  }

  // POST /iclock/devicecmd?SN=.. — batched results (T4).
  async function deviceCmd(req, res, sn, device, active, body) {
    if (!active) return ok(res);
    const { results, errors } = parseDeviceCmd(body);
    if (errors.length) {
      await store.writeRawLog({ sn, path: req.path, query: req.query, body, status: 200, note: "devicecmd_unparsed" });
    }
    const counts = await store.applyAcks(device, results);
    log.info("acks", { sn, ...counts });
    return ok(res);
  }

  // AC 3.x registration (scaffold).
  async function registry(req, res, sn, device, active, body) {
    if (!active) {
      await logUnknown(sn, req, body, "registry_unknown_sn");
      return ok(res);
    }
    const kv = ac3.parseRegistry(body);
    const code = device.registryCode || ac3.newRegistryCode();
    await store.updateCaps(device, caps.capsFromEndpoint("registry"), caps.capsFromInfo(kv));
    if (!device.registryCode) await store.updateDevice(sn, { registryCode: code });
    return sendText(res, 200, ac3.registryResponse(code));
  }

  async function push(req, res, sn, device, active) {
    if (!active) return ok(res);
    await store.updateCaps(device, caps.capsFromEndpoint("push"));
    return sendText(res, 200, ac3.pushConfig({ sessionId: device.registryCode || sn }));
  }

  return app;
}

async function main() {
  const { initializeApp, applicationDefault, getApps } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");
  const { createCaches } = require("./store/caches");
  const { createStore } = require("./store/writes");

  if (!getApps().length) {
    // On the VM: the attached service account via ADC. No key files.
    initializeApp(process.env.FIRESTORE_EMULATOR_HOST
      ? { projectId: process.env.GCLOUD_PROJECT || "demo-gymly-test" }
      : { credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT || "gymly-app-06" });
  }
  const db = getFirestore();
  const caches = createCaches(db);
  const store = createStore(db, { caches });
  await caches.ready();
  log.info("caches_ready", { devices: caches.devices.size });

  const app = createApp({ db, caches, store });
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || "127.0.0.1";
  const server = app.listen(port, host, () => log.info("listening", { host, port }));
  server.keepAliveTimeout = 65000;

  const shutdown = () => {
    log.info("shutdown");
    caches.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (require.main === module) {
  main().catch((err) => {
    log.error("fatal", { err, stack: err && err.stack });
    process.exit(1);
  });
}

module.exports = { createApp, createRateLimiter, SN_RE, ICLOCK_RE };
