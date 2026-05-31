// src/firebase/firestore-payments.js
// Proxy wrapper to redirect queries to mockFirestore in demo/screenshot mode

import * as real from './firestore-payments_real';
import * as mock from './mockFirestore';

const isMock = () => typeof window !== 'undefined' && localStorage.getItem('mockRole');

const run = (fnName, realFn, ...args) => {
  if (isMock()) {
    if (mock[fnName]) {
      return mock[fnName](...args);
    }
    console.warn(`mockFirestore.${fnName} not found in mock. Falling back to real.`);
  }
  return realFn(...args);
};

export const getNextInvoiceNumber = (...args) => run('getNextInvoiceNumber', real.getNextInvoiceNumber, ...args);
export const createPayment = (...args) => run('createPayment', real.createPayment, ...args);
export const getPaymentById = (...args) => run('getPaymentById', real.getPaymentById, ...args);
export const updatePayment = (...args) => run('updatePayment', real.updatePayment, ...args);
export const deletePayment = (...args) => run('deletePayment', real.deletePayment, ...args);
export const getPaymentsRealtime = (...args) => run('getPaymentsRealtime', real.getPaymentsRealtime, ...args);
export const getMemberPayments = (...args) => run('getMemberPayments', real.getMemberPayments, ...args);
export const getMemberPaymentsRealtime = (...args) => run('getMemberPaymentsRealtime', real.getMemberPaymentsRealtime, ...args);

export const createAttendanceLog = (...args) => run('createAttendanceLog', real.createAttendanceLog, ...args);
export const getAttendanceLogsRealtime = (...args) => run('getAttendanceLogsRealtime', real.getAttendanceLogsRealtime, ...args);
export const getTodayActiveMembers = (...args) => run('getTodayActiveMembers', real.getTodayActiveMembers, ...args);
export const getMemberTodayAttendance = (...args) => run('getMemberTodayAttendance', real.getMemberTodayAttendance, ...args);
export const getAttendanceRange = (...args) => run('getAttendanceRange', real.getAttendanceRange, ...args);

export const createWhatsAppLog = (...args) => run('createWhatsAppLog', real.createWhatsAppLog, ...args);
export const getWhatsAppLogsRealtime = (...args) => run('getWhatsAppLogsRealtime', real.getWhatsAppLogsRealtime, ...args);

export const clearPaymentDue = (...args) => run('clearPaymentDue', real.clearPaymentDue, ...args);

// Export static helpers normally
export const formatDateKey = real.formatDateKey;
export { serverTimestamp, Timestamp, increment, doc, updateDoc, getDoc, collection, addDoc, query, where, orderBy, getDocs, onSnapshot } from './firestore-payments_real';
