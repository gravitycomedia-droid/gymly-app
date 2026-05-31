const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

// Check admin initialization securely
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

// Zoho Authentication Logic
async function getZohoAccessToken() {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN; 
  
  if (!refreshToken) {
    console.error("ZOHO_REFRESH_TOKEN is missing.");
    throw new Error("Missing Zoho Refresh Token");
  }

  const url = `https://accounts.zoho.in/oauth/v2/token?refresh_token=${refreshToken}&client_id=${clientId}&client_secret=${clientSecret}&grant_type=refresh_token`;

  try {
    const response = await fetch(url, { method: "POST" });
    const data = await response.json();
    if (data.access_token) {
      return data.access_token;
    } else {
      throw new Error(`Failed to get access token: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    console.error("Zoho Auth Error:", err);
    throw err;
  }
}

// Zoho: Get or Create Contact helper
async function getOrCreateContact(token, orgId, paymentData) {
  const phone = paymentData.member_phone ? paymentData.member_phone.replace(/[^0-9]/g, "") : "";
  const name = paymentData.member_name || "Gym Member";

  if (phone) {
    // 1. Search by Phone/Search Text
    const searchUrl = `https://www.zohoapis.in/books/v3/contacts?organization_id=${orgId}&search_text=${phone}`;
    const searchRes = await fetch(searchUrl, {
      headers: { "Authorization": `Zoho-oauthtoken ${token}` }
    });
    const searchData = await searchRes.json();

    if (searchData.code === 0 && searchData.contacts && searchData.contacts.length > 0) {
      console.log(`Found existing contact for phone ${phone}: ${searchData.contacts[0].contact_id}`);
      return searchData.contacts[0].contact_id;
    }
  }

  // 2. Create New Contact if not found
  console.log(`Creating new contact for ${name} (${phone})`);
  const createUrl = `https://www.zohoapis.in/books/v3/contacts?organization_id=${orgId}`;
  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: {
      "Authorization": `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contact_name: name,
      mobile: phone,
      contact_type: "customer"
    })
  });
  const createData = await createRes.json();

  if (createData.code === 0) {
    return createData.contact.contact_id;
  } else {
    console.error("Zoho Contact Creation Error:", createData);
    throw new Error(`Failed to create/find Zoho contact: ${createData.message}`);
  }
}

// Zoho: Record Payment helper
async function recordZohoPayment(token, orgId, invoiceId, customerId, amount) {
  const url = `https://www.zohoapis.in/books/v3/customerpayments?organization_id=${orgId}`;
  const payload = {
    customer_id: customerId,
    payment_mode: "cash",
    amount: amount,
    date: new Date().toISOString().split('T')[0],
    description: "Payment collected via Gymly APP",
    invoices: [
      {
        invoice_id: invoiceId,
        amount_applied: amount
      }
    ]
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  if (result.code !== 0) {
    console.error("Zoho Record Payment Error:", JSON.stringify(result));
    // We don't throw here to avoid failing the whole process if just the payment recording fails
  } else {
    console.log(`Successfully recorded Zoho payment for invoice ${invoiceId}`);
  }
}

// Zoho Create Invoice Logic
async function createZohoInvoice(paymentData) {
  const orgId = process.env.ZOHO_ORG_ID || "60069998595";
  const token = await getZohoAccessToken();

  // Get or Create the Customer in Zoho
  const customerId = await getOrCreateContact(token, orgId, paymentData);

  // Simple billing since org is not registered for GST
  const amount = paymentData.amount || 0;

  const payload = {
    customer_id: customerId,
    line_items: [
      {
        item_order: 1,
        name: `Membership Plan: ${paymentData.plan_name || "Gym Access"}`,
        description: "Gym Membership Subscription",
        rate: amount,
        quantity: 1
      }
    ],
    date: new Date().toISOString().split('T')[0],
    notes: "Thank you for subscribing via GYMLY.",
  };

  try {
    const response = await fetch(`https://www.zohoapis.in/books/v3/invoices?organization_id=${orgId}`, {
      method: "POST",
      headers: {
        "Authorization": `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (result.code === 0) {
      const invoiceId = result.invoice.invoice_id;
      
      // 1. Mark as Sent (Mandatory for public URL visibility)
      await fetch(`https://www.zohoapis.in/books/v3/invoices/${invoiceId}/status/sent?organization_id=${orgId}`, {
        method: "POST",
        headers: { "Authorization": `Zoho-oauthtoken ${token}` }
      });

      // 2. Record Payment (Marks it 'Paid' so link shows receipt, not payment portal)
      await recordZohoPayment(token, orgId, invoiceId, customerId, amount);

      return {
        invoice_id: invoiceId,
        invoice_number: result.invoice.invoice_number,
        pdf_url: result.invoice.invoice_url
      };
    } else {
      console.error("Zoho Invoice API Error:", JSON.stringify(result));
      throw new Error(`Zoho API Error: ${result.message}`);
    }
  } catch (err) {
    console.error("Error creating Zoho invoice:", err);
    throw err;
  }
}

// Cleomitra Delivery Logic
async function sendInvoiceWhatsApp(phone, invoiceUrl, name, amount) {
  const token = functions.config().cleomitra?.apikey || process.env.VITE_CLEOMITRA_API_KEY || "cmk_c6e22d2cd37d7e9f861459879fa388f8";
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  
  const payload = {
    channel: "whatsapp",
    toId: cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`,
    type: "template",
    templateName: "gymly_payment_confirmation", // Uses approved payment receipt template
    components: {
      body_parameters: ["GYMLY Studio", String(name), String(amount), "918008008000"], // Mapping: gymName, memberName, amount, gymPhone
      header_parameters: [
         { type: "document", url: invoiceUrl, filename: "Invoice_Receipt.pdf" }
      ]
    }
  };

  try {
    const response = await fetch("https://api.cleomitra.app/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": token,
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    return { success: response.ok, result };
  } catch (error) {
    console.error("Cleomitra Send Error:", error);
    return { success: false, error: error.message };
  }
}

// Cloud Function Trigger: onPaymentCreate
exports.processNewPayment = functions.firestore
  .document("payments/{paymentId}")
  .onCreate(async (snap, context) => {
    const paymentId = context.params.paymentId;
    const paymentData = snap.data();

    // Idempotency: skip if already processed or invoice exists
    const existingInvoices = await db.collection("invoices").where("payment_id", "==", paymentId).get();
    if (!existingInvoices.empty) {
      console.log(`Invoice already exists for payment ${paymentId}. Skipping.`);
      return null;
    }

    try {
      // 1. Create Zoho Invoice
      const invoiceData = await createZohoInvoice(paymentData);
      
      // 2. Save Invoice Details to Firestore
      const newInvoiceDoc = db.collection("invoices").doc();
      await newInvoiceDoc.set({
        payment_id: paymentId,
        zoho_invoice_id: invoiceData.invoice_id,
        invoice_number: invoiceData.invoice_number,
        pdf_url: invoiceData.pdf_url,
        amount_before_tax: Math.round(paymentData.amount / 1.18),
        tax_amount: paymentData.amount - Math.round(paymentData.amount / 1.18),
        status: "generated",
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });

      // Update original payment doc
      await db.collection("payments").doc(paymentId).update({
        invoice_status: "generated",
        invoice_pdf_url: invoiceData.pdf_url
      });

      // 3. Send via Cleomitra
      if (paymentData.member_phone) {
        const waResult = await sendInvoiceWhatsApp(
          paymentData.member_phone,
          invoiceData.pdf_url,
          paymentData.member_name,
          paymentData.amount
        );

        if (waResult.success) {
          await newInvoiceDoc.update({
            status: "sent_via_wa",
            whatsapp_message_id: waResult.result?.messageId || "sent"
          });

          await db.collection("payments").doc(paymentId).update({
            invoice_status: "sent_via_wa"
          });
          
          // Log explicitly into message_logs
          await db.collection("message_logs").add({
            message_type: "invoice_delivery",
            payment_id: paymentId,
            phone: paymentData.member_phone,
            attachment: {
              type: "invoice",
              pdf_url: invoiceData.pdf_url
            },
            status: "sent",
            sent_at: admin.firestore.FieldValue.serverTimestamp()
          });
        } else {
          await newInvoiceDoc.update({
             status: "wa_failed"
          });
          await db.collection("payments").doc(paymentId).update({
            invoice_status: "wa_failed"
          });
          console.error("WhatsApp delivery failed payload:", waResult);
        }
      }

    } catch (error) {
      console.error(`Failed executing billing flow for ${paymentId}:`, error);
      // We don't crash, we just let it fail gracefully. Owner can trigger a manual retry later.
    }

    return null;
  });

// Callable: Resend Invoice via WhatsApp
exports.resendInvoice = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
  
  const paymentId = data.paymentId;
  const paymentDoc = await db.collection("payments").doc(paymentId).get();
  if (!paymentDoc.exists) throw new functions.https.HttpsError("not-found", "Payment not found.");
  
  const pData = paymentDoc.data();
  if (!pData.invoice_pdf_url) throw new functions.https.HttpsError("failed-precondition", "Invoice PDF not generated yet.");
  if (!pData.member_phone) throw new functions.https.HttpsError("failed-precondition", "Member phone number is missing.");

  const waResult = await sendInvoiceWhatsApp(
    pData.member_phone,
    pData.invoice_pdf_url,
    pData.member_name,
    pData.amount
  );

  if (waResult.success) {
    await db.collection("payments").doc(paymentId).update({ invoice_status: "sent_via_wa" });
    return { success: true };
  } else {
    throw new functions.https.HttpsError("internal", "WhatsApp delivery failed via Cleomitra.");
  }
});

// Callable: Force Generate Zoho Invoice
exports.generateInvoice = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
  
  const paymentId = data.paymentId;
  const paymentDoc = await db.collection("payments").doc(paymentId).get();
  if (!paymentDoc.exists) throw new functions.https.HttpsError("not-found", "Payment not found.");
  
  const paymentData = paymentDoc.data();
  if (paymentData.invoice_pdf_url) {
    return { pdf_url: paymentData.invoice_pdf_url };
  }

  try {
    const invoiceData = await createZohoInvoice(paymentData);

    const newInvoiceDoc = db.collection("invoices").doc();
    await newInvoiceDoc.set({
      payment_id: paymentId,
      zoho_invoice_id: invoiceData.invoice_id,
      invoice_number: invoiceData.invoice_number,
      pdf_url: invoiceData.pdf_url,
      amount_before_tax: Math.round(paymentData.amount / 1.18),
      tax_amount: paymentData.amount - Math.round(paymentData.amount / 1.18),
      status: "generated",
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection("payments").doc(paymentId).update({
      invoice_status: "generated",
      invoice_pdf_url: invoiceData.pdf_url
    });

    return { pdf_url: invoiceData.pdf_url };
  } catch (error) {
    console.error(`Failed to generate retroactive invoice for ${paymentId}:`, error);
    throw new functions.https.HttpsError("internal", "Zoho Invoice Generation Failed");
  }
});
