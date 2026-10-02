"use strict";

// Emulator tests for Part 0 (D1 attendance mode, D2 inclusive expiry, D2b extend).
// Run with: npm run test:emulator   (skipped under plain `npm test`).

const test = require("node:test");
const assert = require("node:assert/strict");

const SKIP = !process.env.FIRESTORE_EMULATOR_HOST && "needs the Firestore emulator (npm run test:emulator)";

const PROJECT = process.env.GCLOUD_PROJECT || "demo-gymly-test";

let fft, admin, db, wrapped;

test.before(() => {
  if (SKIP) return;
  fft = require("firebase-functions-test")({ projectId: PROJECT });
  admin = require("firebase-admin");
  const { setAttendanceMode } = require("../../src/attendanceMode");
  const { extendMembership } = require("../../src/extendMembership");
  const { processScan } = require("../../src/processScan");
  db = admin.firestore();
  wrapped = {
    setAttendanceMode: fft.wrap(setAttendanceMode),
    extendMembership: fft.wrap(extendMembership),
    processScan: fft.wrap(processScan),
  };
});

test.after(async () => {
  if (fft) fft.cleanup();
});

const ctx = (uid, role, gymId) => ({
  auth: { uid, token: { role, gym_id: gymId, firebase: { sign_in_provider: "phone" } } },
});

async function reset() {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
}

async function expectHttpsError(promise, code, msgPart) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`);
    if (msgPart) assert.match(err.message, new RegExp(msgPart));
    return true;
  });
}

const Ts = (d) => admin.firestore.Timestamp.fromDate(new Date(d));

// ── setAttendanceMode ──────────────────────────────────────────────────────
test("setAttendanceMode: PREMIUM owner can switch to biometric and back", { skip: SKIP }, async () => {
  await reset();
  await db.doc("subscriptions/G1").set({ plan: "PREMIUM", status: "active" });
  const r1 = await wrapped.setAttendanceMode({ mode: "biometric" }, ctx("O1", "owner", "G1"));
  assert.deepEqual(r1, { mode: "biometric", changed: true });
  assert.equal((await db.doc("gym_settings/G1").get()).data().attendance_mode, "biometric");
  const r2 = await wrapped.setAttendanceMode({ mode: "biometric" }, ctx("O1", "owner", "G1"));
  assert.equal(r2.changed, false);
  const r3 = await wrapped.setAttendanceMode({ mode: "qr" }, ctx("O1", "owner", "G1"));
  assert.deepEqual(r3, { mode: "qr", changed: true });
  const audits = await db.collection("audit_logs/G1/events").where("action", "==", "attendance_mode_changed").get();
  assert.equal(audits.size, 2);
});

test("setAttendanceMode: PREMIUM_PLUS is entitled", { skip: SKIP }, async () => {
  await reset();
  await db.doc("subscriptions/G1").set({ plan: "PREMIUM_PLUS" });
  const r = await wrapped.setAttendanceMode({ mode: "biometric" }, ctx("O1", "owner", "G1"));
  assert.equal(r.mode, "biometric");
});

test("setAttendanceMode: lower plan or missing subscription is denied biometric", { skip: SKIP }, async () => {
  await reset();
  await db.doc("subscriptions/G1").set({ plan: "PROFESSIONAL_PLUS" });
  await expectHttpsError(wrapped.setAttendanceMode({ mode: "biometric" }, ctx("O1", "owner", "G1")), "permission-denied", "Premium");
  await expectHttpsError(wrapped.setAttendanceMode({ mode: "biometric" }, ctx("O2", "owner", "G2")), "permission-denied", "Premium");
  assert.equal((await db.doc("gym_settings/G1").get()).exists, false);
});

test("setAttendanceMode: downgraded gym can still switch back to QR", { skip: SKIP }, async () => {
  await reset();
  await db.doc("subscriptions/G1").set({ plan: "FREE" });
  await db.doc("gym_settings/G1").set({ attendance_mode: "biometric" });
  const r = await wrapped.setAttendanceMode({ mode: "qr" }, ctx("O1", "owner", "G1"));
  assert.deepEqual(r, { mode: "qr", changed: true });
});

test("setAttendanceMode: non-owners, bad input and unauthenticated are rejected", { skip: SKIP }, async () => {
  await reset();
  await db.doc("subscriptions/G1").set({ plan: "PREMIUM" });
  for (const role of ["manager", "receptionist", "trainer", "member"]) {
    await expectHttpsError(wrapped.setAttendanceMode({ mode: "biometric" }, ctx("X", role, "G1")), "permission-denied");
  }
  await expectHttpsError(wrapped.setAttendanceMode({ mode: "face" }, ctx("O1", "owner", "G1")), "invalid-argument");
  await expectHttpsError(wrapped.setAttendanceMode({ mode: "qr" }, {}), "unauthenticated");
});

// ── extendMembership ───────────────────────────────────────────────────────
test("extendMembership: active member extends from current expiry", { skip: SKIP }, async () => {
  await reset();
  const expiry = new Date(Date.now() + 10 * 86400000);
  await db.doc("users/M1").set({ role: "member", gym_id: "G1", name: "Ravi", subscription_expiry: Ts(expiry), plan_id: "p1" });
  const r = await wrapped.extendMembership({ memberId: "M1", days: 7, reason: "Diwali closure" }, ctx("O1", "owner", "G1"));
  assert.equal(r.newExpiry, new Date(expiry.getTime() + 7 * 86400000).toISOString());
  const m = (await db.doc("users/M1").get()).data();
  assert.equal(m.subscription_expiry.toDate().toISOString(), r.newExpiry);
  assert.equal(m.renewal_history.length, 1);
  assert.equal(m.renewal_history[0].type, "extension");
  assert.equal(m.renewal_history[0].days, 7);
  assert.equal(m.renewal_history[0].reason, "Diwali closure");
  const audits = await db.collection("audit_logs/G1/events").where("action", "==", "membership_extended").get();
  assert.equal(audits.size, 1);
});

test("extendMembership: lapsed member extends from start of today IST", { skip: SKIP }, async () => {
  await reset();
  const { startOfTodayIST } = require("../../src/lib/membership");
  await db.doc("users/M1").set({ role: "member", gym_id: "G1", subscription_expiry: Ts("2020-01-01") });
  const r = await wrapped.extendMembership({ memberId: "M1", days: 2 }, ctx("MG", "manager", "G1"));
  assert.equal(r.newExpiry, new Date(startOfTodayIST().getTime() + 2 * 86400000).toISOString());
});

test("extendMembership: authorization and validation", { skip: SKIP }, async () => {
  await reset();
  await db.doc("users/M1").set({ role: "member", gym_id: "G1", subscription_expiry: Ts("2020-01-01") });
  await db.doc("users/DEL").set({ role: "member", gym_id: "G1", is_deleted: true, subscription_expiry: Ts("2020-01-01") });
  await db.doc("users/STAFF").set({ role: "trainer", gym_id: "G1" });
  for (const role of ["receptionist", "trainer", "member"]) {
    await expectHttpsError(wrapped.extendMembership({ memberId: "M1", days: 5 }, ctx("X", role, "G1")), "permission-denied");
  }
  await expectHttpsError(wrapped.extendMembership({ memberId: "M1", days: 5 }, ctx("O2", "owner", "G2")), "permission-denied", "different gym");
  for (const days of [0, 366, 1.5, "5", null]) {
    await expectHttpsError(wrapped.extendMembership({ memberId: "M1", days }, ctx("O1", "owner", "G1")), "invalid-argument");
  }
  await expectHttpsError(wrapped.extendMembership({ memberId: "NOPE", days: 5 }, ctx("O1", "owner", "G1")), "not-found");
  await expectHttpsError(wrapped.extendMembership({ memberId: "DEL", days: 5 }, ctx("O1", "owner", "G1")), "failed-precondition");
  await expectHttpsError(wrapped.extendMembership({ memberId: "STAFF", days: 5 }, ctx("O1", "owner", "G1")), "failed-precondition");
  const m = (await db.doc("users/M1").get()).data();
  assert.equal(m.renewal_history, undefined);
});

// ── processScan (D1 guard, D2 inclusive expiry, is_deleted) ────────────────
test("processScan: manual check-in still works in QR mode (no gym_settings doc)", { skip: SKIP }, async () => {
  await reset();
  await db.doc("users/M1").set({ role: "member", gym_id: "G1", name: "Ravi", subscription_expiry: Ts(Date.now() + 86400000) });
  const r = await wrapped.processScan({ manualMemberId: "M1" }, ctx("R1", "receptionist", "G1"));
  assert.equal(r.status, "success");
});

test("processScan: biometric mode rejects every scan", { skip: SKIP }, async () => {
  await reset();
  await db.doc("gym_settings/G1").set({ attendance_mode: "biometric" });
  await db.doc("users/M1").set({ role: "member", gym_id: "G1", subscription_expiry: Ts(Date.now() + 86400000) });
  await expectHttpsError(wrapped.processScan({ manualMemberId: "M1" }, ctx("R1", "receptionist", "G1")), "failed-precondition", "QR attendance is disabled");
  await expectHttpsError(wrapped.processScan({ qrPayload: "gymly://checkin/M1/G1/1/abc" }, ctx("R1", "receptionist", "G1")), "failed-precondition");
  assert.equal((await db.collection("attendance_logs").get()).size, 0);
});

test("processScan: membership that expired earlier today is still allowed (D2)", { skip: SKIP }, async () => {
  await reset();
  const { startOfTodayIST } = require("../../src/lib/membership");
  const earlierToday = new Date(Math.max(startOfTodayIST().getTime(), Date.now() - 60000));
  await db.doc("users/M1").set({ role: "member", gym_id: "G1", subscription_expiry: Ts(earlierToday) });
  const r = await wrapped.processScan({ manualMemberId: "M1" }, ctx("R1", "receptionist", "G1"));
  assert.equal(r.status, "success");
});

test("processScan: membership that expired yesterday is expired", { skip: SKIP }, async () => {
  await reset();
  const { startOfTodayIST } = require("../../src/lib/membership");
  await db.doc("users/M1").set({ role: "member", gym_id: "G1", subscription_expiry: Ts(startOfTodayIST().getTime() - 1) });
  const r = await wrapped.processScan({ manualMemberId: "M1" }, ctx("R1", "receptionist", "G1"));
  assert.equal(r.status, "expired");
});

test("processScan: soft-deleted member cannot check in", { skip: SKIP }, async () => {
  await reset();
  await db.doc("users/M1").set({ role: "member", gym_id: "G1", is_deleted: true, subscription_expiry: Ts(Date.now() + 86400000) });
  await expectHttpsError(wrapped.processScan({ manualMemberId: "M1" }, ctx("R1", "receptionist", "G1")), "not-found");
  assert.equal((await db.collection("attendance_logs").get()).size, 0);
});
