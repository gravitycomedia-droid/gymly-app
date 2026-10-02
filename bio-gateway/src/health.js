"use strict";

// GET /health — for the Cloud Monitoring uptime check. Does a real Firestore
// read so a broken credential or network shows up as a failed check.
// Public endpoint: it says only whether Firestore answers — no tenant data.
// (Not under /iclock, so JSON is fine here.)

const log = require("./log");

function createHealth({ db }) {
  return async function health(req, res) {
    res.set("Cache-Control", "no-store");
    try {
      await db.doc("bio_counters/_health").get();
      res.status(200).json({ ok: true });
    } catch (err) {
      log.error("health_failed", { err });
      res.status(503).json({ ok: false });
    }
  };
}

module.exports = { createHealth };
