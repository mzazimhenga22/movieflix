import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import React from 'react';

export function useActiveProfilePhoto() {
  const [activeProfilePhoto, setActiveProfilePhoto] = useState<string | null>(null);

  const syncActiveProfile = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('activeProfile');

      if (stored) {
        const parsed = JSON.parse(stored);
        const photo =
          typeof parsed?.photoURL === 'string' && parsed.photoURL.trim().length > 0
            ? parsed.photoURL
            : null;

        setActiveProfilePhoto(photo);
      } else {
        setActiveProfilePhoto(null);
      }
    } catch (err) {
      console.error('[useActiveProfilePhoto] failed to load active profile avatar', err);
      setActiveProfilePhoto(null);
    }
  }, []);

  // ✅ Correct: useFocusEffect callback must NOT be async
  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;

      (async () => {
        try {
          await syncActiveProfile();
        } catch (e) {
          console.error('[useActiveProfilePhoto] focus sync error', e);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [syncActiveProfile])
  );

  // ✅ Also sync on initial mount
  useEffect(() => {
    syncActiveProfile();
  }, [syncActiveProfile]);

  return activeProfilePhoto;
}
