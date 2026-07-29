import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app = null;
let auth = null;
let db = null;
let storage = null;
let functions = null;

try {
  app = initializeApp(firebaseConfig);
  // App is phone-OTP only (no signInWithPopup/Redirect anywhere) — initializeAuth
  // with an explicit persistence list skips getAuth()'s default popup/redirect
  // resolver, which otherwise loads apis.google.com/js/api.js + a firebaseapp.com
  // auth iframe that this app never uses.
  auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
  });
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
  storage = getStorage(app);
  functions = getFunctions(app);
  if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
    // Deferred one frame so the reCAPTCHA Enterprise script fetch doesn't
    // compete with auth/firestore init on the critical path. The delay is a
    // single rAF tick, not a meaningful window for App Check enforcement.
    const initAppCheck = () => {
      import('firebase/app-check').then(({ initializeAppCheck, ReCaptchaEnterpriseProvider }) => {
        initializeAppCheck(app, {
          provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
          isTokenAutoRefreshEnabled: true,
        });
      });
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(initAppCheck);
    } else {
      initAppCheck();
    }
  }
} catch (error) {
  if (import.meta.env.DEV) console.error('Firebase initialization error:', error);
}

export { auth, db, storage, functions };
export default app;
