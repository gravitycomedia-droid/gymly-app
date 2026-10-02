"use strict";

// Part 3 emulator tests: member trigger, daily sweep, permanent delete,
// plan-downgrade freeze and the biometric callables.

const test = require("node:test");
const assert = require("node:assert/strict");

const SKIP = !process.env.FIRESTORE_EMULATOR_HOST && "needs the Firestore emulator (npm run test:emulator)";
const PROJECT = process.env.GCLOUD_PROJECT || "demo-gymly-test";
const DAY = 86400000;

let fft, admin, db, Ts, trigger, handleMemberWrite, core, call;

test.before(() => {
  if (SKIP) return;
  fft = require("firebase-functions-test")({ projectId: PROJECT });
  admin = require("firebase-admin");
  ({ handleMemberWrite } = require("../../src/bio/memberTrigger")); // initializes the app
  db = admin.firestore();
  Ts = (ms) => admin.firestore.Timestamp.fromMillis(ms);
  trigger = fft.wrap(require("../../src/bio/memberTrigger").bioOnMemberWrite);
  core = require("../../src/bio/core");
  const c = require("../../src/bio/callables");
  call = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, fft.wrap(v)]));
});

test.after(() => { if (fft) fft.cleanup(); });

const ctx = (uid, role, gymId) => ({ auth: { uid, token: { role, gym_id: gymId, firebase: { sign_in_provider: "phone" } } } });
const OWNER = ctx("O1", "owner", "G1");

async function reset() {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
}

// G1: PREMIUM + biometric mode + two active devices (algo 10 FINGERTMP, algo 12 BIODATA).
async function seedGym({ plan = "PREMIUM", mode = "biometric" } = {}) {
  await reset();
  const b = db.batch();
  b.set(db.doc("subscriptions/G1"), { plan, status: "active" });
  b.set(db.doc("gym_settings/G1"), { gym_id: "G1", attendance_mode: mode });
  b.set(db.doc("bio_devices/DEVA00001"), { gym_id: "G1", status: "active", activatedAt: Ts(Date.now()), cmdSeq: 0, caps: { protocol: "ta2", templateTable: "FINGERTMP", fpAlgo: 10, userinfoDialect: "pri" } });
  b.set(db.doc("bio_devices/DEVB00002"), { gym_id: "G1", status: "active", activatedAt: Ts(Date.now()), cmdSeq: 0, caps: { protocol: "ta2", templateTable: "BIODATA", fpAlgo: 12, userinfoDialect: "privilege" } });
  b.set(db.doc("bio_devices/DEVOFF0003"), { gym_id: "G1", status: "disabled", cmdSeq: 0, caps: {} });
  b.set(db.doc("bio_devices/OTHERG0004"), { gym_id: "G2", status: "active", cmdSeq: 0, caps: {} });
  await b.commit();
}

const member = (over = {}) => ({ role: "member", gym_id: "G1", name: "Ravi Kumar", subscription_expiry: Ts(Date.now() + 20 * DAY), ...over });

// Persist the new doc, then run the trigger body with before/after.
async function write(id, before, after) {
  if (after) await db.doc(`users/${id}`).set(after);
  return handleMemberWrite(id, before, after);
}

async function commands(sn) {
  const s = await db.collection("bio_commands").where("sn", "==", sn).get();
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.seq - b.seq);
}
const enrollment = async (pin) => (await db.doc(`bio_enrollments/G1_${pin}`).get()).data();

// ── trigger ─────────────────────────────────────────────────────────────────
test("new active member → PIN 1000, USER_UPSERT on every active device (dialect per device)", { skip: SKIP }, async () => {
  await seedGym();
  const r = await write("M1", null, member());
  assert.deepEqual(r, { action: "added", bioPin: 1000 });
  const a = await commands("DEVA00001");
  const b = await commands("DEVB00002");
  assert.deepEqual(a.map((c) => [c.id, c.type, c.cmd]), [["DEVA00001_1", "USER_UPSERT", "DATA UPDATE USERINFO PIN=1000\tName=Ravi Kumar\tPri=0"]]);
  assert.equal(b[0].cmd, "DATA UPDATE USERINFO PIN=1000\tName=Ravi Kumar\tPrivilege=0");
  assert.equal((await commands("DEVOFF0003")).length, 0, "disabled device untouched");
  assert.equal((await commands("OTHERG0004")).length, 0, "other gym untouched");
  const e = await enrollment(1000);
  assert.deepEqual([e.memberId, e.desiredOnDevice, e.bioStatus], ["M1", true, "not_enrolled"]);
  assert.equal((await db.doc("bio_counters/G1").get()).data().next, 1001);
  const r2 = await write("M2", null, member({ name: "Sita" }));
  assert.equal(r2.bioPin, 1001);
});

test("the real trigger wrapper runs end-to-end (create)", { skip: SKIP }, async () => {
  await seedGym();
  const after = member();
  await db.doc("users/MW").set(after);
  const change = fft.makeChange(
    fft.firestore.makeDocumentSnapshot(undefined, "users/MW"),
    fft.firestore.makeDocumentSnapshot(after, "users/MW")
  );
  await trigger(change, { params: { userId: "MW" } });
  assert.equal((await commands("DEVA00001")).length, 1);
});

test("streak-only / unrelated writes are ignored before any read", { skip: SKIP }, async () => {
  await seedGym();
  const m = member();
  await write("M1", null, m);
  const r = await write("M1", m, { ...m, current_streak: 4, last_checkin_date: "2026-10-02", weight: 70 });
  assert.equal(r.action, "ignored_fields");
  assert.equal((await commands("DEVA00001")).length, 1);
});

test("non-members and staff are ignored", { skip: SKIP }, async () => {
  await seedGym();
  assert.equal((await write("S1", null, { role: "receptionist", gym_id: "G1", name: "Desk" })).action, "ignored_role");
  assert.equal((await commands("DEVA00001")).length, 0);
});

test("rename while active → USER_UPSERT with the new name", { skip: SKIP }, async () => {
  await seedGym();
  const m = member();
  await write("M1", null, m);
  const r = await write("M1", m, { ...m, name: "Ravi K" });
  assert.equal(r.action, "renamed");
  const a = await commands("DEVA00001");
  assert.equal(a[1].cmd, "DATA UPDATE USERINFO PIN=1000\tName=Ravi K\tPri=0");
});

test("expiry moved into the past → USER_DELETE, desiredOnDevice false", { skip: SKIP }, async () => {
  await seedGym();
  const m = member();
  await write("M1", null, m);
  const r = await write("M1", m, { ...m, subscription_expiry: Ts(Date.now() - 3 * DAY) });
  assert.equal(r.action, "removed");
  const a = await commands("DEVA00001");
  assert.deepEqual(a.map((c) => c.type), ["USER_UPSERT", "USER_DELETE"]);
  assert.equal(a[1].cmd, "DATA DELETE USERINFO PIN=1000");
  assert.equal((await enrollment(1000)).desiredOnDevice, false);
});

test("expiry earlier today is still active (inclusive date) → no delete", { skip: SKIP }, async () => {
  await seedGym();
  const { startOfTodayIST } = require("../../src/lib/membership");
  const m = member();
  await write("M1", null, m);
  const r = await write("M1", m, { ...m, subscription_expiry: Ts(Math.max(startOfTodayIST().getTime(), Date.now() - 60000)) });
  assert.equal(r.action, "noop_active");
});

test("renewal of a lapsed member re-adds user + stored templates (algo-matched), no re-enroll", { skip: SKIP }, async () => {
  await seedGym();
  const lapsed = member({ subscription_expiry: Ts(Date.now() - 5 * DAY) });
  await db.doc("users/M1").set(lapsed);
  // Member enrolled earlier on an algo-10 device: PIN + template exist.
  await db.doc("bio_enrollments/G1_1000").set({ gym_id: "G1", memberId: "M1", bioPin: 1000, fingers: [0], desiredOnDevice: false, bioStatus: "enrolled" });
  await db.doc("bio_counters/G1").set({ next: 1001 });
  await db.doc("bio_templates/G1_1000_1_0").set({ gym_id: "G1", bioPin: 1000, memberId: "M1", type: 1, fingerIndex: 0, majorVer: 10, minorVer: 0, tmp: "VEVNUExBVEU=" });
  const r = await write("M1", lapsed, { ...lapsed, subscription_expiry: Ts(Date.now() + 30 * DAY) });
  assert.deepEqual(r, { action: "added", bioPin: 1000 });
  const a = await commands("DEVA00001");
  assert.deepEqual(a.map((c) => c.type), ["USER_UPSERT", "FP_UPSERT"]);
  assert.equal(a[1].cmd, "DATA UPDATE FINGERTMP PIN=1000\tFID=0\tSize=12\tValid=1\tTMP=VEVNUExBVEU=");
  // Device B runs ZKFinger 12 → user only, and flagged for re-enrollment.
  const b = await commands("DEVB00002");
  assert.deepEqual(b.map((c) => c.type), ["USER_UPSERT"]);
  const e = await enrollment(1000);
  assert.equal(e.desiredOnDevice, true);
  assert.deepEqual(e.needsReenrollOn, ["DEVB00002"]);
  assert.equal((await db.doc("bio_counters/G1").get()).data().next, 1001, "no new PIN");
});

test("extendMembership callable → trigger re-adds the member", { skip: SKIP }, async () => {
  await seedGym();
  const lapsed = member({ subscription_expiry: Ts(Date.now() - 2 * DAY) });
  await db.doc("users/M1").set(lapsed);
  const extend = fft.wrap(require("../../src/extendMembership").extendMembership);
  await extend({ memberId: "M1", days: 7 }, OWNER);
  const after = (await db.doc("users/M1").get()).data();
  const r = await write("M1", lapsed, after);
  assert.equal(r.action, "added");
  assert.equal((await commands("DEVA00001"))[0].type, "USER_UPSERT");
});

test("soft delete → USER_DELETE; restore → USER_UPSERT", { skip: SKIP }, async () => {
  await seedGym();
  const m = member();
  await write("M1", null, m);
  const deleted = { ...m, is_deleted: true };
  assert.equal((await write("M1", m, deleted)).action, "removed");
  const restored = { ...m };
  assert.equal((await write("M1", deleted, restored)).action, "added");
  assert.deepEqual((await commands("DEVA00001")).map((c) => c.type), ["USER_UPSERT", "USER_DELETE", "USER_UPSERT"]);
});

test("plan downgrade → sync frozen (no adds, no deletes)", { skip: SKIP }, async () => {
  await seedGym({ plan: "FREE" });
  const m = member();
  assert.deepEqual(await write("M1", null, m), { action: "frozen", reason: "plan" });
  await db.doc("bio_enrollments/G1_1000").set({ gym_id: "G1", memberId: "M1", bioPin: 1000, fingers: [], desiredOnDevice: true });
  assert.deepEqual(await write("M1", m, { ...m, subscription_expiry: Ts(Date.now() - 3 * DAY) }), { action: "frozen", reason: "plan" });
  assert.equal((await commands("DEVA00001")).length, 0);
  assert.equal((await enrollment(1000)).desiredOnDevice, true, "device state left alone");
});

test("QR-mode gym → frozen, no PIN allocated", { skip: SKIP }, async () => {
  await seedGym({ mode: "qr" });
  assert.deepEqual(await write("M1", null, member()), { action: "frozen", reason: "mode" });
  assert.equal((await db.doc("bio_counters/G1").get()).exists, false);
});

// ── daily sweep ─────────────────────────────────────────────────────────────
test("daily sweep removes yesterday's expiries and missing members; skips frozen gyms", { skip: SKIP }, async () => {
  await seedGym();
  const { startOfTodayIST } = require("../../src/lib/membership");
  const now = new Date();
  await db.doc("users/OK").set(member({ subscription_expiry: Ts(startOfTodayIST(now).getTime() + 1000) }));
  await db.doc("users/EXP").set(member({ subscription_expiry: Ts(startOfTodayIST(now).getTime() - 1000) }));
  await db.doc("users/DEL").set(member({ is_deleted: true }));
  for (const [pin, id] of [[1000, "OK"], [1001, "EXP"], [1002, "DEL"], [1003, "GONE"]]) {
    await db.doc(`bio_enrollments/G1_${pin}`).set({ gym_id: "G1", memberId: id, bioPin: pin, fingers: [], desiredOnDevice: true });
  }
  // Frozen gym G3 with an expired member: must be left alone.
  await db.doc("subscriptions/G3").set({ plan: "BASIC" });
  await db.doc("gym_settings/G3").set({ attendance_mode: "biometric" });
  await db.doc("bio_devices/DEVG30005").set({ gym_id: "G3", status: "active", cmdSeq: 0 });
  await db.doc("users/G3M").set({ ...member({ gym_id: "G3", subscription_expiry: Ts(Date.now() - 5 * DAY) }) });
  await db.doc("bio_enrollments/G3_1000").set({ gym_id: "G3", memberId: "G3M", bioPin: 1000, fingers: [], desiredOnDevice: true });

  const summary = await core.runBioExpirySweep(now);
  assert.deepEqual(summary, { gyms: 2, frozen: 1, removed: 3 });
  const dels = (await commands("DEVA00001")).map((c) => c.cmd).sort();
  assert.deepEqual(dels, ["DATA DELETE USERINFO PIN=1001", "DATA DELETE USERINFO PIN=1002", "DATA DELETE USERINFO PIN=1003"]);
  assert.equal((await enrollment(1000)).desiredOnDevice, true);
  assert.equal((await enrollment(1001)).desiredOnDevice, false);
  assert.equal((await commands("DEVG30005")).length, 0);
});

// ── permanent delete ────────────────────────────────────────────────────────
test("permanent delete purges templates + enrollment, scrubs template commands, queues USER_DELETE", { skip: SKIP }, async () => {
  await seedGym();
  await db.doc("bio_enrollments/G1_1000").set({ gym_id: "G1", memberId: "M1", bioPin: 1000, fingers: [0, 1], desiredOnDevice: false });
  await db.doc("bio_templates/G1_1000_1_0").set({ gym_id: "G1", bioPin: 1000, type: 1, fingerIndex: 0, majorVer: 10, tmp: "AAA" });
  await db.doc("bio_templates/G1_1000_1_1").set({ gym_id: "G1", bioPin: 1000, type: 1, fingerIndex: 1, majorVer: 10, tmp: "BBB" });
  await db.doc("bio_commands/DEVA00001_7").set({ sn: "DEVA00001", gym_id: "G1", seq: 7, memberId: "M1", type: "FP_UPSERT", status: "pending", cmd: "DATA UPDATE FINGERTMP PIN=1000\tFID=0\tSize=3\tValid=1\tTMP=AAA" });
  await db.doc("bio_commands/DEVA00001_6").set({ sn: "DEVA00001", gym_id: "G1", seq: 6, memberId: "M1", type: "FP_UPSERT", status: "acked", cmd: "DATA UPDATE FINGERTMP PIN=1000\tFID=1\tSize=3\tValid=1\tTMP=BBB" });
  await db.doc("bio_devices/DEVA00001").set({ cmdSeq: 7 }, { merge: true });

  // Through the real callable path (bin doc + owner doc for the legacy caller check).
  await db.doc("users/O1").set({ role: "owner", gym_id: "G1", name: "Owner" });
  await db.doc("users/M1").set(member({ is_deleted: true }));
  await db.doc("deleted_members/G1/bin/M1").set({ gym_id: "G1", snapshot: { name: "Ravi Kumar" } });
  const del = fft.wrap(require("../../src/memberLifecycle").permanentlyDeleteMember);
  await del({ memberId: "M1", gymId: "G1" }, OWNER);

  assert.equal((await db.collection("bio_templates").where("gym_id", "==", "G1").get()).size, 0);
  assert.equal((await db.doc("bio_enrollments/G1_1000").get()).exists, false);
  const a = await commands("DEVA00001");
  const old7 = a.find((c) => c.seq === 7);
  const old6 = a.find((c) => c.seq === 6);
  assert.deepEqual([old7.status, old7.cmd], ["cancelled", "[purged]"]);
  assert.deepEqual([old6.status, old6.cmd], ["acked", "[purged]"]);
  const del8 = a.find((c) => c.seq === 8);
  assert.deepEqual([del8.type, del8.cmd], ["USER_DELETE", "DATA DELETE USERINFO PIN=1000"]);
  assert.equal((await commands("DEVB00002"))[0].type, "USER_DELETE");
});

// ── callables ───────────────────────────────────────────────────────────────
test("claimBioDevice: creates a pending claim; other gym's SN rejected; roles, SN and mode checked", { skip: SKIP }, async () => {
  await seedGym();
  const r = await call.claimBioDevice({ sn: "NEWDEV0001", label: "Front\tdoor" }, OWNER);
  assert.equal(r.status, "pending_claim");
  assert.equal(r.server.host, "bio.gymly.online");
  const d = (await db.doc("bio_devices/NEWDEV0001").get()).data();
  assert.deepEqual([d.gym_id, d.status, d.label, d.cmdSeq], ["G1", "pending_claim", "Front door", 0]);
  assert.ok(d.claimExpiresAt.toMillis() > Date.now() + 29 * 60000);
  const again = await call.claimBioDevice({ sn: "DEVA00001" }, OWNER);
  assert.equal(again.alreadyActive, true);
  await assert.rejects(call.claimBioDevice({ sn: "OTHERG0004" }, OWNER), (e) => e.code === "already-exists");
  await assert.rejects(call.claimBioDevice({ sn: "bad sn!" }, OWNER), (e) => e.code === "invalid-argument");
  await assert.rejects(call.claimBioDevice({ sn: "NEWDEV0002" }, ctx("R", "receptionist", "G1")), (e) => e.code === "permission-denied");
  await db.doc("gym_settings/G1").set({ attendance_mode: "qr" });
  await assert.rejects(call.claimBioDevice({ sn: "NEWDEV0002" }, OWNER), (e) => e.code === "failed-precondition");
  await db.doc("subscriptions/G1").set({ plan: "PROFESSIONAL" });
  await assert.rejects(call.claimBioDevice({ sn: "NEWDEV0002" }, OWNER), (e) => e.code === "permission-denied");
});

test("syncBioDevice: adds active members (+templates), removes inactive ones with PINs", { skip: SKIP }, async () => {
  await seedGym();
  await db.doc("users/A1").set(member({ name: "Active One" }));
  await db.doc("users/A2").set(member({ name: "Active Two" }));
  await db.doc("users/X1").set(member({ name: "Expired", subscription_expiry: Ts(Date.now() - 9 * DAY) }));
  await db.doc("users/X2").set(member({ name: "Never had pin", subscription_expiry: Ts(Date.now() - 9 * DAY) }));
  await db.doc("bio_enrollments/G1_1005").set({ gym_id: "G1", memberId: "X1", bioPin: 1005, fingers: [], desiredOnDevice: true });
  await db.doc("bio_enrollments/G1_1006").set({ gym_id: "G1", memberId: "A1", bioPin: 1006, fingers: [0], desiredOnDevice: true });
  await db.doc("bio_counters/G1").set({ next: 1007 });
  await db.doc("bio_templates/G1_1006_1_0").set({ gym_id: "G1", bioPin: 1006, type: 1, fingerIndex: 0, majorVer: 10, tmp: "QUJD" });
  const r = await call.syncBioDevice({ sn: "DEVA00001" }, OWNER);
  assert.deepEqual({ ...r, sn: undefined }, { sn: undefined, upserts: 2, deletes: 1, templates: 1, templatesPending: 0, reenroll: 0 });
  const cmds = (await commands("DEVA00001")).map((c) => c.cmd);
  assert.ok(cmds.includes("DATA UPDATE USERINFO PIN=1006\tName=Active One\tPri=0"));
  assert.ok(cmds.includes("DATA UPDATE USERINFO PIN=1007\tName=Active Two\tPri=0"));
  assert.ok(cmds.includes("DATA DELETE USERINFO PIN=1005"));
  assert.ok(cmds.some((c) => c.startsWith("DATA UPDATE FINGERTMP PIN=1006")));
  assert.equal(cmds.indexOf("DATA UPDATE USERINFO PIN=1006\tName=Active One\tPri=0") < cmds.findIndex((c) => c.startsWith("DATA UPDATE FINGERTMP")), true, "user before template");
  assert.equal(cmds.filter((c) => c.includes("Never had pin")).length, 0);
});

test("syncBioDevice: device with unknown algorithm holds templates back (not flagged)", { skip: SKIP }, async () => {
  await seedGym();
  await db.doc("bio_devices/DEVA00001").set({ caps: { fpAlgo: null } }, { merge: true });
  await db.doc("users/A1").set(member());
  await db.doc("bio_enrollments/G1_1000").set({ gym_id: "G1", memberId: "A1", bioPin: 1000, fingers: [0], desiredOnDevice: true });
  await db.doc("bio_templates/G1_1000_1_0").set({ gym_id: "G1", bioPin: 1000, type: 1, fingerIndex: 0, majorVer: 10, tmp: "QUJD" });
  const r = await call.syncBioDevice({ sn: "DEVA00001" }, OWNER);
  assert.equal(r.templatesPending, 1);
  assert.equal(r.reenroll, 0);
});

test("setBioDeviceStatus: owner can disable without a plan; re-enable needs plan + mode", { skip: SKIP }, async () => {
  await seedGym({ plan: "FREE" });
  const r = await call.setBioDeviceStatus({ sn: "DEVA00001", status: "disabled" }, OWNER);
  assert.equal(r.changed, true);
  await assert.rejects(call.setBioDeviceStatus({ sn: "DEVA00001", status: "active" }, OWNER), (e) => e.code === "permission-denied");
  await assert.rejects(call.setBioDeviceStatus({ sn: "DEVA00001", status: "disabled" }, ctx("MG", "manager", "G1")), (e) => e.code === "permission-denied");
  await assert.rejects(call.setBioDeviceStatus({ sn: "OTHERG0004", status: "disabled" }, OWNER), (e) => e.code === "not-found");
});

test("requestBioEnroll: queues USER_UPSERT then ENROLL_FP/ENROLL_BIO by device caps", { skip: SKIP }, async () => {
  await seedGym();
  await db.doc("users/M1").set(member());
  const r = await call.requestBioEnroll({ memberId: "M1", sn: "DEVA00001", fingerIndex: 6 }, ctx("R", "receptionist", "G1"));
  assert.deepEqual([r.bioPin, r.kind], [1000, "ENROLL_FP"]);
  const a = await commands("DEVA00001");
  assert.deepEqual(a.map((c) => [c.type, c.cmd]), [
    ["USER_UPSERT", "DATA UPDATE USERINFO PIN=1000\tName=Ravi Kumar\tPri=0"],
    ["ENROLL", "ENROLL_FP PIN=1000\tFID=6\tRETRY=3\tOVERWRITE=1"],
  ]);
  assert.equal(a[1].maxAttempts, 1);
  assert.deepEqual(a[1].meta, { enrollKind: "ENROLL_FP", fingerIndex: 6 });
  assert.equal((await enrollment(1000)).enroll.state, "requested");
  const rb = await call.requestBioEnroll({ memberId: "M1", sn: "DEVB00002" }, OWNER);
  assert.equal(rb.kind, "ENROLL_BIO");
  assert.equal((await commands("DEVB00002"))[1].cmd, "ENROLL_BIO TYPE=1\tPIN=1000\tNO=0\tRETRY=3\tOVERWRITE=1");
});

test("requestBioEnroll: unsupported device → fallback details; expired member and trainer refused", { skip: SKIP }, async () => {
  await seedGym();
  await db.doc("users/M1").set(member());
  await db.doc("users/MX").set(member({ subscription_expiry: Ts(Date.now() - 3 * DAY) }));
  await db.doc("bio_devices/DEVA00001").set({ caps: { supportsEnroll: "none" } }, { merge: true });
  await assert.rejects(call.requestBioEnroll({ memberId: "M1", sn: "DEVA00001" }, OWNER), (e) => {
    assert.equal(e.code, "failed-precondition");
    assert.deepEqual(e.details, { bioPin: 1000, memberName: "Ravi Kumar" });
    return true;
  });
  await assert.rejects(call.requestBioEnroll({ memberId: "MX", sn: "DEVB00002" }, OWNER), (e) => e.code === "failed-precondition");
  await assert.rejects(call.requestBioEnroll({ memberId: "M1", sn: "DEVB00002" }, ctx("T", "trainer", "G1")), (e) => e.code === "permission-denied");
});

test("queueBioRawCommand: owner only; T2/T14 guards; audit has no template data", { skip: SKIP }, async () => {
  await seedGym();
  const r = await call.queueBioRawCommand({ sn: "DEVA00001", cmd: "CONTROL DEVICE 01010105" }, OWNER);
  assert.equal(r.commandId, "DEVA00001_1");
  for (const bad of ["USER ADD PIN=1000", "DATA DEL USERINFO PIN=1000", "CLEAR DATA", "DATA DELETE USERINFO PIN=1", "INFO\nREBOOT"]) {
    await assert.rejects(call.queueBioRawCommand({ sn: "DEVA00001", cmd: bad }, OWNER), (e) => e.code === "invalid-argument", bad);
  }
  await assert.rejects(call.queueBioRawCommand({ sn: "DEVA00001", cmd: "INFO" }, ctx("MG", "manager", "G1")), (e) => e.code === "permission-denied");
  await call.queueBioRawCommand({ sn: "DEVA00001", cmd: "DATA UPDATE FINGERTMP PIN=1000\tFID=0\tSize=3\tValid=1\tTMP=SECRET" }, OWNER);
  const audits = await db.collection("audit_logs/G1/events").where("action", "==", "bio_raw_command").get();
  assert.ok(audits.docs.every((d) => !d.data().cmd.includes("SECRET")));
});
