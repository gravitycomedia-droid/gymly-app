"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  startOfTodayIST,
  istDateKey,
  istWallClockToMillis,
  isMemberActive,
} = require("../src/lib/membership");
const { computeExtendedExpiry } = require("../src/extendMembership");

const iso = (ms) => new Date(ms).toISOString();
const at = (s) => new Date(s);

test("startOfTodayIST: last ms of the IST day still belongs to that day", () => {
  // 2026-10-02 23:59:59.999 IST
  assert.equal(startOfTodayIST(at("2026-10-02T18:29:59.999Z")).toISOString(), "2026-10-01T18:30:00.000Z");
});

test("startOfTodayIST: IST midnight starts the next day", () => {
  // 2026-10-03 00:00:00.000 IST
  assert.equal(startOfTodayIST(at("2026-10-02T18:30:00.000Z")).toISOString(), "2026-10-02T18:30:00.000Z");
});

test("startOfTodayIST: UTC morning is still the same IST day", () => {
  // 2026-10-03 05:29 IST (UTC still 2026-10-02 23:59)
  assert.equal(startOfTodayIST(at("2026-10-02T23:59:00Z")).toISOString(), "2026-10-02T18:30:00.000Z");
});

test("istDateKey flips at IST midnight, not UTC midnight", () => {
  assert.equal(istDateKey(at("2026-10-02T18:29:59Z")), "2026-10-02");
  assert.equal(istDateKey(at("2026-10-02T18:30:00Z")), "2026-10-03");
});

test("istWallClockToMillis: master-prompt reference value", () => {
  assert.equal(iso(istWallClockToMillis("2026-10-03 06:15:00")), "2026-10-03T00:45:00.000Z");
});

test("istWallClockToMillis: just after IST midnight lands on the previous UTC day", () => {
  assert.equal(iso(istWallClockToMillis("2026-10-03 00:10:00")), "2026-10-02T18:40:00.000Z");
});

test("istWallClockToMillis: rejects malformed and impossible times", () => {
  for (const bad of ["", null, "2026-10-03", "2026-10-03 6:15:00", "2026-13-01 00:00:00",
    "2026-02-31 10:00:00", "2026-10-03 24:00:00", "garbage"]) {
    assert.equal(istWallClockToMillis(bad), null, String(bad));
  }
});

test("isMemberActive: expiry earlier today (IST) is active all day (inclusive)", () => {
  const member = { subscription_expiry: at("2026-10-02T04:30:00Z") }; // 10:00 IST Oct 2
  assert.equal(isMemberActive(member, at("2026-10-02T18:29:59Z")), true); // 23:59:59 IST Oct 2
});

test("isMemberActive: inactive from IST midnight the next day", () => {
  const member = { subscription_expiry: at("2026-10-02T04:30:00Z") };
  assert.equal(isMemberActive(member, at("2026-10-02T18:30:00Z")), false); // 00:00 IST Oct 3
});

test("isMemberActive: expiry exactly at start of today is active", () => {
  const member = { subscription_expiry: at("2026-10-01T18:30:00Z") }; // 00:00 IST Oct 2
  assert.equal(isMemberActive(member, at("2026-10-02T12:00:00Z")), true);
});

test("isMemberActive: soft-deleted, missing or malformed expiry is inactive", () => {
  const now = at("2026-10-02T12:00:00Z");
  assert.equal(isMemberActive({ subscription_expiry: at("2099-01-01"), is_deleted: true }, now), false);
  assert.equal(isMemberActive({}, now), false);
  assert.equal(isMemberActive(null, now), false);
  assert.equal(isMemberActive({ subscription_expiry: "not a date" }, now), false);
});

test("isMemberActive: accepts Firestore Timestamp-like values", () => {
  const ts = { toMillis: () => Date.parse("2026-10-05T00:00:00Z") };
  assert.equal(isMemberActive({ subscription_expiry: ts }, at("2026-10-02T12:00:00Z")), true);
});

test("computeExtendedExpiry: future expiry extends from the expiry", () => {
  const out = computeExtendedExpiry(at("2026-10-10T10:00:00Z"), 5, at("2026-10-02T12:00:00Z"));
  assert.equal(out.toISOString(), "2026-10-15T10:00:00.000Z");
});

test("computeExtendedExpiry: lapsed expiry extends from start of today IST", () => {
  const out = computeExtendedExpiry(at("2026-09-01T10:00:00Z"), 3, at("2026-10-02T12:00:00Z"));
  assert.equal(out.toISOString(), "2026-10-04T18:30:00.000Z"); // 00:00 IST Oct 5
});

test("computeExtendedExpiry: missing expiry extends from start of today IST", () => {
  const out = computeExtendedExpiry(null, 1, at("2026-10-02T12:00:00Z"));
  assert.equal(out.toISOString(), "2026-10-02T18:30:00.000Z");
});
