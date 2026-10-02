"use strict";

// Device clocks have no timezone (T7). Every wall-clock string from a device is
// read as Asia/Kolkata, a fixed +05:30 (India has no DST). Never use the
// server's receive time as a punch time, and never let Date parse the string.

const IST_OFFSET_MS = 330 * 60 * 1000;
const WALL_CLOCK_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;

// 'YYYY-MM-DD HH:mm:ss' (IST) → epoch ms, or null if malformed/impossible.
function istWallClockToMillis(str) {
  const m = WALL_CLOCK_RE.exec(String(str == null ? "" : str).trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const utc = Date.UTC(y, mo - 1, d, h, mi, s);
  if (new Date(utc).getUTCDate() !== d) return null; // e.g. 2026-02-31
  return utc - IST_OFFSET_MS;
}

// IST calendar date 'YYYY-MM-DD' for an epoch ms.
function istDateKey(ms) {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

// IST wall clock 'YYYYMMDDHHmmss' for an epoch ms (used in deterministic IDs).
function istCompact(ms) {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 19).replace(/[-T:]/g, "");
}

// IST wall clock 'YYYY-MM-DD HH:mm:ss' for an epoch ms.
function istWallClock(ms) {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 19).replace("T", " ");
}

module.exports = { IST_OFFSET_MS, istWallClockToMillis, istDateKey, istCompact, istWallClock };
