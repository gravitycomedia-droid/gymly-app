"use strict";

// Biometric core helpers shared by the callables, the member trigger, the
// daily sweep and the permanent-delete paths.
//
// Cloud Functions decide WHAT a device should contain by queuing
// bio_commands; the bio-gateway VM delivers them. Command doc id is
// {sn}_{seq}; seq is allocated in a transaction on bio_devices/{sn}.cmdSeq,
// the same allocator the gateway uses, so both can enqueue safely.
//
// Plan-downgrade safety: when a gym loses the biometric plan (or switches
// back to QR), sync is FROZEN — no adds or deletes are queued. A lapsed bill
// must never wipe a device and lock every member out.

const admin = require("firebase-admin");
const { hasFeature } = require("../lib/entitlement");
const { isMemberActive } = require("../lib/membership");
const { getAttendanceMode } = require("../attendanceMode");
const cmds = require("./commands");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;

const DAY_MS = 24 * 60 * 60 * 1000;
const COMMAND_TTL_MS = 30 * DAY_MS;
const FIRST_PIN = 1000; // T14: 1-999 are on-device admins
const TX_CHUNK = 400;   // stay under the 500-writes-per-commit limit

// ── gating ──────────────────────────────────────────────────────────────────
// → { allowed, reason: null | 'plan' | 'mode' }
async function syncState(gymId) {
  const [entitled, mode] = await Promise.all([
    hasFeature(gymId, "biometric_attendance"),
    getAttendanceMode(gymId),
  ]);
  if (!entitled) return { allowed: false, reason: "plan" };
  if (mode !== "biometric") return { allowed: false, reason: "mode" };
  return { allowed: true, reason: null };
}

// ── devices ─────────────────────────────────────────────────────────────────
async function activeDevices(gymId) {
  const snap = await db.collection("bio_devices")
    .where("gym_id", "==", gymId)
    .where("status", "==", "active")
    .get();
  return snap.docs.map((d) => ({ sn: d.id, ...d.data() }));
}

function capsOf(device) {
  return {
    protocol: "ta2",
    templateTable: "FINGERTMP",
    userinfoDialect: "pri",
    fpAlgo: null,
    supportsEnroll: "unknown",
    ...((device && device.caps) || {}),
  };
}

// ── command queue ───────────────────────────────────────────────────────────
// specs: [{ type, cmd, memberId?, bioPin?, maxAttempts?, meta? }] in delivery
// order (a member's USER_UPSERT before their templates).
async function enqueue(sn, gymId, specs) {
  const created = [];
  for (let i = 0; i < specs.length; i += TX_CHUNK) {
    const chunk = specs.slice(i, i + TX_CHUNK);
    const deviceRef = db.doc(`bio_devices/${sn}`);
    const ids = await db.runTransaction(async (tx) => {
      const snap = await tx.get(deviceRef);
      let seq = (snap.exists && snap.data().cmdSeq) || 0;
      const now = Date.now();
      const out = [];
      for (const s of chunk) {
        seq += 1;
        const id = `${sn}_${seq}`;
        tx.set(db.doc(`bio_commands/${id}`), {
          sn,
          gym_id: gymId,
          seq,
          type: s.type,
          memberId: s.memberId || null,
          bioPin: s.bioPin == null ? null : s.bioPin,
          cmd: s.cmd,
          status: "pending",
          returnCode: null,
          attempts: 0,
          maxAttempts: s.maxAttempts || 5,
          meta: s.meta || null,
          source: "functions",
          createdAt: Timestamp.fromMillis(now),
          sentAt: null,
          ackedAt: null,
          expireAt: Timestamp.fromMillis(now + COMMAND_TTL_MS),
        });
        out.push(id);
      }
      tx.set(deviceRef, { cmdSeq: seq }, { merge: true });
      return out;
    });
    created.push(...ids);
  }
  return created;
}

// buildFn(device) → specs for that device. Runs for every ACTIVE device of
// the gym. Returns { [sn]: commandIds }.
async function enqueueForGym(gymId, buildFn, devices = null) {
  const list = devices || (await activeDevices(gymId));
  const out = {};
  for (const device of list) {
    const specs = await buildFn(device);
    if (specs && specs.length) out[device.sn] = await enqueue(device.sn, gymId, specs);
  }
  return out;
}

// ── PIN allocation ──────────────────────────────────────────────────────────
// Idempotent: a member that already has an enrollment keeps its PIN. The
// counter lives in the server-only bio_counters/{gymId} (owners can write the
// gym doc, so it cannot live there). The enrollment lookup runs inside the
// transaction, so two concurrent allocations never give one member two PINs.
//
// members: [{ id, name }] → Map<memberId, enrollment>
async function allocateBioPins(gymId, members) {
  const result = new Map();
  for (let i = 0; i < members.length; i += 200) {
    const chunk = members.slice(i, i + 200);
    await db.runTransaction(async (tx) => {
      const counterRef = db.doc(`bio_counters/${gymId}`);
      const [counterSnap, existingSnap] = await Promise.all([
        tx.get(counterRef),
        tx.get(db.collection("bio_enrollments").where("gym_id", "==", gymId)),
      ]);
      const byMember = new Map();
      existingSnap.docs.forEach((d) => byMember.set(d.data().memberId, { id: d.id, ...d.data() }));
      let next = (counterSnap.exists && counterSnap.data().next) || FIRST_PIN;
      const now = Timestamp.now();
      let allocated = false;
      for (const m of chunk) {
        const existing = byMember.get(m.id);
        if (existing) {
          result.set(m.id, existing);
          continue;
        }
        const pin = next;
        next += 1;
        const enr = {
          gym_id: gymId,
          memberId: m.id,
          memberName: m.name || "",
          bioPin: pin,
          fingers: [],
          desiredOnDevice: false,
          bioStatus: "not_enrolled",
          createdAt: now,
          updatedAt: now,
        };
        tx.create(db.doc(`bio_enrollments/${gymId}_${pin}`), enr);
        byMember.set(m.id, { id: `${gymId}_${pin}`, ...enr });
        result.set(m.id, { id: `${gymId}_${pin}`, ...enr });
        allocated = true;
      }
      if (allocated) tx.set(counterRef, { gym_id: gymId, next, updatedAt: now }, { merge: true });
    });
  }
  return result;
}

async function allocateBioPin(gymId, memberId, memberName) {
  return (await allocateBioPins(gymId, [{ id: memberId, name: memberName }])).get(memberId);
}

async function enrollmentByMember(memberId) {
  const snap = await db.collection("bio_enrollments").where("memberId", "==", memberId).limit(1).get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function templatesFor(gymId, bioPin) {
  let q = db.collection("bio_templates").where("gym_id", "==", gymId);
  if (bioPin != null) q = q.where("bioPin", "==", bioPin);
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// USER_UPSERT then every compatible template, for one device. Templates the
// device cannot take are reported in `reenroll` (the caller marks the
// enrollment needsReenrollOn that device). If the device's algorithm is not
// known yet (INFO not answered), templates are held back, not flagged.
function upsertSpecs(device, enr, memberName, templates) {
  const caps = capsOf(device);
  const specs = [{
    type: "USER_UPSERT",
    cmd: cmds.userUpsert(enr.bioPin, memberName, caps.userinfoDialect),
    memberId: enr.memberId,
    bioPin: enr.bioPin,
  }];
  let reenroll = false;
  let pending = 0;
  for (const tpl of templates) {
    if (caps.fpAlgo == null && caps.protocol !== "ac3") {
      pending += 1;
      continue;
    }
    const built = cmds.templateCommand(caps, enr.bioPin, tpl);
    if (built) {
      specs.push({ ...built, memberId: enr.memberId, bioPin: enr.bioPin, meta: { fingerIndex: tpl.fingerIndex } });
    } else {
      reenroll = true;
    }
  }
  return { specs, reenroll, pending };
}

function deleteSpec(enr) {
  return [{ type: "USER_DELETE", cmd: cmds.userDelete(enr.bioPin), memberId: enr.memberId, bioPin: enr.bioPin }];
}

// Put one member on every active device of the gym (user + templates).
async function addMemberToDevices(gymId, enr, memberName, devices = null) {
  const list = devices || (await activeDevices(gymId));
  const templates = list.length ? await templatesFor(gymId, enr.bioPin) : [];
  const reenrollOn = [];
  const queued = await enqueueForGym(gymId, (d) => {
    const { specs, reenroll } = upsertSpecs(d, enr, memberName, templates);
    if (reenroll) reenrollOn.push(d.sn);
    return specs;
  }, list);
  const patch = {
    desiredOnDevice: true,
    memberName: memberName || "",
    updatedAt: Timestamp.now(),
  };
  if (reenrollOn.length) patch.needsReenrollOn = FieldValue.arrayUnion(...reenrollOn);
  await db.doc(`bio_enrollments/${enr.id}`).set(patch, { merge: true });
  return queued;
}

async function removeMemberFromDevices(gymId, enr, devices = null) {
  const queued = await enqueueForGym(gymId, () => deleteSpec(enr), devices);
  await db.doc(`bio_enrollments/${enr.id}`).set({ desiredOnDevice: false, updatedAt: Timestamp.now() }, { merge: true });
  return queued;
}

// ── daily expiry sweep (runs inside permanentlyDeleteExpired, 02:00 IST) ────
// Members still marked desiredOnDevice whose membership is no longer active
// (D2: expired before today IST, or soft-deleted, or gone) get USER_DELETE.
// Frozen gyms are skipped entirely.
async function runBioExpirySweep(now = new Date()) {
  const snap = await db.collection("bio_enrollments").where("desiredOnDevice", "==", true).get();
  const byGym = new Map();
  snap.docs.forEach((d) => {
    const e = { id: d.id, ...d.data() };
    if (!byGym.has(e.gym_id)) byGym.set(e.gym_id, []);
    byGym.get(e.gym_id).push(e);
  });
  const summary = { gyms: 0, frozen: 0, removed: 0 };
  for (const [gymId, enrollments] of byGym) {
    summary.gyms += 1;
    const state = await syncState(gymId);
    if (!state.allowed) {
      summary.frozen += 1;
      continue;
    }
    const devices = await activeDevices(gymId);
    const members = new Map();
    for (let i = 0; i < enrollments.length; i += 300) {
      const refs = enrollments.slice(i, i + 300).map((e) => db.doc(`users/${e.memberId}`));
      (await db.getAll(...refs)).forEach((s) => members.set(s.id, s.exists ? s.data() : null));
    }
    for (const enr of enrollments) {
      const member = members.get(enr.memberId);
      if (member && isMemberActive(member, now)) continue;
      await removeMemberFromDevices(gymId, enr, devices);
      summary.removed += 1;
    }
  }
  console.log(`bioExpirySweep: ${JSON.stringify(summary)}`);
  return summary;
}

// ── permanent delete ────────────────────────────────────────────────────────
// Deletes the member's templates (T17) and enrollment, scrubs template data
// from their queued/old commands, cancels anything still pending, and queues
// USER_DELETE on every active device. The delete is queued even when the gym
// is frozen: a permanently removed member must not keep door access, and the
// freeze exists to protect paying members, not deleted ones.
async function purgeMemberBio(gymId, memberId) {
  const enrSnap = await db.collection("bio_enrollments")
    .where("memberId", "==", memberId)
    .get();
  const enrollments = enrSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((e) => e.gym_id === gymId);
  if (!enrollments.length) return { purged: 0 };

  const cmdSnap = await db.collection("bio_commands").where("memberId", "==", memberId).get();
  const ops = [];
  cmdSnap.docs.forEach((d) => {
    const c = d.data();
    const patch = {};
    if (c.type === "FP_UPSERT" || c.type === "BIODATA_UPSERT") patch.cmd = "[purged]";
    if (c.status === "pending" || c.status === "sent") patch.status = "cancelled";
    if (Object.keys(patch).length) ops.push((b) => b.update(d.ref, patch));
  });
  for (const enr of enrollments) {
    const tpls = await templatesFor(gymId, enr.bioPin);
    tpls.forEach((t) => ops.push((b) => b.delete(db.doc(`bio_templates/${t.id}`))));
  }
  for (let i = 0; i < ops.length; i += TX_CHUNK) {
    const batch = db.batch();
    ops.slice(i, i + TX_CHUNK).forEach((op) => op(batch));
    await batch.commit();
  }

  const devices = await activeDevices(gymId);
  for (const enr of enrollments) {
    await enqueueForGym(gymId, () => deleteSpec(enr), devices);
    await db.doc(`bio_enrollments/${enr.id}`).delete();
  }
  return { purged: enrollments.length };
}

module.exports = {
  FIRST_PIN,
  syncState,
  activeDevices,
  capsOf,
  enqueue,
  enqueueForGym,
  allocateBioPins,
  allocateBioPin,
  enrollmentByMember,
  templatesFor,
  upsertSpecs,
  deleteSpec,
  addMemberToDevices,
  removeMemberFromDevices,
  runBioExpirySweep,
  purgeMemberBio,
};
