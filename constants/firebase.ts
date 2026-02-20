// app/constants/firebase.ts
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { FirebaseOptions, getApps, initializeApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import { getAuth, initializeAuth } from "firebase/auth";
import { Platform } from 'react-native';

function getEnv(name: string): string | undefined {
  const value = (process.env[name] ?? '').trim();
  return value ? value : undefined;
}

type GoogleServicesJson = {
  project_info?: {
    project_number?: string;
    project_id?: string;
    storage_bucket?: string;
  };
  client?: Array<{
    client_info?: {
      mobilesdk_app_id?: string;
      android_client_info?: {
        package_name?: string;
      };
    };
    api_key?: Array<{
      current_key?: string;
    }>;
  }>;
};

function decodeBase64Utf8(input: string): string | null {
  try {
    if (typeof (globalThis as any)?.atob === 'function') {
      return (globalThis as any).atob(input);
    }
  } catch {
    // ignore
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Buffer } = require('buffer');
    return Buffer.from(input, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function loadGoogleServicesJson(): GoogleServicesJson | null {
  const b64 = (process.env.GOOGLE_SERVICES_JSON_BASE64 ?? '').trim();
  if (b64) {
    const text = decodeBase64Utf8(b64);
    if (text) {
      try {
        return JSON.parse(text) as GoogleServicesJson;
      } catch {
        // ignore
      }
    }
  }

  // Avoid a static import so bundling/typecheck doesn't require the file to exist.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../' + 'google-services.json');
    return (mod?.default ?? mod) as GoogleServicesJson;
  } catch {
    return null;
  }
}

function deriveFromGoogleServices(): Partial<FirebaseOptions> {
  const gs = loadGoogleServicesJson();
  if (!gs) return {};
  const projectId = gs.project_info?.project_id;
  const storageBucket = gs.project_info?.storage_bucket;
  const messagingSenderId = gs.project_info?.project_number;

  const expectedPackage = 'com.movieflix.app';
  const client =
    gs.client?.find((c) => c?.client_info?.android_client_info?.package_name === expectedPackage) ||
    gs.client?.[0];

  const apiKey = client?.api_key?.[0]?.current_key;
  const appId = client?.client_info?.mobilesdk_app_id;
  const authDomain = projectId ? `${projectId}.firebaseapp.com` : undefined;

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  };
}

// Firebase web configuration (set via EXPO_PUBLIC_* env vars)
const measurementId = (process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ?? '').trim();

const derived = deriveFromGoogleServices();

const firebaseConfig: FirebaseOptions = {
  apiKey: getEnv('EXPO_PUBLIC_FIREBASE_API_KEY') ?? (derived.apiKey as string | undefined) ?? '',
  authDomain: getEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN') ?? (derived.authDomain as string | undefined) ?? '',
  projectId: getEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID') ?? (derived.projectId as string | undefined) ?? '',
  storageBucket: getEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET') ?? (derived.storageBucket as string | undefined) ?? '',
  messagingSenderId:
    getEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID') ??
    (derived.messagingSenderId as string | undefined) ??
    '',
  appId: getEnv('EXPO_PUBLIC_FIREBASE_APP_ID') ?? (derived.appId as string | undefined) ?? '',
  ...(measurementId ? { measurementId } : {}),
};

const missing: string[] = [];
if (!firebaseConfig.apiKey) missing.push('EXPO_PUBLIC_FIREBASE_API_KEY');
if (!firebaseConfig.authDomain) missing.push('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN');
if (!firebaseConfig.projectId) missing.push('EXPO_PUBLIC_FIREBASE_PROJECT_ID');
if (!firebaseConfig.storageBucket) missing.push('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET');
if (!firebaseConfig.messagingSenderId) missing.push('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID');
if (!firebaseConfig.appId) missing.push('EXPO_PUBLIC_FIREBASE_APP_ID');

if (missing.length) {
  // Don't crash at module-import time — log a warning instead so the app
  // can start and surface errors more gracefully. Missing Firebase config
  // will likely mean auth/firestore features are unavailable.
  console.warn(
    `MovieFlix Firebase config missing: ${missing.join(', ')}. Provide EXPO_PUBLIC_FIREBASE_* env vars (recommended) or ensure google-services.json is present and valid.`,
  );
}

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
  try {
    auth = initializeAuth(app, authOptions as any);
  } catch (e: any) {
    if (e?.code === 'auth/already-initialized') {
      auth = getAuth(app);
    } else {
      // Fall back to getAuth for other errors to prevent app crash on Android
      console.warn('[Firebase] initializeAuth failed, falling back to getAuth:', e?.message || e);
      try {
        auth = getAuth(app);
      } catch (fallbackErr: any) {
        console.error('[Firebase] getAuth fallback also failed:', fallbackErr?.message || fallbackErr);
        // Return a minimal auth that won't crash but may have limited functionality
        return getAuthSyncSilent(app);
      }
    }
  }
  return auth as Auth;
})();

/**
 * Fallback auth getter that returns a minimal auth instance without throwing.
 * Used when normal initialization fails to prevent app crashes on Android.
 */
function getAuthSyncSilent(app_: any): Auth {
  try {
    return getAuth(app_);
  } catch {
    // Final fallback: return a stub that won't crash
    return null as any;
  }
}

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
// NOTE: In some Android networks/proxies, Firestore's default transport can fail TLS handshakes.
// Force long-polling on native to improve reliability.
// Avoid static named imports for submodules which can cause type-resolution
// issues with some firebase package builds. We'll require them dynamically
// where needed to keep Metro bundling and TS happier.
export const firestore = (() => {
  try {
    if (Platform.OS !== 'web') {
      // Use dynamic require so TypeScript won't complain about missing named exports
      // in certain firebase builds.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fbfs: any = require('firebase/firestore');
      if (fbfs && typeof fbfs.initializeFirestore === 'function') {
        const { initializeFirestore, persistentLocalCache } = fbfs;
        return initializeFirestore(app, {
          experimentalForceLongPolling: true,
          useFetchStreams: false,
          localCache: persistentLocalCache(),
        });
      }
    }
  } catch {
    // If Firestore was already initialized (e.g. during HMR) or require failed,
    // we'll try to fall back to the standard getter below.
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fbfs: any = require('firebase/firestore');
    if (fbfs && typeof fbfs.getFirestore === 'function') {
      return fbfs.getFirestore(app);
    }
  } catch {
    // give up — return a placeholder that will error later when used
  }

  return (null as unknown) as any;
})();

// Firestore quota error codes for proper error handling
export const FIRESTORE_QUOTA_ERRORS = new Set([
  'quota-exceeded',
  'resource-exhausted',
  ' firestore/quota-exceeded',
  ' firestore/resource-exhausted',
]);

export const isFirestoreQuotaError = (error: any): boolean => {
  if (!error) return false;
  const code = typeof error === 'string' ? error : error?.code || error?.message || String(error);
  return FIRESTORE_QUOTA_ERRORS.has(code) || code.includes('quota-exceeded') || code.includes('Quota exceeded');
};

export const isFirestoreAvailable = (): boolean => {
  try {
    return !!firestore && typeof firestore === 'object';
  } catch {
    return false;
  }
};

export const storage = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fbstorage: any = require('firebase/storage');
    if (fbstorage && typeof fbstorage.getStorage === 'function') return fbstorage.getStorage(app);
  } catch {
    // ignore
  }
  return (null as unknown) as any;
})();

// Export app as default
export default app;
