"use strict";

// ── Load .env from project root (pure Node built-ins, no dotenv needed) ──
const fs   = require("fs");
const path = require("path");
const envPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8").split("\n").forEach((line) => {
    const eqIdx = line.indexOf("=");
    if (eqIdx > 0) {
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim();
      if (key && !process.env[key]) process.env[key] = val;
    }
  });
}

// ── Use Firebase CLIENT SDK from root node_modules (no service account needed) ──
const { initializeApp }                      = require("../../node_modules/firebase/app");
const { getAuth, signInWithEmailAndPassword } = require("../../node_modules/firebase/auth");
const { getFirestore, doc, setDoc, serverTimestamp } = require("../../node_modules/firebase/firestore");

const COUPONS = [
  { code: "GYM1M-BRYYC8", days: 30,  label: "1 Month" },
  { code: "GYM1M-GVRFSF", days: 30,  label: "1 Month" },
  { code: "GYM1M-4VBB7S", days: 30,  label: "1 Month" },
  { code: "GYM1M-RZZVPP", days: 30,  label: "1 Month" },
  { code: "GYM1M-ZKFHTR", days: 30,  label: "1 Month" },
  { code: "GYM3M-8H9ALB", days: 90,  label: "3 Months" },
  { code: "GYM3M-QGPHXG", days: 90,  label: "3 Months" },
  { code: "GYM3M-5WRYCZ", days: 90,  label: "3 Months" },
  { code: "GYM3M-3YSSAH", days: 90,  label: "3 Months" },
  { code: "GYM3M-GHU32Y", days: 90,  label: "3 Months" },
  { code: "GYM6M-UKTFPZ", days: 180, label: "6 Months" },
  { code: "GYM6M-SRPXUT", days: 180, label: "6 Months" },
  { code: "GYM6M-GF47CA", days: 180, label: "6 Months" },
  { code: "GYM6M-JGGCM8", days: 180, label: "6 Months" },
  { code: "GYM6M-5J7NUQ", days: 180, label: "6 Months" },
  { code: "GYM1Y-BDP4FS", days: 365, label: "1 Year" },
  { code: "GYM1Y-YNH3T3", days: 365, label: "1 Year" },
  { code: "GYM1Y-D3GT5V", days: 365, label: "1 Year" },
  { code: "GYM1Y-QQJBAF", days: 365, label: "1 Year" },
  { code: "GYM1Y-JDEKF6", days: 365, label: "1 Year" },
];

async function seed() {
  const email = process.env.OWNER_EMAIL;
  const pass  = process.env.OWNER_PASS;

  if (!email || !pass) {
    console.error("❌  Set OWNER_EMAIL and OWNER_PASS env vars, e.g.:");
    console.error("    OWNER_EMAIL=you@email.com OWNER_PASS=yourpass node functions/src/seedCoupons.js");
    process.exit(1);
  }

  const firebaseConfig = {
    apiKey:            process.env.VITE_FIREBASE_API_KEY,
    authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             process.env.VITE_FIREBASE_APP_ID,
  };

  if (!firebaseConfig.apiKey) {
    console.error("❌  VITE_FIREBASE_API_KEY not found. Make sure .env exists.");
    process.exit(1);
  }

  console.log("🔥  Initializing Firebase...");
  const app  = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db   = getFirestore(app);

  console.log(`🔐  Signing in as ${email}...`);
  await signInWithEmailAndPassword(auth, email, pass);
  console.log("✅  Signed in.");

  console.log("📝  Writing coupon docs...");
  await Promise.all(
    COUPONS.map((c) =>
      setDoc(doc(db, "coupons", c.code), {
        days: c.days, label: c.label, is_active: true, created_at: serverTimestamp(),
      })
    )
  );

  console.log(`\n🎉  Seeded ${COUPONS.length} coupons into Firestore /coupons!`);
  console.log("    Verify: https://console.firebase.google.com/project/gymly-app-06/firestore/data/coupons");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌  Seed failed:", err.code || err.message);
  process.exit(1);
});
