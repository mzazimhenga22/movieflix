import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import { addDoc, collection, doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';

import ScreenWrapper from '../../components/ScreenWrapper';
import { useAccent } from '../components/AccentContext';
import { useUser } from '../../hooks/use-user';
import {
  getProductsBySellerId,
  db,
  getPromoCreditsAccount,
  isProductPromoted,
  darajaStkQuery,
  mpesaMarketplaceStkPush,
  type Product,
} from './api';
import { formatKsh } from '../../lib/money';

export default function PromoteScreen() {
  const router = useRouter();
  const { setAccentColor } = useAccent();
  const { user } = useUser();

  const MPESA_PHONE_CACHE_KEY = 'promoCreditsMpesaPhone';
  const PROMO_CREDITS_TOPUPS_COLLECTION = 'promo_credits_topups';
  const PROMO_CREDITS_ACCOUNTS_COLLECTION = 'promo_credits_accounts';
  const PROMO_CREDITS_TRANSACTIONS_COLLECTION = 'promo_credits_transactions';
  const PROMO_CREDITS_KES_PER_CREDIT = 10;
  const PROMO_CREDITS_MIN_TOPUP_KSH = 50;
  const PROMO_CREDITS_MAX_TOPUP_KSH = 50_000;

  const formatCredits = useCallback((value: number) => {
    const v = Math.max(0, Math.round(Number(value) || 0));
    return `${v} credit${v === 1 ? '' : 's'}`;
  }, []);

  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [placement, setPlacement] = useState<'search' | 'story' | 'feed'>('feed');
  const [durationUnit, setDurationUnit] = useState<'hours' | 'days'>('days');
  const [durationValue, setDurationValue] = useState(7);
  const [products, setProducts] = useState<(Product & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [campaignBusyId, setCampaignBusyId] = useState<string | null>(null);

  const [creditsBalance, setCreditsBalance] = useState(0);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [topupAmountKsh, setTopupAmountKsh] = useState('500');
  const [topupSubmitting, setTopupSubmitting] = useState(false);
  const [topupPhone, setTopupPhone] = useState('');
  const [topupDocId, setTopupDocId] = useState<string | null>(null);
  const [topupCheckoutRequestId, setTopupCheckoutRequestId] = useState<string | null>(null);
  const [topupStatus, setTopupStatus] = useState<string | null>(null);
  const [topupChecking, setTopupChecking] = useState(false);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const reloadCredits = useCallback(async () => {
    if (!user?.uid) {
      setCreditsBalance(0);
      return;
    }
    setCreditsLoading(true);
    try {
      const account = await getPromoCreditsAccount(user.uid);
      setCreditsBalance(Math.max(0, Math.round(Number((account as any)?.availableCredits ?? 0))));
    } catch (err) {
      console.warn('[marketplace] credits load failed', err);
      setCreditsBalance(0);
    } finally {
      setCreditsLoading(false);
    }
  }, [user?.uid]);

  const toMillis = useCallback((value: any): number | null => {
    if (!value) return null;
    if (value instanceof Date) return value.getTime();
    if (typeof value?.toMillis === 'function') {
      try {
        return value.toMillis();
      } catch {
        return null;
      }
    }
    if (typeof value?.toDate === 'function') {
      try {
        const d = value.toDate();
        return d instanceof Date ? d.getTime() : null;
      } catch {
        return null;
      }
    }
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const ms = Date.parse(value);
      return Number.isFinite(ms) ? ms : null;
    }
    return null;
  }, []);

  const formatEndsIn = useCallback((endsAtMs: number | null) => {
    if (!endsAtMs) return '—';
    const diff = endsAtMs - Date.now();
    if (diff <= 0) return 'ended';
    const mins = Math.floor(diff / (60 * 1000));
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 48) return `in ${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `in ${days}d`;
  }, []);

  useEffect(() => {
    setAccentColor('#e50914');
  }, [setAccentColor]);

  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(MPESA_PHONE_CACHE_KEY)
      .then((stored) => {
        if (!mounted) return;
        if (stored && stored.trim()) setTopupPhone(stored.trim());
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [MPESA_PHONE_CACHE_KEY]);

  const isLikelyKenyaPhone = useCallback((raw: string) => {
    const cleaned = raw.trim().replace(/^[+]/, '').replace(/[\s-]/g, '');
    if (!cleaned) return false;
    if (!/^\d+$/.test(cleaned)) return false;
    return cleaned.startsWith('0') || cleaned.startsWith('254') || cleaned.startsWith('7') || cleaned.startsWith('1');
  }, []);

  useEffect(() => {
    void reloadCredits();
  }, [reloadCredits, user?.uid, reloadKey]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        if (!user?.uid) {
          if (!cancelled) {
            setProducts([]);
            setSelectedProducts([]);
          }
          return;
        }

        const mine = (await getProductsBySellerId(user.uid)).filter((p): p is Product & { id: string } => !!p.id);
        if (!cancelled) {
          setProducts(mine);
          setSelectedProducts((prev) => prev.filter((id) => mine.some((p) => p.id === id)));
        }
      } catch (err) {
        console.error('[marketplace] failed to load products for promotion', err);
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.uid, reloadKey]);

  const toggleProductSelection = (productId: string) => {
    setSelectedProducts(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const rates = useMemo(
    () => ({
      hours: { search: 3, story: 6, feed: 8 },
      days: { search: 50, story: 90, feed: 120 },
    }),
    []
  );

  const promoteWithCreditsLocal = useCallback(
    async (args: {
      productIds: string[];
      placement: 'search' | 'story' | 'feed';
      durationUnit: 'hours' | 'days';
      durationValue: number;
      mode: 'purchase' | 'extend';
    }) => {
      if (!user?.uid) throw new Error('Sign in required');

      const productIds = (args.productIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean);
      if (productIds.length === 0) throw new Error('Select at least one product');
      if (productIds.length > 10) throw new Error('Select up to 10 products at a time');

      const placement = args.placement;
      const unit = args.durationUnit;
      const value = Math.max(1, Math.round(Number(args.durationValue) || 1));

      const perUnit = (rates as any)?.[unit]?.[placement] ?? 0;
      const totalCredits = Math.max(0, Math.round(Number(perUnit) * value * productIds.length));
      if (totalCredits <= 0) throw new Error('Promotion cost must be greater than zero');

      const now = Date.now();
      const msPerUnit = unit === 'hours' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
      const addMs = value * msPerUnit;

      return await runTransaction(db, async (tx) => {
        const productsCollection = 'marketplace_products';
        const promoAccountsCollection = 'promo_credits_accounts';
        const promoTxCollection = 'promo_credits_transactions';

        const productRefs = productIds.map((id) => doc(db, productsCollection, id));
        const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));

        let baseEndsAtMs = now;
        for (const snap of productSnaps) {
          if (!snap.exists()) throw new Error('One or more products not found');
          const data = snap.data() as any;
          const sellerId = String(data?.sellerId ?? '').trim();
          if (!sellerId || sellerId !== user.uid) throw new Error('You can only promote your own products');

          if (args.mode === 'extend') {
            const rawEnds = data?.promotionEndsAt ?? null;
            const endsMs =
              rawEnds && typeof rawEnds?.toMillis === 'function'
                ? rawEnds.toMillis()
                : rawEnds && typeof rawEnds?.toDate === 'function'
                  ? rawEnds.toDate().getTime()
                  : rawEnds instanceof Date
                    ? rawEnds.getTime()
                    : typeof rawEnds === 'number'
                      ? rawEnds
                      : typeof rawEnds === 'string'
                        ? Date.parse(rawEnds)
                        : null;
            if (typeof endsMs === 'number' && Number.isFinite(endsMs)) {
              baseEndsAtMs = Math.max(baseEndsAtMs, endsMs);
            }
          }
        }

        const accountRef = doc(db, promoAccountsCollection, user.uid);
        const accountSnap = await tx.get(accountRef);
        const account = (accountSnap.exists() ? accountSnap.data() : {}) as any;
        const available = Math.max(0, Math.round(Number(account?.availableCredits ?? 0)));
        if (available < totalCredits) throw new Error('Insufficient promo credits. Please top up to continue.');

        const after = available - totalCredits;
        const endsAt = new Date(baseEndsAtMs + addMs);
        const perProductCredits = Math.round(totalCredits / productIds.length);

        const promoTxRef = doc(collection(db, promoTxCollection));
        tx.set(promoTxRef, {
          userId: user.uid,
          type: args.mode === 'extend' ? 'promotion_extend' : 'promotion_purchase',
          direction: 'debit',
          credits: totalCredits,
          balanceAfter: after,
          reference: {
            productIds,
            placement,
            durationUnit: unit,
            durationValue: value,
          },
          createdAt: serverTimestamp(),
        });

        tx.set(
          accountRef,
          {
            userId: user.uid,
            availableCredits: after,
            lifetimeIn: Number(account?.lifetimeIn ?? 0),
            lifetimeOut: Number(account?.lifetimeOut ?? 0) + totalCredits,
            updatedAt: serverTimestamp(),
            ...(accountSnap.exists() ? {} : { createdAt: serverTimestamp() }),
          },
          { merge: true }
        );

        for (const ref of productRefs) {
          tx.set(
            ref,
            {
              promoted: true,
              promotionPlacement: placement,
              promotionDurationUnit: unit,
              promotionDurationValue: value,
              promotionEndsAt: endsAt,
              promotionBid: perProductCredits,
              promotionCost: perProductCredits,
              promotionCurrency: 'credits',
              promotionCostCredits: perProductCredits,
              promotionLastPurchaseTxId: promoTxRef.id,
              promotionUpdatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }

        return {
          availableCredits: after,
          totalCredits,
          endsAt: endsAt.toISOString(),
          transactionId: promoTxRef.id,
        };
      });
    },
    [rates, user?.uid]
  );

  const activeCampaigns = useMemo(() => {
    const mine = products || [];
    const active = mine.filter((p) => isProductPromoted(p));
    return active.sort((a, b) => {
      const aEnd = toMillis((a as any).promotionEndsAt) ?? 0;
      const bEnd = toMillis((b as any).promotionEndsAt) ?? 0;
      return bEnd - aEnd;
    });
  }, [products, toMillis]);

  const cancelCampaign = useCallback(
    (product: Product & { id: string }) => {
      if (!product?.id) return;
      Alert.alert('Cancel promotion?', `This will stop boosting "${product.name}" immediately.`, [
        { text: 'Keep running', style: 'cancel' },
        {
          text: 'Cancel promotion',
          style: 'destructive',
          onPress: () => {
            if (campaignBusyId || submitting) return;
            setCampaignBusyId(product.id);
            void (async () => {
              if (!user?.uid) throw new Error('Sign in required');
              if (String(product.sellerId ?? '').trim() !== user.uid) throw new Error('Not allowed');
              await updateDoc(doc(db, 'marketplace_products', product.id), {
                promoted: false,
                promotionEndsAt: new Date(),
                promotionUpdatedAt: serverTimestamp(),
              } as any);
            })()
              .then(async () => {
                await reloadCredits();
                reload();
              })
              .catch((err) => {
                console.error('[marketplace] cancel promotion failed', err);
                Alert.alert('Failed', 'Unable to cancel promotion right now.');
              })
              .finally(() => setCampaignBusyId(null));
          },
        },
      ]);
    },
    [campaignBusyId, reload, reloadCredits, submitting, user?.uid],
  );

  const extendCampaign = useCallback(
    (product: Product & { id: string }) => {
      if (!product?.id) return;

      const unit = (product.promotionDurationUnit === 'hours' || product.promotionDurationUnit === 'days')
        ? product.promotionDurationUnit
        : 'days';
      const placementKey =
        product.promotionPlacement === 'search' || product.promotionPlacement === 'story' || product.promotionPlacement === 'feed'
          ? product.promotionPlacement
          : 'feed';

      const applyExtend = (addUnits: number) => {
        if (campaignBusyId || submitting) return;
        setCampaignBusyId(product.id);
        void (async () => {
          await promoteWithCreditsLocal({
            productIds: [product.id],
            placement: placementKey,
            durationUnit: unit,
            durationValue: addUnits,
            mode: 'extend',
          });
        })()
          .then(async () => {
            await reloadCredits();
            reload();
          })
          .catch((err) => {
            console.error('[marketplace] extend promotion failed', err);
            Alert.alert('Failed', 'Unable to extend promotion right now.');
          })
          .finally(() => setCampaignBusyId(null));
      };

      const options =
        unit === 'hours'
          ? [
              { label: '+6 hours', add: 6 },
              { label: '+12 hours', add: 12 },
              { label: '+24 hours', add: 24 },
            ]
          : [
              { label: '+1 day', add: 1 },
              { label: '+3 days', add: 3 },
              { label: '+7 days', add: 7 },
            ];

      Alert.alert('Extend promotion', `Add more time to "${product.name}".`, [
        ...options.map((o) => ({ text: o.label, onPress: () => applyExtend(o.add) })),
        { text: 'Not now', style: 'cancel' },
      ]);
    },
    [campaignBusyId, promoteWithCreditsLocal, reload, reloadCredits, submitting],
  );

  const durationMax = durationUnit === 'hours' ? 72 : 30;
  const durationMin = 1;

  useEffect(() => {
    setDurationValue((v) => {
      const next = Math.max(durationMin, Math.min(durationMax, Math.round(v)));
      return next;
    });
  }, [durationMax, durationMin]);

  const estimatedCreditsPerProduct = useMemo(() => {
    const perUnit = rates[durationUnit][placement];
    return Math.max(0, Math.round(perUnit * durationValue));
  }, [durationUnit, durationValue, placement, rates]);

  const estimatedCreditsTotal = useMemo(() => {
    const count = selectedProducts.length;
    return count > 0 ? estimatedCreditsPerProduct * count : 0;
  }, [estimatedCreditsPerProduct, selectedProducts.length]);

  const canAfford = useMemo(() => {
    if (!user?.uid) return true;
    if (selectedProducts.length === 0) return true;
    return creditsBalance >= estimatedCreditsTotal;
  }, [creditsBalance, estimatedCreditsTotal, selectedProducts.length, user?.uid]);

  const startTopup = useCallback(async () => {
    if (topupSubmitting) return;
    if (!user?.uid) {
      Alert.alert('Sign in required', 'Please sign in to top up promo credits.');
      router.push('/profile');
      return;
    }

    const amount = Math.round(Number(topupAmountKsh));

    if (amount < PROMO_CREDITS_MIN_TOPUP_KSH) {
      Alert.alert('Amount too low', `Minimum top up is ${formatKsh(PROMO_CREDITS_MIN_TOPUP_KSH)}.`);
      return;
    }
    if (amount > PROMO_CREDITS_MAX_TOPUP_KSH) {
      Alert.alert('Amount too high', `Maximum top up is ${formatKsh(PROMO_CREDITS_MAX_TOPUP_KSH)}.`);
      return;
    }
    if (amount % PROMO_CREDITS_KES_PER_CREDIT !== 0) {
      Alert.alert('Invalid amount', `Top up amount must be a multiple of KSh ${PROMO_CREDITS_KES_PER_CREDIT}.`);
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Amount required', 'Enter a valid top up amount.');
      return;
    }

    if (!topupPhone.trim() || !isLikelyKenyaPhone(topupPhone)) {
      Alert.alert('Invalid phone', 'Enter a Kenya phone number (e.g. 07XXXXXXXX or 2547XXXXXXXX).');
      return;
    }

    setTopupSubmitting(true);
    try {
      const firebaseToken = await user.getIdToken(true);

      const credits = Math.round(amount / PROMO_CREDITS_KES_PER_CREDIT);
      if (!Number.isFinite(credits) || credits <= 0) throw new Error('Top up amount is too low');

      setTopupStatus(null);
      setTopupDocId(null);
      setTopupCheckoutRequestId(null);

      try {
        await AsyncStorage.setItem(MPESA_PHONE_CACHE_KEY, topupPhone.trim());
      } catch {
        // ignore
      }

      const topupRef = await addDoc(collection(db, PROMO_CREDITS_TOPUPS_COLLECTION), {
        userId: user.uid,
        phone: topupPhone.trim(),
        amountKsh: amount,
        credits,
        status: 'initiated',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as any);

      setTopupDocId(topupRef.id);

      const stk = await mpesaMarketplaceStkPush({
        firebaseToken,
        phone: topupPhone.trim(),
        amount,
        accountReference: `promo-${topupRef.id}`,
        transactionDesc: 'Promo credits top up',
      });

      setTopupCheckoutRequestId(stk.checkoutRequestId ?? null);
      setTopupStatus(stk.customerMessage ?? 'STK push sent. Enter your M-Pesa PIN then tap “Check status”.');

      await updateDoc(topupRef, {
        merchantRequestId: stk.merchantRequestId ?? null,
        checkoutRequestId: stk.checkoutRequestId ?? null,
        customerMessage: stk.customerMessage ?? null,
        status: 'stk_sent',
        updatedAt: serverTimestamp(),
      } as any);

      Alert.alert('Check your phone', stk.customerMessage ?? 'Enter your M-Pesa PIN prompt then tap “Check status”.');
    } catch (err: any) {
      console.error('[marketplace] credits topup start failed', err);
      Alert.alert('Top up failed', err?.message || 'Unable to start top up right now.');
    } finally {
      setTopupSubmitting(false);
    }
  }, [MPESA_PHONE_CACHE_KEY, PROMO_CREDITS_KES_PER_CREDIT, PROMO_CREDITS_MAX_TOPUP_KSH, PROMO_CREDITS_MIN_TOPUP_KSH, PROMO_CREDITS_TOPUPS_COLLECTION, isLikelyKenyaPhone, router, topupAmountKsh, topupPhone, topupSubmitting, user]);

  const checkTopupStatus = useCallback(async (opts?: { silent?: boolean }) => {
    if (topupChecking || topupSubmitting) return;
    if (!user?.uid) {
      Alert.alert('Sign in required', 'Please sign in to check your top up.');
      return;
    }
    if (!topupDocId) {
      Alert.alert('Missing request', 'Start top up first to get an STK prompt.');
      return;
    }
    if (!topupCheckoutRequestId) {
      Alert.alert('Missing request', 'Waiting for CheckoutRequestID. Start the top up again.');
      return;
    }

    setTopupChecking(true);
    try {
      const firebaseToken = await user.getIdToken(true);

      const res = await darajaStkQuery({ firebaseToken, checkoutRequestId: topupCheckoutRequestId });
      const resultCode = String(res?.resultCode ?? '').trim();
      const desc = res?.resultDesc || (resultCode ? `Result code: ${resultCode}` : 'Status unavailable');
      setTopupStatus(desc);

      if (resultCode !== '0') {
        await updateDoc(doc(db, PROMO_CREDITS_TOPUPS_COLLECTION, topupDocId), {
          status: 'failed',
          resultCode: resultCode || null,
          resultDesc: desc ? String(desc) : null,
          raw: res?.raw ?? null,
          updatedAt: serverTimestamp(),
        } as any).catch(() => {});

        if (!opts?.silent) Alert.alert('Not confirmed yet', desc);
        return;
      }

      const confirmResult = await runTransaction(db, async (tx) => {
        const topupRef = doc(db, PROMO_CREDITS_TOPUPS_COLLECTION, topupDocId);
        const topupSnap = await tx.get(topupRef);
        if (!topupSnap.exists()) throw new Error('Top up not found');

        const topup = topupSnap.data() as any;
        if (String(topup?.userId ?? '').trim() !== user.uid) throw new Error('Not allowed');

        const status = String(topup?.status ?? '').toLowerCase();
        const creditsToCredit = Math.max(0, Math.round(Number(topup?.credits ?? 0)));
        const amountKsh = Math.max(0, Math.round(Number(topup?.amountKsh ?? 0)));

        const accountRef = doc(db, PROMO_CREDITS_ACCOUNTS_COLLECTION, user.uid);
        const accountSnap = await tx.get(accountRef);
        const account = (accountSnap.exists() ? accountSnap.data() : {}) as any;
        const before = Math.max(0, Math.round(Number(account?.availableCredits ?? 0)));

        if (status === 'confirmed') {
          return { alreadyProcessed: true, availableCredits: before };
        }
        if (creditsToCredit <= 0 || amountKsh <= 0) throw new Error('Invalid top up record');

        const after = before + creditsToCredit;

        const promoTxRef = doc(collection(db, PROMO_CREDITS_TRANSACTIONS_COLLECTION));
        tx.set(promoTxRef, {
          userId: user.uid,
          type: 'topup',
          direction: 'credit',
          credits: creditsToCredit,
          balanceAfter: after,
          amountKsh,
          reference: {
            topupDocId,
            checkoutRequestId: topupCheckoutRequestId,
          },
          createdAt: serverTimestamp(),
        } as any);

        tx.set(
          accountRef,
          {
            userId: user.uid,
            availableCredits: after,
            lifetimeIn: Number(account?.lifetimeIn ?? 0) + creditsToCredit,
            lifetimeOut: Number(account?.lifetimeOut ?? 0),
            updatedAt: serverTimestamp(),
            ...(accountSnap.exists() ? {} : { createdAt: serverTimestamp() }),
          },
          { merge: true }
        );

        tx.set(
          topupRef,
          {
            status: 'confirmed',
            confirmedAt: serverTimestamp(),
            resultCode: resultCode || null,
            resultDesc: desc ? String(desc) : null,
            raw: res?.raw ?? null,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        return { alreadyProcessed: false, availableCredits: after };
      });

      await reloadCredits();
      Alert.alert(
        'Top up confirmed',
        `Credits updated. New balance: ${formatCredits(Number((confirmResult as any)?.availableCredits ?? creditsBalance))}.`
      );
    } catch (err: any) {
      console.error('[marketplace] credits topup check failed', err);
      if (!opts?.silent) Alert.alert('Check failed', err?.message || 'Unable to check top up status right now.');
    } finally {
      setTopupChecking(false);
    }
  }, [PROMO_CREDITS_ACCOUNTS_COLLECTION, PROMO_CREDITS_TOPUPS_COLLECTION, PROMO_CREDITS_TRANSACTIONS_COLLECTION, creditsBalance, darajaStkQuery, formatCredits, reloadCredits, topupChecking, topupCheckoutRequestId, topupDocId, topupSubmitting, user]);

  const handlePromote = async () => {
    if (!user?.uid) {
      Alert.alert('Sign in required', 'Please sign in to promote your products.');
      router.push('/profile');
      return;
    }

    if (selectedProducts.length === 0) {
      Alert.alert('Error', 'Please select at least one product to promote');
      return;
    }

    if (submitting) return;

    setSubmitting(true);
    try {
      const res = await promoteWithCreditsLocal({
        productIds: selectedProducts,
        placement,
        durationUnit,
        durationValue,
        mode: 'purchase',
      });

      await reloadCredits();
      reload();

      Alert.alert(
        'Promotion activated',
        `Charged ${formatCredits(res.totalCredits)}. Remaining: ${formatCredits(res.availableCredits)}.`
      );
      router.push('/marketplace');
    } catch (err: any) {
      console.error('[marketplace] promotion update failed', err);
      Alert.alert('Promotion failed', err?.message || 'Unable to start promotion right now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenWrapper>
      <StatusBar barStyle="light-content" backgroundColor="#0E0E0E" />
      <LinearGradient
        colors={['#e50914', '#150a13', '#05060f'] as const}
        start={[0, 0]}
        end={[1, 1]}
        style={styles.gradient}
      >
        <LinearGradient
          colors={['rgba(125,216,255,0.18)', 'rgba(255,255,255,0)'] as const}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.bgOrbPrimary}
        />
        <LinearGradient
          colors={['rgba(95,132,255,0.14)', 'rgba(255,255,255,0)'] as const}
          start={{ x: 0.8, y: 0 }}
          end={{ x: 0.2, y: 1 }}
          style={styles.bgOrbSecondary}
        />
        <View style={styles.container}>
          <View style={styles.headerWrap}>
            <LinearGradient
              colors={['rgba(229,9,20,0.22)', 'rgba(10,12,24,0.4)'] as const}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerGlow}
            />
            <View style={styles.headerBar}>
              <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={22} color="#fff" />
              </TouchableOpacity>
              <View style={styles.headerCopy}>
                <View style={styles.titleRow}>
                  <View style={styles.accentDot} />
                  <Text style={styles.headerEyebrow}>Campaign Studio</Text>
                </View>
                <Text style={styles.headerTitle}>Promote Products</Text>
                <Text style={styles.headerSubtitle}>Boost your listings across MovieFlix</Text>
              </View>
              <TouchableOpacity
                style={styles.headerIconBtn}
                onPress={() => router.push('/marketplace')}
              >
                <Ionicons name="storefront-outline" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.scrollViewContent}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Promo credits</Text>
              <Text style={styles.sectionSub}>Top up when you want, then boost your listings on-demand.</Text>

              {!user?.uid ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="wallet-outline" size={22} color="rgba(255,255,255,0.75)" />
                  <Text style={styles.emptyTitle}>Sign in to use credits</Text>
                  <Text style={styles.emptySub}>Promo credits are stored in Firestore and topped up via M-Pesa.</Text>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/profile')}>
                    <Text style={styles.secondaryBtnText}>Go to profile</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.walletCard}>
                  <View style={styles.walletTopRow}>
                    <View>
                      <Text style={styles.walletLabel}>Balance</Text>
                      {creditsLoading ? (
                        <View style={styles.walletLoadingRow}>
                          <ActivityIndicator color="#fff" />
                          <Text style={styles.walletLoadingText}>Loading…</Text>
                        </View>
                      ) : (
                        <Text style={styles.walletValue}>{formatCredits(creditsBalance)}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={reloadCredits}
                      disabled={creditsLoading || topupSubmitting}
                      style={[styles.refreshIconBtn, (creditsLoading || topupSubmitting) && { opacity: 0.6 }]}
                    >
                      <Ionicons name="refresh" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.walletHint}>
                    Enter your phone number to receive an STK prompt.
                    {'\n'}Tip: Top up amounts must be a multiple of KSh 10.
                  </Text>

                  <Text style={styles.inputLabel}>Top up amount (KSh)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="500"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    keyboardType="number-pad"
                    value={topupAmountKsh}
                    onChangeText={(t) => setTopupAmountKsh(t.replace(/[^0-9]/g, ''))}
                    editable={!topupSubmitting && !topupChecking}
                  />

                  <Text style={styles.inputLabel}>Phone number</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="07XXXXXXXX"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    keyboardType="phone-pad"
                    value={topupPhone}
                    onChangeText={(t) => setTopupPhone(t)}
                    editable={!topupSubmitting && !topupChecking}
                  />

                  {!!topupCheckoutRequestId && <Text style={styles.mutedNote}>CheckoutRequestID: {topupCheckoutRequestId}</Text>}
                  {!!topupStatus && <Text style={styles.mutedNote}>{topupStatus}</Text>}

                  <View style={styles.quickAmountsRow}>
                    {[200, 500, 1000, 2000].map((amt) => (
                      <TouchableOpacity
                        key={amt}
                        style={styles.quickAmountPill}
                        onPress={() => setTopupAmountKsh(String(amt))}
                        disabled={topupSubmitting}
                      >
                        <Text style={styles.quickAmountText}>{formatKsh(amt)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryWalletBtn, topupSubmitting && { opacity: 0.7 }]}
                    onPress={startTopup}
                    disabled={topupSubmitting || topupChecking}
                  >
                    {topupSubmitting ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryWalletBtnText}>Top up via M-Pesa</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.secondaryBtn, (topupChecking || !topupDocId || !topupCheckoutRequestId) && { opacity: 0.7 }]}
                    onPress={() => void checkTopupStatus()}
                    disabled={topupChecking || !topupDocId || !topupCheckoutRequestId}
                  >
                    {topupChecking ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.secondaryBtnText}>Check status</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {user?.uid ? (
              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Active campaigns</Text>
                  <TouchableOpacity
                    onPress={reload}
                    disabled={loading || submitting}
                    style={[styles.refreshIconBtn, (loading || submitting) && { opacity: 0.6 }]}
                  >
                    <Ionicons name="refresh" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.sectionSub}>Views and engagements update as your ads run.</Text>

                {loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color="#fff" />
                    <Text style={styles.loadingText}>Loading campaigns…</Text>
                  </View>
                ) : activeCampaigns.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Ionicons name="sparkles-outline" size={22} color="rgba(255,255,255,0.75)" />
                    <Text style={styles.emptyTitle}>No active campaigns</Text>
                    <Text style={styles.emptySub}>Select products below to start boosting.</Text>
                  </View>
                ) : (
                  activeCampaigns.map((p) => {
                    const views = Number((p as any)?.promotionMetrics?.totalImpressions ?? 0);
                    const clicks = Number((p as any)?.promotionMetrics?.totalClicks ?? 0);
                    const endsAtMs = toMillis((p as any)?.promotionEndsAt);
                    const ctr = views > 0 ? (clicks / views) * 100 : 0;
                    const busy = campaignBusyId === p.id;

                    return (
                      <View key={p.id} style={styles.campaignCard}>
                        <View style={styles.campaignTopRow}>
                          <Text style={styles.campaignName} numberOfLines={1}>
                            {p.name}
                          </Text>
                          <View style={styles.campaignPill}>
                            <Text style={styles.campaignPillText}>
                              {(String((p as any)?.promotionPlacement || 'feed') as any).toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.campaignMeta}>Ends {formatEndsIn(endsAtMs)}</Text>

                        <View style={styles.campaignMetricsRow}>
                          <View style={styles.metricPill}>
                            <Text style={styles.metricLabel}>Views</Text>
                            <Text style={styles.metricValue}>{views}</Text>
                          </View>
                          <View style={styles.metricPill}>
                            <Text style={styles.metricLabel}>Engagements</Text>
                            <Text style={styles.metricValue}>{clicks}</Text>
                          </View>
                          <View style={styles.metricPill}>
                            <Text style={styles.metricLabel}>CTR</Text>
                            <Text style={styles.metricValue}>{`${ctr.toFixed(1)}%`}</Text>
                          </View>
                        </View>

                        <View style={styles.campaignActionsRow}>
                          <TouchableOpacity
                            style={[styles.campaignActionBtn, styles.campaignCancelBtn, busy && { opacity: 0.6 }]}
                            onPress={() => cancelCampaign(p)}
                            disabled={busy || submitting}
                            activeOpacity={0.85}
                          >
                            <Text style={styles.campaignActionText}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.campaignActionBtn, busy && { opacity: 0.6 }]}
                            onPress={() => extendCampaign(p)}
                            disabled={busy || submitting}
                            activeOpacity={0.85}
                          >
                            <Text style={styles.campaignActionText}>Extend</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Select Products to Promote</Text>
              <View style={styles.productsList}>
                {!user?.uid ? (
                  <View style={styles.emptyCard}>
                    <Ionicons name="log-in-outline" size={22} color="rgba(255,255,255,0.75)" />
                    <Text style={styles.emptyTitle}>Sign in to promote</Text>
                    <Text style={styles.emptySub}>You need an account to promote your listings.</Text>
                    <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/profile')}>
                      <Text style={styles.secondaryBtnText}>Go to profile</Text>
                    </TouchableOpacity>
                  </View>
                ) : loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color="#fff" />
                    <Text style={styles.loadingText}>Loading your products…</Text>
                  </View>
                ) : products.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Ionicons name="pricetag-outline" size={22} color="rgba(255,255,255,0.75)" />
                    <Text style={styles.emptyTitle}>No listings yet</Text>
                    <Text style={styles.emptySub}>Create a product first, then come back to promote it.</Text>
                    <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/marketplace/sell')}>
                      <Text style={styles.secondaryBtnText}>Create listing</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  products.map((product) => (
                    <TouchableOpacity
                      key={product.id}
                      style={[
                        styles.productItem,
                        selectedProducts.includes(product.id) && styles.productItemSelected,
                      ]}
                      onPress={() => toggleProductSelection(product.id)}
                    >
                      <View style={styles.productInfo}>
                        <Text style={styles.productTitle} numberOfLines={1}>
                          {product.name}
                        </Text>
                        <Text style={styles.productPrice}>{formatKsh(Number(product.price))}</Text>
                      </View>
                      <View style={[styles.checkbox, selectedProducts.includes(product.id) && styles.checkboxSelected]}>
                        {selectedProducts.includes(product.id) && (
                          <Ionicons name="checkmark" size={16} color="#fff" />
                        )}
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Ad placement</Text>
              <Text style={styles.sectionSub}>Choose where your ad shows up.</Text>
              <View style={styles.promotionOptions}>
                {([
                  {
                    key: 'feed' as const,
                    title: 'Feed Ad',
                    description: 'Boost visibility in marketplace browsing.',
                    icon: 'newspaper',
                  },
                  {
                    key: 'search' as const,
                    title: 'Search Ad',
                    description: 'Higher placement when users search.',
                    icon: 'search',
                  },
                  {
                    key: 'story' as const,
                    title: 'Story Ad',
                    description: 'Show as a sponsored card in stories.',
                    icon: 'albums',
                  },
                ]).map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.promotionCard, placement === opt.key && styles.promotionCardActive]}
                    onPress={() => setPlacement(opt.key)}
                    disabled={submitting}
                  >
                    <View style={styles.promotionHeader}>
                      <Ionicons name={opt.icon as any} size={24} color={placement === opt.key ? '#fff' : '#e50914'} />
                      <Text style={[styles.promotionPrice, placement === opt.key && styles.promotionPriceActive]}>
                        {formatCredits(rates[durationUnit][opt.key])}/{durationUnit === 'hours' ? 'hr' : 'day'}
                      </Text>
                    </View>
                    <Text style={[styles.promotionTitle, placement === opt.key && styles.promotionTitleActive]}>
                      {opt.title}
                    </Text>
                    <Text style={[styles.promotionDescription, placement === opt.key && styles.promotionDescriptionActive]}>
                      {opt.description}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Duration & budget</Text>
              <View style={styles.unitRow}>
                <TouchableOpacity
                  style={[styles.unitPill, durationUnit === 'hours' && styles.unitPillActive]}
                  onPress={() => setDurationUnit('hours')}
                  disabled={submitting}
                >
                  <Text style={styles.unitPillText}>Hours</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.unitPill, durationUnit === 'days' && styles.unitPillActive]}
                  onPress={() => setDurationUnit('days')}
                  disabled={submitting}
                >
                  <Text style={styles.unitPillText}>Days</Text>
                </TouchableOpacity>
                <View style={styles.pricePill}>
                  <Text style={styles.pricePillText}>Total: {formatCredits(estimatedCreditsTotal)}</Text>
                </View>
              </View>

              <View style={styles.sliderCard}>
                <View style={styles.sliderHeader}>
                  <Text style={styles.sliderLabel}>Duration</Text>
                  <Text style={styles.sliderValue}>
                    {durationValue} {durationUnit === 'hours' ? 'hour' : 'day'}{durationValue === 1 ? '' : 's'}
                  </Text>
                </View>
                <Slider
                  minimumValue={durationMin}
                  maximumValue={durationMax}
                  step={1}
                  value={durationValue}
                  onValueChange={(v) => setDurationValue(Math.round(v))}
                  minimumTrackTintColor="#e50914"
                  maximumTrackTintColor="rgba(255,255,255,0.18)"
                  thumbTintColor="#ff8a00"
                  disabled={submitting}
                />
                <View style={styles.sliderFooter}>
                  <Text style={styles.sliderHint}>{durationMin}</Text>
                  <Text style={styles.sliderHint}>{durationMax}</Text>
                </View>
                <Text style={styles.budgetHint}>
                  Rate: {formatCredits(rates[durationUnit][placement])}/{durationUnit === 'hours' ? 'hr' : 'day'} · Placement: {placement}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.promoteButton, (submitting || loading || !canAfford) && { opacity: 0.7 }]}
              onPress={handlePromote}
              disabled={submitting || loading || !canAfford}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
              <Text style={styles.promoteButtonText}>
                Promote {selectedProducts.length} Product{selectedProducts.length !== 1 ? 's' : ''} · {formatCredits(estimatedCreditsTotal)}
              </Text>
              )}
            </TouchableOpacity>

            {user?.uid && selectedProducts.length > 0 && !canAfford ? (
              <Text style={styles.insufficientText}>
                Not enough credits. You need {formatCredits(estimatedCreditsTotal)} but have {formatCredits(creditsBalance)}.
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </LinearGradient>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  bgOrbPrimary: {
    position: 'absolute',
    width: 380,
    height: 380,
    borderRadius: 190,
    top: -40,
    left: -60,
    opacity: 0.6,
  },
  bgOrbSecondary: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    bottom: -80,
    right: -40,
    opacity: 0.55,
  },
  container: {
    flex: 1,
    paddingBottom: 0,
  },
  headerWrap: {
    marginHorizontal: 16,
    marginTop: 48,
    marginBottom: 16,
    borderRadius: 22,
    overflow: 'hidden',
  },
  headerGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.7,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(8,10,20,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  headerIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  headerCopy: {
    flex: 1,
    marginHorizontal: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ff8a00',
    shadowColor: '#ff8a00',
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 6,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.78)',
    marginTop: 4,
    fontSize: 13,
  },
  scrollViewContent: {
    paddingBottom: 180,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  sectionSub: {
    color: 'rgba(255,255,255,0.7)',
    marginTop: -10,
    marginBottom: 16,
  },
  walletCard: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  walletTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  walletLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  walletValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 6,
  },
  walletHint: {
    color: 'rgba(255,255,255,0.65)',
    marginTop: 10,
    fontWeight: '700',
  },
  mutedNote: {
    color: 'rgba(255,255,255,0.72)',
    marginTop: 10,
    fontWeight: '700',
  },
  walletLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  walletLoadingText: {
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '700',
  },
  inputLabel: {
    color: 'rgba(255,255,255,0.82)',
    fontWeight: '800',
    marginTop: 12,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    fontWeight: '700',
  },
  quickAmountsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  quickAmountPill: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  quickAmountText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 12,
  },
  primaryWalletBtn: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#e50914',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryWalletBtnText: {
    color: '#fff',
    fontWeight: '900',
  },
  secondaryWalletBtn: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryWalletBtnText: {
    color: '#fff',
    fontWeight: '900',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  refreshIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  campaignCard: {
    borderRadius: 14,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    marginBottom: 12,
  },
  campaignTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  campaignName: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  campaignPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(229,9,20,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.28)',
  },
  campaignPillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  campaignMeta: {
    color: 'rgba(255,255,255,0.7)',
    marginTop: 6,
    marginBottom: 10,
    fontSize: 12,
    fontWeight: '600',
  },
  campaignMetricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricPill: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  metricLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  metricValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  campaignActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  campaignActionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#e50914',
    alignItems: 'center',
    justifyContent: 'center',
  },
  campaignCancelBtn: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  campaignActionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  productsList: {
    gap: 12,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 16,
  },
  emptySub: {
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    lineHeight: 18,
  },
  secondaryBtn: {
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  secondaryBtnText: {
    color: '#fff',
    fontWeight: '800',
  },
  productItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  productItemSelected: {
    borderColor: '#e50914',
    backgroundColor: 'rgba(229,9,20,0.1)',
  },
  productInfo: {
    flex: 1,
  },
  productTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  productPrice: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginTop: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#e50914',
    borderColor: '#e50914',
  },
  promotionOptions: {
    gap: 12,
  },
  promotionCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  promotionCardActive: {
    borderColor: '#e50914',
    backgroundColor: 'rgba(229,9,20,0.1)',
  },
  promotionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  promotionPrice: {
    color: '#e50914',
    fontSize: 16,
    fontWeight: '700',
  },
  promotionPriceActive: {
    color: '#fff',
  },
  promotionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  promotionTitleActive: {
    color: '#fff',
  },
  promotionDescription: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  promotionDescriptionActive: {
    color: 'rgba(255,255,255,0.9)',
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  unitPill: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  unitPillActive: {
    backgroundColor: '#e50914',
    borderColor: '#e50914',
  },
  unitPillText: {
    color: '#fff',
    fontWeight: '800',
  },
  pricePill: {
    marginLeft: 'auto',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  pricePillText: {
    color: '#fff',
    fontWeight: '900',
  },
  sliderCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sliderLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '800',
  },
  sliderValue: {
    color: '#fff',
    fontWeight: '900',
  },
  sliderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  sliderHint: {
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '700',
  },
  budgetHint: {
    color: 'rgba(255,255,255,0.65)',
    marginTop: 10,
    fontWeight: '700',
  },
  promoteButton: {
    backgroundColor: '#e50914',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  promoteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  insufficientText: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    fontWeight: '700',
  },
});
