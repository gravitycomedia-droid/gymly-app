"use strict";

// Per-device capability detection, persisted in bio_devices/{SN}.caps.
// Every detector returns a PARTIAL caps object; mergeCaps() returns only the
// fields that actually change so the gateway writes nothing when nothing is new.
// Fields:
//   protocol          'ta2' | 'ac3'
//   pushver           string as the device reports it
//   deviceType        'att' | 'acc'
//   fwVersion, model  strings
//   templateTable     'FINGERTMP' | 'BIODATA' | 'templatev10'
//   fpAlgo            number (ZKFinger major version, e.g. 10 or 12)
//   userinfoDialect   'pri' | 'privilege'
//   supportsEnroll    'unknown' | 'ENROLL_FP' | 'ENROLL_BIO' | 'none'
//   supportsDoorOpen  'unknown' | 'yes' | 'no'
//   supportsUserValidity 'unknown' | 'yes' | 'no'

const { toInt } = require("./kv");

const DEFAULT_CAPS = Object.freeze({
  protocol: "ta2",
  pushver: null,
  deviceType: "att",
  fwVersion: null,
  model: null,
  templateTable: "FINGERTMP",
  fpAlgo: null,
  userinfoDialect: "pri",
  supportsEnroll: "unknown",
  supportsDoorOpen: "unknown",
  supportsUserValidity: "unknown",
});

// '2.4.1' vs '2.4.0' → 1 / 0 / -1. Non-numeric parts compare as 0.
function compareVersions(a, b) {
  const pa = String(a || "0").split(/[^\d]+/).filter(Boolean).map(Number);
  const pb = String(b || "0").split(/[^\d]+/).filter(Boolean).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

function capsFromPushver(pushver) {
  if (!pushver) return {};
  const out = { pushver: String(pushver) };
  if (compareVersions(pushver, "3.0.0") >= 0) {
    out.protocol = "ac3";
    out.templateTable = "templatev10";
    out.deviceType = "acc";
  } else if (compareVersions(pushver, "2.4.0") >= 0) {
    out.templateTable = "BIODATA";
  }
  return out;
}

// Query string of the handshake / any request.
function capsFromQuery(query = {}) {
  const q = {};
  for (const [k, v] of Object.entries(query)) q[k.toLowerCase()] = v;
  const out = { ...capsFromPushver(q.pushver) };
  if (q.devicetype) out.deviceType = /acc/i.test(q.devicetype) ? "acc" : "att";
  return out;
}

// AC 3.x devices identify themselves by hitting /iclock/registry or /push.
function capsFromEndpoint(endpoint) {
  if (endpoint === "registry" || endpoint === "push") {
    return { protocol: "ac3", templateTable: "templatev10", deviceType: "acc" };
  }
  return {};
}

// Key/value info from INFO results, table=options uploads or getrequest?INFO=.
function capsFromInfo(kv = {}) {
  const out = {};
  const model = kv.devicename || kv.devicetype_name || kv["~devicename"];
  if (model) out.model = String(model).trim();
  const fw = kv.fwversion || kv.firmver || kv.firmwareversion;
  if (fw) out.fwVersion = String(fw).trim();
  const algo = toInt(kv.zkfpversion != null ? kv.zkfpversion : kv.fpversion);
  if (algo != null) out.fpAlgo = algo;
  const pv = kv.pushversion || kv.pushver;
  if (pv) Object.assign(out, capsFromPushver(pv));
  return out;
}

// getrequest?INFO=Ver 6.60 Apr 2 2020,12,3,240,192.168.1.20,10,7,12,15,...
// Field order (TA 2.x): FW, users, fingerprints, attlogs, IP, FP algo, face
// algo, face reg count, faces, ... Only the parts we trust are used.
function capsFromInfoParam(infoParam) {
  if (!infoParam) return {};
  const parts = String(infoParam).split(",");
  const out = {};
  if (parts[0] && parts[0].trim()) out.fwVersion = parts[0].trim();
  const algo = toInt(parts[5]);
  if (algo != null && algo > 0) out.fpAlgo = algo;
  return out;
}

function capsFromUserLine(dialect) {
  return dialect ? { userinfoDialect: dialect } : {};
}

// A device that uploads BIODATA uses the BIODATA table, whatever pushver said.
function capsFromBiodataUpload(item) {
  const out = { templateTable: "BIODATA" };
  if (item && item.type === 1 && item.majorVer != null) out.fpAlgo = item.majorVer;
  return out;
}

function currentCaps(device) {
  return { ...DEFAULT_CAPS, ...((device && device.caps) || {}) };
}

// → { changed: boolean, caps: full merged caps, patch: only changed fields }
function mergeCaps(existing, ...partials) {
  const base = { ...DEFAULT_CAPS, ...(existing || {}) };
  const merged = { ...base };
  for (const p of partials) Object.assign(merged, p || {});
  // An AC 3.x device never falls back to TA tables because of a later hint.
  if (merged.protocol === "ac3") merged.templateTable = "templatev10";
  const patch = {};
  for (const [k, v] of Object.entries(merged)) {
    const had = existing ? existing[k] : undefined;
    if (had !== v) patch[k] = v;
  }
  return { changed: Object.keys(patch).length > 0, caps: merged, patch };
}

module.exports = {
  DEFAULT_CAPS,
  compareVersions,
  capsFromPushver,
  capsFromQuery,
  capsFromEndpoint,
  capsFromInfo,
  capsFromInfoParam,
  capsFromUserLine,
  capsFromBiodataUpload,
  currentCaps,
  mergeCaps,
};
