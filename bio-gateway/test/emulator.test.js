"use strict";

// End-to-end: real gateway (caches + store) against the Firestore emulator,
// driven by the device simulator. Run with `npm run test:emulator`.

const test = require("node:test");
const assert = require("node:assert/strict");

const SKIP = !process.env.FIRESTORE_EMULATOR_HOST && "needs the Firestore emulator (npm run test:emulator)";
const PROJECT = process.env.GCLOUD_PROJECT || "demo-gymly-test";
process.env.BIO_GATEWAY_SILENT = "1";

let db, caches, server, base;

async function reset() {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
}

async function startGateway() {
  const { createCaches } = require("../src/store/caches");
  const { createStore } = require("../src/store/writes");
  const { createApp } = require("../src/server");
  caches = createCaches(db);
  await caches.ready();
  const store = createStore(db, { caches });
  const app = createApp({ db, caches, store });
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
}

async function stopGateway() {
  if (caches) caches.stop();
  if (server) await new Promise((r) => server.close(r));
  caches = null;
  server = null;
}

test.before(() => {
  if (SKIP) return;
  const { initializeApp, getApps } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");
  if (!getApps().length) initializeApp({ projectId: PROJECT });
  db = getFirestore();
});

const docs = async (coll, field, value) => {
  const q = field ? db.collection(coll).where(field, "==", value) : db.collection(coll);
  return (await q.get()).docs.map((d) => ({ id: d.id, ...d.data() }));
};

test("TA 2.x FINGERTMP device: claim → users → enroll → punches → replay", { skip: SKIP }, async () => {
  await reset();
  const { seed, SIM_SN, SIM_SN2, SIM_GYM } = require("../tools/seed-emulator");
  await seed(db, { templateTable: "FINGERTMP" });
  await startGateway();
  try {
    const { simulate } = require("../tools/simulate-device");
    const transcript = await simulate({ url: base, sn: SIM_SN, polls: 4, interval: 300, quiet: true });
    if (process.env.SHOW_TRANSCRIPT) console.log(transcript.join("\n"));

    // Device activated, caps learned from options + INFO.
    const dev = (await db.doc(`bio_devices/${SIM_SN}`).get()).data();
    assert.equal(dev.status, "active");
    assert.equal(dev.caps.fpAlgo, 10);
    assert.equal(dev.caps.model, "K40/ID");
    assert.equal(dev.caps.templateTable, "FINGERTMP");
    assert.equal(dev.caps.userinfoDialect, "pri");
    assert.equal(dev.caps.supportsEnroll, "ENROLL_FP");
    assert.equal(dev.attlogStamp, "100");
    assert.equal(dev.userCount, 2);

    // Every command for the device was delivered and acked, in seq order.
    const cmds = (await docs("bio_commands", "sn", SIM_SN)).sort((a, b) => a.seq - b.seq);
    assert.deepEqual(cmds.map((c) => [c.seq, c.type, c.status]), [
      [1, "USER_UPSERT", "acked"], [2, "USER_UPSERT", "acked"], [3, "ENROLL", "acked"], [4, "INFO", "acked"],
    ]);

    // Template stored server-side, enrollment updated, pushed to the other
    // device (same algorithm 10, FINGERTMP).
    const tpl = (await db.doc(`bio_templates/${SIM_GYM}_1000_1_0`).get()).data();
    assert.equal(tpl.majorVer, 10);
    assert.equal(tpl.format, "FINGERTMP");
    assert.equal(tpl.sourceSN, SIM_SN);
    assert.ok(tpl.tmp.length > 20);
    const enr = (await db.doc(`bio_enrollments/${SIM_GYM}_1000`).get()).data();
    assert.deepEqual(enr.fingers, [0]);
    assert.equal(enr.bioStatus, "enrolled");
    assert.equal(enr.enroll.state, "done");
    assert.equal(enr.devices[SIM_SN].present, true);
    const pushed = await docs("bio_commands", "sn", SIM_SN2);
    assert.equal(pushed.length, 1);
    assert.equal(pushed[0].type, "FP_UPSERT");
    assert.match(pushed[0].cmd, /^DATA UPDATE FINGERTMP PIN=1000\tFID=0\tSize=\d+\tValid=1\tTMP=/);

    // Punches: 2 members → 2 sessions + 2 logs; re-punch inside 90 min and
    // all replays add nothing; unknown + local-admin PINs are unmatched.
    const sessions = await docs("attendance_sessions", "gymId", SIM_GYM);
    assert.equal(sessions.length, 2);
    for (const s of sessions) {
      assert.equal(s.status, "inside");
      assert.equal(s.entryDeviceId, `bio:${SIM_SN}`);
      assert.equal(s.source, "biometric");
      assert.match(s.id, new RegExp(`^bio_${SIM_SN}_100[01]_\\d{14}$`));
    }
    const logs = await docs("attendance_logs", "gym_id", SIM_GYM);
    assert.equal(logs.length, 2);
    const ravi = logs.find((l) => l.member_id === "M_SIM1");
    assert.equal(ravi.scanned_by, "biometric");
    assert.equal(ravi.scan_mode, "biometric");
    assert.equal(ravi.is_expired, false);
    assert.equal(ravi.member_name, "Ravi Kumar");
    assert.equal(ravi.plan_name, "Monthly");
    // entry_time is the device punch time read as IST (T7), not receive time.
    const firstLine = ravi.rawLine.split("\t")[1];
    const { istWallClockToMillis, istDateKey } = require("../src/time/ist");
    assert.equal(ravi.entry_time.toMillis(), istWallClockToMillis(firstLine));
    assert.equal(ravi.date, istDateKey(istWallClockToMillis(firstLine)));
    assert.equal(ravi.id, `bio_M_SIM1_${ravi.date}`);

    const unmatched = await docs("bio_unmatched_punches", "gym_id", SIM_GYM);
    assert.deepEqual(unmatched.map((u) => [u.pin, u.reason]).sort(), [["1", "device_local_pin"], ["4321", "unknown_pin"]]);

    // Malformed line kept for debugging; raw logs never contain a template.
    const raw = await docs("bio_raw_logs", "sn", SIM_SN);
    assert.ok(raw.some((r) => r.note === "malformed_punch_lines" && r.bodyPreview.includes("garbage")));
    for (const r of raw) assert.ok(!/TMP=(?!<redacted)/.test(r.bodyPreview || ""), "template leaked into bio_raw_logs");
  } finally {
    await stopGateway();
  }
});

test("BIODATA device without remote enroll: ENROLL rejected → caps none, fallback state", { skip: SKIP }, async () => {
  await reset();
  const { seed, SIM_SN, SIM_GYM } = require("../tools/seed-emulator");
  await seed(db, { templateTable: "BIODATA" });
  await startGateway();
  try {
    const { simulate } = require("../tools/simulate-device");
    await simulate({ url: base, sn: SIM_SN, templateTable: "BIODATA", enrollSupported: "no", polls: 3, interval: 300, quiet: true, replay: false });
    const dev = (await db.doc(`bio_devices/${SIM_SN}`).get()).data();
    assert.equal(dev.caps.templateTable, "BIODATA");
    assert.equal(dev.caps.supportsEnroll, "none");
    const enr = (await db.doc(`bio_enrollments/${SIM_GYM}_1000`).get()).data();
    assert.equal(enr.enroll.state, "failed");
    assert.equal(enr.enroll.code, -1002);
    const enrollCmd = (await docs("bio_commands", "sn", SIM_SN)).find((c) => c.type === "ENROLL");
    assert.equal(enrollCmd.status, "failed");
    assert.equal(enrollCmd.returnCode, -1002);
  } finally {
    await stopGateway();
  }
});

test("--fail-code -1002: DATA commands fail and are not retried", { skip: SKIP }, async () => {
  await reset();
  const { seed, SIM_SN } = require("../tools/seed-emulator");
  await seed(db);
  await startGateway();
  try {
    const { simulate } = require("../tools/simulate-device");
    await simulate({ url: base, sn: SIM_SN, failCode: -1002, polls: 3, interval: 300, quiet: true, replay: false });
    const cmds = await docs("bio_commands", "sn", SIM_SN);
    const users = cmds.filter((c) => c.type === "USER_UPSERT");
    assert.deepEqual(users.map((c) => [c.status, c.returnCode, c.attempts]), [["failed", -1002, 1], ["failed", -1002, 1]]);
  } finally {
    await stopGateway();
  }
});

test("template with a different algorithm is not pushed; enrollment marked needsReenrollOn", { skip: SKIP }, async () => {
  await reset();
  const { seed, SIM_SN, SIM_SN2, SIM_GYM } = require("../tools/seed-emulator");
  await seed(db);
  await db.doc(`bio_devices/${SIM_SN2}`).set({ caps: { fpAlgo: 12 } }, { merge: true });
  await startGateway();
  try {
    const { simulate } = require("../tools/simulate-device");
    await simulate({ url: base, sn: SIM_SN, polls: 3, interval: 300, quiet: true, replay: false });
    assert.equal((await docs("bio_commands", "sn", SIM_SN2)).length, 0);
    const enr = (await db.doc(`bio_enrollments/${SIM_GYM}_1000`).get()).data();
    assert.deepEqual(enr.needsReenrollOn, [SIM_SN2]);
  } finally {
    await stopGateway();
  }
});

test("AC 3.x scaffold: registry/push/rtlog punch lands in attendance", { skip: SKIP }, async () => {
  await reset();
  const { seed, SIM_SN, SIM_GYM } = require("../tools/seed-emulator");
  await seed(db);
  await startGateway();
  try {
    const { simulate } = require("../tools/simulate-device");
    await simulate({ url: base, sn: SIM_SN, proto: "ac3", polls: 1, interval: 100, quiet: true });
    const dev = (await db.doc(`bio_devices/${SIM_SN}`).get()).data();
    assert.equal(dev.caps.protocol, "ac3");
    assert.equal(dev.caps.templateTable, "templatev10");
    assert.ok(dev.registryCode);
    const logs = await docs("attendance_logs", "gym_id", SIM_GYM);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].member_id, "M_SIM2");
  } finally {
    await stopGateway();
  }
});

test("health endpoint does a real Firestore read", { skip: SKIP }, async () => {
  await reset();
  await startGateway();
  try {
    const r = await fetch(`${base}/health`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).ok, true);
  } finally {
    await stopGateway();
  }
});
