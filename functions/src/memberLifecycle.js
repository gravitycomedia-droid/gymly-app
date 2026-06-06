"use strict";

const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ─── Callable: softDeleteMember ───
exports.softDeleteMember = functions.https.onCall(async (data, context) => {
  if (!context.auth)
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");

  const { memberId, gymId, deletePayments = false } = data;
  if (!memberId || !gymId)
    throw new functions.https.HttpsError("invalid-argument", "memberId and gymId are required.");

  const callerSnap = await db.collection("users").doc(context.auth.uid).get();
  if (!callerSnap.exists)
    throw new functions.https.HttpsError("not-found", "Caller user record not found.");
  const caller = callerSnap.data();
  if (caller.gym_id !== gymId || !["owner", "manager"].includes(caller.role))
    throw new functions.https.HttpsError("permission-denied", "Only owners or managers of this gym can delete members.");

  const memberSnap = await db.collection("users").doc(memberId).get();
  if (!memberSnap.exists)
    throw new functions.https.HttpsError("not-found", "Member not found.");
  const memberData = memberSnap.data();
  if (memberData.gym_id !== gymId)
    throw new functions.https.HttpsError("permission-denied", "Member does not belong to this gym.");
  if (memberData.is_deleted === true)
    throw new functions.https.HttpsError("failed-precondition", "Member is already soft-deleted.");

  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const binRef = db.collection("deleted_members").doc(gymId).collection("bin").doc(memberId);
  const auditRef = db.collection("audit_logs").doc(gymId).collection("events").doc();

  const batch = db.batch();

  batch.set(binRef, {
    snapshot: memberData,
    deleted_at: now,
    deleted_by: context.auth.uid,
    deleted_by_name: caller.name || "",
    gym_id: gymId,
    expires_at: expiresAt,
  });

  batch.update(db.collection("users").doc(memberId), {
    is_deleted: true,
    deleted_at: now,
    deleted_by: context.auth.uid,
  });

  batch.set(auditRef, {
    action: "member_deleted",
    target_id: memberId,
    target_name: memberData.name || "",
    performed_by: context.auth.uid,
    performed_by_name: caller.name || "",
    timestamp: now,
    snapshot: memberData,
  });

  if (deletePayments) {
    const paymentsSnap = await db.collection("payments")
      .where("member_id", "==", memberId)
      .where("gym_id", "==", gymId)
      .get();
    paymentsSnap.forEach(d => batch.delete(d.ref));
  }

  await batch.commit();
  return { success: true };
});

// ─── Callable: permanentlyDeleteMember ───
exports.permanentlyDeleteMember = functions.https.onCall(async (data, context) => {
  if (!context.auth)
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");

  const { memberId, gymId } = data;
  if (!memberId || !gymId)
    throw new functions.https.HttpsError("invalid-argument", "memberId and gymId are required.");

  const callerSnap = await db.collection("users").doc(context.auth.uid).get();
  if (!callerSnap.exists)
    throw new functions.https.HttpsError("not-found", "Caller not found.");
  const caller = callerSnap.data();
  if (caller.gym_id !== gymId || !["owner", "manager"].includes(caller.role))
    throw new functions.https.HttpsError("permission-denied", "Only owners or managers can permanently delete members.");

  const binRef = db.collection("deleted_members").doc(gymId).collection("bin").doc(memberId);
  const binSnap = await binRef.get();
  if (!binSnap.exists)
    throw new functions.https.HttpsError("not-found", "No deleted record found for this member.");

  try {
    await admin.auth().deleteUser(memberId);
  } catch (authErr) {
    if (authErr.code !== "auth/user-not-found")
      console.warn(`Auth deletion failed for ${memberId}: ${authErr.message}`);
  }

  const batch = db.batch();
  batch.delete(db.collection("users").doc(memberId));
  batch.delete(binRef);
  batch.set(db.collection("audit_logs").doc(gymId).collection("events").doc(), {
    action: "member_permanently_deleted",
    target_id: memberId,
    target_name: binSnap.data().snapshot?.name || "",
    performed_by: context.auth.uid,
    performed_by_name: caller.name || "",
    timestamp: admin.firestore.Timestamp.now(),
  });
  await batch.commit();
  return { success: true };
});

// ─── Callable: restoreMember ───
exports.restoreMember = functions.https.onCall(async (data, context) => {
  if (!context.auth)
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");

  const { memberId, gymId } = data;
  if (!memberId || !gymId)
    throw new functions.https.HttpsError("invalid-argument", "memberId and gymId are required.");

  const callerSnap = await db.collection("users").doc(context.auth.uid).get();
  if (!callerSnap.exists)
    throw new functions.https.HttpsError("not-found", "Caller user record not found.");
  const caller = callerSnap.data();
  if (caller.gym_id !== gymId || !["owner", "manager"].includes(caller.role))
    throw new functions.https.HttpsError("permission-denied", "Only owners or managers of this gym can restore members.");

  const binRef = db.collection("deleted_members").doc(gymId).collection("bin").doc(memberId);
  const binSnap = await binRef.get();
  if (!binSnap.exists)
    throw new functions.https.HttpsError("not-found", "No deleted record found for this member.");
  const binData = binSnap.data();
  if (binData.expires_at.toMillis() < Date.now())
    throw new functions.https.HttpsError("failed-precondition", "Restore window has expired (30 days).");

  const now = admin.firestore.Timestamp.now();
  const auditRef = db.collection("audit_logs").doc(gymId).collection("events").doc();

  const batch = db.batch();

  batch.update(db.collection("users").doc(memberId), {
    is_deleted: admin.firestore.FieldValue.delete(),
    deleted_at: admin.firestore.FieldValue.delete(),
    deleted_by: admin.firestore.FieldValue.delete(),
  });

  batch.delete(binRef);

  batch.set(auditRef, {
    action: "member_restored",
    target_id: memberId,
    target_name: binData.snapshot ? (binData.snapshot.name || "") : "",
    performed_by: context.auth.uid,
    performed_by_name: caller.name || "",
    timestamp: now,
  });

  await batch.commit();
  return { success: true };
});

// ─── Scheduled: permanentlyDeleteExpired (2:00 AM IST daily) ───
exports.permanentlyDeleteExpired = functions.pubsub
  .schedule("0 2 * * *")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();

    // collectionGroup query across all /deleted_members/{gymId}/bin subcollections.
    // Requires a Firestore index: collection group 'bin', field expires_at ASC.
    const expiredSnap = await db.collectionGroup("bin")
      .where("expires_at", "<", now)
      .get();

    if (expiredSnap.empty) {
      console.log("permanentlyDeleteExpired: no expired records.");
      return null;
    }

    console.log(`permanentlyDeleteExpired: processing ${expiredSnap.size} expired record(s).`);

    for (const docSnap of expiredSnap.docs) {
      const binData = docSnap.data();
      const memberId = docSnap.id;
      const gymId = binData.gym_id;

      try {
        try {
          await admin.auth().deleteUser(memberId);
          console.log(`Deleted Auth account for member ${memberId}.`);
        } catch (authErr) {
          if (authErr.code !== "auth/user-not-found") {
            console.warn(`Auth deletion failed for ${memberId}: ${authErr.message}`);
          }
          // auth/user-not-found is expected — most members have no Firebase Auth account
        }

        await db.collection("users").doc(memberId).delete();
        await docSnap.ref.delete();

        await db.collection("audit_logs").doc(gymId).collection("events").add({
          action: "member_permanently_deleted",
          target_id: memberId,
          target_name: binData.snapshot ? (binData.snapshot.name || "") : "",
          performed_by: "system",
          original_deleted_at: binData.deleted_at,
          original_deleted_by: binData.deleted_by,
          timestamp: admin.firestore.Timestamp.now(),
        });

        console.log(`Permanently deleted member ${memberId} (gym: ${gymId}).`);
      } catch (err) {
        console.error(`Failed permanent deletion for member ${memberId}:`, err);
      }
    }

    return null;
  });

// ─── Callable: redeemCoupon ───
exports.redeemCoupon = functions.https.onCall(async (data, context) => {
  if (!context.auth)
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");

  const { code, gymId } = data;
  if (!code || !gymId)
    throw new functions.https.HttpsError("invalid-argument", "code and gymId are required.");

  // Verify caller is the owner of this gym
  const callerSnap = await db.collection("users").doc(context.auth.uid).get();
  if (!callerSnap.exists)
    throw new functions.https.HttpsError("not-found", "Caller user record not found.");
  const caller = callerSnap.data();
  if (caller.gym_id !== gymId || caller.role !== "owner")
    throw new functions.https.HttpsError("permission-denied", "Only gym owners can redeem coupons.");

  const normalized = code.trim().toUpperCase();

  // Validate coupon exists in Firestore and is active
  const couponSnap = await db.collection("coupons").doc(normalized).get();
  if (!couponSnap.exists || !couponSnap.data().is_active)
    throw new functions.https.HttpsError("not-found", "Invalid coupon code.");
  const coupon = couponSnap.data();

  // Enforce single-use per gym
  const usedRef = db.collection("used_coupons").doc(`${gymId}_${normalized}`);
  const usedSnap = await usedRef.get();
  if (usedSnap.exists)
    throw new functions.https.HttpsError("failed-precondition", "This code has already been used for your gym.");

  // Calculate new expiry — extend from existing valid-until if still in the future
  const gymSnap = await db.collection("gyms").doc(gymId).get();
  if (!gymSnap.exists)
    throw new functions.https.HttpsError("not-found", "Gym not found.");
  const gymData = gymSnap.data();
  const currentExpiry = gymData.subscription_valid_until?.toDate?.();
  const base = currentExpiry && currentExpiry > new Date() ? currentExpiry : new Date();
  const newExpiry = new Date(base);
  newExpiry.setDate(newExpiry.getDate() + coupon.days);

  // Atomic batch: update gym + record used coupon
  const batch = db.batch();
  batch.update(db.collection("gyms").doc(gymId), {
    subscription_valid_until: admin.firestore.Timestamp.fromDate(newExpiry),
    subscription_coupon_label: coupon.label,
    subscription_coupon_active: true,
  });
  batch.set(usedRef, {
    gym_id: gymId,
    code: normalized,
    days: coupon.days,
    label: coupon.label,
    redeemed_by: context.auth.uid,
    used_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return {
    success: true,
    label: coupon.label,
    newExpiry: newExpiry.toISOString(),
  };
});
