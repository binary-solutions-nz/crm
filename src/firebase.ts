// Firebase Web SDK initialisation.
//
// Config values are read from Vite env vars (VITE_FIREBASE_*), which are
// injected at build time. These are NOT secrets — Firebase web config is
// safe to ship to the browser; access is controlled by Firestore security
// rules and Firebase Authentication. See .env.example.

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  // Surface misconfiguration early rather than failing deep inside the SDK.
  // eslint-disable-next-line no-console
  console.error(
    'Firebase config is missing. Copy .env.example to .env and fill in your ' +
      'VITE_FIREBASE_* values from the Firebase console.'
  );
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
// Callable Cloud Functions are deployed to australia-southeast1 (see functions/src/index.ts).
export const functions = getFunctions(app, 'australia-southeast1');
