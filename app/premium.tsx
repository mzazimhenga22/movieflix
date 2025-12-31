import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { authPromise, firestore } from '../constants/firebase';
import { useSubscription } from '../providers/SubscriptionProvider';
import { useAccent } from './components/AccentContext';

type PlanTier = 'free' | 'plus' | 'premium';

const PAYMENT_HIGHLIGHTS = [
  {
    title: 'Pay per plan',
    description: 'Monthly billing for Plus and Premium via your preferred card or wallet.',
  },
  {
    title: 'Upgrade anytime',
    description: 'Swap between plus, premium, or custom bundles in Settings.',
  },
  {
    title: 'Keep it flexible',
    description: 'Quarterly or annual billing offers longer savings with auto-renew.',
  },
];

const OTHER_OFFERS = [
  'Refer friends & unlock a free month',
  'Family & student discounts available',
  'Gift cards land instantly in your inbox',
];

const PLAN_LABELS: Record<PlanTier, string> = {
  free: 'Free',
  plus: 'Plus',
  premium: 'Premium',
};

const PLAN_LIMITS: Record<PlanTier, number> = {
  free: 1,
  plus: 3,
  premium: 5,
};

const PLAN_PRICE_KSH: Record<Exclude<PlanTier, 'free'>, number> = {
  plus: 100,
  premium: 200,
};

const PLAN_DETAILS: Array<{
  tier: PlanTier;
  title: string;
  price: string;
  description: string;
  features: string[];
  highlight?: boolean;
}> = [
  {
    tier: 'free',
    title: 'Starter',
    price: '0 KSH / month',
    description: 'Keep things simple with one household profile.',
    features: [
      '- 1 household profile',
      '- Standard recommendations',
      '- Stories + social feed access',
    ],
  },
  {
    tier: 'plus',
    title: 'Household Plus',
    price: '100 KSH / month',
    description: 'Perfect for small households that need a few extra seats.',
    features: [
      '- Up to 3 household profiles',
      '- Priority recommendations',
      '- Extra kids filters & badges',
    ],
  },
  {
    tier: 'premium',
    title: 'Watch Party Plus',
    price: '200 KSH / month',
    description: 'Maximum profiles, larger watch parties, and early labs access.',
    features: [
      '- Up to 5 household profiles',
      '- Bigger watch party rooms',
      '- Priority stream quality',
      '- Early access to interactive labs',
    ],
    highlight: true,
  },
];

const formatLimit = (tier: PlanTier) => {
  const count = PLAN_LIMITS[tier];
  return `${count} profile${count === 1 ? '' : 's'}`;
};

const formatUpgradeGain = (tier: PlanTier) => {
  const base = PLAN_LIMITS.free;
  const diff = PLAN_LIMITS[tier] - base;
  if (diff <= 0) return 'Includes 1 profile';
  if (diff === 1) return 'Add 1 more profile (2 total)';
  return `Add ${diff} more profiles (${PLAN_LIMITS[tier]} total)`;
};

function classifyStripeReturnUrl(url: string): 'success' | 'cancel' | null {
  const lower = (url || '').toLowerCase();
  const successPrefix = (process.env.EXPO_PUBLIC_STRIPE_SUCCESS_URL_PREFIX ?? '').toLowerCase();
  const cancelPrefix = (process.env.EXPO_PUBLIC_STRIPE_CANCEL_URL_PREFIX ?? '').toLowerCase();

  if (successPrefix && lower.startsWith(successPrefix)) return 'success';
  if (cancelPrefix && lower.startsWith(cancelPrefix)) return 'cancel';

  // Heuristic fallbacks (prefer setting explicit prefixes in env for reliability)
  if (lower.startsWith('movieflix://') || lower.startsWith('exp://')) {
    if (lower.includes('success')) return 'success';
    if (lower.includes('cancel')) return 'cancel';
  }

  // Common patterns for hosted success/cancel pages
  if (/(^|[/?#])success([/?#]|$)/.test(lower) || /[?&](status|result)=success\b/.test(lower)) return 'success';
  if (/(^|[/?#])cancel([/?#]|$)/.test(lower) || /[?&](status|result)=cancel\b/.test(lower)) return 'cancel';
  return null;
}

function appendQueryParams(url: string, params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => typeof v === 'string' && v.length);
  if (!entries.length) return url;

  const [base, hash] = url.split('#');
  const hasQuery = base.includes('?');
  const query = entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
    .join('&');
  const next = `${base}${hasQuery ? '&' : '?'}${query}`;
  return hash ? `${next}#${hash}` : next;
}

const PremiumScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams<{ source?: string; requested?: string }>();
  const source = params.source;
  const requestedFromParams = params.requested as PlanTier | undefined;
  const { accentColor } = useAccent();
  const gradientColors = useMemo(() => [accentColor, '#090814', '#050509'] as const, [accentColor]);
  const badgeGradient = useMemo(() => [accentColor, 'rgba(5,5,15,0.6)'] as const, [accentColor]);
  const isWatchparty = source === 'watchparty';
  const heroBadge = isWatchparty ? 'Watch Party Plus' : 'Profile Plans';
  const heroTitle = isWatchparty ? 'Bigger rooms. More fun.' : 'More profiles, more control.';
  const heroSubtitle = isWatchparty
    ? 'Host watch parties with more friends, priority quality, and upcoming interactive features.'
    : 'Unlock Plus or Premium to add up to 5 household profiles, pay flexibly, and keep everyone in sync.';

  const [selectedPlan, setSelectedPlan] = useState<PlanTier>('free');
  const [statusCopy, setStatusCopy] = useState<string | null>(null);
  const [updatingPlan, setUpdatingPlan] = useState<PlanTier | null>(null);
  const [showPurchaseSheet, setShowPurchaseSheet] = useState(false);
  const [requestedTier, setRequestedTier] = useState<PlanTier | null>(null);
  const sheetTranslateY = React.useRef(new Animated.Value(1)).current;
  const [stripeCheckoutUrl, setStripeCheckoutUrl] = useState<string | null>(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [mpesaBusy, setMpesaBusy] = useState(false);
  const [mpesaCheckoutRequestId, setMpesaCheckoutRequestId] = useState<string | null>(null);
  const [mpesaMerchantRequestId, setMpesaMerchantRequestId] = useState<string | null>(null);
  const [mpesaStatus, setMpesaStatus] = useState<string | null>(null);
  const [paybillReceiptCode, setPaybillReceiptCode] = useState('');
  const [paybillBusy, setPaybillBusy] = useState(false);
  const [paybillStatus, setPaybillStatus] = useState<string | null>(null);
  const didAutoStartMpesaRef = useRef(false);
  const didAutoOpenRequestedTier = React.useRef(false);
  const { refresh, currentPlan } = useSubscription();

  const MPESA_PHONE_CACHE_KEY = 'mpesaPhone';
  const PAYBILL_NUMBER = (process.env.EXPO_PUBLIC_EQUITY_PAYBILL_NUMBER ?? process.env.EXPO_PUBLIC_PAYBILL_NUMBER ?? '247247').trim();
  const PAYBILL_ACCOUNT = (process.env.EXPO_PUBLIC_EQUITY_PAYBILL_ACCOUNT ?? process.env.EXPO_PUBLIC_PAYBILL_ACCOUNT ?? '480755').trim();

  const billingProvider = useMemo(() => {
    const raw = (process.env.EXPO_PUBLIC_BILLING_PROVIDER ?? '').toLowerCase().trim();
    if (raw === 'stripe') return 'stripe';
    if (raw === 'daraja') return 'daraja';
    if (raw === 'paybill' || raw === 'equity') return 'paybill';

    const anyStripeUrl =
      process.env.EXPO_PUBLIC_STRIPE_CHECKOUT_URL ||
      process.env.EXPO_PUBLIC_STRIPE_CHECKOUT_URL_PLUS ||
      process.env.EXPO_PUBLIC_STRIPE_CHECKOUT_URL_PREMIUM;
    if (Platform.OS === 'android' && anyStripeUrl) return 'stripe';
    return 'paybill';
  }, []);

  const closePurchaseSheet = useCallback(() => {
    Animated.timing(sheetTranslateY, { toValue: 1, duration: 180, useNativeDriver: true } as any).start(() => {
      setShowPurchaseSheet(false);
      setRequestedTier(null);
      setStripeCheckoutUrl(null);
      setStripeLoading(false);
      setMpesaBusy(false);
      setMpesaCheckoutRequestId(null);
      setMpesaMerchantRequestId(null);
      setMpesaStatus(null);
      setPaybillReceiptCode('');
      setPaybillBusy(false);
      setPaybillStatus(null);
      didAutoStartMpesaRef.current = false;
    });
  }, [sheetTranslateY]);

  useEffect(() => {
    if (!showPurchaseSheet) return;
    if (billingProvider !== 'daraja') return;
    if (mpesaPhone.trim()) return;

    let mounted = true;
    void AsyncStorage.getItem(MPESA_PHONE_CACHE_KEY)
      .then((stored) => {
        if (!mounted) return;
        if (stored && stored.trim()) setMpesaPhone(stored.trim());
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [MPESA_PHONE_CACHE_KEY, billingProvider, mpesaPhone, showPurchaseSheet]);

  const isLikelyKenyaPhone = useCallback((raw: string) => {
    const cleaned = raw.trim().replace(/^[+]/, '').replace(/[\s-]/g, '');
    if (!cleaned) return false;
    if (!/^\d+$/.test(cleaned)) return false;
    return cleaned.startsWith('0') || cleaned.startsWith('254') || cleaned.startsWith('7') || cleaned.startsWith('1');
  }, []);

  const submitPaybillReceipt = useCallback(async () => {
    if (!requestedTier || requestedTier === 'free') return;
    const base = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
    if (!base) {
      Alert.alert('Supabase not configured', 'Set EXPO_PUBLIC_SUPABASE_URL to use Paybill verification.');
      return;
    }

    const code = paybillReceiptCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(code)) {
      Alert.alert('Invalid receipt', 'Paste the M-Pesa receipt code (10 chars), e.g. QRTSITS25S.');
      return;
    }

    try {
      setPaybillBusy(true);
      setPaybillStatus(null);

      const auth = await authPromise;
      const user = auth.currentUser;
      if (!user) {
        Alert.alert('Sign in required', 'Please sign in to continue.');
        return;
      }

      const idToken = await user.getIdToken();
      const res = await fetch(`${base}/functions/v1/paybill`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: 'plan_submit_receipt',
          tier: requestedTier,
          receiptCode: code,
        }),
      });

      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(data?.error || 'Failed to submit receipt');

      setPaybillStatus('Receipt submitted. Your plan will update after confirmation.');
      try {
        await refresh();
      } catch {
        // ignore
      }
    } catch (err: any) {
      console.warn('[premium] paybill submit failed', err);
      Alert.alert('Submit failed', err?.message || 'Unable to submit receipt right now.');
    } finally {
      setPaybillBusy(false);
    }
  }, [paybillReceiptCode, refresh, requestedTier]);

  const startMpesaPayment = useCallback(async () => {
    if (!requestedTier || requestedTier === 'free') return;
    const base = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
    if (!base) {
      Alert.alert('Supabase not configured', 'Set EXPO_PUBLIC_SUPABASE_URL to use Daraja payments.');
      return;
    }

    if (!mpesaPhone.trim() || !isLikelyKenyaPhone(mpesaPhone)) {
      Alert.alert('Invalid phone', 'Enter a Kenya phone number (e.g. 07XXXXXXXX or 2547XXXXXXXX).');
      return;
    }

    try {
      setMpesaBusy(true);
      setMpesaStatus(null);
      setMpesaCheckoutRequestId(null);
      setMpesaMerchantRequestId(null);

      try {
        await AsyncStorage.setItem(MPESA_PHONE_CACHE_KEY, mpesaPhone.trim());
      } catch {
        // ignore
      }

      const auth = await authPromise;
      const user = auth.currentUser;
      if (!user) {
        Alert.alert('Sign in required', 'Please sign in to continue.');
        return;
      }
      const idToken = await user.getIdToken();

      const res = await fetch(`${base}/functions/v1/daraja`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: 'stkpush',
          tier: requestedTier,
          phone: mpesaPhone,
          accountReference: `movieflix-${requestedTier}`,
          transactionDesc: `MovieFlix ${requestedTier} plan`,
          firebaseUid: user.uid,
        }),
      });

      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to start payment');
      }

      setMpesaCheckoutRequestId(data?.checkoutRequestId ?? null);
      setMpesaMerchantRequestId(data?.merchantRequestId ?? null);
      setMpesaStatus(data?.customerMessage ?? 'STK Push sent. Complete payment on your phone.');
    } catch (err: any) {
      console.warn('[premium] mpesa stkpush failed', err);
      Alert.alert('Payment failed', err?.message || 'Unable to start M-Pesa payment.');
    } finally {
      setMpesaBusy(false);
    }
  }, [MPESA_PHONE_CACHE_KEY, isLikelyKenyaPhone, mpesaPhone, requestedTier]);

  useEffect(() => {
    if (!showPurchaseSheet) return;
    if (billingProvider !== 'daraja') return;
    if (!requestedTier || requestedTier === 'free') return;
    if (mpesaBusy) return;
    if (mpesaCheckoutRequestId) return;
    if (didAutoStartMpesaRef.current) return;
    if (!mpesaPhone.trim() || !isLikelyKenyaPhone(mpesaPhone)) return;

    didAutoStartMpesaRef.current = true;
    // auto-trigger STK push so user gets the M-Pesa PIN prompt right after plan selection
    void startMpesaPayment();
  }, [billingProvider, isLikelyKenyaPhone, mpesaBusy, mpesaCheckoutRequestId, mpesaPhone, requestedTier, showPurchaseSheet, startMpesaPayment]);

  const checkMpesaStatus = useCallback(async () => {
    if (!requestedTier || requestedTier === 'free') return;
    const base = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
    if (!base) {
      Alert.alert('Supabase not configured', 'Set EXPO_PUBLIC_SUPABASE_URL to use Daraja payments.');
      return;
    }
    if (!mpesaCheckoutRequestId) {
      Alert.alert('Missing request', 'Start the payment first.');
      return;
    }

    try {
      setMpesaBusy(true);

      const auth = await authPromise;
      const user = auth.currentUser;
      if (!user) {
        Alert.alert('Sign in required', 'Please sign in to continue.');
        return;
      }
      const idToken = await user.getIdToken();

      const res = await fetch(`${base}/functions/v1/daraja`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: 'query',
          checkoutRequestId: mpesaCheckoutRequestId,
          tier: requestedTier,
          merchantRequestId: mpesaMerchantRequestId,
        }),
      });

      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to query payment');
      }

      const resultCode = String(data?.resultCode ?? '').trim();
      const resultDesc = String(data?.resultDesc ?? '').trim();

      if (resultCode === '0') {
        await refresh().catch(() => {});
        setSelectedPlan(requestedTier);
        Alert.alert('Payment confirmed', `You're now on ${PLAN_LABELS[requestedTier]}.`);
        closePurchaseSheet();
        return;
      }

      const message = resultDesc || 'Payment not completed yet.';
      setMpesaStatus(message);
      Alert.alert('Not completed', message);
    } catch (err: any) {
      console.warn('[premium] mpesa query failed', err);
      Alert.alert('Check failed', err?.message || 'Unable to check payment status.');
    } finally {
      setMpesaBusy(false);
    }
  }, [closePurchaseSheet, mpesaCheckoutRequestId, mpesaMerchantRequestId, refresh, requestedTier]);

  const buildStripeCheckoutUrl = useCallback(async (tier: PlanTier) => {
    const direct =
      (tier === 'plus' ? process.env.EXPO_PUBLIC_STRIPE_CHECKOUT_URL_PLUS : undefined) ||
      (tier === 'premium' ? process.env.EXPO_PUBLIC_STRIPE_CHECKOUT_URL_PREMIUM : undefined) ||
      process.env.EXPO_PUBLIC_STRIPE_CHECKOUT_URL;

    if (!direct) return null;

    let uid = '';
    try {
      const auth = await authPromise;
      uid = auth.currentUser?.uid || '';
    } catch {
      // ignore
    }

    const returnScheme = Linking.createURL('');
    return appendQueryParams(direct, {
      tier,
      app_user_id: uid || undefined,
      return_url: returnScheme || undefined,
    });
  }, []);

  const handleStripeResult = useCallback(
    async (result: 'success' | 'cancel') => {
      const tier = requestedTier;
      if (!tier) {
        closePurchaseSheet();
        return;
      }

      if (result === 'cancel') {
        Alert.alert('Payment cancelled', 'You can try again anytime.');
        closePurchaseSheet();
        return;
      }

      try {
        setStripeLoading(true);
        await refresh().catch(() => {});

        try {
          const auth = await authPromise;
          const user = auth.currentUser;
          if (user) {
            await updateDoc(doc(firestore, 'users', user.uid), {
              planTier: tier,
              subscription: {
                tier,
                updatedAt: serverTimestamp(),
                source: 'stripe',
              },
            });
          }
        } catch (err) {
          console.warn('[premium] failed to persist Stripe purchase to Firestore', err);
        }

        Alert.alert('Payment complete', 'Your subscription will activate shortly.');
        setSelectedPlan(tier);
      } finally {
        setStripeLoading(false);
        closePurchaseSheet();
      }
    },
    [closePurchaseSheet, refresh, requestedTier]
  );

  useEffect(() => {
    const __DEV__FLAG = typeof __DEV__ !== 'undefined' && __DEV__;
    const loadPlan = async () => {
      if (__DEV__FLAG) {
        try {
          const stored = await AsyncStorage.getItem('planTierOverride');
          const normalized: PlanTier =
            stored === 'premium' || stored === 'plus' || stored === 'free' ? stored : currentPlan;
          setSelectedPlan(normalized);
          setStatusCopy(`Currently on ${PLAN_LABELS[normalized]} (${formatUpgradeGain(normalized)}).`);
          return;
        } catch {
          // ignore
        }
      }

      setSelectedPlan(currentPlan);
      setStatusCopy(`Currently on ${PLAN_LABELS[currentPlan]} (${formatUpgradeGain(currentPlan)}).`);
    };

    void loadPlan();
  }, [currentPlan]);

  const openPurchaseFor = useCallback((tier: PlanTier) => {
    setRequestedTier(tier);
    setShowPurchaseSheet(true);
    setStripeCheckoutUrl(null);
    setStripeLoading(false);
    Animated.timing(sheetTranslateY, {
      toValue: 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    } as any).start();
  }, [sheetTranslateY]);

  useEffect(() => {
    if (!requestedFromParams) return;
    if (requestedFromParams !== 'plus' && requestedFromParams !== 'premium') return;

    // Auto-open purchase sheet once when navigated here with a requested plan
    if (didAutoOpenRequestedTier.current) return;
    didAutoOpenRequestedTier.current = true;
    openPurchaseFor(requestedFromParams);
  }, [openPurchaseFor, requestedFromParams]);

  const handleApplyPlan = useCallback(
    async (tier: PlanTier) => {
      if (tier === selectedPlan) return;
      setUpdatingPlan(tier);
      try {
        if (tier === 'free') {
          // Save free override and instruct user to cancel in-store if they had an active purchase
          try {
            const auth = await authPromise;
            const user = auth.currentUser;
            if (user) {
              await updateDoc(doc(firestore, 'users', user.uid), {
                planTier: 'free',
                subscription: { canceledByUser: true, updatedAt: serverTimestamp(), source: 'premium-screen' },
              });
            }
          } catch (err) {
            console.warn('[premium] failed to persist cancel to Firestore', err);
          }
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            await AsyncStorage.removeItem('planTierOverride');
          }
          await refresh().catch(() => {});
          Alert.alert(
            'Updated',
            'Your account is set to Free in the app.',
          );
        } else {
          // Open purchase sheet to complete payment
          openPurchaseFor(tier);
          return;
        }

        setSelectedPlan('free');
        setStatusCopy(`Switched to Free.`);
      } catch (err) {
        console.error('[premium] failed to update plan override', err);
        Alert.alert('Plan update failed', 'Unable to save your plan. Please try again.');
      } finally {
        setUpdatingPlan(null);
      }
    },
    [openPurchaseFor, refresh, selectedPlan]
  );

  const handleBack = useCallback(() => {
    if (source === 'profiles') {
      router.replace('/select-profile');
      return;
    }
    if (source === 'watchparty') {
      router.replace('/watchparty');
      return;
    }
    router.replace('/movies');
  }, [router, source]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Go Premium</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <LinearGradient
            colors={badgeGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroBadge}
          >
            <Text style={styles.heroBadgeText}>{heroBadge}</Text>
          </LinearGradient>
          <Text style={styles.heroTitle}>{heroTitle}</Text>
          <Text style={styles.heroSubtitle}>{heroSubtitle}</Text>
        </View>

        <View style={styles.currentPlanBanner}>
          <Text style={styles.currentPlanTitle}>
            Current plan: {PLAN_LABELS[selectedPlan]}
          </Text>
          <Text style={styles.currentPlanSubtitle}>{formatUpgradeGain(selectedPlan)}</Text>
        </View>
        {statusCopy && <Text style={styles.statusText}>{statusCopy}</Text>}

        {!isWatchparty && (
          <>
            <Text style={styles.sectionHeading}>{`How you'll pay`}</Text>
            <View style={styles.paymentGrid}>
              {PAYMENT_HIGHLIGHTS.map((highlight) => (
                <View key={highlight.title} style={styles.paymentCard}>
                  <Text style={styles.paymentTitle}>{highlight.title}</Text>
                  <Text style={styles.paymentBody}>{highlight.description}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.sectionHeading}>Other offers</Text>
            <View style={styles.offerGrid}>
              {OTHER_OFFERS.map((offer) => (
                <View key={offer} style={styles.offerCard}>
                  <Ionicons name="pricetag-outline" size={18} color="rgba(255,255,255,0.8)" />
                  <Text style={styles.offerText}>{offer}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {PLAN_DETAILS.map((plan) => {
          const isActive = selectedPlan === plan.tier;
          const isBusy = updatingPlan === plan.tier;
          const buttonLabel = isActive
            ? 'Current plan'
            : plan.tier === 'free'
            ? 'Switch to Free'
            : `Choose ${plan.title}`;
          return (
            <View
              key={plan.tier}
              style={[
                styles.card,
                plan.highlight && styles.cardHighlight,
                isActive && { borderColor: accentColor },
              ]}
            >
              <View style={styles.planHeader}>
                <Text style={styles.planLabel}>{PLAN_LABELS[plan.tier]}</Text>
                <Text style={styles.planTitle}>{plan.title}</Text>
                <Text style={styles.planPrice}>{plan.price}</Text>
                <Text style={styles.planDescription}>{plan.description}</Text>
                <Text style={styles.planMeta}>
                  {plan.tier === 'free' ? 'Includes 1 profile' : formatUpgradeGain(plan.tier)}
                </Text>
              </View>
              {plan.features.map((feature) => (
                <View key={`${plan.tier}-${feature}`} style={styles.bulletRow}>
                  <Text style={styles.bullet}>{feature}</Text>
                </View>
              ))}
              <TouchableOpacity
                style={[
                  styles.planButton,
                  { backgroundColor: accentColor },
                  (isActive || isBusy) && styles.planButtonDisabled,
                ]}
                disabled={isActive || isBusy}
                onPress={() => handleApplyPlan(plan.tier)}
              >
                <Text style={styles.planButtonText}>{isBusy ? 'Updating...' : buttonLabel}</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        <Text style={styles.disclaimer}>
          {billingProvider === 'daraja'
            ? 'Upgrading uses M-Pesa (Daraja STK Push). Your plan updates after payment is confirmed.'
            : billingProvider === 'stripe'
            ? 'Upgrading uses a secure Stripe card checkout. Your plan updates after payment is confirmed.'
            : billingProvider === 'paybill'
            ? 'Upgrading uses M-Pesa Paybill (Equity). Your plan updates after payment is confirmed.'
            : 'Upgrading is not configured on this device.'}
        </Text>

        {/* Purchase bottom sheet */}
        {showPurchaseSheet && requestedTier && (
          <>
            <TouchableOpacity
              style={styles.sheetBackdrop}
              activeOpacity={1}
              onPress={closePurchaseSheet}
            />

            <Animated.View
              style={{
                ...styles.sheet,
                transform: [
                  { translateY: sheetTranslateY.interpolate({ inputRange: [0, 1], outputRange: [0, 500] }) },
                ],
              }}
            >
              <View style={styles.sheetHandle} />

              {/* Paywall header */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{PLAN_LABELS[requestedTier as PlanTier]}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.8)', marginTop: 6 }}>{PLAN_DETAILS.find((p) => p.tier === requestedTier)?.description}</Text>
              </View>

              {/* Features */}
              <View style={{ marginBottom: 12 }}>
                {(PLAN_DETAILS.find((p) => p.tier === requestedTier)?.features ?? []).map((f) => (
                  <View key={f} style={{ marginBottom: 6 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.9)' }}>{f.replace(/^-/,'').trim()}</Text>
                  </View>
                ))}
              </View>

              {/* Offerings / packages */}
              <View style={{ marginTop: 6 }}>
                {billingProvider === 'daraja' ? (
                  <View>
                    <Text style={{ color: 'rgba(255,255,255,0.85)', marginBottom: 10 }}>
                      Enter your M-Pesa number to receive an STK Push (you&apos;ll be prompted for your M-Pesa PIN).
                    </Text>

                    <TextInput
                      value={mpesaPhone}
                      onChangeText={(t) => setMpesaPhone(t)}
                      placeholder="07XXXXXXXX"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                      keyboardType="phone-pad"
                      style={{
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.12)',
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        color: '#fff',
                        backgroundColor: 'rgba(255,255,255,0.03)',
                      }}
                    />

                    <Text style={{ color: 'rgba(255,255,255,0.7)', marginTop: 10 }}>
                      Amount: {requestedTier === 'plus' ? '100' : '200'} KSH
                    </Text>

                    {mpesaCheckoutRequestId ? (
                      <Text style={{ color: 'rgba(255,255,255,0.6)', marginTop: 8, fontSize: 12 }}>
                        CheckoutRequestID: {mpesaCheckoutRequestId}
                      </Text>
                    ) : null}

                    {mpesaStatus ? (
                      <Text style={{ color: 'rgba(255,255,255,0.8)', marginTop: 8 }}>
                        {mpesaStatus}
                      </Text>
                    ) : null}

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
                      <TouchableOpacity
                        style={[styles.cancelButton, { marginLeft: 0, flex: 1, marginRight: 8 }]}
                        disabled={mpesaBusy}
                        onPress={checkMpesaStatus}
                      >
                        <Text style={styles.cancelText}>{mpesaBusy ? 'Checking…' : 'Check status'}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.saveButton, { backgroundColor: accentColor, flex: 1 }]}
                        disabled={mpesaBusy}
                        onPress={startMpesaPayment}
                      >
                        <Text style={styles.saveText}>{mpesaBusy ? 'Sending…' : 'Pay with M-Pesa'}</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
                      <TouchableOpacity style={[styles.saveButton, { backgroundColor: 'rgba(255,255,255,0.08)' }]} onPress={closePurchaseSheet}>
                        <Text style={styles.saveText}>Close</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : billingProvider === 'paybill' ? (
                  <View>
                    <Text style={{ color: 'rgba(255,255,255,0.85)', marginBottom: 10 }}>
                      Pay via M-Pesa Paybill, then paste your M-Pesa receipt code.
                    </Text>

                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.12)',
                        borderRadius: 12,
                        padding: 12,
                        backgroundColor: 'rgba(255,255,255,0.03)',
                      }}
                    >
                      <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '700' }}>Paybill: {PAYBILL_NUMBER}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.85)', marginTop: 6, fontWeight: '700' }}>
                        Account/Business No: {PAYBILL_ACCOUNT}
                      </Text>
                      <Text style={{ color: 'rgba(255,255,255,0.7)', marginTop: 10 }}>
                        Amount: {requestedTier === 'plus' ? '100' : '200'} KSH
                      </Text>
                    </View>

                    <Text style={{ color: 'rgba(255,255,255,0.75)', marginTop: 12, marginBottom: 8 }}>
                      M-Pesa receipt code
                    </Text>
                    <TextInput
                      value={paybillReceiptCode}
                      onChangeText={(t) => setPaybillReceiptCode(t.replace(/[^0-9a-zA-Z]/g, '').toUpperCase())}
                      placeholder="QRTSITS25S"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                      autoCapitalize="characters"
                      style={{
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.12)',
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        color: '#fff',
                        backgroundColor: 'rgba(255,255,255,0.03)',
                      }}
                      editable={!paybillBusy}
                    />

                    {paybillStatus ? (
                      <Text style={{ color: 'rgba(255,255,255,0.8)', marginTop: 8 }}>{paybillStatus}</Text>
                    ) : null}

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
                      <TouchableOpacity
                        style={[styles.cancelButton, { marginLeft: 0, flex: 1, marginRight: 8 }]}
                        disabled={paybillBusy}
                        onPress={async () => {
                          try {
                            setPaybillBusy(true);
                            await refresh();
                            Alert.alert('Updated', 'Refreshed your subscription status.');
                          } catch {
                            Alert.alert('Refresh failed', 'Please try again.');
                          } finally {
                            setPaybillBusy(false);
                          }
                        }}
                      >
                        <Text style={styles.cancelText}>{paybillBusy ? 'Refreshing…' : 'Refresh status'}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.saveButton, { backgroundColor: accentColor, flex: 1 }]}
                        disabled={paybillBusy}
                        onPress={submitPaybillReceipt}
                      >
                        <Text style={styles.saveText}>{paybillBusy ? 'Submitting…' : 'Submit receipt'}</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
                      <TouchableOpacity style={[styles.saveButton, { backgroundColor: 'rgba(255,255,255,0.08)' }]} onPress={closePurchaseSheet}>
                        <Text style={styles.saveText}>Close</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : billingProvider === 'stripe' ? (
                  <View>
                    {!stripeCheckoutUrl ? (
                      <TouchableOpacity
                        style={[styles.planButton, { backgroundColor: accentColor }]}
                        disabled={stripeLoading}
                        onPress={async () => {
                          try {
                            setStripeLoading(true);
                            const url = await buildStripeCheckoutUrl(requestedTier);
                            if (!url) {
                              Alert.alert(
                                'Stripe checkout not configured',
                                'Set EXPO_PUBLIC_STRIPE_CHECKOUT_URL (and optionally *_PLUS / *_PREMIUM).'
                              );
                              return;
                            }
                            setStripeCheckoutUrl(url);
                          } finally {
                            setStripeLoading(false);
                          }
                        }}
                      >
                        <Text style={styles.planButtonText}>{stripeLoading ? 'Loading…' : 'Continue to payment'}</Text>
                      </TouchableOpacity>
                    ) : (
                      <View
                        style={{
                          height: 420,
                          borderRadius: 14,
                          overflow: 'hidden',
                          borderWidth: 1,
                          borderColor: 'rgba(255,255,255,0.08)',
                          backgroundColor: 'rgba(255,255,255,0.02)',
                        }}
                      >
                        <WebView
                          source={{ uri: stripeCheckoutUrl }}
                          startInLoadingState
                          renderLoading={() => (
                            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                              <ActivityIndicator color={accentColor} />
                            </View>
                          )}
                          onShouldStartLoadWithRequest={(req) => {
                            const hit = classifyStripeReturnUrl(req.url);
                            if (hit) {
                              void handleStripeResult(hit);
                              return false;
                            }
                            return true;
                          }}
                        />
                      </View>
                    )}

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                      <TouchableOpacity
                        style={styles.cancelButton}
                        onPress={async () => {
                          try {
                            setStripeLoading(true);
                            await refresh();
                            Alert.alert('Updated', 'Refreshed your subscription status.');
                          } catch {
                            Alert.alert('Refresh failed', 'Please try again.');
                          } finally {
                            setStripeLoading(false);
                          }
                        }}
                      >
                        <Text style={styles.cancelText}>{stripeLoading ? 'Refreshing…' : 'Refresh status'}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={[styles.saveButton, { backgroundColor: accentColor }]} onPress={closePurchaseSheet}>
                        <Text style={styles.saveText}>Close</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View>
                    <Text style={{ color: 'rgba(255,255,255,0.8)', marginBottom: 12 }}>
                      Billing provider is not configured for purchases on this device.
                    </Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                      <TouchableOpacity
                        style={[styles.saveButton, { backgroundColor: accentColor }]}
                        onPress={closePurchaseSheet}
                      >
                        <Text style={styles.saveText}>Close</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            </Animated.View>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050509',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 12,
  },
  backButton: {
    padding: 6,
    marginRight: 8,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  hero: {
    marginBottom: 20,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 8,
  },
  heroBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  heroSubtitle: {
    color: '#C4C4C4',
    fontSize: 13,
  },
  currentPlanBanner: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginBottom: 12,
  },
  currentPlanTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  currentPlanSubtitle: {
    color: 'rgba(255,255,255,0.75)',
    marginTop: 4,
    fontSize: 13,
  },
  statusText: {
    color: '#7dd8ff',
    fontSize: 12,
    marginBottom: 10,
  },
  sectionHeading: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  paymentGrid: {
    marginBottom: 16,
  },
  paymentCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  paymentTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  paymentBody: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  offerGrid: {
    marginBottom: 20,
  },
  offerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 10,
  },
  offerText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    flex: 1,
    marginLeft: 6,
  },
  card: {
    backgroundColor: 'rgba(10,10,18,0.65)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  cardHighlight: {
    borderColor: 'rgba(229,9,20,0.3)',
  },
  planHeader: {
    marginBottom: 12,
  },
  planLabel: {
    color: '#AAAAAA',
    fontSize: 12,
    marginBottom: 2,
  },
  planTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 2,
  },
  planPrice: {
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 6,
  },
  planDescription: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 13,
    marginBottom: 4,
  },
  planMeta: {
    color: '#7dd8ff',
    fontSize: 12,
    fontWeight: '600',
  },
  bulletRow: {
    marginBottom: 4,
  },
  bullet: {
    color: '#DDDDDD',
    fontSize: 13,
  },
  planButton: {
    marginTop: 12,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
  },
  planButtonDisabled: {
    opacity: 0.5,
  },
  planButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  disclaimer: {
    color: '#777777',
    fontSize: 11,
    marginTop: 4,
  },
  sheetBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)'
  },
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 24,
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(6,6,10,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    elevation: 20,
  },
  sheetHandle: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  subscriptionTitle: { color: '#fff', fontWeight: '700', marginBottom: 8 },
  purchaseRow: { backgroundColor: 'rgba(255,255,255,0.02)' },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginLeft: 8,
  },
  cancelText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  saveButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default PremiumScreen;
