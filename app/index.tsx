import AsyncStorage from '@react-native-async-storage/async-storage';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { buildProfileScopedKey, getLastAuthUid, getStoredActiveProfile } from '../lib/profileStorage';
import { onAuthChange } from './messaging/controller';

type RouteContext = 'authed' | 'guest' | 'offline-downloads' | 'offline-profiles';

type RouteTarget = '/downloads' | '/select-profile' | '/(auth)/login';

type RoutePlan = {
  target: RouteTarget;
  context: RouteContext;
  summary?: string | null;
};

const heroPoster = require('../assets/images/default-poster.webp');

const moodSource = ['Spotlight', 'Thrillers', 'Glow Reels', 'Offline vault', 'Romance', 'Indie gems'];
const SPLASH_NAV_DELAY_MS = 11500;

export default function SplashScreen() {
  const heroScale = useRef(new Animated.Value(0.92)).current;
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const metaOpacity = useRef(new Animated.Value(0)).current;
  const metaTranslate = useRef(new Animated.Value(18)).current;
  const chipOpacity = useRef(new Animated.Value(0)).current;
  const chipTranslate = useRef(new Animated.Value(28)).current;
  const featuredOpacity = useRef(new Animated.Value(0)).current;
  const featuredTranslate = useRef(new Animated.Value(36)).current;
  const deckOpacity = useRef(new Animated.Value(0)).current;
  const deckTranslate = useRef(new Animated.Value(42)).current;
  const delayHandle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasNavigatedRef = useRef(false);
  const [statusMessage, setStatusMessage] = useState('Calibrating your cinema...');
  const [routePlan, setRoutePlan] = useState<RoutePlan | null>(null);
  const [offlineSummary, setOfflineSummary] = useState<string | null>(null);

  const featureCards = useMemo(
    () => [
      { title: 'Trending flames', copy: '68 cinematic drops curated for tonight.', icon: 'flame' },
      { title: 'Watch parties', copy: 'Sync chats, parties, and glowing UI.', icon: 'people-outline' },
      {
        title: 'Offline vault',
        copy: offlineSummary ?? 'Save titles before entering airplane mode.',
        icon: 'cloud-download-outline',
      },
      { title: 'For You', copy: 'Hyper-personal mixes with romance sprinkles.', icon: 'heart' },
    ],
    [offlineSummary]
  );

  const iconDeck = useMemo(
    () => [
      { key: 'chat', icon: 'chatbubble-outline', size: 20 },
      { key: 'market', icon: 'bag-outline', size: 20 },
      { key: 'social', icon: 'people-outline', size: 22 },
      { key: 'profile', icon: 'profile', size: 22 },
    ],
    []
  );

  const planHighlight = useMemo(() => {
    if (!routePlan) return 'Calibrating vibe';
    switch (routePlan.context) {
      case 'authed':
        return 'Profiles synced';
      case 'offline-downloads':
        return 'Offline vault ready';
      case 'offline-profiles':
        return 'Offline profiles ready';
      default:
        return 'Guest cinematic mode';
    }
  }, [routePlan]);

  const planSummary = useMemo(
    () => offlineSummary ?? routePlan?.summary ?? 'Your cinematic feed is almost ready.',
    [offlineSummary, routePlan]
  );

  const metaItems = useMemo(
    () => [
      { icon: 'flame', label: '68 trending' },
      { icon: 'film-outline', label: statusMessage },
      { icon: 'cloud-download-outline', label: offlineSummary ?? 'Syncing profiles' },
    ],
    [offlineSummary, statusMessage]
  );

  const moodChips = useMemo(
    () =>
      moodSource.map((label, index) => ({
        label,
        active:
          index === 0 ||
          ((routePlan?.context === 'offline-downloads' || routePlan?.context === 'offline-profiles') &&
            label === 'Offline vault') ||
          (routePlan?.context === 'guest' && label === 'Indie gems'),
      })),
    [routePlan]
  );

  useEffect(() => {
    Animated.parallel([
      Animated.spring(heroScale, {
        toValue: 1,
        tension: 35,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(heroOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.timing(metaOpacity, {
      toValue: 1,
      duration: 500,
      delay: 180,
      useNativeDriver: true,
    }).start();
    Animated.timing(metaTranslate, {
      toValue: 0,
      duration: 500,
      delay: 180,
      useNativeDriver: true,
    }).start();
    Animated.timing(chipOpacity, {
      toValue: 1,
      duration: 500,
      delay: 260,
      useNativeDriver: true,
    }).start();
    Animated.timing(chipTranslate, {
      toValue: 0,
      duration: 500,
      delay: 260,
      useNativeDriver: true,
    }).start();
    Animated.timing(featuredOpacity, {
      toValue: 1,
      duration: 520,
      delay: 360,
      useNativeDriver: true,
    }).start();
    Animated.timing(featuredTranslate, {
      toValue: 0,
      duration: 520,
      delay: 360,
      useNativeDriver: true,
    }).start();
    Animated.timing(deckOpacity, {
      toValue: 1,
      duration: 520,
      delay: 460,
      useNativeDriver: true,
    }).start();
    Animated.timing(deckTranslate, {
      toValue: 0,
      duration: 520,
      delay: 460,
      useNativeDriver: true,
    }).start();
  }, [chipOpacity, chipTranslate, deckOpacity, deckTranslate, featuredOpacity, featuredTranslate, heroOpacity, heroScale, metaOpacity, metaTranslate]);

  const resolveOfflineDownloads = useCallback(async (): Promise<RoutePlan | null> => {
    try {
      const profile = await getStoredActiveProfile();
      if (!profile) return null;
      const scopeKey = buildProfileScopedKey('downloads', profile.id ?? undefined);
      const stored = await AsyncStorage.getItem(scopeKey);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return {
          target: '/downloads',
          context: 'offline-downloads',
          summary: `${parsed.length} saved title${parsed.length === 1 ? '' : 's'} for ${
            profile.name || 'you'
          }`,
        };
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const resolveOfflineProfiles = useCallback(async (): Promise<RoutePlan | null> => {
    try {
      const uid = await getLastAuthUid();
      if (!uid) return null;
      const cached = await AsyncStorage.getItem(`profileCache:${uid}`);
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return {
          target: '/select-profile',
          context: 'offline-profiles',
          summary: `${parsed.length} cached profile${parsed.length === 1 ? '' : 's'} available offline`,
        };
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const decideInitialRoute = useCallback(
    async (user: any) => {
      if (hasNavigatedRef.current) return;
      if (user) {
        setOfflineSummary(null);
        setStatusMessage('Syncing your profiles...');
        setRoutePlan({ target: '/select-profile', context: 'authed' });
        return;
      }
      setStatusMessage('Checking offline access…');
      const offline = await resolveOfflineDownloads();
      if (offline) {
        setOfflineSummary(offline.summary ?? null);
        setStatusMessage('Offline vault unlocked');
        setRoutePlan(offline);
        return;
      }

      const offlineProfiles = await resolveOfflineProfiles();
      if (offlineProfiles) {
        setOfflineSummary(offlineProfiles.summary ?? null);
        setStatusMessage('Offline profiles loaded');
        setRoutePlan(offlineProfiles);
        return;
      }

      setOfflineSummary(null);
      setStatusMessage('Sign in to keep watching');
      setRoutePlan({ target: '/(auth)/login', context: 'guest' });
    },
    [resolveOfflineDownloads, resolveOfflineProfiles]
  );

  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      void decideInitialRoute(user);
    });

    return () => {
      unsubscribe();
    };
  }, [decideInitialRoute]);

  useEffect(() => {
    if (!routePlan || hasNavigatedRef.current) return;
    if (delayHandle.current) {
      clearTimeout(delayHandle.current);
    }
    delayHandle.current = setTimeout(() => {
      if (hasNavigatedRef.current || !routePlan) return;
      hasNavigatedRef.current = true;
      router.replace(routePlan.target);
    }, SPLASH_NAV_DELAY_MS);
    return () => {
      if (delayHandle.current) {
        clearTimeout(delayHandle.current);
      }
    };
  }, [routePlan]);

  useEffect(() => {
    return () => {
      if (delayHandle.current) {
        clearTimeout(delayHandle.current);
      }
    };
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#150a13', '#070815', '#05060f']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <LinearGradient
        colors={['rgba(125,216,255,0.2)', 'rgba(255,255,255,0)']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.bgOrbPrimary}
      />
      <LinearGradient
        colors={['rgba(95,132,255,0.18)', 'rgba(255,255,255,0)']}
        start={{ x: 0.9, y: 0 }}
        end={{ x: 0.1, y: 1 }}
        style={styles.bgOrbSecondary}
      />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.headerWrap, { opacity: heroOpacity, transform: [{ scale: heroScale }] }]}>
          <LinearGradient
            colors={['rgba(229,9,20,0.22)', 'rgba(10,12,24,0.5)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGlow}
          />
          <View style={styles.headerBar}>
            <View style={styles.titleRow}>
              <View style={styles.accentDot} />
              <View>
                <Text style={styles.headerEyebrow}>{`Tonight's picks`}</Text>
                <Text style={styles.headerText}>MovieFlix</Text>
              </View>
            </View>
            <View style={styles.headerIcons}>
              {iconDeck.map((item) => (
                <View key={item.key} style={styles.iconBtn}>
                  <LinearGradient
                    colors={['#e50914', '#b20710']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.iconBg}
                  >
                    {item.key === 'profile' ? (
                      <FontAwesome name="user-circle" size={item.size} color="#ffffff" />
                    ) : (
                      <Ionicons name={item.icon as any} size={item.size} color="#ffffff" />
                    )}
                  </LinearGradient>
                </View>
              ))}
            </View>
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.headerMetaRow,
            { opacity: metaOpacity, transform: [{ translateY: metaTranslate }] },
          ]}
        >
          {metaItems.map((item) => (
            <View key={item.icon} style={styles.metaPill}>
              <Ionicons name={item.icon as any} size={14} color="#fff" />
              <Text numberOfLines={1} style={styles.metaText}>
                {item.label}
              </Text>
            </View>
          ))}
        </Animated.View>

        <Animated.View
          style={[
            styles.genreSection,
            { opacity: chipOpacity, transform: [{ translateY: chipTranslate }] },
          ]}
        >
          <Text style={styles.genreLabel}>Browse by vibe</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.genreRow}>
            {moodChips.map((chip) => (
              <View
                key={chip.label}
                style={[styles.genreChip, chip.active && styles.genreChipActive]}
              >
                <Text
                  style={[styles.genreChipText, chip.active && styles.genreChipTextActive]}
                >
                  {chip.label}
                </Text>
              </View>
            ))}
          </ScrollView>
        </Animated.View>

        <Animated.View
          style={[
            styles.featuredWrapper,
            { opacity: featuredOpacity, transform: [{ translateY: featuredTranslate }] },
          ]}
        >
          <LinearGradient
            colors={['rgba(229,9,20,0.26)', 'rgba(5,6,15,0.92)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.featuredCard}
          >
            <View style={styles.featuredRow}>
              <Image source={heroPoster} style={styles.featuredPoster} />
              <View style={styles.featuredMeta}>
                <Text style={styles.featuredEyebrow}>{planHighlight}</Text>
                <Text style={styles.featuredTitle}>Glow feed warming up</Text>
                <Text numberOfLines={2} style={styles.featuredMetaText}>
                  {statusMessage}
                </Text>
                <Text numberOfLines={1} style={styles.featuredMetaText}>
                  {planSummary}
                </Text>
              </View>
            </View>
            <View style={styles.featuredActions}>
              <View style={styles.playButton}>
                <Ionicons name="play" size={16} color="#000" />
                <Text style={styles.playButtonText}>Play preview</Text>
              </View>
              <View style={styles.secondaryButton}>
                <Ionicons name="information-circle-outline" size={16} color="#fff" />
                <Text style={styles.secondaryButtonText}>Details</Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        <Animated.View
          style={[
            styles.sectionsDeck,
            { opacity: deckOpacity, transform: [{ translateY: deckTranslate }] },
          ]}
        >
          {featureCards.map((card) => (
            <View key={card.title} style={styles.sectionCard}>
              <View style={styles.sectionIconCircle}>
                <Ionicons name={card.icon as any} size={18} color="#fff" />
              </View>
              <Text style={styles.sectionTitle}>{card.title}</Text>
              <Text style={styles.sectionCopy}>{card.copy}</Text>
            </View>
          ))}
        </Animated.View>

        <Animated.View style={[styles.previewSheet, { opacity: deckOpacity }]}>
          <View style={styles.previewCard}>
            <View style={styles.previewRow}>
              <Image source={heroPoster} style={styles.previewPoster} />
              <View style={styles.previewMeta}>
                <Text style={styles.previewTitle}>{planHighlight}</Text>
                <Text style={styles.previewSubtitle}>{planSummary}</Text>
              </View>
              <View style={styles.previewBadge}>
                <Ionicons name="sparkles" size={14} color="#e50914" />
                <Text style={styles.previewBadgeText}>{routePlan ? 'Ready' : 'Calibrating'}</Text>
              </View>
            </View>
            <View style={styles.previewFooter}>
              <Text numberOfLines={2} style={styles.previewFooterText}>
                Your splash mirrors the movies tab — gradient glass, glow pills, and cinematic stacks.
              </Text>
            </View>
          </View>
        </Animated.View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <LinearGradient
        colors={['rgba(5,6,15,0.92)', 'rgba(5,6,15,0.82)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bottomStatus}
      >
        <ActivityIndicator size="small" color="#e50914" />
        <View style={styles.bottomCopy}>
          <Text style={styles.bottomTitle}>{statusMessage}</Text>
          <Text style={styles.bottomSubtitle}>{planSummary}</Text>
        </View>
        <View style={styles.signatureMark}>
          <Text style={styles.signaturePrefix}>made by</Text>
          <Text style={styles.signatureName}>mzazimhenga</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05060f',
  },
  scrollContent: {
    paddingTop: 80,
    paddingHorizontal: 16,
    paddingBottom: 200,
  },
  bgOrbPrimary: {
    position: 'absolute',
    width: 380,
    height: 380,
    borderRadius: 190,
    top: -60,
    left: -90,
    opacity: 0.5,
    transform: [{ rotate: '12deg' }],
  },
  bgOrbSecondary: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    bottom: -90,
    right: -60,
    opacity: 0.5,
    transform: [{ rotate: '-16deg' }],
  },
  headerWrap: {
    borderRadius: 22,
    marginBottom: 12,
    overflow: 'hidden',
  },
  headerGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.8,
  },
  headerBar: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accentDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#e50914',
    shadowColor: '#e50914',
    shadowOpacity: 0.7,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    letterSpacing: 0.6,
  },
  headerText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    marginLeft: 8,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  iconBg: {
    padding: 10,
    borderRadius: 14,
  },
  headerMetaRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 6,
    paddingVertical: 12,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    flex: 1,
  },
  metaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  genreSection: {
    marginTop: 4,
    marginBottom: 12,
  },
  genreLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  genreRow: {
    paddingVertical: 6,
    gap: 10,
  },
  genreChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  genreChipActive: {
    backgroundColor: '#e50914',
    borderColor: '#e50914',
  },
  genreChipText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  genreChipTextActive: {
    color: '#fff',
  },
  featuredWrapper: {
    marginBottom: 18,
    borderRadius: 26,
    overflow: 'hidden',
  },
  featuredCard: {
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  featuredRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featuredPoster: {
    width: 90,
    height: 130,
    borderRadius: 18,
    marginRight: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  featuredMeta: {
    flex: 1,
    gap: 4,
  },
  featuredEyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  featuredTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  featuredMetaText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
  },
  featuredActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
  },
  playButtonText: {
    color: '#000',
    fontWeight: '700',
    marginLeft: 8,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  secondaryButtonText: {
    color: '#fff',
    fontWeight: '600',
    marginLeft: 8,
  },
  sectionsDeck: {
    marginBottom: 20,
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  sectionCard: {
    marginBottom: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(5,6,15,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sectionIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(229,9,20,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionCopy: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  previewSheet: {
    marginTop: 10,
  },
  previewCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(5,6,15,0.92)',
    padding: 16,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewPoster: {
    width: 60,
    height: 90,
    borderRadius: 12,
    marginRight: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  previewMeta: {
    flex: 1,
  },
  previewTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  previewSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 4,
  },
  previewBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  previewBadgeText: {
    color: '#e50914',
    fontWeight: '700',
    marginTop: 2,
    fontSize: 11,
  },
  previewFooter: {
    marginTop: 12,
  },
  previewFooterText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    lineHeight: 18,
  },
  bottomSpacer: {
    height: 120,
  },
  bottomStatus: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bottomCopy: {
    flex: 1,
  },
  bottomTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  bottomSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  signatureMark: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 12,
  },
  signaturePrefix: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  signatureName: {
    color: '#ff9b9b',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
});
