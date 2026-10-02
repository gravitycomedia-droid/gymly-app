"use strict";

// Device command builders for Cloud Functions. This is a copy of the pure
// builders in bio-gateway/src/protocol/{commands,biodata}.js — Functions
// deploy only the functions/ folder, so they cannot require the gateway.
// functions/test/bio-commands-parity.test.js asserts both copies produce
// byte-identical commands, so they cannot drift.
//
// Wire rules: TAB-separated fields (T3); only hardware-verified verbs (T2);
// member PINs are >= 1000, PINs 1-999 belong to on-device admins (T14).

const MIN_MEMBER_PIN = 1000;
const MAX_NAME = 24;

function assertPin(pin) {
  const n = typeof pin === "string" && /^\d+$/.test(pin) ? Number(pin) : pin;
  if (!Number.isInteger(n) || n < MIN_MEMBER_PIN || n > 999999999) {
    throw new Error(`PIN must be an integer >= ${MIN_MEMBER_PIN}`);
  }
  return n;
}

function sanitizeName(name, pin) {
  const ascii = String(name == null ? "" : name)
    .replace(/[\t\r\n]+/g, " ")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/[=]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME)
    .trim();
  return ascii || (pin != null ? `Member ${pin}` : "Member");
}

function userUpsert(pin, name, dialect = "pri") {
  const p = assertPin(pin);
  const priKey = dialect === "privilege" ? "Privilege" : "Pri";
  return [`DATA UPDATE USERINFO PIN=${p}`, `Name=${sanitizeName(name, p)}`, `${priKey}=0`].join("\t");
}

function userDelete(pin) {
  return `DATA DELETE USERINFO PIN=${assertPin(pin)}`;
}

function checkFinger(i) {
  if (!Number.isInteger(i) || i < 0 || i > 9) throw new Error("finger index must be 0-9");
}

function checkTmp(tmp) {
  if (!tmp || /[\t\r\n]/.test(tmp)) throw new Error("bad template payload");
}

function fpUpsert(pin, fid, tmp) {
  const p = assertPin(pin);
  checkFinger(fid);
  checkTmp(tmp);
  return `DATA UPDATE FINGERTMP PIN=${p}\tFID=${fid}\tSize=${tmp.length}\tValid=1\tTMP=${tmp}`;
}

function biodataUpsert({ pin, fingerIndex, subIndex = 0, majorVer, minorVer, tmp }) {
  assertPin(pin);
  checkFinger(fingerIndex);
  checkTmp(tmp);
  return [
    `DATA UPDATE BIODATA Pin=${pin}`,
    `No=${fingerIndex}`,
    `Index=${subIndex}`,
    "Valid=1",
    "Duress=0",
    "Type=1",
    `MajorVer=${majorVer == null ? "" : majorVer}`,
    `MinorVer=${minorVer == null ? "" : minorVer}`,
    "Format=0",
    `Tmp=${tmp}`,
  ].join("\t");
}

function enrollFp(pin, fid) {
  const p = assertPin(pin);
  checkFinger(fid);
  return `ENROLL_FP PIN=${p}\tFID=${fid}\tRETRY=3\tOVERWRITE=1`;
}

function enrollBio(pin, fingerIndex) {
  const p = assertPin(pin);
  checkFinger(fingerIndex);
  return `ENROLL_BIO TYPE=1\tPIN=${p}\tNO=${fingerIndex}\tRETRY=3\tOVERWRITE=1`;
}

// Template → command for one TARGET device, or null when that device cannot
// take it (AC 3.x, or a fingerprint-algorithm mismatch / unknown algorithm).
function templateCompatible(caps, tpl) {
  if (!caps || (caps.protocol || "ta2") !== "ta2") return false;
  if (!tpl || tpl.type !== 1) return false;
  if (caps.fpAlgo == null || tpl.majorVer == null) return false;
  return Number(caps.fpAlgo) === Number(tpl.majorVer);
}

function templateCommand(caps, pin, tpl) {
  if (!templateCompatible(caps, tpl)) return null;
  if (caps.templateTable === "BIODATA") {
    return {
      type: "BIODATA_UPSERT",
      cmd: biodataUpsert({
        pin, fingerIndex: tpl.fingerIndex, subIndex: tpl.subIndex || 0,
        majorVer: tpl.majorVer, minorVer: tpl.minorVer, tmp: tpl.tmp,
      }),
    };
  }
  if ((caps.templateTable || "FINGERTMP") === "FINGERTMP") {
    return { type: "FP_UPSERT", cmd: fpUpsert(pin, tpl.fingerIndex, tpl.tmp) };
  }
  return null;
}

function enrollCommand(caps, pin, fingerIndex) {
  if ((caps && caps.protocol) === "ac3") return null;
  if (caps && caps.templateTable === "BIODATA") {
    return { kind: "ENROLL_BIO", cmd: enrollBio(pin, fingerIndex) };
  }
  return { kind: "ENROLL_FP", cmd: enrollFp(pin, fingerIndex) };
}

module.exports = {
  MIN_MEMBER_PIN,
  assertPin,
  sanitizeName,
  userUpsert,
  userDelete,
  fpUpsert,
  biodataUpsert,
  enrollFp,
  enrollBio,
  templateCompatible,
  templateCommand,
  enrollCommand,
};
