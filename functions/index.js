const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();
const db = admin.firestore();

// ─── Helper: Send WhatsApp via Authkey.io ───
async function sendWhatsAppFromFunction({ phone, template, params }) {
  const token = functions.config().authkey?.token;
  if (!token) {
    console.warn("No Authkey token configured. Skipping WhatsApp send.");
    return { success: false, error: "no_token" };
  }

  const TEMPLATES = {
    expiry_7d: (p) =>
      `⏰ Membership Reminder — ${p.gymName}\n\nHi ${p.memberName}, your membership expires in 7 days.\n\n📅 Expiry: ${p.expiryDate}\n💳 Plan: ${p.planName}\n\nRenew now to keep your streak going!\nContact: ${p.gymPhone}`,
    expiry_3d: (p) =>
      `⚠️ 3 Days Left — ${p.gymName}\n\nHi ${p.memberName}, only 3 days left on your membership!\n\n📅 Expires: ${p.expiryDate}\n\nDon't lose your progress. Renew today!\n📞 ${p.gymPhone}`,
    expiry_1d: (p) =>
      `🚨 Last Day — ${p.gymName}\n\nHi ${p.memberName}, your membership expires TOMORROW!\n\n📅 Expires: ${p.expiryDate}\n\nContact your gym to renew immediately.\n📞 ${p.gymPhone}`,
    payment_due: (p) =>
      `💰 Payment Reminder — ${p.gymName}\n\nHi ${p.memberName}, your payment of ₹${p.amount} is pending.\n\n📋 Plan: ${p.planName}\n💵 Amount due: ₹${p.amount}\n\nPlease clear your dues at the gym.\n📞 ${p.gymPhone}`,
    workout_reminder: (p) =>
      `💪 Time to Train — ${p.gymName}\n\nHey ${p.memberName}! Don't skip today's workout.\n\nYou've got this! 🚀`,
  };

  const messageFn = TEMPLATES[template];
  if (!messageFn) return { success: false, error: "unknown_template" };

  const message = messageFn(params);
  const cleanPhone = phone.replace(/[^0-9]/g, "");

  try {
    const response = await fetch("https://messages.authkey.io/api/send_sms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authkey: token,
      },
      body: JSON.stringify({
        mobile: cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`,
        message: message,
        country_code: "91",
      }),
    });
    const result = await response.json();
    return { success: response.ok, result };
  } catch (error) {
    console.error("WhatsApp send error:", error);
    return { success: false, error: error.message };
  }
}

function formatDate(timestamp) {
  if (!timestamp) return "—";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

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

          const templateKey = `expiry_${days}d`;
          await sendWhatsAppFromFunction({
            phone: member.phone,
            template: templateKey,
            params: {
              gymName: gym.name || "Gym",
              memberName: member.name || "Member",
              expiryDate: formatDate(member.subscription_expiry),
              planName: member.plan_name || "Membership",
              gymPhone: gym.phone || "",
            },
          });

          await db.collection("whatsapp_logs").add({
            gym_id: member.gym_id,
            member_id: memberDoc.id,
            phone: member.phone,
            message_type: templateKey,
            status: "sent",
            sent_at: admin.firestore.FieldValue.serverTimestamp(),
            message_preview: `Expiry reminder ${days} days`,
            authkey_message_id: null,
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

      // Get all active members
      const membersSnap = await db
        .collection("users")
        .where("role", "==", "member")
        .where("subscription_expiry", ">", admin.firestore.Timestamp.now())
        .get();

      for (const memberDoc of membersSnap.docs) {
        const member = memberDoc.data();
        if (!member.workout_plan_id || !member.gym_id) continue;

        // Check if already logged today
        const todayLogs = await db
          .collection("workout_logs")
          .where("member_id", "==", memberDoc.id)
          .where("client_date", ">=", todayStr)
          .limit(1)
          .get();

        if (!todayLogs.empty) continue;

        const gymSnap = await db.collection("gyms").doc(member.gym_id).get();
        const gym = gymSnap.exists ? gymSnap.data() : {};

        await sendWhatsAppFromFunction({
          phone: member.phone,
          template: "workout_reminder",
          params: {
            gymName: gym.name || "Gym",
            memberName: member.name || "Member",
          },
        });

        await db.collection("whatsapp_logs").add({
          gym_id: member.gym_id,
          member_id: memberDoc.id,
          phone: member.phone,
          message_type: "workout_reminder",
          status: "sent",
          sent_at: admin.firestore.FieldValue.serverTimestamp(),
          message_preview: "Workout reminder",
          authkey_message_id: null,
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

        await sendWhatsAppFromFunction({
          phone: payment.member_phone,
          template: "payment_due",
          params: {
            gymName: gym.name || "Gym",
            memberName: payment.member_name || "Member",
            amount: payment.pending_amount || payment.final_amount,
            planName: payment.plan_name || "Membership",
            gymPhone: gym.phone || "",
          },
        });

        await db.collection("whatsapp_logs").add({
          gym_id: payment.gym_id,
          member_id: payment.member_id,
          phone: payment.member_phone,
          message_type: "payment_due",
          status: "sent",
          sent_at: admin.firestore.FieldValue.serverTimestamp(),
          message_preview: `Payment due: ₹${payment.pending_amount || payment.final_amount}`,
          authkey_message_id: null,
        });
      }
    } catch (error) {
      console.error("Payment reminder error:", error);
    }
    return null;
  });
