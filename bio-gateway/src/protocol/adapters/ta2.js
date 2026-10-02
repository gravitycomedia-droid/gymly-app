"use strict";

// TA PUSH 2.x adapter (Tier 1: K40 Pro, K45 Pro, K30 Pro, F22, X990, K21 Pro).
// Maps upload tables to parsers and picks the right command dialect for a
// device's capabilities.

const { parseAttlog } = require("../attlog");
const { parseOperlog } = require("../operlog");
const { parseKv } = require("../kv");
const commands = require("../commands");
const { buildBiodataUpsert } = require("../biodata");

// table name (upper-case) → how the gateway treats the upload
const TABLES = {
  ATTLOG: "punches",
  OPERLOG: "roster",
  USERINFO: "roster",
  USER: "roster",
  FINGERTMP: "roster",
  BIODATA: "roster",
  OPTIONS: "options",
};

function tableKind(table) {
  return TABLES[String(table || "").toUpperCase()] || "other";
}

function parsePunches(body) {
  return parseAttlog(body);
}

function parseRoster(body, table) {
  return parseOperlog(body, table);
}

// table=options body: "~DeviceName=K40,MAC=..,~ZKFPVersion=10,FWVersion=.."
// (comma- or newline-separated depending on firmware).
function parseOptions(body) {
  return parseKv(String(body || "").replace(/\r?\n/g, ","), ",");
}

// Template push: choose FINGERTMP vs BIODATA by the TARGET device's caps.
// Returns null when the target cannot take this template (AC 3.x or an
// algorithm mismatch); the caller marks the enrollment needs_reenroll_on.
function templateCommand(targetCaps, pin, template) {
  if (!templateCompatible(targetCaps, template)) return null;
  if (targetCaps.templateTable === "BIODATA") {
    return {
      type: "BIODATA_UPSERT",
      cmd: buildBiodataUpsert({
        pin,
        fingerIndex: template.fingerIndex,
        subIndex: template.subIndex || 0,
        majorVer: template.majorVer,
        minorVer: template.minorVer,
        tmp: template.tmp,
      }),
    };
  }
  if (targetCaps.templateTable === "FINGERTMP") {
    return { type: "FP_UPSERT", cmd: commands.fpUpsert(pin, template.fingerIndex, template.tmp) };
  }
  return null;
}

// Only push a template to a device whose fingerprint algorithm matches the
// template's major version (ZKFinger VX10 and VX12 are not interchangeable).
// Unknown on either side → not compatible (re-enroll rather than guess).
function templateCompatible(targetCaps, template) {
  if (!targetCaps || targetCaps.protocol !== "ta2") return false;
  if (!template || template.type !== 1) return false;
  if (targetCaps.fpAlgo == null || template.majorVer == null) return false;
  return Number(targetCaps.fpAlgo) === Number(template.majorVer);
}

function enrollCommand(caps, pin, fingerIndex) {
  if (caps.templateTable === "BIODATA") {
    return { kind: "ENROLL_BIO", cmd: commands.enrollBio(pin, fingerIndex) };
  }
  return { kind: "ENROLL_FP", cmd: commands.enrollFp(pin, fingerIndex) };
}

module.exports = {
  name: "ta2",
  tableKind,
  parsePunches,
  parseRoster,
  parseOptions,
  templateCommand,
  templateCompatible,
  enrollCommand,
};
