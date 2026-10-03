"use strict";

// Shared membership rules (D2). One definition of "active" for processScan,
// the biometric member trigger, the daily sweep and syncBioDevice.
//
// The expiry DATE is inclusive: a membership whose subscription_expiry falls
// anywhere inside today (IST) works all day and is removed by the 02:00 IST
// job the next day. India has no DST, so IST is a fixed +05:30 offset and no
// timezone library is needed.

const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function toMillis(value) {
  if (value == null) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

// Start of the current IST calendar day, as a Date (UTC instant).
function startOfTodayIST(now = new Date()) {
  const nowMs = toMillis(now);
  const istMs = nowMs + IST_OFFSET_MS;
  return new Date(istMs - (((istMs % DAY_MS) + DAY_MS) % DAY_MS) - IST_OFFSET_MS);
}

// 'YYYY-MM-DD' for the IST calendar day containing `date`.
function istDateKey(date = new Date()) {
  return new Date(toMillis(date) + IST_OFFSET_MS).toISOString().slice(0, 10);
}

const WALL_CLOCK_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;

// Device wall-clock string 'YYYY-MM-DD HH:mm:ss' read as IST → epoch ms.
// Returns null for anything malformed (T7: never fall back to server time).
function istWallClockToMillis(str) {
  const m = WALL_CLOCK_RE.exec(String(str || "").trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const utc = Date.UTC(y, mo - 1, d, h, mi, s);
  // Reject dates JS silently rolled over (e.g. 2026-02-31).
  if (new Date(utc).getUTCDate() !== d) return null;
  return utc - IST_OFFSET_MS;
}

function istWallClockToTimestamp(str) {
  const ms = istWallClockToMillis(str);
  return ms == null ? null : admin.firestore.Timestamp.fromMillis(ms);
}

// D2: !is_deleted && subscription_expiry >= start of today (IST).
// Frozen members (lib/freeze.js): with the gym's 'block' entry policy they are
// inactive; otherwise days don't run while frozen, so the expiry is judged as
// of the day the freeze began (they keep door access; checking in ends it).
function isMemberActive(member, now = new Date()) {
  if (!member || member.is_deleted === true) return false;
  const expiryMs = toMillis(member.subscription_expiry);
  if (expiryMs == null) return false;
  if (member.frozen === true) {
    if (member.freeze_entry_policy === "block") return false;
    const frozenAtMs = toMillis(member.frozen_at);
    if (frozenAtMs != null) return expiryMs >= startOfTodayIST(new Date(frozenAtMs)).getTime();
  }
  return expiryMs >= startOfTodayIST(now).getTime();
}

module.exports = {
  IST_OFFSET_MS,
  DAY_MS,
  toMillis,
  startOfTodayIST,
  istDateKey,
  istWallClockToMillis,
  istWallClockToTimestamp,
  isMemberActive,
};
