// shims-firebase.d.ts
declare module 'firebase/auth/react-native' {
  import { Persistence } from 'firebase/auth';

  // a minimal declaration so TS can compile. It matches the runtime function you use:
  export function getReactNativePersistence(storage: any): Persistence;
}

declare module 'firebase/firestore' {
  const firestore: any;
  export = firestore;
}