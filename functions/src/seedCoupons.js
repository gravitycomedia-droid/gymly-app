/**
 * BROWSER CONSOLE SEED SCRIPT
 * ─────────────────────────────────────────────────────────────
 * 1. Open https://gymly.online and LOG IN as owner (phone OTP)
 * 2. Open DevTools → Console
 * 3. Paste this entire script and press Enter
 * 4. Wait for "✅ Done! Seeded 20 coupons" message
 * ─────────────────────────────────────────────────────────────
 *
 * This uses the already-authenticated Firebase session in your browser.
 * No service account or extra credentials needed.
 */

(async () => {
  // Firebase modules are already loaded by the app
  const { getFirestore, doc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js');
  // Get the existing Firebase app instance from the page
  const { getApp } = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js');

  let db;
  try {
    db = getFirestore(getApp());
    console.log('✅ Connected to Firestore');
  } catch (e) {
    console.error('❌ Could not get Firestore instance:', e.message);
    console.log('Make sure you are on the Gymly app page and logged in.');
    return;
  }

  const COUPONS = [
    { code: 'GYM1M-BRYYC8', days: 30,  label: '1 Month' },
    { code: 'GYM1M-GVRFSF', days: 30,  label: '1 Month' },
    { code: 'GYM1M-4VBB7S', days: 30,  label: '1 Month' },
    { code: 'GYM1M-RZZVPP', days: 30,  label: '1 Month' },
    { code: 'GYM1M-ZKFHTR', days: 30,  label: '1 Month' },
    { code: 'GYM3M-8H9ALB', days: 90,  label: '3 Months' },
    { code: 'GYM3M-QGPHXG', days: 90,  label: '3 Months' },
    { code: 'GYM3M-5WRYCZ', days: 90,  label: '3 Months' },
    { code: 'GYM3M-3YSSAH', days: 90,  label: '3 Months' },
    { code: 'GYM3M-GHU32Y', days: 90,  label: '3 Months' },
    { code: 'GYM6M-UKTFPZ', days: 180, label: '6 Months' },
    { code: 'GYM6M-SRPXUT', days: 180, label: '6 Months' },
    { code: 'GYM6M-GF47CA', days: 180, label: '6 Months' },
    { code: 'GYM6M-JGGCM8', days: 180, label: '6 Months' },
    { code: 'GYM6M-5J7NUQ', days: 180, label: '6 Months' },
    { code: 'GYM1Y-BDP4FS', days: 365, label: '1 Year' },
    { code: 'GYM1Y-YNH3T3', days: 365, label: '1 Year' },
    { code: 'GYM1Y-D3GT5V', days: 365, label: '1 Year' },
    { code: 'GYM1Y-QQJBAF', days: 365, label: '1 Year' },
    { code: 'GYM1Y-JDEKF6', days: 365, label: '1 Year' },
  ];

  console.log(`📝 Writing ${COUPONS.length} coupon docs...`);
  let count = 0;
  for (const c of COUPONS) {
    await setDoc(doc(db, 'coupons', c.code), {
      days: c.days,
      label: c.label,
      is_active: true,
      created_at: serverTimestamp(),
    });
    count++;
    console.log(`  [${count}/${COUPONS.length}] ${c.code} — ${c.label}`);
  }

  console.log(`\n🎉 Done! Seeded ${COUPONS.length} coupons into Firestore /coupons collection.`);
  console.log('Verify at: https://console.firebase.google.com/project/gymly-app-06/firestore/data/coupons');
})();
