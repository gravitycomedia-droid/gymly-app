"use strict";

// Security / AC PUSH 3.x adapter — SCAFFOLD ONLY in v1 (Tier 2 face terminals
// in AC mode). Parsers are unit-tested; command support (user/templatev10
// writes) is v2. Punches from table=rtlog go through the same attendance
// writer as TA ATTLOG punches.
//
//   POST /iclock/registry?SN=..   → "RegistryCode=<code>"
//   GET|POST /iclock/push?SN=..   → session config (below)
//   POST /iclock/cdata?SN=..&table=rtlog
//       time=2026-10-03 06:15:00\tpin=1000\tcardno=0\teventaddr=1\tevent=0\tinoutstatus=0\tverifytype=1\tindex=12

const crypto = require("crypto");
const { splitLines, parseKv, toInt } = require("../kv");
const { istWallClockToMillis } = require("../../time/ist");
const { parseOperlog } = require("../operlog");

// rtlog `event` codes that mean "a person was verified" on AC firmware. Only
// 0 (normal verify / door open) is treated as a punch in v1; everything else
// (alarms, door sensor, illegal verify) is logged, not counted.
const PUNCH_EVENTS = new Set([0]);

const TABLES = {
  RTLOG: "punches",
  USER: "roster",
  TEMPLATEV10: "roster",
  OPTIONS: "options",
};

function tableKind(table) {
  return TABLES[String(table || "").toUpperCase()] || "other";
}

function parseRtlog(body) {
  const records = [];
  const errors = [];
  const ignored = [];
  for (const line of splitLines(body)) {
    const kv = parseKv(line);
    const pin = kv.pin != null ? String(kv.pin).trim() : "";
    const event = toInt(kv.event);
    if (event == null || !PUNCH_EVENTS.has(event)) {
      ignored.push({ line, reason: `event_${event}` });
      continue;
    }
    if (!/^[A-Za-z0-9]{1,24}$/.test(pin) || pin === "0") {
      errors.push({ line, reason: "bad_pin" });
      continue;
    }
    const timeMs = istWallClockToMillis(kv.time);
    if (timeMs == null) {
      errors.push({ line, reason: "bad_time" });
      continue;
    }
    const verify = toInt(kv.verifytype);
    records.push({
      pin,
      time: kv.time.trim(),
      timeMs,
      status: toInt(kv.inoutstatus),
      verify,
      verifyMode: verify === 1 ? "fingerprint" : verify == null ? null : `code_${verify}`,
      workcode: null,
      rawLine: line,
    });
  }
  return { records, errors, ignored };
}

function parseRoster(body, table) {
  return parseOperlog(body, table);
}

// registry body is comma-separated key=value device parameters.
function parseRegistry(body) {
  return parseKv(String(body || "").replace(/\r?\n/g, ","), ",");
}

function registryResponse(registryCode) {
  return `RegistryCode=${registryCode}`;
}

function newRegistryCode() {
  return crypto.randomBytes(8).toString("hex");
}

function pushConfig({ sessionId }) {
  return [
    "ServerVersion=3.1.2",
    "ServerName=GymlyADMS",
    "PushVersion=3.1.2",
    "ErrorDelay=60",
    "RequestDelay=10",
    "TransTimes=00:00\t14:00",
    "TransInterval=1",
    "TransTables=User\tTransaction",
    "Realtime=1",
    `SessionID=${sessionId}`,
    "TimeoutSec=10",
  ].join("\n");
}

module.exports = {
  name: "ac3",
  PUNCH_EVENTS,
  tableKind,
  parsePunches: parseRtlog,
  parseRtlog,
  parseRoster,
  parseOptions: parseRegistry,
  parseRegistry,
  registryResponse,
  newRegistryCode,
  pushConfig,
  // v1: no AC command support — templates are stored but never pushed.
  templateCommand: () => null,
  templateCompatible: () => false,
  enrollCommand: () => null,
};
