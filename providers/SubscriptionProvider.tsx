import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

import { authPromise, firestore } from '../constants/firebase';

const __DEV__FLAG = typeof __DEV__ !== 'undefined' && __DEV__;


type PlanTier = 'free' | 'plus' | 'premium';

type SubscriptionContextType = {
  isSubscribed: boolean;
  currentPlan: PlanTier;
  refresh: () => Promise<void>;
};


const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);


export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};


type Props = {
  children: React.ReactNode;
};

export const SubscriptionProvider: React.FC<Props> = ({ children }) => {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<PlanTier>('free');

  const normalizePlanTier = useCallback((raw: unknown): PlanTier => {
    const v = String(raw ?? '')
      .toLowerCase()
      .trim();
    return v === 'premium' || v === 'plus' || v === 'free' ? (v as PlanTier) : 'free';
  }, []);

  const refresh = useCallback(async () => {
    try {
      const auth = await authPromise;
      const user = auth.currentUser;
      if (!user) {
        setCurrentPlan('free');
        setIsSubscribed(false);
        return;
      }

      const snap = await getDoc(doc(firestore, 'users', user.uid));
      const tier = normalizePlanTier((snap.data() as any)?.planTier);

      if (__DEV__FLAG) {
        try {
          const stored = await AsyncStorage.getItem('planTierOverride');
          if (stored === 'premium' || stored === 'plus' || stored === 'free') {
            setCurrentPlan(stored);
            setIsSubscribed(stored !== 'free');
            return;
          }
        } catch {
          // ignore
        }
      }

      setCurrentPlan(tier);
      setIsSubscribed(tier !== 'free');
    } catch (err) {
      console.warn('[SubscriptionProvider] failed to refresh plan', err);
      setCurrentPlan('free');
      setIsSubscribed(false);
    }
  }, [normalizePlanTier]);

  useEffect(() => {
    let unsubAuth: (() => void) | null = null;
    let unsubUser: (() => void) | null = null;

    void authPromise
      .then((auth) => {
        unsubAuth = auth.onAuthStateChanged((user) => {
          if (unsubUser) {
            unsubUser();
            unsubUser = null;
          }

          if (!user) {
            setCurrentPlan('free');
            setIsSubscribed(false);
            return;
          }

          const userRef = doc(firestore, 'users', user.uid);
          unsubUser = onSnapshot(
            userRef,
            async (snap) => {
              const nextTier = normalizePlanTier((snap.data() as any)?.planTier);

              if (__DEV__FLAG) {
                try {
                  const stored = await AsyncStorage.getItem('planTierOverride');
                  if (stored === 'premium' || stored === 'plus' || stored === 'free') {
                    setCurrentPlan(stored);
                    setIsSubscribed(stored !== 'free');
                    return;
                  }
                } catch {
                  // ignore
                }
              }

              setCurrentPlan(nextTier);
              setIsSubscribed(nextTier !== 'free');
            },
            (err) => {
              console.warn('[SubscriptionProvider] plan snapshot error', err);
            },
          );
        });
      })
      .catch((err) => console.warn('[SubscriptionProvider] auth init failed', err));

    return () => {
      if (unsubUser) unsubUser();
      if (unsubAuth) unsubAuth();
    };
  }, [normalizePlanTier]);

  return (
    <SubscriptionContext.Provider
      value={{
        isSubscribed,
        currentPlan,
        refresh,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};
