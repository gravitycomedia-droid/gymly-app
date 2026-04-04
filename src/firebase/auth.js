import { RecaptchaVerifier, signInWithPhoneNumber, signOut } from 'firebase/auth';
import { auth } from './config';

export const setupRecaptcha = (containerId = 'recaptcha-container') => {
  if (!auth) throw new Error('Firebase Auth not initialized');

  if (!window.recaptchaVerifier) {
    window.recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
      callback: () => {},
      'expired-callback': () => {
        if (window.recaptchaVerifier) {
          window.recaptchaVerifier.clear();
          window.recaptchaVerifier = null;
        }
      },
    });
  }

  return window.recaptchaVerifier;
};

export const sendOTP = async (phoneNumber) => {
  if (!auth) throw new Error('Firebase Auth not initialized');
  const verifier = setupRecaptcha();
  const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, verifier);
  return confirmationResult;
};

export const verifyOTP = async (confirmationResult, code) => {
  const result = await confirmationResult.confirm(code);
  return result.user;
};

export const logout = async () => {
  if (!auth) return;
  await signOut(auth);
};
