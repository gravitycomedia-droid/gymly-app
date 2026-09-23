"use strict";

// processScan — the single server-side entry point for every attendance scan.
// Replaces the client-trusted logic that used to live in QRScanner.jsx,
// TabletMode.jsx and EntryKiosk.jsx. Because it runs with the Admin SDK it
// bypasses Firestore rules, which lets us lock those collections down to
// `create: if false` and stop trusting the browser.
//
// Caller types:
//   - staff / owner / manager : has request.auth.token.gym_id (custom claim)
//   - kiosk                    : anonymous auth; passes deviceId, gym resolved
//                                server-side from kiosk_devices/{deviceId}
//
// Field shapes written here are IDENTICAL to the old client writes so the
// owner dashboards (AttendanceLogs, occupancy, gymStats) keep working unchanged.
//
// v1 firebase-functions to match this codebase (NOT v2).

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { verifyToken } = require("./attendanceAuth");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const { sendGa4Events } = require("../lib/ga4");
const HttpsError = functions.https.HttpsError;
const FV = admin.firestore.FieldValue;

const DAY = 24 * 60 * 60 * 1000;

// Date key in the gym's timezone (India). Cloud Functions run in UTC, so we
// must format in Asia/Kolkata to match the client's device-local formatDateKey,
// otherwise post-midnight IST check-ins would be grouped under the wrong day.
function formatDateKey(date) {
  return (date || new Date()).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

// GA4 (server): scan_processed. Wraps a scan handler so the outcome is
// reported AFTER its transaction settles — never inside it, since Firestore
// transactions retry and would double-count. Only the status and the mode are
// sent; the handler's result also carries member_name and photo, which must
// never reach GA4.
function reportScan(resultPromise, meta) {
  return resultPromise.then((result) => {
    try {
      sendGa4Events({
        gym_id: meta.gym_id,
        events: [{
          name: "scan_processed",
          params: {
            scan_status: (result && result.status) || "unknown",
            scan_mode: meta.scan_mode,
          },
        }],
      });
    } catch (_) { /* analytics must never affect a scan */ }
    return result;
  });
}

// O(1) streak update — no history scan. Deduped so it only writes once per day.
function computeStreak(member, now) {
  const today = formatDateKey(now);
  const yesterday = formatDateKey(new Date(now.getTime() - DAY));
  const last = member.last_checkin_date || null;
  let current = member.current_streak || 0;
  let longest = member.longest_streak || 0;
  let changed = false;

  if (last === today) {
    if (current < 1) current = 1; // safety for legacy docs
  } else if (last === yesterday) {
    current = current + 1;
    changed = true;
  } else {
    current = 1;
    changed = true;
  }
  if (current > longest) longest = current;

  const isNewRecord = changed && current === longest && current > 1;
  return { current, longest, changed, isNewRecord };
}

function subscriptionExpiryMs(member) {
  const e = member.subscription_expiry;
  return e && typeof e.toMillis === "function" ? e.toMillis() : 0;
}

// ── Staff / manual check-in → attendance_logs (transactional) ───────────────
async function handleStaffScan({ uid, callerGymId, scannedByUid, source }) {
  const memberRef = db.doc(`users/${uid}`);
  const logsRef = db.collection("attendance_logs");
  const now = new Date();
  const dateKey = formatDateKey(now);

  return db.runTransaction(async (tx) => {
    const memberSnap = await tx.get(memberRef);
    if (!memberSnap.exists) throw new HttpsError("not-found", "Member not found");
    const member = memberSnap.data();
    if (member.gym_id !== callerGymId) {
      throw new HttpsError("permission-denied", "Member belongs to a different gym");
    }

    const expiryMs = subscriptionExpiryMs(member);
    const isExpired = !expiryMs || expiryMs < Date.now();

    // Duplicate check (only meaningful for valid members).
    const dupSnap = await tx.get(
      logsRef
        .where("member_id", "==", uid)
        .where("date", "==", dateKey)
        .where("is_expired", "==", false)
        .limit(1)
    );

    const base = {
      gym_id: callerGymId,
      member_id: uid,
      member_name: member.name || "",
      member_photo: member.profile_photo || null,
      plan_name: member.plan_name || null,
      subscription_expiry: member.subscription_expiry || null,
      exit_time: null,
      date: dateKey,
      scanned_by: source,
      scan_mode: "phone",
      entry_time: FV.serverTimestamp(),
      scanned_by_uid: scannedByUid || null,
    };

    if (isExpired) {
      tx.set(logsRef.doc(), { ...base, is_expired: true });
      return {
        status: "expired",
        memberId: uid,
        memberName: member.name || "",
        memberPhoto: member.profile_photo || null,
        planName: member.plan_name || null,
      };
    }

    if (!dupSnap.empty) {
      return {
        status: "duplicate",
        memberId: uid,
        memberName: member.name || "",
        memberPhoto: member.profile_photo || null,
        planName: member.plan_name || null,
        message: "Already checked in today",
      };
    }

    const streak = computeStreak(member, now);
    tx.set(logsRef.doc(), { ...base, is_expired: false });
    if (streak.changed) {
      tx.update(memberRef, {
        current_streak: streak.current,
        longest_streak: streak.longest,
        last_checkin_date: dateKey,
      });
    }

    return {
      status: "success",
      memberId: uid,
      memberName: member.name || "",
      memberPhoto: member.profile_photo || null,
      planName: member.plan_name || null,
      currentStreak: streak.current,
      longestStreak: streak.longest,
      isNewRecord: streak.isNewRecord,
    };
  });
}

// ── Kiosk check-in → attendance_sessions (entry/exit/both + 90m auto-exit) ──
async function handleKioskScan({ uid, callerGymId, deviceId, deviceDoc, intent }) {
  const now = new Date();
  const memberRef = db.doc(`users/${uid}`);
  const sessionsCol = db.collection("attendance_sessions");
  // A dedicated Exit Kiosk passes intent:'exit' to force exit regardless of how
  // the device's mode was configured; otherwise fall back to the device mode.
  const mode = (intent === "exit" || intent === "entry") ? intent : (deviceDoc.mode || "both");

  return db.runTransaction(async (tx) => {
    const memberSnap = await tx.get(memberRef);
    if (!memberSnap.exists) throw new HttpsError("not-found", "Member not found");
    const member = memberSnap.data();
    if (member.gym_id !== callerGymId) {
      throw new HttpsError("permission-denied", "Member belongs to a different gym");
    }

    const expiryMs = subscriptionExpiryMs(member);
    const isExpired = !expiryMs || expiryMs <= Date.now();
    const daysLeft = expiryMs ? Math.ceil((expiryMs - Date.now()) / DAY) : 0;

    // Most recent "inside" session (with 90-min auto-exit for stale ones).
    const activeSnap = await tx.get(
      sessionsCol
        .where("memberId", "==", uid)
        .where("gymId", "==", callerGymId)
        .where("status", "==", "inside")
        .orderBy("entryTime", "desc")
        .limit(1)
    );

    let active = null;
    if (!activeSnap.empty) {
      const d = activeSnap.docs[0];
      const dd = d.data();
      const entryMs = dd.entryTime && typeof dd.entryTime.toMillis === "function"
        ? dd.entryTime.toMillis()
        : Date.now();
      if (Date.now() - entryMs > 90 * 60 * 1000) {
        tx.update(d.ref, {
          exitTime: FV.serverTimestamp(),
          durationMinutes: 90,
          exitDeviceId: "auto-exit",
          status: "completed",
        });
      } else {
        active = { ref: d.ref, entryMs };
      }
    }

    let actionType = "entry";
    if (mode === "exit") actionType = "exit";
    else if (mode === "both") actionType = active ? "exit" : "entry";

    // EXIT — never blocked by expiry (a member inside must always be able to leave).
    if (actionType === "exit") {
      if (!active) {
        return {
          status: "no-session",
          memberName: member.name || "",
          memberPhoto: member.profile_photo || null,
        };
      }
      const durationMinutes = Math.max(1, Math.round((Date.now() - active.entryMs) / 60000));
      tx.update(active.ref, {
        exitTime: FV.serverTimestamp(),
        durationMinutes,
        exitDeviceId: deviceId || null,
        status: "completed",
      });
      return {
        status: "exit-success",
        memberName: member.name || "",
        memberPhoto: member.profile_photo || null,
        durationMinutes,
      };
    }

    // ENTRY — deny expired members.
    if (isExpired) {
      tx.set(db.collection("access_denied_logs").doc(), {
        memberId: uid,
        gymId: callerGymId,
        deviceId: deviceId || "unknown",
        attemptTime: FV.serverTimestamp(),
        reason: "expired",
        memberName: member.name || "",
        memberPhone: member.phone || "",
      });
      return {
        status: "expired",
        memberName: member.name || "",
        memberPhoto: member.profile_photo || null,
      };
    }

    tx.set(sessionsCol.doc(), {
      memberId: uid,
      gymId: callerGymId,
      memberName: member.name || "",
      entryTime: FV.serverTimestamp(),
      exitTime: null,
      durationMinutes: null,
      entryDeviceId: deviceId || "manual",
      exitDeviceId: null,
      status: "inside",
      createdAt: FV.serverTimestamp(),
    });

    const streak = computeStreak(member, now);
    if (streak.changed) {
      tx.update(memberRef, {
        current_streak: streak.current,
        longest_streak: streak.longest,
        last_checkin_date: formatDateKey(now),
      });
    }

    return {
      status: daysLeft <= 15 ? "expiring" : "success",
      memberName: member.name || "",
      memberPhoto: member.profile_photo || null,
      daysLeft,
      currentStreak: streak.current,
      longestStreak: streak.longest,
      isNewRecord: streak.isNewRecord,
    };
  });
}

exports.processScan = functions
  .runWith({ secrets: ["QR_SIGNING_SECRET"] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new HttpsError("unauthenticated", "Device not authenticated");
    }

    const providerData = context.auth.token.firebase || {};
    const isKiosk = providerData.sign_in_provider === "anonymous";

    // Resolve the caller's gym context.
    let callerGymId;
    let deviceDoc = null;
    const deviceId = data && data.deviceId ? data.deviceId : null;

    if (isKiosk) {
      if (!deviceId) throw new HttpsError("permission-denied", "No kiosk device");
      const dSnap = await db.doc(`kiosk_devices/${deviceId}`).get();
      if (!dSnap.exists) throw new HttpsError("permission-denied", "Kiosk not paired");
      deviceDoc = dSnap.data();
      if (deviceDoc.status !== "active") {
        throw new HttpsError("permission-denied", "Kiosk not active");
      }
      callerGymId = deviceDoc.gymId;
    } else {
      callerGymId = context.auth.token.gym_id;
    }
    if (!callerGymId) throw new HttpsError("permission-denied", "No gym context on token");

    // Manual staff check-in (no QR) — staff only.
    if (data && data.manualMemberId) {
      if (isKiosk) throw new HttpsError("permission-denied", "Manual check-in is staff only");
      return reportScan(handleStaffScan({
        uid: data.manualMemberId,
        callerGymId,
        scannedByUid: context.auth.uid,
        source: "manual_verified",
      }), { gym_id: callerGymId, scan_mode: "manual" });
    }

    // QR scan.
    const qrPayload = data && data.qrPayload;
    if (!qrPayload || !qrPayload.startsWith("gymly://")) {
      throw new HttpsError("invalid-argument", "Not a gymly QR");
    }
    const parts = qrPayload.replace("gymly://", "").split("/");
    const action = parts[0];

    if (action === "checkin") {
      const [, uid, gymId, windowStart, token] = parts;
      if (!uid || !gymId || !windowStart || !token) {
        throw new HttpsError("permission-denied", "Outdated check-in code — reopen the app");
      }
      if (gymId !== callerGymId) {
        throw new HttpsError("permission-denied", "QR belongs to a different gym");
      }
      if (!verifyToken(process.env.QR_SIGNING_SECRET, uid, gymId, Number(windowStart), token)) {
        throw new HttpsError("permission-denied", "Expired or invalid check-in code");
      }
      if (isKiosk) {
        return reportScan(
          handleKioskScan({ uid, callerGymId, deviceId, deviceDoc, intent: data && data.intent }),
          { gym_id: callerGymId, scan_mode: "kiosk" }
        );
      }
      return reportScan(handleStaffScan({
        uid,
        callerGymId,
        scannedByUid: context.auth.uid,
        source: "qr_staff_verified",
      }), { gym_id: callerGymId, scan_mode: "staff" });
    }

    throw new HttpsError("invalid-argument", `Unknown action: ${action}`);
  });
