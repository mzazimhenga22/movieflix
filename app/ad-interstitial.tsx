import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import AdBanner from '../components/ads/AdBanner';
import { usePromotedProducts } from '../hooks/use-promoted-products';
import { useSubscription } from '../providers/SubscriptionProvider';
import { buildSourceOrder, buildVideoScrapeContext, buildScrapeDebugTag } from '../lib/videoPlaybackShared';
import { createPrefetchKey, storePrefetchedPlayback } from '../lib/videoPrefetchCache';
import { usePStream } from '../src/pstream/usePStream';

const INTERSTITIAL_NAV_KEY = '__movieflix_interstitial_nav';

function readInterstitialNavState(): any {
  try {
    return (globalThis as any)?.[INTERSTITIAL_NAV_KEY];
  } catch {
    return undefined;
  }
}

function clearInterstitialNavState() {
  try {
    const state = (globalThis as any)?.[INTERSTITIAL_NAV_KEY];
    if (!state) return;
    state.active = false;
    state.queued = 0;
    state.pendingNext = undefined;
    state.updatedAt = Date.now();
  } catch {
    // ignore
  }
}

export default function AdInterstitialScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string>>();
  const { currentPlan } = useSubscription();
  const { products, hasAds, loading } = usePromotedProducts({ placement: 'feed', limit: 20 });
  const { scrape: prefetchScrape } = usePStream();

  const pickRef = useRef(Math.floor(Math.random() * 10_000));
  const product = useMemo(() => {
    if (!products.length) return null;
    return products[pickRef.current % products.length];
  }, [products]);

  const navState = readInterstitialNavState();
  const queuedCount = typeof navState?.queued === 'number' ? navState.queued : 0;

  const nextPathname =
    (typeof navState?.pendingNext?.pathname === 'string' && navState.pendingNext.pathname) ||
    params.__nextPathname ||
    '/video-player';
  const secondsTotal = Math.max(1, Math.min(120, Number(params.__seconds || '30') || 30));

  const baseNextParams = useMemo(() => {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(params)) {
      if (k.startsWith('__')) continue;
      out[k] = v;
    }
    return out;
  }, [params]);

  const nextParams = useMemo(() => {
    const overrideParams = navState?.pendingNext?.params;
    const merged = { ...baseNextParams, ...(overrideParams ?? {}) };
    const prefetchKeyForNext = createPrefetchKey({ pathname: nextPathname, params: merged });
    return { ...merged, __prefetchKey: prefetchKeyForNext };
  }, [baseNextParams, navState?.pendingNext?.params, nextPathname]);

  const prefetchKey = typeof nextParams.__prefetchKey === 'string' ? (nextParams.__prefetchKey as string) : undefined;

  const [remaining, setRemaining] = useState(secondsTotal);
  const startedAtRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownStartedRef = useRef(false);
  const hasNavigatedRef = useRef(false);
  const prefetchAttemptedRef = useRef(false);
  const [countdownActive, setCountdownActive] = useState(false);
  const [exiting, setExiting] = useState(false);

  const clearCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    setRemaining(secondsTotal);
    countdownStartedRef.current = false;
    startedAtRef.current = null;
    clearCountdown();
    setCountdownActive(false);
  }, [secondsTotal, clearCountdown]);

  const goToNext = useCallback(() => {
    if (hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;
    clearCountdown();
    setCountdownActive(false);
    setExiting(true);
    requestAnimationFrame(() => {
      clearInterstitialNavState();
      router.replace({ pathname: nextPathname as any, params: nextParams } as any);
    });
  }, [clearCountdown, nextParams, nextPathname, router]);

  const goToNextRef = useRef(goToNext);
  useEffect(() => {
    goToNextRef.current = goToNext;
  }, [goToNext]);

  useEffect(
    () => () => {
      clearCountdown();
      clearInterstitialNavState();
    },
    [clearCountdown],
  );

  useEffect(() => {
    if (currentPlan !== 'free') {
      goToNext();
      return;
    }
    if (!loading && !hasAds) {
      goToNext();
    }
  }, [currentPlan, hasAds, loading, goToNext]);

  useEffect(() => {
    if (currentPlan !== 'free') return;
    if (loading || !hasAds) return;
    if (hasNavigatedRef.current || countdownStartedRef.current) return;

    countdownStartedRef.current = true;
    setCountdownActive(true);
    startedAtRef.current = Date.now();
    countdownTimerRef.current = setInterval(() => {
      const startedAt = startedAtRef.current ?? Date.now();
      const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
      const nextRemaining = Math.max(0, secondsTotal - elapsedSec);
      setRemaining(nextRemaining);
      if (nextRemaining <= 0) {
        clearCountdown();
        goToNextRef.current?.();
      }
    }, 250);

    return () => {
      clearCountdown();
      setCountdownActive(false);
    };
  }, [currentPlan, hasAds, loading, secondsTotal, clearCountdown]);

  const scrapeContext = useMemo(() => buildVideoScrapeContext(nextParams), [nextParams]);

  useEffect(() => {
    if (currentPlan !== 'free') return;
    if (!prefetchKey) return;
    if (!scrapeContext) return;
    if (prefetchAttemptedRef.current) return;
    prefetchAttemptedRef.current = true;
    let cancelled = false;
    prefetchScrape(scrapeContext.media, {
      sourceOrder: buildSourceOrder(scrapeContext.preferAnimeSources),
      debugTag: buildScrapeDebugTag('interstitial-prefetch', scrapeContext.displayTitle),
    })
      .then((playback) => {
        if (cancelled || !playback) return;
        storePrefetchedPlayback(prefetchKey, {
          playback,
          title: scrapeContext.formattedTitle,
        });
      })
      .catch((err) => {
        if (__DEV__) {
          console.warn('[AdInterstitial] Prefetch failed', err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentPlan, prefetchKey, prefetchScrape, scrapeContext]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <LinearGradient
        colors={['#050509', '#0b0620', '#150a13', '#05060f'] as const}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.center}>
        <Text style={styles.title}>Sponsored</Text>
        <Text style={styles.subtitle}>
          {loading ? 'Loading…' : `Your movie starts in ${remaining}s`}
        </Text>
        {queuedCount > 0 ? (
          <Text style={styles.queueNote}>
            Multiple play requests detected — starting the latest selection.
          </Text>
        ) : null}

        {product?.id ? (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => router.push((`/marketplace/${product.id}`) as any)}
            style={styles.card}
          >
            {product.imageUrl ? (
              <Image source={{ uri: product.imageUrl }} style={styles.image} />
            ) : (
              <View style={styles.imageFallback} />
            )}
            <View style={styles.cardCopy}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {product.name}
              </Text>
              <Text style={styles.cardDesc} numberOfLines={2}>
                {product.description}
              </Text>
              <Text style={styles.cardPrice}>${Number(product.price ?? 0).toFixed(2)}</Text>
            </View>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.bottom}>
        {exiting ? null : <AdBanner placement="feed" />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050509',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
  },
  queueNote: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  bottom: {
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  card: {
    marginTop: 16,
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  image: {
    width: '100%',
    height: 160,
    backgroundColor: '#000',
  },
  imageFallback: {
    width: '100%',
    height: 160,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cardCopy: {
    padding: 12,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  cardDesc: {
    color: 'rgba(255,255,255,0.75)',
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
  },
  cardPrice: {
    color: 'rgba(255,255,255,0.9)',
    marginTop: 8,
    fontSize: 13,
    fontWeight: '900',
  },
});
