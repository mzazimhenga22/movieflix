import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, StyleSheet, Text, View } from 'react-native';

import { authPromise, firestore } from '@/constants/firebase';
import { TvFocusable } from './components/TvSpatialNavigation';
import AmbientGlow from './components/AmbientGlow';
import FloatingParticles from './components/FloatingParticles';

type HouseholdProfile = {
  id: string;
  name: string;
  avatarColor: string;
  photoURL?: string | null;
  photoPath?: string | null;
  isKids?: boolean;
};

const ProfileCard = memo(function ProfileCard({
  item,
  onSelect,
  index,
}: {
  item: HouseholdProfile;
  onSelect: (p: HouseholdProfile) => void;
  index: number;
}) {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 60,
        useNativeDriver: true,
        delay: index * 80,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 400,
        delay: index * 80,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, opacityAnim, scaleAnim]);

  useEffect(() => {
    Animated.timing(glowAnim, {
      toValue: focused ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [focused, glowAnim]);

  const animatedBorderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.12)', item.avatarColor || '#e50914'],
  });

  const animatedShadowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.6],
  });

  return (
    <Animated.View
      style={[
        styles.cardOuter,
        {
          opacity: opacityAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <TvFocusable
        onPress={() => onSelect(item)}
        isTVSelectable={true}
        accessibilityLabel={item.name}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={({ focused: f }: any) => [
          styles.card,
          f ? styles.cardFocused : null,
        ]}
      >
        <Animated.View
          style={[
            styles.cardGlow,
            {
              borderColor: animatedBorderColor,
              shadowColor: item.avatarColor || '#e50914',
              shadowOpacity: animatedShadowOpacity,
            },
          ]}
        />
        {focused && (
          <LinearGradient
            colors={[`${item.avatarColor}40`, 'transparent']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
          />
        )}
        <View style={[styles.avatar, { backgroundColor: `${item.avatarColor || '#e50914'}33` }]}>
          <LinearGradient
            colors={[`${item.avatarColor || '#e50914'}`, `${item.avatarColor || '#e50914'}77`]}
            style={[StyleSheet.absoluteFill, { borderRadius: 28 }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <Text style={styles.avatarInitial}>{item.name.charAt(0).toUpperCase()}</Text>
        </View>
        <Text numberOfLines={1} style={styles.name}>
          {item.name}
        </Text>
        {item.isKids ? (
          <View style={styles.kidsBadge}>
            <Text style={styles.kidsText}>Kids</Text>
          </View>
        ) : null}
      </TvFocusable>
    </Animated.View>
  );
});

export default function SelectProfileTv() {
  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<HouseholdProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const titleAnim = useRef(new Animated.Value(0)).current;
  const subtitleAnim = useRef(new Animated.Value(0)).current;

  const cacheKey = useMemo(() => (user?.uid ? `profileCache:${user.uid}` : null), [user?.uid]);

  useEffect(() => {
    Animated.stagger(150, [
      Animated.spring(titleAnim, { toValue: 1, friction: 8, tension: 50, useNativeDriver: true }),
      Animated.spring(subtitleAnim, { toValue: 1, friction: 8, tension: 50, useNativeDriver: true }),
    ]).start();
  }, [subtitleAnim, titleAnim]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    void authPromise
      .then((auth) => {
        unsub = onAuthStateChanged(auth, (u) => {
          setUser(u ?? null);
          if (!u) {
            router.replace('/(auth)/login');
          }
        });
      })
      .catch(() => {
        router.replace('/(auth)/login');
      });
    return () => {
      try {
        unsub?.();
      } catch {}
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!cacheKey) {
      setProfiles([]);
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    setLoading(true);
    AsyncStorage.getItem(cacheKey)
      .then((cached) => {
        if (!mounted) return;
        if (!cached) return;
        try {
          const parsed = JSON.parse(cached) as HouseholdProfile[];
          if (Array.isArray(parsed)) setProfiles(parsed);
        } catch {}
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [cacheKey]);

  useEffect(() => {
    if (!user || !cacheKey) return;

    const profilesRef = collection(firestore, 'users', user.uid, 'profiles');
    const q = query(profilesRef, orderBy('createdAt', 'asc'));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: HouseholdProfile[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: (data.name as string) || 'Profile',
            avatarColor: (data.avatarColor as string) || '#e50914',
            photoURL: (data.photoURL as string | null | undefined) ?? null,
            photoPath: (data.photoPath as string | null | undefined) ?? null,
            isKids: Boolean(data.isKids),
          };
        });

        setProfiles(next);
        AsyncStorage.setItem(cacheKey, JSON.stringify(next)).catch(() => {});
      },
      () => {},
    );

    return () => unsub();
  }, [cacheKey, user]);

  const selectProfile = useCallback(
    async (profile: HouseholdProfile) => {
      await AsyncStorage.setItem(
        'activeProfile',
        JSON.stringify({
          id: profile.id,
          name: profile.name,
          avatarColor: profile.avatarColor,
          photoURL: profile.photoURL ?? null,
          photoPath: profile.photoPath ?? null,
          isKids: Boolean(profile.isKids),
        }),
      );
      router.replace('/(tabs)/movies');
    },
    [],
  );

  const accentColor = profiles[0]?.avatarColor || '#e50914';

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0a0512', '#070815', '#05060f']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <AmbientGlow color={accentColor} intensity={0.28} />
      <FloatingParticles count={18} color={accentColor} />

      <View style={styles.headerRow}>
        <View>
          <Animated.Text
            style={[
              styles.title,
              {
                opacity: titleAnim,
                transform: [{ translateY: titleAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
              },
            ]}
          >
            {"Who's watching?"}
          </Animated.Text>
          <Animated.Text
            style={[
              styles.subtitle,
              {
                opacity: subtitleAnim,
                transform: [{ translateY: subtitleAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
              },
            ]}
          >
            Pick a profile (create/manage profiles on phone).
          </Animated.Text>
        </View>
        <TvFocusable
          onPress={() => router.push('/continue-on-phone?feature=profiles')}
          isTVSelectable={true}
          accessibilityLabel="Manage on phone"
          style={({ focused }: any) => [styles.phoneBtn, focused && styles.phoneBtnFocused]}
        >
          <Ionicons name="phone-portrait-outline" size={18} color="#fff" />
          <Text style={styles.phoneBtnText}>Manage on phone</Text>
        </TvFocusable>
      </View>

      <View style={styles.body}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <Ionicons name="reload" size={32} color="rgba(255,255,255,0.5)" />
            <Text style={styles.loadingText}>Loading profiles…</Text>
          </View>
        ) : profiles.length === 0 ? (
          <View style={styles.emptyCard}>
            <LinearGradient
              colors={['rgba(229,9,20,0.18)', 'transparent']}
              style={[StyleSheet.absoluteFill, { borderRadius: 28 }]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
            />
            <View style={styles.emptyIconWrap}>
              <Ionicons name="people-outline" size={48} color="rgba(255,255,255,0.85)" />
            </View>
            <Text style={styles.emptyTitle}>No profiles found</Text>
            <Text style={styles.emptySubtitle}>
              Create profiles in the MovieFlix phone app, then come back.
            </Text>
            <TvFocusable
              onPress={() => router.push('/continue-on-phone?feature=profiles')}
              isTVSelectable={true}
              accessibilityLabel="Continue on phone"
              style={({ focused }: any) => [styles.primaryBtn, focused && styles.primaryBtnFocused]}
            >
              <Text style={styles.primaryText}>Continue on phone</Text>
            </TvFocusable>
          </View>
        ) : (
          <FlatList
            data={profiles}
            keyExtractor={(p) => p.id}
            numColumns={5}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.grid}
            renderItem={({ item, index }) => (
              <ProfileCard item={item} onSelect={selectProfile} index={index} />
            )}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    paddingHorizontal: 48,
    paddingTop: 38,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 12,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 8,
  },
  phoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  phoneBtnFocused: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderColor: '#fff',
    transform: [{ scale: 1.04 }],
  },
  phoneBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  body: { flex: 1, paddingHorizontal: 48, paddingTop: 16 },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: { color: 'rgba(255,255,255,0.65)', fontSize: 17, fontWeight: '700' },
  emptyCard: {
    maxWidth: 800,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(10,12,25,0.85)',
    padding: 36,
    overflow: 'hidden',
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: 'rgba(229,9,20,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '900',
    marginTop: 8,
  },
  emptySubtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 17,
    fontWeight: '600',
    marginTop: 10,
    lineHeight: 24,
  },
  primaryBtn: {
    marginTop: 24,
    alignSelf: 'flex-start',
    backgroundColor: '#e50914',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  primaryBtnFocused: {
    backgroundColor: '#ff1a26',
    borderColor: '#fff',
    transform: [{ scale: 1.05 }],
  },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  grid: { paddingTop: 16, paddingBottom: 36 },
  gridRow: { gap: 20, marginBottom: 20 },
  cardOuter: {},
  card: {
    width: 210,
    height: 220,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(15,18,35,0.75)',
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardFocused: {
    transform: [{ scale: 1.06 }],
  },
  cardGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 26,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 24,
    elevation: 8,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    overflow: 'hidden',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 38,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  name: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '900',
  },
  kidsBadge: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  kidsText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
