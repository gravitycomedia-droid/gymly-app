/**
 * setSuperAdmin.js — Super Admin claim bootstrap (LOCAL ONLY, NOT DEPLOYED)
 * ─────────────────────────────────────────────────────────────────────────
 * Grants the `super_admin: true` custom claim to an allowlist of UIDs.
 * There is intentionally NO UI to grant super admin — a "grant" button is an
 * attack surface. Run this locally with the service account.
 *
 * Setup:
 *   1. Download the service account key from
 *      Firebase Console → Project Settings → Service Accounts → Generate new key
 *   2. Save it as scripts/serviceAccount.json (git-ignored — never commit it)
 *   3. Add your UID(s) to SUPER_ADMIN_UIDS below
 *   4. Run:  node scripts/setSuperAdmin.js
 *
 * After running, the target user must refresh their token (re-login or
 * getIdToken(true)) before the claim takes effect.
 *
 * IMPORTANT: This MERGES the claim — it preserves any existing role/gym_id so
 * a super-admin who is also a gym owner keeps both. The onUserWrite function
 * is patched to do the same on every user-doc write.
 */

const admin = require("firebase-admin");
const path = require("path");

// TODO: add your UID(s) here. Find them in Firebase Console → Authentication.
const SUPER_ADMIN_UIDS = [
  
  "inlbtQiiBpUFPHlZ2Ru5uW1W5Wf2"
];

const serviceAccount = require(path.join(__dirname, "serviceAccount.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

(async () => {
  if (SUPER_ADMIN_UIDS.length === 0) {
    console.error("✋ SUPER_ADMIN_UIDS is empty. Add at least one UID and re-run.");
    process.exit(1);
  }

  for (const uid of SUPER_ADMIN_UIDS) {
    try {
      const userRecord = await admin.auth().getUser(uid);
      const existing = userRecord.customClaims || {};
      // Merge — never clobber existing role / gym_id.
      const merged = { ...existing, super_admin: true };
      await admin.auth().setCustomUserClaims(uid, merged);
      console.log(`✅ super_admin granted to ${uid}`, merged);
    } catch (err) {
      console.error(`❌ Failed for ${uid}:`, err.message);
    }
  }

  console.log("\nDone. Affected users must re-login (or call getIdToken(true)) to pick up the claim.");
  process.exit(0);
})();
