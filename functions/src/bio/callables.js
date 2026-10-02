"use strict";

// Biometric callables (v1 onCall, default region us-central1 to match the
// client's getFunctions(app)). Every one of them:
//   • requires auth and takes gym_id + role from custom claims (never from
//     the client, never by re-reading users/{uid} — staff/member doc IDs are
//     random addDoc IDs),
//   • checks the plan server-side (hasFeature) and attendance_mode ==
//     'biometric' — except disabling a device, which is always allowed.

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { isMemberActive } = require("../lib/membership");
const core = require("./core");
const cmds = require("./commands");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const { Timestamp } = admin.firestore;
const HttpsError = functions.https.HttpsError;

const SN_RE = /^[A-Za-z0-9]{6,32}$/;
const CLAIM_WINDOW_MS = 30 * 60 * 1000;
const SERVER = { host: "bio.gymly.online", port: 80, fallbackPort: 8081 };

function caller(context, roles) {
  if (!context.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
  const token = context.auth.token || {};
  if (!token.gym_id || !roles.includes(token.role)) {
    throw new HttpsError("permission-denied", "You don't have permission to manage biometric devices.");
  }
  return { uid: context.auth.uid, gymId: token.gym_id, role: token.role };
}

async function requireSync(gymId) {
  const state = await core.syncState(gymId);
  if (state.reason === "plan") {
    throw new HttpsError("permission-denied", "Biometric attendance needs the Premium or Premium Plus plan.");
  }
  if (state.reason === "mode") {
    throw new HttpsError("failed-precondition", "Turn on biometric attendance mode first.");
  }
}

function requireSn(sn) {
  if (typeof sn !== "string" || !SN_RE.test(sn)) {
    throw new HttpsError("invalid-argument", "Serial number must be 6-32 letters or digits.");
  }
  return sn;
}

async function ownDevice(gymId, sn) {
  const snap = await db.doc(`bio_devices/${sn}`).get();
  if (!snap.exists || snap.data().gym_id !== gymId) {
    throw new HttpsError("not-found", "Device not found for this gym.");
  }
  return { sn, ...snap.data() };
}

async function audit(gymId, uid, action, extra) {
  await db.collection("audit_logs").doc(gymId).collection("events").add({
    action, performed_by: uid, timestamp: Timestamp.now(), ...extra,
  });
}

// ── claimBioDevice({ sn, label }) ───────────────────────────────────────────
exports.claimBioDevice = functions.https.onCall(async (data, context) => {
  const { uid, gymId } = caller(context, ["owner", "manager"]);
  const sn = requireSn(data && data.sn);
  const label = String((data && data.label) || "").replace(/[\r\n\t]/g, " ").trim().slice(0, 40) || "Main door";
  await requireSync(gymId);

  const ref = db.doc(`bio_devices/${sn}`);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    if (snap.exists) {
      const d = snap.data();
      if (d.gym_id && d.gym_id !== gymId) {
        throw new HttpsError("already-exists", "This device is already registered to another gym.");
      }
      if (d.status === "active") return { status: "active", alreadyActive: true };
    }
    tx.set(ref, {
      gym_id: gymId,
      status: "pending_claim",
      claimExpiresAt: Timestamp.fromMillis(now + CLAIM_WINDOW_MS),
      claimedBy: uid,
      label,
      timezone: "Asia/Kolkata",
      createdAt: snap.exists ? (snap.data().createdAt || Timestamp.fromMillis(now)) : Timestamp.fromMillis(now),
      updatedAt: Timestamp.fromMillis(now),
      ...(snap.exists ? {} : { cmdSeq: 0 }),
    }, { merge: true });
    return { status: "pending_claim", alreadyActive: false };
  });
  await audit(gymId, uid, "bio_device_claimed", { target_id: sn, label });

  return {
    sn,
    ...result,
    server: SERVER,
    steps: [
      "On the device: Menu → Comm → Cloud Server Setting",
      "Server mode: ADMS",
      "Enable Domain Name: ON",
      `Server address: ${SERVER.host}`,
      `Server port: ${SERVER.port}`,
      "Enable Proxy Server: OFF",
      "Save, then restart the device",
    ],
  };
});

// ── syncBioDevice({ sn }) ───────────────────────────────────────────────────
// Reconcile one device with the gym: every active member is added (with
// stored templates); every inactive member that has a PIN is removed.
exports.syncBioDevice = functions.runWith({ timeoutSeconds: 300, memory: "512MB" }).https.onCall(async (data, context) => {
  const { uid, gymId } = caller(context, ["owner", "manager"]);
  const sn = requireSn(data && data.sn);
  await requireSync(gymId);
  const device = await ownDevice(gymId, sn);
  if (device.status !== "active") {
    throw new HttpsError("failed-precondition", "The device is not connected yet.");
  }

  const now = new Date();
  const membersSnap = await db.collection("users")
    .where("gym_id", "==", gymId)
    .where("role", "==", "member")
    .get();
  const members = membersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const active = members.filter((m) => isMemberActive(m, now));
  const inactiveIds = new Set(members.filter((m) => !isMemberActive(m, now)).map((m) => m.id));
  const memberIds = new Set(members.map((m) => m.id));

  const enrollments = await core.allocateBioPins(gymId, active.map((m) => ({ id: m.id, name: m.name })));
  const existingSnap = await db.collection("bio_enrollments").where("gym_id", "==", gymId).get();
  const templates = await core.templatesFor(gymId);
  const tplByPin = new Map();
  templates.forEach((t) => {
    if (!tplByPin.has(t.bioPin)) tplByPin.set(t.bioPin, []);
    tplByPin.get(t.bioPin).push(t);
  });

  const specs = [];
  const counts = { upserts: 0, deletes: 0, templates: 0, templatesPending: 0, reenroll: 0 };
  const enrPatches = [];
  for (const m of active) {
    const enr = enrollments.get(m.id);
    const built = core.upsertSpecs(device, enr, m.name, tplByPin.get(enr.bioPin) || []);
    specs.push(...built.specs);
    counts.upserts += 1;
    counts.templates += built.specs.length - 1;
    counts.templatesPending += built.pending;
    const patch = { desiredOnDevice: true, memberName: m.name || "", updatedAt: Timestamp.now() };
    if (built.reenroll) {
      patch.needsReenrollOn = admin.firestore.FieldValue.arrayUnion(sn);
      counts.reenroll += 1;
    }
    enrPatches.push([enr.id, patch]);
  }
  existingSnap.docs.forEach((d) => {
    const e = d.data();
    // Inactive members, and enrollments whose member doc is gone.
    if (inactiveIds.has(e.memberId) || !memberIds.has(e.memberId)) {
      specs.push(...core.deleteSpec({ ...e, id: d.id }));
      enrPatches.push([d.id, { desiredOnDevice: false, updatedAt: Timestamp.now() }]);
      counts.deletes += 1;
    }
  });

  await core.enqueue(sn, gymId, specs);
  for (let i = 0; i < enrPatches.length; i += 400) {
    const batch = db.batch();
    enrPatches.slice(i, i + 400).forEach(([id, p]) => batch.set(db.doc(`bio_enrollments/${id}`), p, { merge: true }));
    await batch.commit();
  }
  await db.doc(`bio_devices/${sn}`).set({ lastSyncAt: Timestamp.now(), lastSyncCounts: counts }, { merge: true });
  await audit(gymId, uid, "bio_device_synced", { target_id: sn, counts });
  return { sn, ...counts };
});

// ── setBioDeviceStatus({ sn, status }) ──────────────────────────────────────
exports.setBioDeviceStatus = functions.https.onCall(async (data, context) => {
  const { uid, gymId } = caller(context, ["owner"]);
  const sn = requireSn(data && data.sn);
  const status = data && data.status;
  if (!["active", "disabled"].includes(status)) {
    throw new HttpsError("invalid-argument", "status must be 'active' or 'disabled'.");
  }
  const device = await ownDevice(gymId, sn);
  if (status === "active") {
    await requireSync(gymId);
    if (!device.activatedAt) {
      throw new HttpsError("failed-precondition", "This device has never connected. Add it again from the device wizard.");
    }
  }
  if (device.status === status) return { sn, status, changed: false };
  await db.doc(`bio_devices/${sn}`).set({ status, updatedAt: Timestamp.now() }, { merge: true });
  await audit(gymId, uid, `bio_device_${status}`, { target_id: sn, before: device.status || null });
  return { sn, status, changed: true };
});

// ── requestBioEnroll({ memberId, sn, fingerIndex }) ─────────────────────────
// Remote fingerprint enrollment (§6). Queues USER_UPSERT then ENROLL_FP /
// ENROLL_BIO. The UI watches bio_enrollments/{gym}_{pin} for the result; if
// the device rejects it, the gateway sets caps.supportsEnroll='none' and the
// UI shows the keypad fallback.
exports.requestBioEnroll = functions.https.onCall(async (data, context) => {
  const { uid, gymId } = caller(context, ["owner", "manager", "receptionist"]);
  const sn = requireSn(data && data.sn);
  const memberId = data && data.memberId;
  const fingerIndex = data && data.fingerIndex != null ? data.fingerIndex : 0;
  if (typeof memberId !== "string" || !memberId || memberId.includes("/")) {
    throw new HttpsError("invalid-argument", "memberId is required.");
  }
  if (!Number.isInteger(fingerIndex) || fingerIndex < 0 || fingerIndex > 9) {
    throw new HttpsError("invalid-argument", "fingerIndex must be 0-9.");
  }
  await requireSync(gymId);
  const device = await ownDevice(gymId, sn);
  if (device.status !== "active") throw new HttpsError("failed-precondition", "The device is not connected.");

  const memberSnap = await db.doc(`users/${memberId}`).get();
  if (!memberSnap.exists) throw new HttpsError("not-found", "Member not found.");
  const member = memberSnap.data();
  if (member.gym_id !== gymId || member.role !== "member") {
    throw new HttpsError("permission-denied", "Member belongs to a different gym.");
  }
  if (!isMemberActive(member)) {
    throw new HttpsError("failed-precondition", "Renew or extend this membership before adding a fingerprint.");
  }

  const enr = await core.allocateBioPin(gymId, memberId, member.name);
  const caps = core.capsOf(device);
  const fallback = { bioPin: enr.bioPin, memberName: member.name || "" };
  const enroll = caps.supportsEnroll === "none" ? null : cmds.enrollCommand(caps, enr.bioPin, fingerIndex);
  if (!enroll) {
    throw new HttpsError("failed-precondition", "This device can't enroll remotely. Enroll on the device keypad.", fallback);
  }

  await core.enqueue(sn, gymId, [
    { type: "USER_UPSERT", cmd: cmds.userUpsert(enr.bioPin, member.name, caps.userinfoDialect), memberId, bioPin: enr.bioPin },
    { type: "ENROLL", cmd: enroll.cmd, memberId, bioPin: enr.bioPin, maxAttempts: 1, meta: { enrollKind: enroll.kind, fingerIndex } },
  ]);
  await db.doc(`bio_enrollments/${enr.id}`).set({
    desiredOnDevice: true,
    memberName: member.name || "",
    enroll: { state: "requested", sn, fingerIndex, code: null, requestedBy: uid, updatedAt: Timestamp.now() },
    updatedAt: Timestamp.now(),
  }, { merge: true });
  return { ...fallback, sn, fingerIndex, kind: enroll.kind };
});

// ── queueBioRawCommand({ sn, cmd }) — owner-only device console (Part 6) ────
const FORBIDDEN_RAW = [
  /^USER\s+(ADD|DEL)\b/i,          // T2: rejected by real firmware
  /^DATA\s+DEL\s/i,                 // T2: must be the full word DELETE
  /^CLEAR\b/i,                      // CLEAR DATA / CLEAR LOG wipes the device
];
exports.queueBioRawCommand = functions.https.onCall(async (data, context) => {
  const { uid, gymId } = caller(context, ["owner"]);
  const sn = requireSn(data && data.sn);
  const cmd = String((data && data.cmd) || "").trim();
  if (!cmd || cmd.length > 2000 || /[\r\n]/.test(cmd)) {
    throw new HttpsError("invalid-argument", "Command must be a single line of at most 2000 characters.");
  }
  if (FORBIDDEN_RAW.some((re) => re.test(cmd))) {
    throw new HttpsError("invalid-argument", "That command is not allowed from the console.");
  }
  const pinMatch = /\bPIN=(\d+)/i.exec(cmd);
  if (/^DATA\s+DELETE\s+USERINFO/i.test(cmd) && (!pinMatch || Number(pinMatch[1]) < cmds.MIN_MEMBER_PIN)) {
    throw new HttpsError("invalid-argument", "PINs below 1000 belong to on-device admins and can't be deleted from Gymly.");
  }
  await requireSync(gymId);
  await ownDevice(gymId, sn);
  const [id] = await core.enqueue(sn, gymId, [{ type: "RAW", cmd, maxAttempts: 1 }]);
  await audit(gymId, uid, "bio_raw_command", { target_id: sn, command_id: id, cmd: cmd.replace(/\b(tmp|template)=\S*/gi, "$1=<redacted>").slice(0, 200) });
  return { sn, commandId: id };
});
