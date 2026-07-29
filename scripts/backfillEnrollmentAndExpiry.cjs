/**
 * backfillEnrollmentAndExpiry.cjs — one-off repair for the auth_uid rules bug
 * ─────────────────────────────────────────────────────────────────────────
 * The users/{uid} update rule briefly denied ALL writes to member docs
 * lacking an `auth_uid` field (owner/staff-created members who never logged
 * in), because `resource.data.auth_uid == null` throws on a genuinely
 * missing key instead of treating it as null. Fixed in firestore.rules
 * (resource.data.get('auth_uid', null)) and deployed.
 *
 * This script repairs data written while the bug was live:
 *   1. For every member, find their most recent payment.
 *   2. If the member's latestEnrollmentNumber doesn't match that payment's
 *      enrollmentNumber, fix it.
 *   3. If the payment is 'paid'/'partial' and its membership_end is later
 *      than the member's current subscription_expiry, the renewal likely
 *      never landed — fix subscription_expiry too (never move it backward).
 *   4. Backfill any payment_history entries missing from the member's array.
 *
 * Dry-run by default — prints what it WOULD change. Pass --apply to write.
 *
 * Run:  node scripts/backfillEnrollmentAndExpiry.cjs [--apply]
 */

const path = require("path");
const admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));

const APPLY = process.argv.includes("--apply");

const serviceAccount = require(path.join(__dirname, "serviceAccount.json"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function tsToMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  return new Date(ts).getTime();
}

(async () => {
  console.log(APPLY ? "🔧 APPLY MODE — writes will be made" : "🔎 DRY RUN — no writes will be made (pass --apply to write)");

  const membersSnap = await db.collection("users").where("role", "==", "member").get();
  console.log(`Found ${membersSnap.size} member docs.`);

  let checked = 0;
  let needsFix = 0;
  let fixed = 0;
  const errors = [];

  for (const memberDoc of membersSnap.docs) {
    checked++;
    const member = memberDoc.data();
    const memberId = memberDoc.id;

    const paymentsSnap = await db.collection("payments").where("member_id", "==", memberId).get();
    if (paymentsSnap.empty) continue;

    const payments = paymentsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => tsToMillis(b.created_at) - tsToMillis(a.created_at));

    const latestPayment = payments[0];

    const updates = {};

    // 1. latestEnrollmentNumber
    if (latestPayment.enrollmentNumber && member.latestEnrollmentNumber !== latestPayment.enrollmentNumber) {
      updates.latestEnrollmentNumber = latestPayment.enrollmentNumber;
    }

    // 2. subscription_expiry — only extend, never shorten
    if (
      (latestPayment.status === "paid" || latestPayment.status === "partial") &&
      latestPayment.membership_end
    ) {
      const paymentEndMs = tsToMillis(latestPayment.membership_end);
      const currentExpiryMs = tsToMillis(member.subscription_expiry);
      if (paymentEndMs > currentExpiryMs) {
        updates.subscription_expiry = latestPayment.membership_end;
      }
    }

    // 3. payment_history — backfill any entries missing from the member's array
    const existingHistory = Array.isArray(member.payment_history) ? member.payment_history : [];
    const existingIds = new Set(existingHistory.map((p) => p.payment_id));
    const missingEntries = payments
      .filter((p) => !existingIds.has(p.id))
      .map((p) => ({
        payment_id: p.id,
        amount: p.amount || 0,
        final_amount: p.final_amount || 0,
        paid_amount: p.paid_amount || 0,
        status: p.status || "pending",
        method: p.method || "cash",
        invoice_number: p.invoice_number || null,
        enrollment_number: p.enrollmentNumber || null,
        payment_date: p.payment_date || admin.firestore.Timestamp.now(),
        plan_name: p.plan_name || "Membership",
      }));

    if (missingEntries.length > 0) {
      updates.payment_history = admin.firestore.FieldValue.arrayUnion(...missingEntries);
    }

    if (Object.keys(updates).length === 0) continue;

    needsFix++;
    console.log(`\n— ${member.name || memberId} (${memberId})`);
    if (updates.latestEnrollmentNumber) {
      console.log(`   latestEnrollmentNumber: ${member.latestEnrollmentNumber || "(none)"} → ${updates.latestEnrollmentNumber}`);
    }
    if (updates.subscription_expiry) {
      const oldD = member.subscription_expiry ? new Date(tsToMillis(member.subscription_expiry)).toISOString() : "(none)";
      const newD = new Date(tsToMillis(updates.subscription_expiry)).toISOString();
      console.log(`   subscription_expiry: ${oldD} → ${newD}`);
    }
    if (missingEntries.length > 0) {
      console.log(`   payment_history: +${missingEntries.length} missing entr${missingEntries.length === 1 ? "y" : "ies"}`);
    }

    if (APPLY) {
      try {
        await memberDoc.ref.update(updates);
        fixed++;
      } catch (err) {
        errors.push({ memberId, error: err.message });
        console.error(`   ❌ write failed: ${err.message}`);
      }
    }
  }

  console.log(`\nChecked ${checked} members. ${needsFix} needed fixes.`);
  if (APPLY) {
    console.log(`✅ Fixed ${fixed}/${needsFix}.`);
    if (errors.length) console.log(`❌ ${errors.length} failed:`, errors);
  } else {
    console.log("Nothing written (dry run). Re-run with --apply to write these changes.");
  }

  process.exit(0);
})().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
