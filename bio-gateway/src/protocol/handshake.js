"use strict";

// TA PUSH 2.x handshake — GET /iclock/cdata?SN=..&options=all (master §5.1 plus
// the build-prompt additions). Every value can be overridden per device via
// bio_devices/{SN}.handshakeOverrides (set a key to null to drop it), so
// Part 6 can tune a model without a redeploy.
//
// TimeZone only reaches the device on a fresh handshake (T8): after claiming,
// the owner flow tells them to restart the device.

const DEFAULTS = [
  ["ErrorDelay", "30"],
  ["Delay", "10"], // §6: poll every 10 s; polls cost zero Firestore reads
  ["TransTimes", "00:00;14:05"],
  ["TransInterval", "1"],
  ["TransFlag", "1111000000"],
  ["TimeZone", "330"], // IST, total minutes (T8)
  ["Realtime", "1"],
  ["Encrypt", "None"],
  ["ServerVer", "2.4.1"],
  ["PushProtVer", "2.4.1"],
  ["PushOptionsFlag", "1"],
];

function cleanValue(v) {
  return String(v).replace(/[\r\n]/g, "");
}

function buildHandshake(sn, device = {}) {
  const overrides = (device && device.handshakeOverrides) || {};
  const stamps = [
    ["ATTLOGStamp", device.attlogStamp || "0"],
    ["OPERLOGStamp", device.operlogStamp || "0"],
    ["ATTPHOTOStamp", "0"],
  ];
  const lines = [`GET OPTION FROM: ${sn}`];
  const seen = new Set();
  for (const [k, v] of [...stamps, ...DEFAULTS]) {
    seen.add(k);
    const value = Object.prototype.hasOwnProperty.call(overrides, k) ? overrides[k] : v;
    if (value === null || value === undefined) continue;
    lines.push(`${k}=${cleanValue(value)}`);
  }
  // Extra keys an installer adds for a specific firmware.
  for (const [k, v] of Object.entries(overrides)) {
    if (seen.has(k) || v === null || v === undefined) continue;
    if (!/^[A-Za-z0-9_~]+$/.test(k)) continue;
    lines.push(`${k}=${cleanValue(v)}`);
  }
  return lines.join("\n");
}

module.exports = { buildHandshake, HANDSHAKE_DEFAULTS: DEFAULTS };
