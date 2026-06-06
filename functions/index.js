const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();
const db = admin.firestore();

// ─── Helper: Send WhatsApp via Cleomitra API ───
async function sendWhatsAppFromFunction({ phone, template, params, gymId, memberId }) {
  const token = functions.config().cleomitra?.apikey || process.env.VITE_CLEOMITRA_API_KEY || "cmk_c6e22d2cd37d7e9f861459879fa388f8";
  if (!token) {
    console.warn("No Cleomitra API key configured. Skipping WhatsApp send.");
    return { success: false, error: "no_token" };
  }

  // ─── Deduplication: Check if same message was sent today ───
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  if (memberId && gymId) {
    const dupCheck = await db.collection("whatsapp_logs")
      .where("member_id", "==", memberId)
      .where("message_type", "==", template)
      .where("date_key", "==", todayStr)
      .where("status", "in", ["sent", "delivered"])
      .limit(1)
      .get();

    if (!dupCheck.empty) {
      console.log(`Dedup: Skipping ${template} for member ${memberId} — already sent today.`);
      return { success: true, deduplicated: true };
    }
  }

  // ─── Template parameter mappings ───
  const MAPPINGS = {
    expiry_7d: {
      name: "gymly_expiry_reminder",
      components: [params.memberName, params.planName, params.gymName, "7", params.expiryDate, params.gymPhone]
    },
    expiry_3d: {
      name: "gymly_expiry_reminder",
      components: [params.memberName, params.planName, params.gymName, "3", params.expiryDate, params.gymPhone]
    },
    expiry_1d: {
      name: "gymly_expiry_reminder",
      components: [params.memberName, params.planName, params.gymName, "1", params.expiryDate, params.gymPhone]
    },
    payment_due: {
      name: "gymly_payment_due",
      components: [params.memberName, params.amount, params.planName, params.gymName, params.gymPhone]
    },
    workout_reminder: {
      name: "gymly_workout_reminder",
      components: [params.memberName, params.gymName]
    },
    welcome_message: {
      name: "gymly_welcome",
      components: [params.gymName, params.memberName, params.loginUrl || "https://gymly-app-06.web.app/member/login"]
    },
    payment_confirmation: {
      name: "gymly_payment_confirmation",
      components: [params.memberName, params.amount, params.gymName, params.gymPhone]
    },
    inactivity_alert: {
      name: "gymly_inactivity_alert",
      components: [params.memberName, params.gymName, params.gymPhone]
    },
    new_inquiry_owner: {
      name: "gymly_new_inquiry",
      components: [params.gymName, params.leadName, params.leadPhone, params.leadGoal]
    },
  };

  const mapping = MAPPINGS[template];
  if (!mapping) return { success: false, error: "unknown_template" };

  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const toPhone = cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`;

  try {
    const response = await fetch("https://api.cleomitra.app/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": token,
      },
      body: JSON.stringify({
        channel: "whatsapp",
        toId: toPhone,
        type: "template",
        templateName: mapping.name,
        components: {
          body_parameters: mapping.components.map(c => String(c || "")),
        },
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error(`Cleomitra API Error (${response.status}):`, JSON.stringify(result));
      return { success: false, error: result?.error || `HTTP ${response.status}`, statusCode: response.status };
    }

    return { success: true, result, messageId: result?.message?.id };
  } catch (error) {
    console.error("WhatsApp send error:", error);
    return { success: false, error: error.message };
  }
}

// ─── Helper: Log WhatsApp message ───
async function logWhatsApp({ gymId, memberId, phone, messageType, status, error, messageId, retryCount }) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  await db.collection("whatsapp_logs").add({
    gym_id: gymId,
    member_id: memberId,
    phone: phone,
    message_type: messageType,
    status: status,
    error_reason: error || null,
    cleomitra_message_id: messageId || null,
    retry_count: retryCount || 0,
    date_key: todayStr,
    sent_at: admin.firestore.FieldValue.serverTimestamp(),
    message_preview: messageType,
  });
}

// ─── Helper: Send and Log with Retry queueing ───
async function sendAndLog({ phone, template, params, gymId, memberId }) {
  const result = await sendWhatsAppFromFunction({ phone, template, params, gymId, memberId });

  if (result.deduplicated) return result;

  if (result.success) {
    await logWhatsApp({
      gymId, memberId, phone, messageType: template,
      status: "sent", messageId: result.messageId,
    });
  } else {
    // Queue for retry
    await db.collection("message_retry_queue").add({
      phone,
      template,
      params,
      gym_id: gymId,
      member_id: memberId,
      retry_count: 0,
      max_retries: 3,
      next_retry_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 5 * 60 * 1000)), // 5 min
      status: "pending",
      error: result.error || "unknown",
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    await logWhatsApp({
      gymId, memberId, phone, messageType: template,
      status: "failed", error: result.error,
    });
  }

  return result;
}

function formatDate(timestamp) {
  if (!timestamp) return "—";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

// ─── Scheduled: Retry Failed Messages (Every 5 min) ───
exports.retryFailedMessages = functions.pubsub
  .schedule("every 5 minutes")
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();

    const pendingSnap = await db.collection("message_retry_queue")
      .where("status", "==", "pending")
      .where("next_retry_at", "<=", now)
      .limit(20)
      .get();

    if (pendingSnap.empty) return null;

    console.log(`Retrying ${pendingSnap.size} failed messages...`);

    for (const doc of pendingSnap.docs) {
      const data = doc.data();
      const retryCount = (data.retry_count || 0) + 1;

      const result = await sendWhatsAppFromFunction({
        phone: data.phone,
        template: data.template,
        params: data.params,
        gymId: data.gym_id,
        memberId: data.member_id,
      });

      if (result.success) {
        await doc.ref.update({ status: "sent", sent_at: admin.firestore.FieldValue.serverTimestamp() });
        await logWhatsApp({
          gymId: data.gym_id, memberId: data.member_id, phone: data.phone,
          messageType: data.template, status: "sent", messageId: result.messageId,
          retryCount,
        });
      } else if (retryCount >= data.max_retries) {
        await doc.ref.update({ status: "permanently_failed", retry_count: retryCount });
        await logWhatsApp({
          gymId: data.gym_id, memberId: data.member_id, phone: data.phone,
          messageType: data.template, status: "permanently_failed",
          error: result.error, retryCount,
        });
        console.error(`Message permanently failed after ${retryCount} retries: ${data.template} to ${data.phone}`);
      } else {
        // Schedule next retry with exponential backoff: 5min, 30min, 2hr
        const delays = [5 * 60 * 1000, 30 * 60 * 1000, 2 * 60 * 60 * 1000];
        const nextDelay = delays[Math.min(retryCount, delays.length - 1)];
        await doc.ref.update({
          retry_count: retryCount,
          next_retry_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() + nextDelay)),
          last_error: result.error,
        });
      }
    }

    return null;
  });

// ─── Scheduled: Daily Expiry Reminders (9 AM IST = 3:30 AM UTC) ───
exports.dailyExpiryReminders = functions.pubsub
  .schedule("30 3 * * *")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const now = new Date();
    const checkDays = [7, 3, 1];

    for (const days of checkDays) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + days);
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      try {
        const membersSnap = await db
          .collection("users")
          .where("role", "==", "member")
          .where("subscription_expiry", ">=", admin.firestore.Timestamp.fromDate(startOfDay))
          .where("subscription_expiry", "<=", admin.firestore.Timestamp.fromDate(endOfDay))
          .get();

        console.log(`Found ${membersSnap.size} members expiring in ${days} days`);

        for (const memberDoc of membersSnap.docs) {
          const member = memberDoc.data();
          if (!member.gym_id) continue;

          const gymSnap = await db.collection("gyms").doc(member.gym_id).get();
          const gym = gymSnap.exists ? gymSnap.data() : {};

          if (gym.messaging_config && gym.messaging_config.expiry_alerts === false) continue;

          const templateKey = `expiry_${days}d`;
          await sendAndLog({
            phone: member.phone,
            template: templateKey,
            params: {
              gymName: gym.name || "Gym",
              memberName: member.name || "Member",
              expiryDate: formatDate(member.subscription_expiry),
              planName: member.plan_name || "Membership",
              gymPhone: gym.phone || "",
            },
            gymId: member.gym_id,
            memberId: memberDoc.id,
          });
        }
      } catch (error) {
        console.error(`Error processing ${days}-day reminders:`, error);
      }
    }
    return null;
  });

// ─── Scheduled: Daily Workout Reminder (10 AM IST = 4:30 AM UTC) ───
exports.dailyWorkoutReminder = functions.pubsub
  .schedule("30 4 * * *")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    try {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

      const membersSnap = await db
        .collection("users")
        .where("role", "==", "member")
        .where("subscription_expiry", ">", admin.firestore.Timestamp.now())
        .get();

      for (const memberDoc of membersSnap.docs) {
        const member = memberDoc.data();
        if (!member.workout_plan_id || !member.gym_id) continue;

        const todayLogs = await db
          .collection("workout_logs")
          .where("member_id", "==", memberDoc.id)
          .where("client_date", ">=", todayStr)
          .limit(1)
          .get();

        if (!todayLogs.empty) continue;

        const gymSnap = await db.collection("gyms").doc(member.gym_id).get();
        const gym = gymSnap.exists ? gymSnap.data() : {};

        await sendAndLog({
          phone: member.phone,
          template: "workout_reminder",
          params: {
            gymName: gym.name || "Gym",
            memberName: member.name || "Member",
          },
          gymId: member.gym_id,
          memberId: memberDoc.id,
        });
      }
    } catch (error) {
      console.error("Workout reminder error:", error);
    }
    return null;
  });

// ─── Scheduled: Pending Payment Reminder (Monday 10:30 AM IST = 5:00 AM UTC) ───
exports.pendingPaymentReminder = functions.pubsub
  .schedule("0 5 * * 1")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    try {
      const paymentsSnap = await db
        .collection("payments")
        .where("status", "in", ["pending", "partial"])
        .get();

      console.log(`Found ${paymentsSnap.size} pending payments`);

      for (const payDoc of paymentsSnap.docs) {
        const payment = payDoc.data();
        if (!payment.gym_id) continue;

        const gymSnap = await db.collection("gyms").doc(payment.gym_id).get();
        const gym = gymSnap.exists ? gymSnap.data() : {};

        if (gym.messaging_config && gym.messaging_config.payment_confirmations === false) continue;

        await sendAndLog({
          phone: payment.member_phone,
          template: "payment_due",
          params: {
            gymName: gym.name || "Gym",
            memberName: payment.member_name || "Member",
            amount: String(payment.pending_amount || payment.final_amount),
            planName: payment.plan_name || "Membership",
            gymPhone: gym.phone || "",
          },
          gymId: payment.gym_id,
          memberId: payment.member_id,
        });
      }
    } catch (error) {
      console.error("Payment reminder error:", error);
    }
    return null;
  });

// ─── Trigger: On Member Created (Welcome Message) ───
exports.onMemberCreated = functions.firestore
  .document("users/{userId}")
  .onCreate(async (snap, context) => {
    const member = snap.data();
    if (member.role !== "member" || !member.gym_id || !member.phone) return null;

    const gymSnap = await db.collection("gyms").doc(member.gym_id).get();
    const gym = gymSnap.exists ? gymSnap.data() : {};

    if (gym.messaging_config && gym.messaging_config.welcome_messages === false) return null;

    await sendAndLog({
      phone: member.phone,
      template: "welcome_message",
      params: {
        gymName: gym.name || "Gym",
        memberName: member.name || "Member",
        loginUrl: "https://gymly-app-06.web.app/member/login",
        gymPhone: gym.phone || "",
      },
      gymId: member.gym_id,
      memberId: context.params.userId,
    });

    return null;
  });

// ─── Trigger: On Payment Created/Updated (Payment Confirmation) ───
exports.onPaymentUpdated = functions.firestore
  .document("payments/{paymentId}")
  .onWrite(async (change, context) => {
    if (!change.after.exists) return null;
    const payment = change.after.data();
    const prevPayment = change.before.exists ? change.before.data() : null;

    if (payment.status !== "paid") return null;
    if (prevPayment && prevPayment.status === "paid") return null;
    if (!payment.gym_id || !payment.member_phone) return null;

    const gymSnap = await db.collection("gyms").doc(payment.gym_id).get();
    const gym = gymSnap.exists ? gymSnap.data() : {};

    if (gym.messaging_config && gym.messaging_config.payment_confirmations === false) return null;

    await sendAndLog({
      phone: payment.member_phone,
      template: "payment_confirmation",
      params: {
        gymName: gym.name || "Gym",
        memberName: payment.member_name || "Member",
        amount: String(payment.final_amount),
        gymPhone: gym.phone || "",
      },
      gymId: payment.gym_id,
      memberId: payment.member_id,
    });

    return null;
  });

// ─── Scheduled: Daily Inactivity Check (11 AM IST = 5:30 AM UTC) ───
exports.dailyInactivityCheck = functions.pubsub
  .schedule("30 5 * * *")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    try {
      const now = new Date();
      const gymsSnap = await db.collection("gyms").get();
      const gymsWithInactivity = [];
      gymsSnap.forEach(doc => {
        const gym = doc.data();
        if (gym.messaging_config && gym.messaging_config.inactivity_alerts === true) {
          gymsWithInactivity.push({ id: doc.id, ...gym });
        }
      });

      if (gymsWithInactivity.length === 0) return null;

      for (const gym of gymsWithInactivity) {
        const membersSnap = await db.collection("users")
          .where("gym_id", "==", gym.id)
          .where("role", "==", "member")
          .where("subscription_expiry", ">", admin.firestore.Timestamp.now())
          .get();

        for (const memberDoc of membersSnap.docs) {
          const member = memberDoc.data();
          if (!member.phone) continue;

          const attSnap = await db.collection("attendance_logs")
            .where("member_id", "==", memberDoc.id)
            .orderBy("timestamp", "desc")
            .limit(1)
            .get();

          let inactiveDays = 4;
          if (!attSnap.empty) {
            const lastLogTime = attSnap.docs[0].data().timestamp.toDate();
            const diffTime = Math.abs(now - lastLogTime);
            inactiveDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          }

          if (inactiveDays >= 3 && inactiveDays <= 4) {
            await sendAndLog({
              phone: member.phone,
              template: "inactivity_alert",
              params: {
                gymName: gym.name || "Gym",
                memberName: member.name || "Member",
                gymPhone: gym.phone || "",
              },
              gymId: gym.id,
              memberId: memberDoc.id,
            });
          }
        }
      }
    } catch (error) {
      console.error("Inactivity check error:", error);
    }
    return null;
  });

// Phase 6 Tasks / Billing Automation
const invoicing = require("./src/invoicing");
exports.processNewPayment = invoicing.processNewPayment;
exports.resendInvoice = invoicing.resendInvoice;
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

// Cleanup scheduled jobs — log retention + workout archival (N-10, N-11)
const { cleanOldWhatsappLogs, archiveOldWorkoutLogs } = require("./src/cleanup");
exports.cleanOldWhatsappLogs  = cleanOldWhatsappLogs;
exports.archiveOldWorkoutLogs = archiveOldWorkoutLogs;

// Custom JWT Claims — embeds role + gym_id into Auth token (O-2)
const { onUserWrite } = require("./src/userClaims");
exports.onUserWrite = onUserWrite;

// Pre-computed Stats Document — powers OwnerDashboard without full collection reads (O-3)
const { statsOnUserWrite, statsOnPaymentWrite, statsOnAttendanceWrite, statsResetDaily } = require("./src/gymStats");
exports.statsOnUserWrite      = statsOnUserWrite;
exports.statsOnPaymentWrite   = statsOnPaymentWrite;
exports.statsOnAttendanceWrite = statsOnAttendanceWrite;
exports.statsResetDaily       = statsResetDaily;

// ─── 4. Trial Expiry Check (Hourly Scheduled) ───
exports.checkTrialExpiry = functions.pubsub
  .schedule("0 * * * *")
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
        }
      }
      return null;
    } catch (error) {
      console.error("checkTrialExpiry error:", error);
      throw error;
    }
  });
