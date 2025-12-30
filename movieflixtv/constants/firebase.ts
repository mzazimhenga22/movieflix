// app/constants/firebase.ts
import { initializeApp, getApps, FirebaseOptions } from "firebase/app";
import { initializeAuth } from "firebase/auth";
import type { Auth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

function requiredEnv(name: string): string {
  const value = (process.env[name] ?? '').trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

// Firebase web configuration (set via EXPO_PUBLIC_* env vars)
const measurementId = (process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ?? '').trim();
const firebaseConfig: FirebaseOptions = {
  apiKey: requiredEnv('EXPO_PUBLIC_FIREBASE_API_KEY'),
  authDomain: requiredEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  projectId: requiredEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: requiredEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requiredEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  appId: requiredEnv('EXPO_PUBLIC_FIREBASE_APP_ID'),
  ...(measurementId ? { measurementId } : {}),
};

// Initialize Firebase app (safe for HMR)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

// We'll populate this once initialization completes
let auth: Auth | null = null;

/**
 * Initialize Auth with React Native persistence if available.
 * Exported as a Promise so callers can await readiness.
 */
export const authPromise: Promise<Auth> = (async () => {
  let persistence: any | undefined;

  // 1) Try the main firebase/auth export (some firebase builds expose the helper there)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const authPkg = require('firebase/auth') as any;
    if (authPkg && typeof authPkg.getReactNativePersistence === 'function') {
      persistence = authPkg.getReactNativePersistence(ReactNativeAsyncStorage);
    }
  } catch (e) {
    // ignore — we'll try dynamic import next
  }

  // 2) Fallback: dynamic import of the RN-specific entry (avoids bundling a static unresolved import)
  if (!persistence) {
    try {
      // dynamic import prevents Metro from trying to resolve this at static bundle-time
      // @ts-ignore - some builds don't have types for this path
      const rn = await import('firebase/auth/react-native');
      if (rn && typeof rn.getReactNativePersistence === 'function') {
        persistence = rn.getReactNativePersistence(ReactNativeAsyncStorage);
      }
    } catch (e) {
      // if this fails, we continue without RN-specific persistence (still works)
      persistence = undefined;
    }
  }

  const authOptions = persistence ? { persistence } : {};
  auth = initializeAuth(app, authOptions as any);
  return auth;
})();

/**
 * Synchronous getter for auth — will throw if used before `authPromise` resolves.
 * Use this after awaiting authPromise (or in code that runs after app startup).
 */
export function getAuthSync(): Auth {
  if (!auth) {
    throw new Error('Firebase Auth not initialized yet. Await authPromise before calling getAuthSync().');
  }
  return auth;
}

// Other services (these are synchronous)
export const firestore = getFirestore(app);
export const storage = getStorage(app);

// Export app as default
export default app;
