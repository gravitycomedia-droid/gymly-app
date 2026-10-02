"use strict";

// The three in-memory caches (master §5.5). Device polls are served entirely
// from memory, so they cost zero Firestore reads:
//   devices      Map<sn, device>                       ← bio_devices (all)
//   commands     Map<sn, Map<docId, command>>          ← bio_commands status in [pending, sent]
//   enrollments  Map<gym_id, Map<bioPin, enrollment>>  ← bio_enrollments (all)
// On a listener error: log, back off, resubscribe. A restart rebuilds from
// Firestore.

const log = require("../log");

function createCaches(db, { backoffMs = 2000, maxBackoffMs = 60000 } = {}) {
  const devices = new Map();
  const commands = new Map();
  const enrollments = new Map();
  const unsubs = {};
  const ready = {};
  let stopped = false;

  function subscribe(name, query, apply) {
    let delay = backoffMs;
    let resolveReady;
    ready[name] = new Promise((r) => { resolveReady = r; });
    const start = () => {
      if (stopped) return;
      unsubs[name] = query.onSnapshot(
        (snap) => {
          delay = backoffMs;
          for (const ch of snap.docChanges()) apply(ch.type, ch.doc.id, ch.doc.data());
          resolveReady();
        },
        (err) => {
          log.error("cache_listener_error", { cache: name, err });
          if (unsubs[name]) unsubs[name]();
          setTimeout(start, delay);
          delay = Math.min(delay * 2, maxBackoffMs);
        }
      );
    };
    start();
  }

  subscribe("devices", db.collection("bio_devices"), (type, id, data) => {
    if (type === "removed") devices.delete(id);
    else devices.set(id, { sn: id, ...data });
  });

  subscribe(
    "commands",
    db.collection("bio_commands").where("status", "in", ["pending", "sent"]),
    (type, id, data) => {
      const sn = data.sn;
      if (!sn) return;
      if (!commands.has(sn)) commands.set(sn, new Map());
      const bySn = commands.get(sn);
      if (type === "removed") bySn.delete(id);
      else bySn.set(id, { id, ...data });
      if (bySn.size === 0) commands.delete(sn);
    }
  );

  const pinIndex = new Map(); // docId → [gym, pin] so removals find their slot
  subscribe("enrollments", db.collection("bio_enrollments"), (type, id, data) => {
    const prev = pinIndex.get(id);
    if (prev) {
      const m = enrollments.get(prev[0]);
      if (m) m.delete(prev[1]);
      pinIndex.delete(id);
    }
    if (type === "removed" || !data.gym_id || !Number.isInteger(data.bioPin)) return;
    if (!enrollments.has(data.gym_id)) enrollments.set(data.gym_id, new Map());
    enrollments.get(data.gym_id).set(data.bioPin, { id, ...data });
    pinIndex.set(id, [data.gym_id, data.bioPin]);
  });

  return {
    devices,
    commands,
    enrollments,
    ready: () => Promise.all(Object.values(ready)),
    isReady: false,
    enrollmentsForGym: (gymId) => enrollments.get(gymId) || new Map(),
    commandsForSn: (sn) => Array.from((commands.get(sn) || new Map()).values()),
    // Local write-through so a reply reflects our own write before the
    // snapshot round-trip arrives.
    patchDevice(sn, patch) {
      const d = devices.get(sn);
      if (d) devices.set(sn, { ...d, ...patch });
    },
    patchCommand(sn, id, patch) {
      const bySn = commands.get(sn);
      if (bySn && bySn.has(id)) bySn.set(id, { ...bySn.get(id), ...patch });
    },
    stop() {
      stopped = true;
      for (const u of Object.values(unsubs)) if (u) u();
    },
  };
}

module.exports = { createCaches };
