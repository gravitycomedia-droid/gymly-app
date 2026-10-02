#!/usr/bin/env node
"use strict";

// Production smoke test helper for Part 5. Talks to Firestore gymly-app-06
// with YOUR Application Default Credentials (`gcloud auth application-default
// login`). It only ever touches one TEST device doc (SN must start with
// GYMLYTEST) and never touches users, members or attendance.
//
//   node tools/prod-smoke.js claim   --gym <testGymId> --sn GYMLYTEST01 --yes
//   node tools/simulate-device.js    --url http://bio.gymly.online --sn GYMLYTEST01 --polls 3 --interval 3000 --no-replay
//   node tools/prod-smoke.js verify  --sn GYMLYTEST01
//   node tools/prod-smoke.js disable --sn GYMLYTEST01 --yes
//
// The simulator's punches use PINs 1000/1001/4321/1; in a gym with no
// fingerprint enrollments they all land in bio_unmatched_punches, so no
// attendance or streak is written for real members.

const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const yes = args.includes("--yes");
const sn = opt("sn");

if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("FIRESTORE_EMULATOR_HOST is set — unset it to talk to production.");
  process.exit(1);
}
if (!sn || !/^GYMLYTEST[A-Z0-9]{1,23}$/.test(sn)) {
  console.error("--sn is required and must look like GYMLYTEST01 (test devices only).");
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: "gymly-app-06" });
const db = getFirestore();
const ref = db.doc(`bio_devices/${sn}`);

async function claim() {
  const gym = opt("gym");
  if (!gym) throw new Error("--gym <testGymId> is required");
  const gymSnap = await db.doc(`gyms/${gym}`).get();
  if (!gymSnap.exists) throw new Error(`gyms/${gym} does not exist`);
  const existing = await ref.get();
  if (existing.exists && existing.data().gym_id !== gym) throw new Error(`${sn} belongs to gym ${existing.data().gym_id}`);
  const doc = {
    gym_id: gym,
    status: "pending_claim",
    claimExpiresAt: Timestamp.fromMillis(Date.now() + 30 * 60000),
    claimedBy: "prod-smoke",
    label: "Smoke test (simulator)",
    timezone: "Asia/Kolkata",
    createdAt: Timestamp.now(),
    ...(existing.exists ? {} : { cmdSeq: 0 }),
  };
  console.log(`Will write bio_devices/${sn} for gym "${gymSnap.data().name || gym}":`, { ...doc, claimExpiresAt: doc.claimExpiresAt.toDate() });
  if (!yes) return console.log("Dry run — add --yes to write.");
  await ref.set(doc, { merge: true });
  console.log("Claimed. Run the simulator within 30 minutes.");
}

async function verify() {
  const d = await ref.get();
  if (!d.exists) throw new Error(`bio_devices/${sn} not found`);
  const dev = d.data();
  const ms = (t) => (t && t.toDate ? t.toDate().toISOString() : null);
  console.log("device:", { status: dev.status, gym_id: dev.gym_id, lastSeenAt: ms(dev.lastSeenAt), lastIp: dev.lastIp, attlogStamp: dev.attlogStamp, caps: dev.caps });
  const cmds = await db.collection("bio_commands").where("sn", "==", sn).get();
  console.log("commands:", cmds.docs.map((c) => ({ seq: c.data().seq, type: c.data().type, status: c.data().status, returnCode: c.data().returnCode })));
  const un = await db.collection("bio_unmatched_punches").where("sn", "==", sn).get();
  console.log("unmatched punches:", un.docs.map((u) => ({ pin: u.data().pin, at: ms(u.data().at), reason: u.data().reason })));
  const raw = await db.collection("bio_raw_logs").where("sn", "==", sn).get();
  console.log("raw logs:", raw.size, raw.docs.map((r) => r.data().note));
  const ok = dev.status === "active" && cmds.docs.some((c) => c.data().type === "INFO" && c.data().status === "acked") && un.size > 0;
  console.log(ok ? "\nROUND TRIP OK ✓" : "\nROUND TRIP INCOMPLETE ✗");
}

async function disable() {
  console.log(`Will set bio_devices/${sn}.status = "disabled"`);
  if (!yes) return console.log("Dry run — add --yes to write.");
  await ref.set({ status: "disabled", updatedAt: Timestamp.now() }, { merge: true });
  console.log("Disabled.");
}

const run = { claim, verify, disable }[cmd];
if (!run) {
  console.error("usage: prod-smoke.js claim|verify|disable --sn GYMLYTEST01 [--gym <id>] [--yes]");
  process.exit(1);
}
run().then(() => process.exit(0)).catch((e) => { console.error("error:", e.message); process.exit(1); });
