import { RecaptchaVerifier, signInWithPhoneNumber, signOut } from 'firebase/auth';
import { auth } from './config';

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

export const verifyOTP = async (confirmationResult, code) => {
  const result = await confirmationResult.confirm(code);
  return result.user;
};

export const logout = async () => {
  if (!auth) return;
  await signOut(auth);
};
