import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, addDoc, query, where, orderBy, limit,
  getDocs, onSnapshot, serverTimestamp, increment,
  Timestamp, runTransaction, arrayUnion
} from 'firebase/firestore';
import { db } from './config';

// ─── Invoice Counter (transaction-safe) ───

export const getNextInvoiceNumber = async (gymId) => {
  const counterRef = doc(db, 'invoice_counter', gymId);

  // Try to fetch the gym prefix from numbering_settings
  let gymPrefix = null;
  try {
    const settingsRef = doc(db, 'numbering_settings', gymId);
    const settingsSnap = await getDoc(settingsRef);
    if (settingsSnap.exists() && settingsSnap.data().gymPrefix) {
      gymPrefix = settingsSnap.data().gymPrefix;
    }
  } catch (e) {
    // non-critical — fall back to stored prefix or 'GYM'
  }

  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const next = snap.exists() ? snap.data().last_number + 1 : 1;
    const prefix = gymPrefix || (snap.exists() ? snap.data().prefix : 'GYM');
    tx.set(counterRef, {
      last_number: next,
      gym_id: gymId,
      prefix,
    }, { merge: true });
    return { number: next, prefix };
  });
  return `${result.prefix}-${new Date().getFullYear()}-${String(result.number).padStart(4, '0')}`;
};

// ─── Payments ───

export const createPayment = async (data) => {
  const docRef = await addDoc(collection(db, 'payments'), {
    ...data,
    created_at: serverTimestamp(),
  });

  // Automatically sync to member's native payment_history array
  if (data.member_id) {
    try {
      const memberRef = doc(db, 'users', data.member_id);
      await updateDoc(memberRef, {
        payment_history: arrayUnion({
          payment_id: docRef.id,
          amount: data.amount || 0,
          final_amount: data.final_amount || 0,
          paid_amount: data.paid_amount || 0,
          status: data.status || 'pending',
          method: data.method || 'cash',
          invoice_number: data.invoice_number || null,
          enrollment_number: data.enrollmentNumber || null,
          payment_date: data.payment_date || Timestamp.now(),
          plan_name: data.plan_name || 'Membership'
        })
      });
    } catch (e) {
      console.error('Error syncing payment to member history array:', e);
    }
  }

  return docRef.id;
};

export const getPaymentById = async (paymentId) => {
  const docSnap = await getDoc(doc(db, 'payments', paymentId));
  if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() };
  return null;
};

export const updatePayment = async (paymentId, data) => {
  await updateDoc(doc(db, 'payments', paymentId), data);
};

export const deletePayment = async (paymentId) => {
  const paymentRef = doc(db, 'payments', paymentId);
  const paymentSnap = await getDoc(paymentRef);
  
  if (!paymentSnap.exists()) return;
  const paymentData = paymentSnap.data();
  const memberId = paymentData.member_id;

  // Delete the payment
  await deleteDoc(paymentRef);

  if (!memberId) return;

  // Recalculate member's subscription status based on remaining payments
  try {
    const q = query(
      collection(db, 'payments'),
      where('member_id', '==', memberId),
      where('gym_id', '==', paymentData.gym_id)
    );
    const snapshot = await getDocs(q);
    
    const payments = [];
    let maxExpiry = 0;
    let hasPending = false;
    let latestPlanId = null;
    
    snapshot.forEach((d) => {
      const p = d.data();
      payments.push(p);
      
      if (p.status === 'pending' || p.status === 'partial') {
        hasPending = true;
      }
      
      if (p.membership_end) {
        const ms = p.membership_end.toDate ? p.membership_end.toDate().getTime() : new Date(p.membership_end).getTime();
        if (ms > maxExpiry) {
          maxExpiry = ms;
          latestPlanId = p.plan_id;
        }
      }
    });

    const memberRef = doc(db, 'users', memberId);
    const updates = {
      payment_status: hasPending ? 'pending' : 'paid'
    };

    if (payments.length === 0) {
      // No payments left. Set expiry to yesterday so it shows as Expired.
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      updates.subscription_expiry = Timestamp.fromDate(yesterday);
    } else if (maxExpiry > 0) {
      updates.subscription_expiry = Timestamp.fromMillis(maxExpiry);
      if (latestPlanId) {
        updates.plan_id = latestPlanId;
      }
    }

    await updateDoc(memberRef, updates);
  } catch (err) {
    console.error('Failed to recalculate member subscription after payment delete:', err);
  }
};

/**
 * Real-time listener for gym payments.
 */
export const getPaymentsRealtime = (gymId, callback) => {
  const q = query(
    collection(db, 'payments'),
    where('gym_id', '==', gymId)
  );
  return onSnapshot(q, (snapshot) => {
    const payments = [];
    snapshot.forEach((doc) => {
      payments.push({ id: doc.id, ...doc.data() });
    });
    // Sort descending by payment_date in JS to avoid requiring composite indexes
    payments.sort((a, b) => {
      const tA = a.payment_date?.toDate ? a.payment_date.toDate().getTime() : 0;
      const tB = b.payment_date?.toDate ? b.payment_date.toDate().getTime() : 0;
      return tB - tA;
    });
    callback(payments);
  }, (error) => {
    console.error('Payments realtime error:', error);
    callback([]);
  });
};

/**
 * Get payments for a specific member.
 */
export const getMemberPayments = async (gymId, memberId) => {
  const q = query(
    collection(db, 'payments'),
    where('gym_id', '==', gymId),
    where('member_id', '==', memberId),
    orderBy('payment_date', 'desc')
  );
  const snap = await getDocs(q);
  const payments = [];
  snap.forEach((d) => payments.push({ id: d.id, ...d.data() }));
  return payments;
};

// Simpler query without orderBy — used for deletion (no composite index needed)
export const deleteMemberPayments = async (gymId, memberId) => {
  const q = query(
    collection(db, 'payments'),
    where('gym_id', '==', gymId),
    where('member_id', '==', memberId)
  );
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  return snap.size;
};


// ─── Attendance Logs ───

export const createAttendanceLog = async (data) => {
  const docRef = await addDoc(collection(db, 'attendance_logs'), {
    ...data,
    entry_time: serverTimestamp(),
  });
  return docRef.id;
};

export const getAttendanceLogsRealtime = (gymId, date, callback) => {
  const q = query(
    collection(db, 'attendance_logs'),
    where('gym_id', '==', gymId),
    where('date', '==', date),
    orderBy('entry_time', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    const logs = [];
    snapshot.forEach((doc) => {
      logs.push({ id: doc.id, ...doc.data() });
    });
    callback(logs);
  }, (error) => {
    console.error('Attendance realtime error:', error);
    callback([]);
  });
};

export const getTodayActiveMembers = (gymId, callback) => {
  const today = formatDateKey(new Date());
  const q = query(
    collection(db, 'attendance_logs'),
    where('gym_id', '==', gymId),
    where('date', '==', today),
    where('is_expired', '==', false)
  );
  return onSnapshot(q, (snapshot) => {
    const logs = [];
    snapshot.forEach((doc) => {
      logs.push({ id: doc.id, ...doc.data() });
    });
    callback(logs);
  }, (error) => {
    console.error('Active members error:', error);
    callback([]);
  });
};

export const getMemberTodayAttendance = async (memberId, date) => {
  const q = query(
    collection(db, 'attendance_logs'),
    where('member_id', '==', memberId),
    where('date', '==', date),
    where('is_expired', '==', false)
  );
  const snap = await getDocs(q);
  return !snap.empty;
};

export const getAttendanceRange = async (gymId, startDate, endDate) => {
  const q = query(
    collection(db, 'attendance_logs'),
    where('gym_id', '==', gymId),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    orderBy('date', 'asc')
  );
  const snap = await getDocs(q);
  const logs = [];
  snap.forEach((d) => logs.push({ id: d.id, ...d.data() }));
  return logs;
};

// ─── WhatsApp Logs ───

export const createWhatsAppLog = async (data) => {
  const docRef = await addDoc(collection(db, 'whatsapp_logs'), {
    ...data,
    sent_at: serverTimestamp(),
  });
  return docRef.id;
};

export const getWhatsAppLogsRealtime = (gymId, callback) => {
  const q = query(
    collection(db, 'whatsapp_logs'),
    where('gym_id', '==', gymId),
    orderBy('sent_at', 'desc'),
    limit(100)
  );
  return onSnapshot(q, (snapshot) => {
    const logs = [];
    snapshot.forEach((doc) => {
      logs.push({ id: doc.id, ...doc.data() });
    });
    callback(logs);
  }, (error) => {
    console.error('WhatsApp logs error:', error);
    callback([]);
  });
};

/**
 * Real-time listener for a specific member's payments.
 */
export const getMemberPaymentsRealtime = (gymId, memberId, callback) => {
  const q = query(
    collection(db, 'payments'),
    where('gym_id', '==', gymId),
    where('member_id', '==', memberId)
  );
  return onSnapshot(q, (snapshot) => {
    const payments = [];
    snapshot.forEach((d) => payments.push({ id: d.id, ...d.data() }));
    // Sort descending by payment_date in JS to avoid composite index error
    payments.sort((a, b) => {
      const tA = a.payment_date?.toDate ? a.payment_date.toDate().getTime() : 0;
      const tB = b.payment_date?.toDate ? b.payment_date.toDate().getTime() : 0;
      return tB - tA;
    });
    callback(payments);
  }, (error) => {
    console.error('Member payments realtime error:', error);
    callback([]);
  });
};

/**
 * Clear due on a payment — mark as paid, set pending_amount to 0.
 */
export const clearPaymentDue = async (paymentId, memberId) => {
  await updateDoc(doc(db, 'payments', paymentId), {
    status: 'paid',
    paid_amount: null, // will be set to final_amount by caller
    pending_amount: 0,
    cleared_at: serverTimestamp(),
  });
};

// ─── Helpers ───

export function formatDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export { serverTimestamp, Timestamp, increment, doc, updateDoc, getDoc, collection, addDoc, query, where, orderBy, getDocs, onSnapshot };
