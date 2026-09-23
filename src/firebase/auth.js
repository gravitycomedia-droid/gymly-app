import { RecaptchaVerifier, signInWithPhoneNumber, signInWithCustomToken, signOut, getAdditionalUserInfo } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './config';
import { clearAnalyticsUser } from '../lib/analytics';

/**
 * Initialise an invisible reCAPTCHA verifier anchored to `containerId`.
 * Call this once from a useEffect on mount so the widget is ready before the
 * user taps "Send OTP". Calling it on button-click (after user interaction
 * triggered state updates) frequently causes auth/captcha-check-failed because
 * Firebase cannot resolve the challenge in the middle of a React re-render.
 */
export const setupRecaptcha = (containerId = 'recaptcha-container') => {
  if (!auth) throw new Error('Firebase Auth not initialized');

  // Destroy any stale verifier first
  destroyRecaptcha();

  const verifier = new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
    callback: () => {},
    'expired-callback': () => {
      // Widget expired — clear so the next sendOTP call re-initialises it
      destroyRecaptcha();
    },
  });

  window.recaptchaVerifier = verifier;
  return verifier;
};

/** Safely tear down the global verifier widget */
export const destroyRecaptcha = () => {
  if (window.recaptchaVerifier) {
    try {
      window.recaptchaVerifier.clear();
    } catch (_) { /* ignore — widget may already be gone */ }
    window.recaptchaVerifier = null;
  }
};

/**
 * Send an OTP to `phoneNumber`.
 * Reuses the pre-initialised verifier when available; creates a fresh one if not.
 * Pass `containerId` to specify which DOM element to anchor the widget to.
 */
export const sendOTP = async (phoneNumber, containerId = 'recaptcha-container') => {
  if (!auth) throw new Error('Firebase Auth not initialized');

  // If the verifier was destroyed (e.g. expired), rebuild it
  if (!window.recaptchaVerifier) {
    setupRecaptcha(containerId);
  }

  try {
    const confirmationResult = await signInWithPhoneNumber(
      auth,
      phoneNumber,
      window.recaptchaVerifier
    );
    return confirmationResult;
  } catch (err) {
    // Always destroy after a failure so the next attempt gets a fresh widget
    destroyRecaptcha();
    throw err;
  }
};

// Returns both the signed-in user and whether this was their first-ever sign
// in (Firebase's own isNewUser flag) — Signup uses isNewUser to decide
// whether to create a gym or treat this as a returning owner.
export const verifyOTP = async (confirmationResult, code) => {
  const result = await confirmationResult.confirm(code);
  const info = getAdditionalUserInfo(result);
  return { user: result.user, isNewUser: !!info?.isNewUser };
};

export const logout = async () => {
  if (!auth) return;
  await signOut(auth);
  // Drops user_id and the gym_id / user_role / plan_tier user properties so the
  // next account on a shared reception tablet starts a clean GA4 session.
  clearAnalyticsUser();
};

/**
 * Sets (or replaces) the signed-in user's 4-digit PIN. Call right after OTP
 * verification during signup — the PIN screen there is the only place a PIN
 * gets created (see functions/src/pinAuth.js for storage/hashing).
 */
export const setPin = async (pin) => {
  const call = httpsCallable(functions, 'setPin');
  await call({ pin });
};

/**
 * Verifies phone + PIN for a signed-out device and signs the client in on
 * success, via a Cloud-Function-minted custom token. This re-enters the same
 * onAuthStateChanged path a normal OTP sign-in takes — no AuthContext changes
 * needed. Throws a FirebaseError whose `.code` is one of:
 *   'not-found'          — no PIN set for this number, fall back to OTP
 *   'resource-exhausted' — locked out (details.lockedUntilMs)
 *   'permission-denied'  — wrong PIN (details.attemptsLeft)
 */
export const verifyPin = async (phone, pin) => {
  const call = httpsCallable(functions, 'verifyPin');
  const { data } = await call({ phone, pin });
  await signInWithCustomToken(auth, data.token);
};
