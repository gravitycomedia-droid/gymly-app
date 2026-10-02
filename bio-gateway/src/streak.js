"use strict";

// Member check-in streak for fingerprint punches — the same rules as
// processScan's computeStreak (functions/src/processScan.js), applied to IST
// punch days instead of "now":
//   same day as last_checkin_date  → unchanged
//   the day after                  → current + 1
//   any later day                  → reset to 1
// Days on or before last_checkin_date are ignored, so device re-uploads and
// out-of-order offline backlogs never move a streak backwards.

const DAY_MS = 24 * 60 * 60 * 1000;

function nextDay(dayKey) {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
}

// member: { current_streak, longest_streak, last_checkin_date }
// dayKeys: IST 'YYYY-MM-DD' check-in days (any order, duplicates allowed)
function applyCheckinDays(member, dayKeys) {
  let last = (member && member.last_checkin_date) || null;
  let current = (member && member.current_streak) || 0;
  let longest = (member && member.longest_streak) || 0;
  let changed = false;

  for (const day of [...new Set(dayKeys)].sort()) {
    if (last && day <= last) continue;
    current = last && day === nextDay(last) ? current + 1 : 1;
    last = day;
    changed = true;
  }
  if (current > longest) longest = current;
  return { current_streak: current, longest_streak: longest, last_checkin_date: last, changed };
}

module.exports = { applyCheckinDays, nextDay };
