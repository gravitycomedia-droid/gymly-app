const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// Phase 6 Tasks / Billing Automation
const invoicing = require("./src/invoicing");
exports.processNewPayment = invoicing.processNewPayment;
exports.generateInvoice = invoicing.generateInvoice;

// Member Lifecycle (soft delete / restore / permanent purge)
const lifecycle = require("./src/memberLifecycle");
exports.softDeleteMember = lifecycle.softDeleteMember;
exports.permanentlyDeleteMember = lifecycle.permanentlyDeleteMember;
exports.restoreMember = lifecycle.restoreMember;
exports.permanentlyDeleteExpired = lifecycle.permanentlyDeleteExpired;
exports.redeemCoupon = lifecycle.redeemCoupon;

// ─────────────────────────────────────────────────────────────────
// SUBSCRIPTION SYSTEM FUNCTIONS
// ─────────────────────────────────────────────────────────────────
const Razorpay = require("razorpay");
const crypto = require("crypto");
const { sendGa4Events, sendPurchase } = require("./lib/ga4");

function getRazorpay() {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || functions.config().razorpay?.key_id,
    key_secret: process.env.RAZORPAY_KEY_SECRET || functions.config().razorpay?.key_secret,
  });
}

function verifyRazorpaySignature(body, signature, secret) {
  const hash = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return hash === signature;
}

async function createSubPaymentRecord(gymId, payment, subscriptionId, planTier) {
  const paymentId = `pay_${Date.now()}`;
  await db.collection("billing").doc(gymId).collection("payments").doc(paymentId).set({
    payment_id: payment.id,
    gym_id: gymId,
    razorpay_subscription_id: subscriptionId,
    amount: payment.amount,
    plan: planTier,
    currency: "INR",
    payment_method: "razorpay",
    payment_source: "auto_recurring",
    payment_date: admin.firestore.Timestamp.fromDate(new Date(payment.created_at * 1000)),
    status: payment.status === "captured" ? "success" : payment.status,
    invoice_generated: true,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function logSubAction(gymId, action, details) {
  await db.collection("admin_logs").add({
    gym_id: gymId,
    action,
    details,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ─── 1. Create Subscription ───
exports.createSubscription = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") return res.status(400).json({ error: "Only POST allowed" });

  try {
    const { gymId, planId, razorpay_token_id } = req.body;
    if (!gymId || !planId) return res.status(400).json({ error: "Missing required fields" });

    const validPlans = ["BASIC", "PROFESSIONAL", "PROFESSIONAL_PLUS", "PREMIUM", "FREE"];
    if (!validPlans.includes(planId)) return res.status(400).json({ error: "Invalid plan" });

    const gymDoc = await db.collection("gyms").doc(gymId).get();
    if (!gymDoc.exists) return res.status(404).json({ error: "Gym not found" });
    const gym = gymDoc.data();

    const planMap = {
      BASIC:             { razorpay: "basic_monthly_199",             amount: 19900 },
      PROFESSIONAL:      { razorpay: "professional_monthly_499",      amount: 49900 },
      PROFESSIONAL_PLUS: { razorpay: "professional_plus_monthly_799", amount: 79900 },
      PREMIUM:           { razorpay: "premium_monthly_999",           amount: 99900 },
      FREE:              { razorpay: null,                            amount: 0 },
    };
    const planInfo = planMap[planId];

    if (planId === "FREE") {
      await db.collection("subscriptions").doc(gymId).set({
        plan: "FREE", status: "active", is_trial: false, amount_monthly: 0,
        auto_renew: false, created_at: admin.firestore.Timestamp.now(), updated_at: admin.firestore.Timestamp.now(),
      });
      return res.json({ success: true, message: "Free tier activated" });
    }

    const rzp = getRazorpay();
    let customerId;
    try {
      const customers = await rzp.customers.all({ email: gym.owner_email });
      customerId = customers.items[0]?.id;
    } catch {}

    if (!customerId) {
      const customer = await rzp.customers.create({
        email: gym.owner_email || `${gymId}@gymly.app`,
        contact: gym.owner_phone || gym.phone,
        notes: { gym_id: gymId, gym_name: gym.name },
      });
      customerId = customer.id;
    }

    const subscriptionPayload = {
      plan_id: planInfo.razorpay,
      customer_id: customerId,
      quantity: 1,
      total_count: 12,
      token: razorpay_token_id,
      notes: { gym_id: gymId, gym_name: gym.name, plan_tier: planId },
    };

    if (planId === "PREMIUM") {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 30);
      subscriptionPayload.expire_by = Math.floor(trialEnd.getTime() / 1000);
    }

    const subscription = await rzp.subscriptions.create(subscriptionPayload);

    const trialEndDate = planId === "PREMIUM"
      ? admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
      : null;

    await db.collection("subscriptions").doc(gymId).set({
      plan: planId,
      razorpay_subscription_id: subscription.id,
      razorpay_customer_id: customerId,
      status: "active",
      is_trial: planId === "PREMIUM",
      trial_started_at: planId === "PREMIUM" ? admin.firestore.Timestamp.now() : null,
      trial_end_date: trialEndDate,
      amount_monthly: planInfo.amount,
      auto_renew: true,
      created_at: admin.firestore.Timestamp.now(),
      updated_at: admin.firestore.Timestamp.now(),
    });

    await logSubAction(gymId, "subscription_created", { plan: planId, type: "razorpay" });

    // GA4 (server): trial_start. Not awaited — the HTTP response must not wait
    // on analytics.
    if (planId === "PREMIUM") {
      sendGa4Events({
        gym_id: gymId,
        events: [{ name: "trial_start", params: { plan_tier: planId, trial_days: 30 } }],
      });
    }

    res.json({
      success: true,
      subscription_id: subscription.id,
      message: planId === "PREMIUM" ? "Free 30-day trial started!" : "Subscription created",
    });
  } catch (error) {
    console.error("createSubscription error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ─── 2. Razorpay Webhook ───
exports.razorpayWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || functions.config().razorpay?.webhook_secret;
    const signature = req.headers["x-razorpay-signature"];

    if (secret && !verifyRazorpaySignature(JSON.stringify(req.body), signature, secret)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { event, payload } = req.body;
    console.log(`Processing webhook: ${event}`);

    const sub = payload?.subscription?.entity;
    const pay = payload?.payment?.entity;
    const gymId = sub?.notes?.gym_id;

    if (!gymId) { res.json({ success: true }); return; }

    switch (event) {
      case "subscription.activated":
      case "subscription.charged": {
        const cycleEnd = new Date((sub.current_period_end || Date.now() / 1000 + 2592000) * 1000);
        const updates = {
          status: "active",
          next_billing_date: admin.firestore.Timestamp.fromDate(cycleEnd),
          updated_at: admin.firestore.Timestamp.now(),
          failed_payment_count: 0,
        };
        if (pay?.card) {
          updates.payment_method_last4 = pay.card.last4;
          updates.payment_method_expiry = pay.card.expiry_month
            ? `${pay.card.expiry_month}/${pay.card.expiry_year}` : null;
        }
        await db.collection("subscriptions").doc(gymId).update(updates);
        if (pay) await createSubPaymentRecord(gymId, pay, sub.id, sub.notes?.plan_tier);

        // GA4 (server): purchase, in GA4 ecommerce shape. Deliberately NOT
        // awaited — Razorpay retries any webhook that does not get a prompt
        // 2xx, so analytics must never sit in front of res.json() below.
        if (pay) {
          sendPurchase({
            gym_id: gymId,
            transaction_id: pay.id,
            amountPaise: pay.amount,
            plan_tier: sub.notes?.plan_tier,
          });
        }
        break;
      }
      case "subscription.payment_failed": {
        await db.collection("subscriptions").doc(gymId).update({
          status: "past_due",
          failed_payment_count: admin.firestore.FieldValue.increment(1),
          updated_at: admin.firestore.Timestamp.now(),
        });
        break;
      }
      case "subscription.halted": {
        await db.collection("subscriptions").doc(gymId).update({
          status: "halted", updated_at: admin.firestore.Timestamp.now(),
        });
        break;
      }
      case "subscription.cancelled": {
        await db.collection("subscriptions").doc(gymId).update({
          status: "cancelled",
          cancelled_at: admin.firestore.Timestamp.now(),
          updated_at: admin.firestore.Timestamp.now(),
        });
        break;
      }
      default:
        console.log(`Unhandled webhook event: ${event}`);
    }

    res.json({ success: true });
  } catch (error) {
    console.error("razorpayWebhook error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ─── 3. Manual Payment Entry (Admin) ───
exports.addManualPayment = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") return res.status(400).json({ error: "Only POST allowed" });

  try {
    const { gymId, amount, paymentMethod, paymentDate, notes, bankDetails } = req.body;
    if (!gymId || !amount) return res.status(400).json({ error: "Missing fields" });

    const subDoc = await db.collection("subscriptions").doc(gymId).get();
    if (!subDoc.exists) return res.status(404).json({ error: "Subscription not found" });

    const paymentId = `mp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const amountInPaise = Math.round(amount * 100);
    const plan = subDoc.data().plan;

    const payData = {
      entry_id: paymentId,
      gym_id: gymId,
      amount: amountInPaise,
      plan,
      payment_method: paymentMethod || "cash",
      payment_date: admin.firestore.Timestamp.fromDate(new Date(paymentDate || Date.now())),
      status: "verified",
      notes: notes || "",
      invoice_generated: true,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (paymentMethod === "bank_transfer" && bankDetails) {
      payData.bank_name     = bankDetails.bank_name;
      payData.utr_number    = bankDetails.utr_number;
      payData.depositor_name = bankDetails.depositor_name;
    }

    await db.collection("billing").doc(gymId).collection("payments").doc(paymentId).set(payData);

    await db.collection("subscriptions").doc(gymId).update({
      last_payment_method: paymentMethod || "cash",
      last_payment_date: admin.firestore.Timestamp.fromDate(new Date(paymentDate || Date.now())),
      last_payment_amount: amountInPaise,
      updated_at: admin.firestore.Timestamp.now(),
    });

    await logSubAction(gymId, "manual_payment_added", { amount, paymentMethod });

    res.json({ success: true, payment_id: paymentId, message: `Payment of ₹${amount} logged.` });
  } catch (error) {
    console.error("addManualPayment error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Cleanup scheduled jobs — workout archival (N-11).
// whatsapp_logs retention (N-10) is now a Firestore TTL policy on sent_at, not a cron job.
const { archiveOldWorkoutLogs } = require("./src/cleanup");
exports.archiveOldWorkoutLogs = archiveOldWorkoutLogs;

// Custom JWT Claims — embeds role + gym_id into Auth token (O-2)
const { onUserWrite } = require("./src/userClaims");
exports.onUserWrite = onUserWrite;

// Pre-computed Stats Document — powers OwnerDashboard without full collection reads (O-3)
// statsResetDaily (nightly full resync) was removed — the 3 onWrite triggers below
// already keep stats fresh in real time; see PR description for the accepted staleness tradeoff.
const { statsOnUserWrite, statsOnPaymentWrite, statsOnAttendanceWrite } = require("./src/gymStats");
exports.statsOnUserWrite      = statsOnUserWrite;
exports.statsOnPaymentWrite   = statsOnPaymentWrite;
exports.statsOnAttendanceWrite = statsOnAttendanceWrite;

// Platform Stats — Super Admin KPI rollup (platform_stats/global), scheduled (SA-1)
// + denormalized gym_summaries for cheap N-read aggregation (SA-3 efficiency)
const { recomputePlatformStats, backfillPlatformStats, mirrorSubscriptionToGym } = require("./src/platformStats");
exports.recomputePlatformStats = recomputePlatformStats;
exports.backfillPlatformStats  = backfillPlatformStats;
exports.mirrorSubscriptionToGym = mirrorSubscriptionToGym;

// Super Admin Control — Phase 2 mutations (plan/trial/status/plans CRUD), audited (SA-2)
const adminControl = require("./src/adminControl");
exports.adminAssignPlan       = adminControl.adminAssignPlan;
exports.adminSetTrial         = adminControl.adminSetTrial;
exports.adminSetGymStatus     = adminControl.adminSetGymStatus;
exports.adminUpsertPlan       = adminControl.adminUpsertPlan;
exports.adminSetPlanActive    = adminControl.adminSetPlanActive;
exports.adminSeedDefaultPlans = adminControl.adminSeedDefaultPlans;
exports.adminMarkSubscriptionPaid = adminControl.adminMarkSubscriptionPaid;
exports.adminUpdateGymSettings    = adminControl.adminUpdateGymSettings;
exports.adminCreateBroadcast      = adminControl.adminCreateBroadcast;
exports.adminSetBroadcastActive   = adminControl.adminSetBroadcastActive;
exports.adminDeleteBroadcast      = adminControl.adminDeleteBroadcast;

// Attendance security — signed check-in token + server-validated scans.
// refreshCheckinClaim issues the member's short-lived QR token; processScan is
// the single validated entry point for staff scanner, tablet and kiosk scans.
const attendanceAuth = require("./src/attendanceAuth");
exports.refreshCheckinClaim = attendanceAuth.refreshCheckinClaim;

// Member multi-gym — mints role/gym_id claims for the selected gym membership.
const memberClaims = require("./src/memberClaims");
exports.setActiveGymClaim = memberClaims.setActiveGymClaim;

// Staff login — links a random-id staff doc to its Auth UID by phone and mints
// role/gym_id claims (onUserWrite can't, since doc id != uid).
const staffClaims = require("./src/staffClaims");
exports.resolveStaffLogin = staffClaims.resolveStaffLogin;
const processScanModule = require("./src/processScan");
exports.processScan = processScanModule.processScan;

// PIN sign-in — set/verify a 4-digit PIN as an OTP alternative for returning
// owners/staff (Gymloop redesign, handoff/AUTH-ONBOARDING.md).
const pinAuth = require("./src/pinAuth");
exports.setPin = pinAuth.setPin;
exports.verifyPin = pinAuth.verifyPin;

// ─── 4. Trial Expiry Check (Daily 6 AM IST) ───
exports.checkTrialExpiry = functions.pubsub
  .schedule("0 6 * * *")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    try {
      const now = admin.firestore.Timestamp.now();
      const expiredSnap = await db.collection("subscriptions")
        .where("is_trial", "==", true)
        .where("trial_end_date", "<", now)
        .get();

      console.log(`Trial expiry check: ${expiredSnap.size} expired`);

      for (const docSnap of expiredSnap.docs) {
        const gymId = docSnap.id;
        const payments = await db.collection("billing").doc(gymId).collection("payments")
          .where("status", "==", "success").limit(1).get();

        if (!payments.empty) {
          await docSnap.ref.update({ is_trial: false, updated_at: admin.firestore.Timestamp.now() });
          await logSubAction(gymId, "trial_converted_to_paid", {});
        } else {
          await docSnap.ref.update({
            plan: "FREE", status: "active", is_trial: false,
            updated_at: admin.firestore.Timestamp.now(),
          });
          await logSubAction(gymId, "trial_expired_downgraded", {});
          // GA4 (server): trial_expired. Awaited here — this is a scheduled
          // job with no caller waiting on a response, so delivery is free.
          await sendGa4Events({
            gym_id: gymId,
            events: [{ name: "trial_expired", params: { converted: false } }],
          });
        }
      }
      return null;
    } catch (error) {
      console.error("checkTrialExpiry error:", error);
      throw error;
    }
  });
