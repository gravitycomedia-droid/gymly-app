import { createWhatsAppLog } from '../firebase/firestore-payments';

const AUTHKEY_TOKEN = import.meta.env.VITE_AUTHKEY_TOKEN;

// ─── Message Templates ───

export const WA_TEMPLATES = {
  welcome: (p) =>
`Welcome to ${p.gymName}! 🏋️

Hi ${p.memberName}, your membership is now active.

📋 Plan: ${p.planName}
📅 Valid till: ${p.expiryDate}

Stay consistent, stay strong! 💪
- Team ${p.gymName}`,

  expiry_7d: (p) =>
`⏰ Membership Reminder — ${p.gymName}

Hi ${p.memberName}, your membership expires in 7 days.

📅 Expiry: ${p.expiryDate}
💳 Plan: ${p.planName}

Renew now to keep your streak going!
Contact: ${p.gymPhone}`,

  expiry_3d: (p) =>
`⚠️ 3 Days Left — ${p.gymName}

Hi ${p.memberName}, only 3 days left on your membership!

📅 Expires: ${p.expiryDate}

Don't lose your progress. Renew today!
📞 ${p.gymPhone}`,

  expiry_1d: (p) =>
`🚨 Last Day — ${p.gymName}

Hi ${p.memberName}, your membership expires TOMORROW!

📅 Expires: ${p.expiryDate}

Contact your gym to renew immediately.
📞 ${p.gymPhone}`,

  payment_due: (p) =>
`💰 Payment Reminder — ${p.gymName}

Hi ${p.memberName}, your payment of ₹${p.amount} is pending.

📋 Plan: ${p.planName}
💵 Amount due: ₹${p.amount}

Please clear your dues at the gym.
📞 ${p.gymPhone}`,

  payment_receipt: (p) =>
`✅ Payment Confirmed — ${p.gymName}

Hi ${p.memberName}, your payment is received!

🧾 Invoice: ${p.invoiceNumber}
💵 Amount: ₹${p.amount}
💳 Method: ${p.method}
📅 Valid till: ${p.expiryDate}

Thank you! See you at the gym 🏋️`,

  renewal_confirm: (p) =>
`🎉 Membership Renewed — ${p.gymName}

Hi ${p.memberName}, your membership has been renewed!

📋 Plan: ${p.planName}
📅 New expiry: ${p.newExpiry}
🔥 Keep the streak going!`,

  workout_reminder: (p) =>
`💪 Time to Train — ${p.gymName}

Hey ${p.memberName}! Don't skip today's workout.

🏋️ Today: ${p.todayWorkout || 'Your scheduled workout'}
🔥 Current streak: ${p.streak || 0} days

You've got this! 🚀`
};

// ─── Send WhatsApp Message ───

export async function sendWhatsApp({ phone, templateName, params, gymId, memberId }) {
  const message = WA_TEMPLATES[templateName]?.(params);
  if (!message) {
    console.error('Unknown WhatsApp template:', templateName);
    return { success: false, error: 'Unknown template' };
  }

  let status = 'sent';
  let authkeyMessageId = null;

  if (AUTHKEY_TOKEN) {
    try {
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      const response = await fetch('https://messages.authkey.io/api/send_sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'authkey': AUTHKEY_TOKEN,
        },
        body: JSON.stringify({
          mobile: cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`,
          message: message,
          country_code: '91',
        }),
      });
      const result = await response.json();
      authkeyMessageId = result?.message_id || null;
      if (!response.ok) status = 'failed';
    } catch (error) {
      console.error('WhatsApp send error:', error);
      status = 'failed';
    }
  } else {
    console.warn('No Authkey token configured. WhatsApp message logged but not sent.');
    status = 'pending';
  }

  // Log to Firestore
  try {
    await createWhatsAppLog({
      gym_id: gymId,
      member_id: memberId,
      phone: phone,
      message_type: templateName,
      status: status,
      message_preview: message.slice(0, 100),
      authkey_message_id: authkeyMessageId,
    });
  } catch (err) {
    console.error('Failed to log WhatsApp message:', err);
  }

  return { success: status === 'sent', status, message };
}

// ─── Helper to build params from common data ───

export function buildReceiptParams(gym, member, payment) {
  return {
    gymName: gym?.name || 'Gym',
    memberName: member?.name || 'Member',
    invoiceNumber: payment.invoice_number,
    amount: payment.final_amount,
    method: payment.method === 'cash' ? 'Cash' : 'UPI',
    expiryDate: formatWADate(payment.membership_end),
  };
}

export function buildWelcomeParams(gym, member, plan, expiryDate) {
  return {
    gymName: gym?.name || 'Gym',
    memberName: member?.name || 'Member',
    planName: plan?.name || 'Membership',
    expiryDate: formatWADate(expiryDate),
    gymPhone: gym?.phone || '',
  };
}

function formatWADate(timestamp) {
  if (!timestamp) return '—';
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  if (isNaN(date.getTime())) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}
