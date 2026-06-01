/**
 * Gymly Numbering Service
 * 
 * Core engine for generating:
 * 1. Member Numbers — permanent, e.g. "YNH-JN26-02"
 * 2. Enrollment Numbers — per-transaction, e.g. "JN01-06-01"
 */

import { db } from '../firebase/config';
import { doc, getDoc, setDoc, runTransaction } from 'firebase/firestore';
import { collection, query, where, getDocs } from 'firebase/firestore';

// ── Month Code Map ──
// 2-letter codes: first letter + next distinguishing consonant
export const MONTH_CODES = {
  0: 'JA', 1: 'FE', 2: 'MR', 3: 'AP', 4: 'MY', 5: 'JN',
  6: 'JL', 7: 'AU', 8: 'SE', 9: 'OC', 10: 'NV', 11: 'DE',
};

export const MONTH_CODE_LABELS = {
  JA: 'January', FE: 'February', MR: 'March', AP: 'April',
  MY: 'May', JN: 'June', JL: 'July', AU: 'August',
  SE: 'September', OC: 'October', NV: 'November', DE: 'December',
};

// ── Default Settings ──
const DEFAULT_SETTINGS = {
  gymPrefix: '',
  memberNumberTemplate: '{GYM_PREFIX}-{MONTH}{YY}-{SERIAL}',
  serialDigits: 2,
  yearlySerials: {},
  enrollmentTemplate: '{JOIN_DATE}-{PLAN_DURATION}-{SERIAL}',
  enrollmentSerialReset: 'monthly',
  createdAt: null,
  updatedAt: null,
};

// ══════════════════════════════════════════════
// MEMBER NUMBER GENERATION
// ══════════════════════════════════════════════

/**
 * Generate a permanent member number using a Firestore transaction.
 * Atomically increments the yearly serial counter.
 * 
 * @param {string} gymId 
 * @param {Date} joinDate - The date the member is joining
 * @returns {Promise<string>} e.g. "YNH-JN26-02"
 */
export async function generateMemberNumber(gymId, joinDate = new Date()) {
  if (!db) throw new Error('Firestore not initialized');

  const settingsRef = doc(db, 'numbering_settings', gymId);
  const year = joinDate.getFullYear().toString();
  const monthCode = MONTH_CODES[joinDate.getMonth()];
  const yy = year.slice(-2);

  let memberNumber = '';

  await runTransaction(db, async (transaction) => {
    const settingsSnap = await transaction.get(settingsRef);

    if (!settingsSnap.exists()) {
      // Auto-initialize with defaults if settings don't exist yet
      console.warn('Numbering settings not found for gym', gymId, '— using defaults');
      const defaultPrefix = 'GYM';
      const defaultTemplate = DEFAULT_SETTINGS.memberNumberTemplate;
      const digits = DEFAULT_SETTINGS.serialDigits;
      const yearlySerials = { [year]: 1 };

      const variables = {
        '{GYM_PREFIX}': defaultPrefix,
        '{MONTH}': monthCode,
        '{YY}': yy,
        '{YYYY}': year,
        '{SERIAL}': String(1).padStart(digits, '0'),
      };

      memberNumber = resolveTemplate(defaultTemplate, variables);

      // Create the settings doc with the first serial already incremented
      transaction.set(settingsRef, {
        ...DEFAULT_SETTINGS,
        gymId,
        gymPrefix: defaultPrefix,
        yearlySerials,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return;
    }

    const settings = settingsSnap.data();
    const template = settings.memberNumberTemplate || DEFAULT_SETTINGS.memberNumberTemplate;
    const digits = settings.serialDigits || DEFAULT_SETTINGS.serialDigits;
    const prefix = settings.gymPrefix || 'GYM';

    // Atomically increment yearly serial
    const yearlySerials = { ...(settings.yearlySerials || {}) };
    const currentSerial = (yearlySerials[year] || 0) + 1;
    yearlySerials[year] = currentSerial;

    // Resolve template
    const variables = {
      '{GYM_PREFIX}': prefix,
      '{MONTH}': monthCode,
      '{YY}': yy,
      '{YYYY}': year,
      '{SERIAL}': String(currentSerial).padStart(digits, '0'),
    };

    memberNumber = resolveTemplate(template, variables);

    // Write back the incremented counter
    transaction.update(settingsRef, {
      yearlySerials,
      updatedAt: new Date(),
    });
  });

  return memberNumber;
}

// ══════════════════════════════════════════════
// ENROLLMENT NUMBER GENERATION
// ══════════════════════════════════════════════

/**
 * Generate an enrollment number for a payment transaction.
 * Uses monthly serial counters.
 * 
 * @param {string} gymId 
 * @param {object} context - { joinDate: Date, planDurationMonths: number }
 * @returns {Promise<string>} e.g. "JN01-06-01"
 */
export async function generateEnrollmentNumber(gymId, context) {
  if (!db) throw new Error('Firestore not initialized');

  const { joinDate = new Date(), planDurationMonths = 1 } = context || {};

  const settingsRef = doc(db, 'numbering_settings', gymId);
  const settingsSnap = await getDoc(settingsRef);

  let settings;
  if (!settingsSnap.exists()) {
    // Auto-initialize with defaults
    console.warn('Numbering settings not found for enrollment number — using defaults');
    settings = { ...DEFAULT_SETTINGS, gymPrefix: 'GYM' };
    try {
      await setDoc(settingsRef, {
        ...settings,
        gymId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }, { merge: true });
    } catch (initErr) {
      console.error('Failed to auto-init numbering settings:', initErr);
    }
  } else {
    settings = settingsSnap.data();
  }
  const template = settings.enrollmentTemplate || DEFAULT_SETTINGS.enrollmentTemplate;
  const resetMode = settings.enrollmentSerialReset || 'monthly';
  const prefix = settings.gymPrefix || 'GYM';

  // Determine the serial counter key based on reset mode
  const monthKey = `${joinDate.getFullYear()}-${String(joinDate.getMonth() + 1).padStart(2, '0')}`;
  const dateKey = `${monthKey}-${String(joinDate.getDate()).padStart(2, '0')}`;
  const counterKey = resetMode === 'daily' ? dateKey : monthKey;

  const counterRef = doc(db, 'serial_counters', `${gymId}_${counterKey}`);
  let serial = 0;

  await runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(counterRef);
    const currentSerial = counterSnap.exists() ? (counterSnap.data().lastSerial || 0) : 0;
    serial = currentSerial + 1;

    transaction.set(counterRef, {
      gymId,
      [resetMode === 'daily' ? 'dateKey' : 'monthKey']: counterKey,
      lastSerial: serial,
      updatedAt: new Date(),
    }, { merge: true });
  });

  // Build JOIN_DATE: month code + zero-padded day
  const monthCode = MONTH_CODES[joinDate.getMonth()];
  const day = String(joinDate.getDate()).padStart(2, '0');

  const variables = {
    '{JOIN_DATE}': `${monthCode}${day}`,
    '{PLAN_DURATION}': String(planDurationMonths).padStart(2, '0'),
    '{SERIAL}': String(serial).padStart(2, '0'),
    '{MONTH}': monthCode,
    '{GYM_CODE}': prefix,
    '{YY}': String(joinDate.getFullYear()).slice(-2),
  };

  return resolveTemplate(template, variables);
}

// ══════════════════════════════════════════════
// GYM PREFIX UTILITIES
// ══════════════════════════════════════════════

/**
 * Derive a gym prefix from the gym name.
 * "Yash's Neon Hub" → "YNH"
 * "Anytime Fitness" → "AF"
 * "FitZone" → "FZ"
 */
export function deriveGymPrefix(gymName) {
  if (!gymName) return 'GYM';

  // Remove special chars, split into words
  const words = gymName
    .replace(/[''`]/g, '') // remove apostrophes
    .replace(/[^a-zA-Z\s]/g, ' ') // replace non-alpha with space
    .split(/\s+/)
    .filter(w => w.length > 0);

  if (words.length === 0) return 'GYM';

  if (words.length === 1) {
    // Single word: take first 2-3 chars
    return words[0].substring(0, Math.min(3, words[0].length)).toUpperCase();
  }

  // Multiple words: first letter of each word
  const prefix = words
    .map(w => w[0])
    .join('')
    .toUpperCase();

  // Cap at 4 chars
  return prefix.substring(0, 4);
}

/**
 * Check if a gym prefix is unique across all gyms.
 * Returns true if available, false if taken.
 */
export async function checkPrefixUniqueness(prefix, excludeGymId = null) {
  if (!db) return true; // offline mode

  const q = query(
    collection(db, 'numbering_settings'),
    where('gymPrefix', '==', prefix.toUpperCase())
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) return true;

  // If only match is our own gym, it's still available
  if (excludeGymId) {
    const otherGyms = snapshot.docs.filter(d => d.id !== excludeGymId);
    return otherGyms.length === 0;
  }

  return false;
}

/**
 * Suggest a unique prefix. If "YNH" is taken, tries "YNH1", "YNH2", etc.
 */
export async function suggestUniquePrefix(gymName, gymId) {
  const base = deriveGymPrefix(gymName);
  if (await checkPrefixUniqueness(base, gymId)) return base;

  for (let i = 1; i <= 9; i++) {
    const candidate = `${base}${i}`;
    if (await checkPrefixUniqueness(candidate, gymId)) return candidate;
  }

  // Fallback: use first 3 chars + random digit
  return `${base.substring(0, 3)}${Math.floor(Math.random() * 10)}`;
}

// ══════════════════════════════════════════════
// TEMPLATE HELPERS
// ══════════════════════════════════════════════

/**
 * Resolve a template by replacing {VAR} placeholders with values.
 * Pure function — no side effects.
 */
export function resolveTemplate(template, variables) {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(escapeRegex(key), 'g'), value);
  }
  return result;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Preview a member number without writing to DB.
 * Uses sample data for display in settings.
 */
export function previewMemberNumber(template, prefix, serialDigits = 2) {
  const now = new Date();
  const variables = {
    '{GYM_PREFIX}': prefix || 'GYM',
    '{MONTH}': MONTH_CODES[now.getMonth()],
    '{YY}': String(now.getFullYear()).slice(-2),
    '{YYYY}': String(now.getFullYear()),
    '{SERIAL}': String(1).padStart(serialDigits, '0'),
  };
  return resolveTemplate(template, variables);
}

/**
 * Preview an enrollment number without writing to DB.
 */
export function previewEnrollmentNumber(template, gymCode) {
  const now = new Date();
  const monthCode = MONTH_CODES[now.getMonth()];
  const day = String(now.getDate()).padStart(2, '0');
  const variables = {
    '{JOIN_DATE}': `${monthCode}${day}`,
    '{PLAN_DURATION}': '06',
    '{SERIAL}': '01',
    '{MONTH}': monthCode,
    '{GYM_CODE}': gymCode || 'GYM',
    '{YY}': String(now.getFullYear()).slice(-2),
  };
  return resolveTemplate(template, variables);
}

// ══════════════════════════════════════════════
// NUMBERING SETTINGS CRUD
// ══════════════════════════════════════════════

/**
 * Get numbering settings for a gym.
 * Returns null if not yet initialized.
 */
export async function getNumberingSettings(gymId) {
  if (!db) return null;
  const docRef = doc(db, 'numbering_settings', gymId);
  const snap = await getDoc(docRef);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Save numbering settings for a gym.
 */
export async function saveNumberingSettings(gymId, data) {
  if (!db) throw new Error('Firestore not initialized');
  const docRef = doc(db, 'numbering_settings', gymId);
  await setDoc(docRef, {
    gymId,
    ...data,
    updatedAt: new Date(),
  }, { merge: true });
}

/**
 * Initialize numbering settings for a gym if they don't exist.
 * Called on first access (e.g., when owner opens settings or adds first member).
 */
export async function initializeNumberingSettings(gymId, gymName) {
  const existing = await getNumberingSettings(gymId);
  if (existing) return existing;

  const prefix = await suggestUniquePrefix(gymName, gymId);
  const settings = {
    ...DEFAULT_SETTINGS,
    gymId,
    gymPrefix: prefix,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await saveNumberingSettings(gymId, settings);
  return { id: gymId, ...settings };
}

// ══════════════════════════════════════════════
// MEMBER ID GENERATION
// ══════════════════════════════════════════════

/**
 * Generate a random internal member ID.
 * Format: "MEM_" + 6 random alphanumeric chars.
 * This is the system-level ID, never shown to users.
 */
export function generateMemberId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let id = 'MEM_';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// ══════════════════════════════════════════════
// BACKFILL UTILITY
// ══════════════════════════════════════════════

/**
 * Assign member numbers to existing members who don't have one.
 * Called once automatically when member list loads.
 * 
 * @param {string} gymId
 * @param {string} gymName
 * @param {Array} members - sorted by created_at, only those without memberNumber
 */
export async function backfillMemberNumbers(gymId, gymName, members) {
  if (!members.length) return;

  // Ensure settings exist
  await initializeNumberingSettings(gymId, gymName);

  const { updateDoc } = await import('firebase/firestore');

  for (const member of members) {
    try {
      // Use the member's original created_at date for the number
      const joinDate = member.created_at?.toDate
        ? member.created_at.toDate()
        : new Date();

      const memberNumber = await generateMemberNumber(gymId, joinDate);
      const memberId = generateMemberId();

      const memberRef = doc(db, 'users', member.id);
      await updateDoc(memberRef, {
        memberNumber,
        memberId,
      });
    } catch (err) {
      console.error(`Backfill failed for ${member.name}:`, err);
      // Continue with next member
    }
  }
}
