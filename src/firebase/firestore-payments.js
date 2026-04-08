import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, addDoc, query, where, orderBy, limit,
  getDocs, onSnapshot, serverTimestamp, increment,
  Timestamp, runTransaction
} from 'firebase/firestore';
import { db } from './config';

// ─── Invoice Counter (transaction-safe) ───

export const getNextInvoiceNumber = async (gymId) => {
  const counterRef = doc(db, 'invoice_counter', gymId);
  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const next = snap.exists() ? snap.data().last_number + 1 : 1;
    tx.set(counterRef, {
      last_number: next,
      gym_id: gymId,
      prefix: snap.exists() ? snap.data().prefix : 'GYM'
    }, { merge: true });
    return { number: next, prefix: snap.exists() ? snap.data().prefix : 'GYM' };
  });
  return `${result.prefix}-${new Date().getFullYear()}-${String(result.number).padStart(4, '0')}`;
};

// ─── Payments ───

export const createPayment = async (data) => {
  const docRef = await addDoc(collection(db, 'payments'), {
    ...data,
    created_at: serverTimestamp(),
  });
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
  await deleteDoc(doc(db, 'payments', paymentId));
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
