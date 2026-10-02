"use strict";

// Every Firestore write the gateway makes. All data-bearing writes commit
// BEFORE the device gets its `OK` (T6); callers turn a thrown error into a
// 500 so the device keeps the data and retries.
//
// Collections written: bio_devices, bio_commands, bio_enrollments,
// bio_templates, bio_raw_logs, bio_unmatched_punches, attendance_sessions,
// attendance_logs. Never users (that would re-fire three users triggers).

const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { istDateKey, istCompact } = require("../time/ist");
const { mergeCaps, currentCaps } = require("../protocol/caps");
const { adapterFor } = require("../protocol/adapters");
const { MIN_MEMBER_PIN } = require("../protocol/commands");
const { redactTemplates } = require("../protocol/kv");
const log = require("../log");

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_WINDOW_MS = 90 * 60 * 1000; // mirrors the kiosk toggle / auto-exit
const COMMAND_TTL_MS = 30 * DAY_MS;
const RAW_LOG_TTL_MS = 7 * DAY_MS;
const BATCH_LIMIT = 400;
const LAST_SEEN_THROTTLE_MS = 60 * 1000;
const ENROLL_TIMEOUT_MS = 90 * 1000;
const RESEND_AFTER_MS = 5 * 60 * 1000;
const UNSUPPORTED_CODES = new Set([-1, -1002, -1004]);

function chunkedCommit(db, ops) {
  const batches = [];
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch);
    batches.push(batch.commit());
  }
  return Promise.all(batches);
}

function createStore(db, { caches, now = () => Date.now() } = {}) {
  const ts = (ms) => Timestamp.fromMillis(ms);
  const lastSeenWritten = new Map();

  // ── devices ─────────────────────────────────────────────────────────────
  async function updateDevice(sn, patch) {
    await db.doc(`bio_devices/${sn}`).set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (caches) caches.patchDevice(sn, patch);
  }

  async function updateCaps(device, ...partials) {
    const { changed, caps, patch } = mergeCaps(device.caps, ...partials);
    if (!changed) return caps;
    log.info("caps_changed", { sn: device.sn, patch });
    await updateDevice(device.sn, { caps });
    device.caps = caps;
    return caps;
  }

  // Throttled to one write per 60 s per device (or on IP change).
  async function touchDevice(device, ip) {
    const t = now();
    const last = lastSeenWritten.get(device.sn) || 0;
    if (t - last < LAST_SEEN_THROTTLE_MS && device.lastIp === ip) return;
    lastSeenWritten.set(device.sn, t);
    try {
      await updateDevice(device.sn, { lastSeenAt: ts(t), lastIp: ip || null });
    } catch (err) {
      lastSeenWritten.delete(device.sn);
      log.warn("touch_failed", { sn: device.sn, err });
    }
  }

  // pending_claim → active on first contact inside the claim window.
  async function activateDevice(device, { ip, capsPatch }) {
    const t = now();
    const { caps } = mergeCaps(device.caps, capsPatch || {});
    const patch = {
      status: "active",
      activatedAt: ts(t),
      lastSeenAt: ts(t),
      lastIp: ip || null,
      caps,
      timezone: device.timezone || "Asia/Kolkata",
    };
    await updateDevice(device.sn, patch);
    lastSeenWritten.set(device.sn, t);
    Object.assign(device, patch);
    await enqueue(device.sn, device.gym_id, [{ type: "INFO", cmd: "INFO" }]);
    log.info("device_activated", { sn: device.sn, gym_id: device.gym_id });
  }

  // ── raw logs (debug firehose, TTL 7 d) ─────────────────────────────────
  async function writeRawLog({ sn, path, query, body, status, note }) {
    try {
      await db.collection("bio_raw_logs").add({
        sn: sn || null,
        path: path || null,
        query: query ? redactTemplates(JSON.stringify(query)).slice(0, 1000) : null,
        bodyPreview: body ? redactTemplates(String(body)).slice(0, 2000) : null,
        status: status == null ? null : status,
        note: note || null,
        at: ts(now()),
        expireAt: ts(now() + RAW_LOG_TTL_MS),
      });
    } catch (err) {
      log.warn("raw_log_failed", { sn, err });
    }
  }

  // ── commands ────────────────────────────────────────────────────────────
  // specs: [{ type, cmd, memberId?, bioPin?, maxAttempts?, meta? }]
  // seq is allocated in a transaction on bio_devices/{sn}.cmdSeq so the
  // gateway and Cloud Functions can both enqueue safely. Doc id = {sn}_{seq}.
  async function enqueue(sn, gymId, specs) {
    if (!specs.length) return [];
    const deviceRef = db.doc(`bio_devices/${sn}`);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(deviceRef);
      let seq = (snap.exists && snap.data().cmdSeq) || 0;
      const created = [];
      const t = now();
      for (const s of specs) {
        seq += 1;
        const doc = {
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
          source: "gateway",
          createdAt: ts(t),
          sentAt: null,
          ackedAt: null,
          expireAt: ts(t + COMMAND_TTL_MS),
        };
        tx.set(db.doc(`bio_commands/${sn}_${seq}`), doc);
        created.push({ id: `${sn}_${seq}`, ...doc });
      }
      tx.set(deviceRef, { cmdSeq: seq }, { merge: true });
      return created;
    });
  }

  // Pick up to 10 deliverable commands for one device, ordered by seq:
  // pending, or sent > 5 min ago with attempts left. Also returns the ones
  // that have run out of attempts / timed out so they can be failed.
  function selectCommands(sn, limit = 10) {
    const t = now();
    const all = caches.commandsForSn(sn).sort((a, b) => a.seq - b.seq);
    const deliver = [];
    const expire = [];
    for (const c of all) {
      const sentMs = c.sentAt && c.sentAt.toMillis ? c.sentAt.toMillis() : 0;
      const maxAttempts = c.maxAttempts || 5;
      if (c.status === "pending") {
        if (deliver.length < limit) deliver.push(c);
      } else if (c.status === "sent") {
        const isEnroll = c.type === "ENROLL";
        if (isEnroll && t - sentMs > ENROLL_TIMEOUT_MS) expire.push({ c, reason: "enroll_timeout" });
        else if (t - sentMs > RESEND_AFTER_MS) {
          if (c.attempts >= maxAttempts) expire.push({ c, reason: "max_attempts" });
          else if (deliver.length < limit) deliver.push(c);
        }
      }
    }
    return { deliver, expire };
  }

  async function markSent(sn, cmds) {
    const t = now();
    await chunkedCommit(db, cmds.map((c) => (b) => b.update(db.doc(`bio_commands/${c.id}`), {
      status: "sent",
      sentAt: ts(t),
      attempts: FieldValue.increment(1),
    })));
    for (const c of cmds) caches.patchCommand(sn, c.id, { status: "sent", sentAt: ts(t), attempts: (c.attempts || 0) + 1 });
  }

  async function expireCommands(device, expired) {
    const ops = [];
    for (const { c, reason } of expired) {
      ops.push((b) => b.update(db.doc(`bio_commands/${c.id}`), {
        status: "failed", returnCode: null, failReason: reason, ackedAt: ts(now()),
      }));
      if (c.type === "ENROLL" && c.gym_id && c.bioPin != null) {
        ops.push((b) => b.set(db.doc(`bio_enrollments/${c.gym_id}_${c.bioPin}`), {
          enroll: { state: "timeout", sn: device.sn, code: null, updatedAt: ts(now()) },
        }, { merge: true }));
      }
      log.warn("command_expired", { sn: device.sn, seq: c.seq, type: c.type, reason });
    }
    await chunkedCommit(db, ops);
    for (const { c } of expired) caches.patchCommand(device.sn, c.id, { status: "failed" });
    if (expired.some(({ c }) => c.type === "ENROLL") && currentCaps(device).supportsEnroll === "unknown") {
      await updateCaps(device, { supportsEnroll: "none" });
    }
  }

  // ── command results (devicecmd) ─────────────────────────────────────────
  async function applyAcks(device, results) {
    const sn = device.sn;
    const withSeq = results.filter((r) => r.seq != null);
    if (!withSeq.length) return { acked: 0, failed: 0, unknown: 0 };
    const refs = withSeq.map((r) => db.doc(`bio_commands/${sn}_${r.seq}`));
    const snaps = await db.getAll(...refs);
    const ops = [];
    const capsPatches = [];
    const deviceInfo = {};
    let acked = 0;
    let failed = 0;
    let unknown = 0;
    const t = now();

    snaps.forEach((snap, i) => {
      const r = withSeq[i];
      if (!snap.exists) {
        unknown += 1;
        log.warn("ack_for_unknown_command", { sn, seq: r.seq, returnCode: r.returnCode });
        return;
      }
      const c = snap.data();
      const ok = r.returnCode === 0;
      ok ? (acked += 1) : (failed += 1);
      ops.push((b) => b.update(snap.ref, {
        status: ok ? "acked" : "failed",
        returnCode: r.returnCode,
        ackedAt: ts(t),
      }));
      caches.patchCommand(sn, snap.id, { status: ok ? "acked" : "failed" });
      if (!ok) {
        log.error("command_failed", { sn, seq: r.seq, type: c.type, returnCode: r.returnCode });
      }

      const enrRef = c.gym_id && c.bioPin != null ? db.doc(`bio_enrollments/${c.gym_id}_${c.bioPin}`) : null;
      if (c.type === "USER_UPSERT" && ok && enrRef) {
        ops.push((b) => b.set(enrRef, { devices: { [sn]: { present: true, updatedAt: ts(t) } } }, { merge: true }));
      } else if (c.type === "USER_DELETE" && ok && enrRef) {
        ops.push((b) => b.set(enrRef, { devices: { [sn]: { present: false, updatedAt: ts(t) } } }, { merge: true }));
      } else if ((c.type === "FP_UPSERT" || c.type === "BIODATA_UPSERT") && ok && enrRef && c.meta) {
        ops.push((b) => b.set(enrRef, {
          devices: { [sn]: { fingers: FieldValue.arrayUnion(c.meta.fingerIndex), updatedAt: ts(t) } },
        }, { merge: true }));
      } else if (c.type === "INFO" && ok) {
        const { capsFromInfo } = require("../protocol/caps");
        capsPatches.push(capsFromInfo(r.contentKv));
        const kv = r.contentKv || {};
        for (const [k, field] of [["usercount", "userCount"], ["fpcount", "fpCount"], ["transactioncount", "attCount"]]) {
          if (kv[k] != null && /^\d+$/.test(String(kv[k]).trim())) deviceInfo[field] = Number(kv[k]);
        }
      } else if (c.type === "ENROLL" && enrRef) {
        const kind = (c.meta && c.meta.enrollKind) || null;
        if (ok) {
          if (kind) capsPatches.push({ supportsEnroll: kind });
          ops.push((b) => b.set(enrRef, { enroll: { state: "acked", sn, code: 0, updatedAt: ts(t) } }, { merge: true }));
        } else {
          if (UNSUPPORTED_CODES.has(r.returnCode) && currentCaps(device).supportsEnroll === "unknown") {
            capsPatches.push({ supportsEnroll: "none" });
          }
          ops.push((b) => b.set(enrRef, {
            enroll: { state: "failed", sn, code: r.returnCode, updatedAt: ts(t) },
          }, { merge: true }));
        }
      }
    });

    await chunkedCommit(db, ops);
    if (capsPatches.length) await updateCaps(device, ...capsPatches);
    if (Object.keys(deviceInfo).length) await updateDevice(sn, deviceInfo);
    return { acked, failed, unknown };
  }

  // ── punches → attendance_sessions + attendance_logs ────────────────────
  // records come from ATTLOG (TA) or rtlog (AC). All writes use
  // deterministic IDs, so a device re-upload (T11) writes nothing new.
  async function writePunches(device, records) {
    const sn = device.sn;
    const gymId = device.gym_id;
    const byPin = caches.enrollmentsForGym(gymId);
    const matched = [];
    const unmatched = [];

    for (const r of records) {
      const pinNum = /^\d+$/.test(r.pin) ? Number(r.pin) : null;
      const enr = pinNum != null && pinNum >= MIN_MEMBER_PIN ? byPin.get(pinNum) : null;
      if (enr && enr.memberId) matched.push({ ...r, enr });
      else unmatched.push({ ...r, reason: pinNum != null && pinNum < MIN_MEMBER_PIN ? "device_local_pin" : "unknown_pin" });
    }

    // Fresh member data (name/photo/plan/expiry) for the attendance docs.
    const memberIds = [...new Set(matched.map((m) => m.enr.memberId))];
    const members = new Map();
    if (memberIds.length) {
      const snaps = await db.getAll(...memberIds.map((id) => db.doc(`users/${id}`)));
      snaps.forEach((s) => { if (s.exists) members.set(s.id, s.data()); });
    }
    const valid = [];
    for (const m of matched) {
      const member = members.get(m.enr.memberId);
      if (!member || member.gym_id !== gymId || member.role !== "member") {
        unmatched.push({ ...m, reason: "member_missing" });
      } else {
        valid.push({ ...m, member });
      }
    }
    valid.sort((a, b) => a.timeMs - b.timeMs);

    const sessionId = (p) => `bio_${sn}_${p.pin}_${istCompact(p.timeMs)}`;
    const logId = (p) => `bio_${p.enr.memberId}_${istDateKey(p.timeMs)}`;
    const unmatchedId = (p) => `bio_${sn}_${p.pin}_${istCompact(p.timeMs)}`;

    // Which deterministic docs already exist (re-uploads)?
    const existing = new Set();
    const checkRefs = [
      ...new Set([
        ...valid.map((p) => `attendance_sessions/${sessionId(p)}`),
        ...valid.map((p) => `attendance_logs/${logId(p)}`),
        ...unmatched.map((p) => `bio_unmatched_punches/${unmatchedId(p)}`),
      ]),
    ];
    for (let i = 0; i < checkRefs.length; i += 300) {
      const snaps = await db.getAll(...checkRefs.slice(i, i + 300).map((p) => db.doc(p)));
      snaps.forEach((s) => { if (s.exists) existing.add(s.ref.path); });
    }

    // Latest "inside" entry per member (same query processScan uses; its
    // composite index already exists).
    const lastEntry = new Map();
    const needsLookup = [...new Set(valid
      .filter((p) => !existing.has(`attendance_sessions/${sessionId(p)}`))
      .map((p) => p.enr.memberId))];
    await Promise.all(needsLookup.map(async (memberId) => {
      const q = await db.collection("attendance_sessions")
        .where("memberId", "==", memberId)
        .where("gymId", "==", gymId)
        .where("status", "==", "inside")
        .orderBy("entryTime", "desc")
        .limit(1)
        .get();
      if (!q.empty) {
        const e = q.docs[0].data().entryTime;
        if (e && e.toMillis) lastEntry.set(memberId, e.toMillis());
      }
    }));

    const ops = [];
    const seen = new Set();
    const counts = { sessions: 0, logs: 0, unmatched: 0, duplicates: 0, skippedInside: 0 };
    const t = now();

    for (const p of valid) {
      const memberId = p.enr.memberId;
      const member = p.member;
      const sPath = `attendance_sessions/${sessionId(p)}`;
      const lPath = `attendance_logs/${logId(p)}`;
      const common = { source: "biometric", deviceSN: sn, verifyMode: p.verifyMode, rawLine: p.rawLine };

      if (existing.has(sPath) || seen.has(sPath)) {
        counts.duplicates += 1;
      } else {
        const prev = lastEntry.get(memberId);
        if (prev != null && p.timeMs >= prev && p.timeMs - prev < SESSION_WINDOW_MS) {
          counts.skippedInside += 1; // already inside — mirrors the kiosk
        } else {
          // A backlog punch older than the window is written already
          // completed, exactly as the client's 90-min auto-exit would.
          const stale = t - p.timeMs > SESSION_WINDOW_MS;
          const doc = {
            memberId,
            gymId,
            memberName: member.name || "",
            entryTime: ts(p.timeMs),
            exitTime: stale ? ts(p.timeMs + SESSION_WINDOW_MS) : null,
            durationMinutes: stale ? 90 : null,
            entryDeviceId: `bio:${sn}`,
            exitDeviceId: stale ? "auto-exit" : null,
            status: stale ? "completed" : "inside",
            createdAt: FieldValue.serverTimestamp(),
            ...common,
          };
          ops.push((b) => b.set(db.doc(sPath), doc));
          lastEntry.set(memberId, p.timeMs);
          counts.sessions += 1;
        }
        seen.add(sPath);
      }

      if (!existing.has(lPath) && !seen.has(lPath)) {
        const doc = {
          gym_id: gymId,
          member_id: memberId,
          member_name: member.name || "",
          member_photo: member.profile_photo || null,
          plan_name: member.plan_name || null,
          subscription_expiry: member.subscription_expiry || null,
          exit_time: null,
          date: istDateKey(p.timeMs),
          scanned_by: "biometric",
          scan_mode: "biometric",
          entry_time: ts(p.timeMs),
          scanned_by_uid: null,
          is_expired: false,
          ...common,
        };
        ops.push((b) => b.set(db.doc(lPath), doc));
        seen.add(lPath);
        counts.logs += 1;
      }
    }

    for (const p of unmatched) {
      const uPath = `bio_unmatched_punches/${unmatchedId(p)}`;
      if (existing.has(uPath) || seen.has(uPath)) {
        counts.duplicates += 1;
        continue;
      }
      seen.add(uPath);
      ops.push((b) => b.set(db.doc(uPath), {
        gym_id: gymId,
        sn,
        pin: p.pin,
        at: ts(p.timeMs),
        verifyMode: p.verifyMode || null,
        reason: p.reason,
        rawLine: p.rawLine,
        createdAt: FieldValue.serverTimestamp(),
      }));
      counts.unmatched += 1;
    }

    await chunkedCommit(db, ops);
    return counts;
  }

  // ── templates (OPERLOG FP / BIODATA / templatev10) ─────────────────────
  // Stored only for known member PINs (≥ 1000 with an enrollment). Pushed to
  // the gym's other active devices whose algorithm matches; otherwise the
  // enrollment is marked needsReenrollOn that device.
  async function storeTemplates(device, items) {
    const sn = device.sn;
    const gymId = device.gym_id;
    const caps = currentCaps(device);
    const byPin = caches.enrollmentsForGym(gymId);
    const counts = { stored: 0, unchanged: 0, unknownPin: 0, unsupportedType: 0, pushed: 0, reenroll: 0 };
    const candidates = [];

    for (const it of items) {
      const type = it.kind === "BIODATA" ? it.type : 1;
      if (type !== 1) {
        counts.unsupportedType += 1;
        log.info("template_unsupported_type", { sn, pin: it.pin, type, typeName: it.typeName });
        continue;
      }
      const pinNum = /^\d+$/.test(String(it.pin)) ? Number(it.pin) : null;
      const enr = pinNum != null && pinNum >= MIN_MEMBER_PIN ? byPin.get(pinNum) : null;
      if (!enr || !it.tmp) {
        counts.unknownPin += 1;
        continue;
      }
      const majorVer = it.kind === "BIODATA" && it.majorVer != null ? it.majorVer : caps.fpAlgo;
      candidates.push({
        enr,
        pin: pinNum,
        tpl: {
          type: 1,
          fingerIndex: it.fingerIndex,
          subIndex: it.subIndex || 0,
          majorVer: majorVer == null ? null : majorVer,
          minorVer: it.kind === "BIODATA" ? it.minorVer : null,
          format: it.kind === "FP" ? "FINGERTMP" : it.kind === "BIODATA" ? "BIODATA" : "templatev10",
          size: it.size != null ? it.size : it.tmp.length,
          valid: it.valid == null ? 1 : it.valid,
          tmp: it.tmp,
        },
      });
    }
    if (!candidates.length) return counts;

    const tplPath = (c) => `bio_templates/${gymId}_${c.pin}_1_${c.tpl.fingerIndex}`;
    const snaps = await db.getAll(...candidates.map((c) => db.doc(tplPath(c))));
    const existingTmp = new Map();
    snaps.forEach((s) => { if (s.exists) existingTmp.set(s.ref.path, s.data().tmp); });

    const ops = [];
    const fresh = [];
    const t = now();
    for (const c of candidates) {
      const path = tplPath(c);
      if (existingTmp.get(path) === c.tpl.tmp) {
        counts.unchanged += 1;
        continue;
      }
      existingTmp.set(path, c.tpl.tmp);
      fresh.push(c);
      ops.push((b) => b.set(db.doc(path), {
        gym_id: gymId,
        bioPin: c.pin,
        memberId: c.enr.memberId,
        ...c.tpl,
        sourceSN: sn,
        capturedAt: ts(t),
      }));
      ops.push((b) => b.set(db.doc(`bio_enrollments/${gymId}_${c.pin}`), {
        fingers: FieldValue.arrayUnion(c.tpl.fingerIndex),
        bioStatus: "enrolled",
        enrolledAt: c.enr.enrolledAt || ts(t),
        updatedAt: ts(t),
        enroll: { state: "done", sn, code: 0, fingerIndex: c.tpl.fingerIndex, updatedAt: ts(t) },
        devices: { [sn]: { present: true, fingers: FieldValue.arrayUnion(c.tpl.fingerIndex), updatedAt: ts(t) } },
        needsReenrollOn: FieldValue.arrayRemove(sn),
      }, { merge: true }));
      counts.stored += 1;
    }
    await chunkedCommit(db, ops);

    // Propagate to the gym's other active devices (only for members who
    // should be on devices; frozen members get templates on reactivation).
    const others = [...caches.devices.values()].filter(
      (d) => d.gym_id === gymId && d.status === "active" && d.sn !== sn
    );
    for (const target of others) {
      const tCaps = currentCaps(target);
      const specs = [];
      const reenroll = [];
      for (const c of fresh) {
        if (c.enr.desiredOnDevice !== true) continue;
        const built = adapterFor(tCaps).templateCommand(tCaps, c.pin, c.tpl);
        if (built) {
          specs.push({
            type: built.type,
            cmd: built.cmd,
            memberId: c.enr.memberId,
            bioPin: c.pin,
            meta: { fingerIndex: c.tpl.fingerIndex },
          });
        } else {
          reenroll.push(c);
        }
      }
      if (specs.length) {
        await enqueue(target.sn, gymId, specs);
        counts.pushed += specs.length;
      }
      if (reenroll.length) {
        await chunkedCommit(db, reenroll.map((c) => (b) => b.set(db.doc(`bio_enrollments/${gymId}_${c.pin}`), {
          needsReenrollOn: FieldValue.arrayUnion(target.sn),
        }, { merge: true })));
        counts.reenroll += reenroll.length;
      }
    }
    return counts;
  }

  return {
    updateDevice,
    updateCaps,
    touchDevice,
    activateDevice,
    writeRawLog,
    enqueue,
    selectCommands,
    markSent,
    expireCommands,
    applyAcks,
    writePunches,
    storeTemplates,
  };
}

module.exports = { createStore, SESSION_WINDOW_MS, UNSUPPORTED_CODES };
