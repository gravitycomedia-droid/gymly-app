"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isMemberActive } = require("../src/lib/membership");
const {
  freezeSettings,
  freezesUsed,
  frozenDaysSoFar,
  buildUnfreeze,
} = require("../src/lib/freeze");

const at = (s) => new Date(s);
const ts = (s) => ({ toMillis: () => Date.parse(s) });
const DAY = 86400000;

test("freezeSettings: defaults 7/14/30, 2 freezes, free, entry ends the freeze", () => {
  assert.deepEqual(freezeSettings(null), {
    enabled: true, durations: [7, 14, 30], max_per_membership: 2, fee: 0, entry_policy: "unfreeze",
  });
});

test("freezeSettings: sanitises owner-edited values", () => {
  const s = freezeSettings({ settings: { freeze: {
    enabled: false, durations: [30, 7, 7, 0, 500, 2.5, 10], max_per_membership: 3, fee: 199.6, entry_policy: "block",
  } } });
  assert.deepEqual(s, { enabled: false, durations: [7, 10, 30], max_per_membership: 3, fee: 200, entry_policy: "block" });
  assert.equal(freezeSettings({ settings: { freeze: { max_per_membership: -1, fee: -5 } } }).max_per_membership, 2);
});

test("frozenDaysSoFar: counts whole IST days, same day = 0", () => {
  const m = { frozen: true, frozen_at: ts("2026-10-03T05:00:00Z") }; // 10:30 IST, 3 Oct
  assert.equal(frozenDaysSoFar(m, at("2026-10-03T17:00:00Z")), 0); // 22:30 IST same day
  assert.equal(frozenDaysSoFar(m, at("2026-10-03T19:00:00Z")), 1); // 00:30 IST, 4 Oct
  assert.equal(frozenDaysSoFar(m, at("2026-10-10T00:00:00Z")), 7);
});

test("buildUnfreeze: adds the frozen days to the expiry and records history", () => {
  const m = {
    frozen: true, frozen_at: ts("2026-10-03T05:00:00Z"), freeze_days: 14, freeze_reason: "Trip",
    subscription_expiry: ts("2026-10-20T18:29:59.000Z"),
  };
  const r = buildUnfreeze(m, at("2026-10-08T06:00:00Z"), "staff", "uid1");
  assert.equal(r.days, 5);
  assert.equal(r.newExpiry.getTime(), Date.parse("2026-10-20T18:29:59.000Z") + 5 * DAY);
  assert.equal(r.update.frozen, false);
  assert.equal(r.update.frozen_at, null);
  assert.equal(r.entry.ended_by, "staff");
  assert.equal(r.entry.reason, "Trip");
  assert.equal(r.entry.actual_days, 5);
});

test("buildUnfreeze: never credits more than the planned freeze length", () => {
  const m = { frozen: true, frozen_at: ts("2026-10-03T05:00:00Z"), freeze_days: 7, subscription_expiry: ts("2026-10-20T00:00:00Z") };
  assert.equal(buildUnfreeze(m, at("2026-10-25T06:00:00Z"), "auto").days, 7);
});

test("freezesUsed: counts this membership period only, plus one in progress", () => {
  const m = {
    start_date: ts("2026-01-01T00:00:00Z"),
    renewal_history: [
      { renewed_at: "2026-06-01T00:00:00Z" },               // new paid period starts here
      { type: "extension", renewed_at: "2026-08-01T00:00:00Z" }, // extensions don't reset it
    ],
    freeze_history: [
      { frozen_at: "2026-03-01T00:00:00Z" }, // previous period
      { frozen_at: "2026-07-01T00:00:00Z" },
    ],
    frozen: true,
  };
  assert.equal(freezesUsed(m), 2);
  assert.equal(freezesUsed({ ...m, frozen: false }), 1);
});

test("isMemberActive: frozen under 'unfreeze' keeps access even past the old expiry", () => {
  const m = {
    frozen: true, freeze_entry_policy: "unfreeze",
    frozen_at: ts("2026-10-03T05:00:00Z"),
    subscription_expiry: ts("2026-10-05T18:29:59.000Z"), // expiry date passes while frozen
  };
  assert.equal(isMemberActive(m, at("2026-10-12T06:00:00Z")), true);
});

test("isMemberActive: frozen under 'block' is inactive", () => {
  const m = {
    frozen: true, freeze_entry_policy: "block",
    frozen_at: ts("2026-10-03T05:00:00Z"),
    subscription_expiry: ts("2026-12-31T18:29:59.000Z"),
  };
  assert.equal(isMemberActive(m, at("2026-10-04T06:00:00Z")), false);
});

test("isMemberActive: unfrozen members are unaffected", () => {
  const m = { subscription_expiry: ts("2026-10-05T18:29:59.000Z") };
  assert.equal(isMemberActive(m, at("2026-10-05T10:00:00Z")), true);
  assert.equal(isMemberActive(m, at("2026-10-06T10:00:00Z")), false);
});
