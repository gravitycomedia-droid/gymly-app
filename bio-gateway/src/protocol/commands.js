"use strict";

// Pure command builders (master §5.6). The wire line is `C:<seq>:<cmd>`; the
// strings here are the <cmd> part only. Fields are TAB-separated (T3), and the
// only verbs used are the ones verified on real hardware (T2):
//   DATA UPDATE USERINFO / DATA DELETE USERINFO / DATA QUERY USERINFO /
//   DATA UPDATE FINGERTMP / DATA UPDATE BIODATA / INFO / REBOOT / SET OPTION.
// Never USER ADD / USER DEL / DATA DEL.

const MIN_MEMBER_PIN = 1000; // PINs 1-999 belong to on-device admins (T14)
const MAX_NAME = 24;

function assertPin(pin) {
  const n = typeof pin === "string" && /^\d+$/.test(pin) ? Number(pin) : pin;
  if (!Number.isInteger(n) || n < MIN_MEMBER_PIN || n > 999999999) {
    throw new Error(`PIN must be an integer >= ${MIN_MEMBER_PIN}`);
  }
  return n;
}

// Names go onto a 2.x device as plain ASCII. Strip TAB/CR/LF first (a raw
// tab or newline in a name is command injection, T3), transliterate accents,
// drop everything non-printable (emoji, Telugu, Devanagari…), collapse
// whitespace, cap at 24 chars. If nothing is left, use "Member <pin>".
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

function userUpsert(pin, name, dialect = "pri", validity = null) {
  const p = assertPin(pin);
  const priKey = dialect === "privilege" ? "Privilege" : "Pri";
  const fields = [`DATA UPDATE USERINFO PIN=${p}`, `Name=${sanitizeName(name, p)}`, `${priKey}=0`];
  // Device-side validity window — only when caps.supportsUserValidity === 'yes'
  // and the probe recorded the field names (Part 6). Off by default on 2.x.
  if (validity && validity.startKey && validity.endKey && validity.start && validity.end) {
    fields.push(`${validity.startKey}=${validity.start}`, `${validity.endKey}=${validity.end}`);
  }
  return fields.join("\t");
}

function userDelete(pin) {
  return `DATA DELETE USERINFO PIN=${assertPin(pin)}`;
}

function fpUpsert(pin, fid, tmp) {
  const p = assertPin(pin);
  if (!Number.isInteger(fid) || fid < 0 || fid > 9) throw new Error("FID must be 0-9");
  if (!tmp || /[\t\r\n]/.test(tmp)) throw new Error("bad template payload");
  return `DATA UPDATE FINGERTMP PIN=${p}\tFID=${fid}\tSize=${tmp.length}\tValid=1\tTMP=${tmp}`;
}

// Remote enrollment (§6). Unverified on K40/K45 — probed in Part 6.
function enrollFp(pin, fid) {
  const p = assertPin(pin);
  if (!Number.isInteger(fid) || fid < 0 || fid > 9) throw new Error("FID must be 0-9");
  return `ENROLL_FP PIN=${p}\tFID=${fid}\tRETRY=3\tOVERWRITE=1`;
}

function enrollBio(pin, fingerIndex) {
  const p = assertPin(pin);
  if (!Number.isInteger(fingerIndex) || fingerIndex < 0 || fingerIndex > 9) {
    throw new Error("finger index must be 0-9");
  }
  return `ENROLL_BIO TYPE=1\tPIN=${p}\tNO=${fingerIndex}\tRETRY=3\tOVERWRITE=1`;
}

const info = () => "INFO";
const queryUsers = () => "DATA QUERY USERINFO";
const reboot = () => "REBOOT";

function setOption(key, value) {
  if (!/^[A-Za-z0-9_~]+$/.test(String(key))) throw new Error("bad option key");
  if (/[\t\r\n]/.test(String(value))) throw new Error("bad option value");
  return `SET OPTION ${key}=${value}`;
}

// RAW console commands (owner-only, Part 6): one line, no control chars.
function raw(cmd) {
  const s = String(cmd == null ? "" : cmd);
  if (!s.trim() || /[\r\n]/.test(s) || s.length > 2000) throw new Error("bad raw command");
  return s;
}

module.exports = {
  MIN_MEMBER_PIN,
  assertPin,
  sanitizeName,
  userUpsert,
  userDelete,
  fpUpsert,
  enrollFp,
  enrollBio,
  info,
  queryUsers,
  reboot,
  setOption,
  raw,
};
