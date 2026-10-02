"use strict";

// Small parsing helpers shared by every protocol module.

// Body → non-empty lines. Devices mix \r\n and \n (and stray \r).
function splitLines(body) {
  return String(body == null ? "" : body)
    .split(/\r\n|\n|\r/)
    .filter((l) => l.trim() !== "");
}

// 'K1=v1<sep>K2=v2' → { k1: 'v1', k2: 'v2' } (keys lower-cased; the value is
// everything after the FIRST '=' so base64 padding survives). Leading '~' on
// option names (e.g. '~DeviceName') is dropped. The original key spelling of
// each field is kept in `__keys` for dialect detection.
function parseKv(str, sep = "\t") {
  const out = {};
  const keys = [];
  for (const part of String(str == null ? "" : str).split(sep)) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const rawKey = part.slice(0, eq).trim().replace(/^~/, "");
    if (!rawKey) continue;
    keys.push(rawKey);
    out[rawKey.toLowerCase()] = part.slice(eq + 1);
  }
  Object.defineProperty(out, "__keys", { value: keys, enumerable: false });
  return out;
}

function toInt(v, fallback = null) {
  if (v == null || String(v).trim() === "") return fallback;
  const n = Number(String(v).trim());
  return Number.isInteger(n) ? n : fallback;
}

// Redact biometric template payloads before anything is logged or stored in
// bio_raw_logs (T17). Covers TA (TMP=/Tmp=) and AC (template=) spellings.
function redactTemplates(text) {
  return String(text == null ? "" : text).replace(
    /\b(tmp|template)=([^\t\r\n&]*)/gi,
    (_, k, v) => `${k}=<redacted ${v.length}b>`
  );
}

module.exports = { splitLines, parseKv, toInt, redactTemplates };
