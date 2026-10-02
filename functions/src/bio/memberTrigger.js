"use strict";

// bioOnMemberWrite — keeps fingerprint devices in step with memberships.
//
// users/{id} already has three writers that fire on EVERY change
// (onUserWrite, statsOnUserWrite, and processScan / the gateway writing
// streaks on each check-in), so this trigger:
//   • only looks at role == 'member' docs,
//   • returns before any read unless name, subscription_expiry or is_deleted
//     changed (or the member was just created),
//   • NEVER writes back to users (bioPin/bioStatus live on bio_enrollments).
//
// Transitions (D2 isMemberActive, inclusive IST expiry date):
//   became active   (created/renewed/extended/restored) → PIN + USER_UPSERT + templates
//   became inactive (expiry moved back / soft-deleted)  → USER_DELETE
//   active and renamed                                  → USER_UPSERT
// Hard deletes are handled by permanentlyDeleteMember / permanentlyDeleteExpired.
// Frozen gyms (no biometric plan, or QR mode) get nothing queued.

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { isMemberActive, toMillis } = require("../lib/membership");
const core = require("./core");

if (!admin.apps.length) admin.initializeApp();

function relevantChange(before, after) {
  if (!before) return true;
  if ((before.name || "") !== (after.name || "")) return true;
  if ((before.is_deleted === true) !== (after.is_deleted === true)) return true;
  return toMillis(before.subscription_expiry) !== toMillis(after.subscription_expiry);
}

async function handleMemberWrite(memberId, before, after, now = new Date()) {
  if (!after) return { action: "ignored_delete" };
  if (after.role !== "member" || !after.gym_id) return { action: "ignored_role" };
  if (!relevantChange(before, after)) return { action: "ignored_fields" };

  const gymId = after.gym_id;
  const wasActive = before ? isMemberActive(before, now) : false;
  const isActive = isMemberActive(after, now);
  const renamed = !!before && (before.name || "") !== (after.name || "");
  if (!isActive && !wasActive) return { action: "noop_inactive" };
  if (isActive && wasActive && !renamed) return { action: "noop_active" };

  const state = await core.syncState(gymId);
  if (!state.allowed) return { action: "frozen", reason: state.reason };

  if (isActive) {
    // Became active, or renamed while active: (re)send the user. On
    // re-activation the stored templates go too, so no re-enrollment (§6.5).
    const enr = await core.allocateBioPin(gymId, memberId, after.name);
    await core.addMemberToDevices(gymId, enr, after.name);
    return { action: wasActive ? "renamed" : "added", bioPin: enr.bioPin };
  }

  const enr = await core.enrollmentByMember(memberId);
  if (!enr) return { action: "noop_no_pin" };
  await core.removeMemberFromDevices(gymId, enr);
  return { action: "removed", bioPin: enr.bioPin };
}

exports.handleMemberWrite = handleMemberWrite;

exports.bioOnMemberWrite = functions.firestore
  .document("users/{userId}")
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    try {
      const result = await handleMemberWrite(context.params.userId, before, after);
      if (!result.action.startsWith("ignored") && !result.action.startsWith("noop")) {
        console.log(`bioOnMemberWrite ${context.params.userId}: ${JSON.stringify(result)}`);
      }
    } catch (err) {
      // Throwing would make the platform retry only if retries were enabled;
      // they are not, so log loudly. syncBioDevice / the daily sweep reconcile.
      console.error(`bioOnMemberWrite failed for ${context.params.userId}:`, err);
    }
    return null;
  });
