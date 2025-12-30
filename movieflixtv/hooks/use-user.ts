import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { authPromise } from '../constants/firebase';

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let unsub: (() => void) | undefined;

    authPromise
      .then((auth) => {
        unsub = onAuthStateChanged(auth, (currentUser) => {
          if (!isMounted) return;
          setUser(currentUser);
          setError(null);
        });
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('[useUser] Auth init failed:', err);
        setError('Unable to initialize authentication');
      });

    return () => {
      isMounted = false;
      if (typeof unsub === 'function') {
        try {
          unsub();
        } catch (e) {
          // ignore
        }
      }
    };
  }, []);

  return { user, error };
}
