"use strict";

// Seeds a test gym into the FIRESTORE EMULATOR for the simulator. Refuses to
// run without FIRESTORE_EMULATOR_HOST, so it can never touch production.
//
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node tools/seed-emulator.js
//
// Creates gym G_SIM (PREMIUM, biometric mode), members M_SIM1 "Ravi Kumar"
// (PIN 1000) and M_SIM2 "Sita" (PIN 1001), device SIMDEV0001 pending claim,
// and a second already-active device SIMDEV0002 (FINGERTMP, ZKFinger 10) so
// template propagation can be seen. The members' USER_UPSERTs and an
// ENROLL request are queued for SIMDEV0001.

const SIM_GYM = "G_SIM";
const SIM_SN = "SIMDEV0001";
const SIM_SN2 = "SIMDEV0002";

async function seed(db, { now = Date.now(), templateTable = "FINGERTMP" } = {}) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Refusing to seed: FIRESTORE_EMULATOR_HOST is not set");
  const { Timestamp } = require("firebase-admin/firestore");
  const { userUpsert, enrollFp, enrollBio } = require("../src/protocol/commands");
  const ts = (ms) => Timestamp.fromMillis(ms);
  const DAY = 86400000;

  const batch = db.batch();
  batch.set(db.doc(`subscriptions/${SIM_GYM}`), { plan: "PREMIUM", status: "active" });
  batch.set(db.doc(`gym_settings/${SIM_GYM}`), { gym_id: SIM_GYM, attendance_mode: "biometric" });
  batch.set(db.doc("users/M_SIM1"), { role: "member", gym_id: SIM_GYM, name: "Ravi Kumar", plan_name: "Monthly", subscription_expiry: ts(now + 20 * DAY), profile_photo: null });
  batch.set(db.doc("users/M_SIM2"), { role: "member", gym_id: SIM_GYM, name: "Sita", plan_name: "Quarterly", subscription_expiry: ts(now + 60 * DAY), profile_photo: null });
  for (const [pin, memberId, name] of [[1000, "M_SIM1", "Ravi Kumar"], [1001, "M_SIM2", "Sita"]]) {
    batch.set(db.doc(`bio_enrollments/${SIM_GYM}_${pin}`), {
      gym_id: SIM_GYM, memberId, memberName: name, bioPin: pin, fingers: [], desiredOnDevice: true, bioStatus: "not_enrolled",
    });
  }
  batch.set(db.doc(`bio_devices/${SIM_SN}`), {
    gym_id: SIM_GYM, status: "pending_claim", label: "Main door", claimExpiresAt: ts(now + 30 * 60000), cmdSeq: 0,
  });
  batch.set(db.doc(`bio_devices/${SIM_SN2}`), {
    gym_id: SIM_GYM, status: "active", label: "Back door", cmdSeq: 0,
    caps: { protocol: "ta2", templateTable: "FINGERTMP", fpAlgo: 10, userinfoDialect: "pri", supportsEnroll: "unknown", supportsDoorOpen: "unknown", supportsUserValidity: "unknown", deviceType: "att", pushver: "2.2.14", fwVersion: null, model: null },
  });
  await batch.commit();

  // Queue what Cloud Functions would queue (Part 3) for the new device.
  const enroll = templateTable === "BIODATA"
    ? { kind: "ENROLL_BIO", cmd: enrollBio(1000, 0) }
    : { kind: "ENROLL_FP", cmd: enrollFp(1000, 0) };
  const specs = [
    { type: "USER_UPSERT", cmd: userUpsert(1000, "Ravi Kumar"), memberId: "M_SIM1", bioPin: 1000 },
    { type: "USER_UPSERT", cmd: userUpsert(1001, "Sita"), memberId: "M_SIM2", bioPin: 1001 },
    { type: "ENROLL", cmd: enroll.cmd, memberId: "M_SIM1", bioPin: 1000, maxAttempts: 1, meta: { enrollKind: enroll.kind, fingerIndex: 0 } },
  ];
  let seq = 0;
  const b2 = db.batch();
  for (const s of specs) {
    seq += 1;
    b2.set(db.doc(`bio_commands/${SIM_SN}_${seq}`), {
      sn: SIM_SN, gym_id: SIM_GYM, seq, type: s.type, memberId: s.memberId, bioPin: s.bioPin, cmd: s.cmd,
      status: "pending", returnCode: null, attempts: 0, maxAttempts: s.maxAttempts || 5, meta: s.meta || null,
      source: "seed", createdAt: ts(now), sentAt: null, ackedAt: null, expireAt: ts(now + 30 * DAY),
    });
  }
  b2.set(db.doc(`bio_devices/${SIM_SN}`), { cmdSeq: seq }, { merge: true });
  await b2.commit();
  return { gymId: SIM_GYM, sn: SIM_SN, sn2: SIM_SN2 };
}

module.exports = { seed, SIM_GYM, SIM_SN, SIM_SN2 };

if (require.main === module) {
  const { initializeApp } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");
  initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-gymly-test" });
  const templateTable = process.argv.includes("BIODATA") ? "BIODATA" : "FINGERTMP";
  seed(getFirestore(), { templateTable })
    .then((r) => { console.log("seeded", r); process.exit(0); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
