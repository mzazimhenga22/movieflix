import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { authPromise, firestore } from '../constants/firebase';

const __DEV__FLAG = typeof __DEV__ !== 'undefined' && __DEV__;
const ALLOW_PLAN_OVERRIDE =
  __DEV__FLAG &&
  String((typeof process !== 'undefined' && (process.env as any)?.EXPO_PUBLIC_ALLOW_PLAN_OVERRIDE) ?? '').trim() ===
  '1';


type PlanTier = 'free' | 'plus' | 'premium';

type SubscriptionContextType = {
  isSubscribed: boolean;
  currentPlan: PlanTier;
  refresh: () => Promise<void>;
  loading: boolean;
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
  const [loading, setLoading] = useState(true);

  const normalizePlanTier = useCallback((raw: unknown): PlanTier => {
    const v = String(raw ?? '')
      .toLowerCase()
      .trim();
    return v === 'premium' || v === 'plus' || v === 'free' ? (v as PlanTier) : 'free';
  }, []);

  const getCacheKey = (uid: string) => `planCache:${uid}`;

  const refresh = useCallback(async () => {
    try {
      const auth = await authPromise;
      const user = auth.currentUser;
      if (!user) {
        setCurrentPlan('free');
        setIsSubscribed(false);
        setLoading(false);
        return;
      }

      // Try cache first
      const cached = await AsyncStorage.getItem(getCacheKey(user.uid));
      if (cached) {
        const tier = normalizePlanTier(cached);
        setCurrentPlan(tier);
        setIsSubscribed(tier !== 'free');
      }

      const snap = await getDoc(doc(firestore, 'users', user.uid));
      const data = (snap.data() as any) ?? {};
      const tier = normalizePlanTier(data?.planTier ?? data?.subscription?.tier);

      if (ALLOW_PLAN_OVERRIDE) {
        const override = String((typeof process !== 'undefined' && (process.env as any)?.EXPO_PUBLIC_PLAN_TIER_OVERRIDE) ?? '')
          .toLowerCase()
          .trim();
        if (override === 'premium' || override === 'plus' || override === 'free') {
          setCurrentPlan(override as PlanTier);
          setIsSubscribed(override !== 'free');
          setLoading(false);
          return;
        }
      }

      setCurrentPlan(tier);
      setIsSubscribed(tier !== 'free');
      await AsyncStorage.setItem(getCacheKey(user.uid), tier);
    } catch (err) {
      console.warn('[SubscriptionProvider] failed to refresh plan', err);
      // Don't override with 'free' if we might be offline; just keep what we have
    } finally {
      setLoading(false);
    }
  }, [normalizePlanTier]);

  useEffect(() => {
    let unsubAuth: (() => void) | null = null;
    let unsubUser: (() => void) | null = null;

    void authPromise
      .then((auth) => {
        unsubAuth = onAuthStateChanged(auth, async (user) => {
          if (unsubUser) {
            unsubUser();
            unsubUser = null;
          }

          if (!user) {
            setCurrentPlan('free');
            setIsSubscribed(false);
            setLoading(false);
            return;
          }

          // Hydrate from cache immediately
          try {
            const cached = await AsyncStorage.getItem(getCacheKey(user.uid));
            console.log('[SubscriptionProvider] Cached plan:', cached);
            if (cached) {
              const tier = normalizePlanTier(cached);
              setCurrentPlan(tier);
              setIsSubscribed(tier !== 'free');
            }
          } catch (e) {
            console.warn('[SubscriptionProvider] Cache read error', e);
          }
          setLoading(false);

          const userRef = doc(firestore, 'users', user.uid);
          unsubUser = onSnapshot(
            userRef,
            async (snap) => {
              console.log('[SubscriptionProvider] Snapshot received. Metadata:', snap.metadata);
              const data = (snap.data() as any) ?? {};
              const nextTier = normalizePlanTier(data?.planTier ?? data?.subscription?.tier);
              console.log('[SubscriptionProvider] Plan from Firestore:', nextTier);

              if (ALLOW_PLAN_OVERRIDE) {
                const override = String((typeof process !== 'undefined' && (process.env as any)?.EXPO_PUBLIC_PLAN_TIER_OVERRIDE) ?? '')
                  .toLowerCase()
                  .trim();
                if (override === 'premium' || override === 'plus' || override === 'free') {
                  setCurrentPlan(override as PlanTier);
                  setIsSubscribed(override !== 'free');
                  return;
                }
              }

              setCurrentPlan(nextTier);
              setIsSubscribed(nextTier !== 'free');
              await AsyncStorage.setItem(getCacheKey(user.uid), nextTier);
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
        loading,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};
