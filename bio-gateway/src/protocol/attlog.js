"use strict";

// ATTLOG upload (TA PUSH 2.x): one punch per line,
//   PIN \t YYYY-MM-DD HH:mm:ss \t Status \t Verify \t Workcode \t Reserved...
// One malformed line must never drop the rest of the batch (T6): it goes into
// `errors` and parsing continues.

const { splitLines, toInt } = require("./kv");
const { istWallClockToMillis } = require("../time/ist");

const PIN_RE = /^[A-Za-z0-9]{1,24}$/;

// Verify-mode codes seen on ZK firmware (s0x90/zkteco-adms table).
const VERIFY_MODES = {
  0: "password", 1: "fingerprint", 2: "card", 3: "password", 4: "card",
  9: "other", 15: "face", 25: "palm",
};

function parseAttlog(body) {
  const records = [];
  const errors = [];
  for (const line of splitLines(body)) {
    const f = line.split("\t").map((s) => s.trim());
    const pin = f[0];
    const time = f[1];
    if (!pin || !PIN_RE.test(pin)) {
      errors.push({ line, reason: "bad_pin" });
      continue;
    }
    const timeMs = istWallClockToMillis(time);
    if (timeMs == null) {
      errors.push({ line, reason: "bad_time" });
      continue;
    }
    const verify = toInt(f[3]);
    records.push({
      pin,
      time,
      timeMs,
      status: toInt(f[2]),
      verify,
      verifyMode: VERIFY_MODES[verify] || (verify == null ? null : `code_${verify}`),
      workcode: f[4] || null,
      rawLine: line,
    });
  }
  return { records, errors };
}

module.exports = { parseAttlog, VERIFY_MODES };
