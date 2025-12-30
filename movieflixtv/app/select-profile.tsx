import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { authPromise, firestore } from '@/constants/firebase';

type HouseholdProfile = {
  id: string;
  name: string;
  avatarColor: string;
  photoURL?: string | null;
  photoPath?: string | null;
  isKids?: boolean;
};

export default function SelectProfileTv() {
  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<HouseholdProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const cacheKey = useMemo(() => (user?.uid ? `profileCache:${user.uid}` : null), [user?.uid]);

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
      () => {
        // offline: keep cached
      },
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

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#150a13', '#070815', '#05060f']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Who’s watching?</Text>
          <Text style={styles.subtitle}>Pick a profile (create/manage profiles on phone).</Text>
        </View>
        <Pressable
          onPress={() => router.push('/continue-on-phone?feature=profiles')}
          style={styles.phoneBtn}
        >
          <Ionicons name="phone-portrait-outline" size={18} color="#fff" />
          <Text style={styles.phoneBtnText}>Manage on phone</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        {loading ? (
          <Text style={styles.loadingText}>Loading profiles…</Text>
        ) : profiles.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="people-outline" size={42} color="rgba(255,255,255,0.8)" />
            <Text style={styles.emptyTitle}>No profiles found</Text>
            <Text style={styles.emptySubtitle}>
              Create profiles in the MovieFlix phone app, then come back.
            </Text>
            <Pressable
              onPress={() => router.push('/continue-on-phone?feature=profiles')}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryText}>Continue on phone</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={profiles}
            keyExtractor={(p) => p.id}
            numColumns={5}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.grid}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => void selectProfile(item)}
                style={({ focused }: any) => [
                  styles.card,
                  focused ? styles.cardFocused : null,
                  !item.photoURL ? { backgroundColor: item.avatarColor || '#222' } : null,
                ]}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarInitial}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <Text numberOfLines={1} style={styles.name}>
                  {item.name}
                </Text>
                {item.isKids ? <Text style={styles.kids}>Kids</Text> : null}
              </Pressable>
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
    paddingTop: 34,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { color: '#fff', fontSize: 44, fontWeight: '900' },
  subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 16, marginTop: 6 },
  phoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  phoneBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  body: { flex: 1, paddingHorizontal: 48, paddingTop: 10 },
  loadingText: { color: 'rgba(255,255,255,0.75)', fontSize: 16 },
  emptyCard: {
    maxWidth: 760,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(5,6,15,0.86)',
    padding: 30,
  },
  emptyTitle: { color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 12 },
  emptySubtitle: { color: 'rgba(255,255,255,0.75)', fontSize: 16, marginTop: 8 },
  primaryBtn: {
    marginTop: 18,
    alignSelf: 'flex-start',
    backgroundColor: '#e50914',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
  },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  grid: { paddingTop: 10, paddingBottom: 30 },
  gridRow: { gap: 16 },
  card: {
    width: 200,
    height: 200,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFocused: {
    borderColor: '#fff',
    transform: [{ scale: 1.04 }],
  },
  avatar: {
    width: 86,
    height: 86,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  avatarInitial: { color: '#fff', fontSize: 34, fontWeight: '900' },
  name: { color: '#fff', fontSize: 16, fontWeight: '900' },
  kids: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
