"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { applyCheckinDays } = require("../src/streak");

const m = (current, longest, last) => ({ current_streak: current, longest_streak: longest, last_checkin_date: last });

test("streak: first ever check-in starts at 1", () => {
  assert.deepEqual(applyCheckinDays({}, ["2026-10-03"]), { current_streak: 1, longest_streak: 1, last_checkin_date: "2026-10-03", changed: true });
});

test("streak: consecutive day increments and raises longest", () => {
  assert.deepEqual(applyCheckinDays(m(4, 4, "2026-10-02"), ["2026-10-03"]), { current_streak: 5, longest_streak: 5, last_checkin_date: "2026-10-03", changed: true });
});

test("streak: same day is a no-op (second punch, replay)", () => {
  assert.equal(applyCheckinDays(m(4, 9, "2026-10-03"), ["2026-10-03"]).changed, false);
});

test("streak: a gap resets to 1 but keeps longest", () => {
  assert.deepEqual(applyCheckinDays(m(4, 9, "2026-09-30"), ["2026-10-03"]), { current_streak: 1, longest_streak: 9, last_checkin_date: "2026-10-03", changed: true });
});

test("streak: offline backlog of several days, unsorted with duplicates", () => {
  const r = applyCheckinDays(m(2, 2, "2026-09-30"), ["2026-10-02", "2026-10-01", "2026-10-02", "2026-10-03"]);
  assert.deepEqual([r.current_streak, r.longest_streak, r.last_checkin_date], [5, 5, "2026-10-03"]);
});

test("streak: days older than last_checkin_date never move it backwards", () => {
  assert.equal(applyCheckinDays(m(3, 3, "2026-10-03"), ["2026-10-01", "2026-10-02"]).changed, false);
});

test("streak: month and year boundaries", () => {
  assert.equal(applyCheckinDays(m(1, 1, "2026-10-31"), ["2026-11-01"]).current_streak, 2);
  assert.equal(applyCheckinDays(m(1, 1, "2026-12-31"), ["2027-01-01"]).current_streak, 2);
  assert.equal(applyCheckinDays(m(1, 1, "2028-02-28"), ["2028-02-29"]).current_streak, 2);
});
