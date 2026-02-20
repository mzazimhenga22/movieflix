import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { getStoredActiveProfile, type StoredProfile } from '../lib/profileStorage';

export function useActiveProfile() {
  const [profile, setProfile] = useState<StoredProfile | null>(null);

  const syncProfile = useCallback(async () => {
    try {
      const stored = await getStoredActiveProfile();
      setProfile(stored);
    } catch (err) {
      console.warn('[useActiveProfile] failed to sync active profile', err);
      setProfile(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      (async () => {
        try {
          const stored = await getStoredActiveProfile();
          if (!cancelled) setProfile(stored);
        } catch (err) {
          if (!cancelled) {
            console.warn('[useActiveProfile] focus sync failed', err);
            setProfile(null);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [])
  );

  useEffect(() => {
    void syncProfile();
  }, [syncProfile]);

  return profile;
}
