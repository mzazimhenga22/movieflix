import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  View,
  TextInput,
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  SafeAreaView,
} from 'react-native';
import { collection, doc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { firestore } from '../constants/firebase';
import ScreenWrapper from '../components/ScreenWrapper';
import { useUser } from '../hooks/use-user';
import { followUser, unfollowUser } from '../lib/followGraph';
import { useAccent } from './components/AccentContext';
import { getSuggestedPeople, type Profile } from './messaging/controller';

const ProfileSearchScreen = () => {
  const router = useRouter();
  const { user } = useUser();
  const viewerId = user?.uid ? String(user.uid) : '';
  const { accentColor, setAccentColor } = useAccent();
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [suggested, setSuggested] = useState<Profile[]>([]);
  const [loadingSuggested, setLoadingSuggested] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [blockedSet, setBlockedSet] = useState<Set<string>>(new Set());

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInFlightRef = useRef(false);

  React.useEffect(() => {
    if (!viewerId) {
      setFollowingSet(new Set());
      setBlockedSet(new Set());
      return;
    }

    return onSnapshot(
      doc(firestore, 'users', viewerId),
      (snap) => {
        const data = snap.exists() ? (snap.data() as any) : {};
        const following = Array.isArray(data?.following) ? data.following.map(String) : [];
        const blocked = Array.isArray(data?.blockedUsers) ? data.blockedUsers.map(String) : [];
        setFollowingSet(new Set(following));
        setBlockedSet(new Set(blocked));
      },
      () => {
        setFollowingSet(new Set());
        setBlockedSet(new Set());
      },
    );
  }, [viewerId]);

  const normalize = useMemo(
    () =>
      (v: string) =>
        String(v || '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim(),
    [],
  );

  const isSubsequence = useMemo(
    () =>
      (needle: string, hay: string) => {
        if (!needle) return true;
        let j = 0;
        for (let i = 0; i < hay.length && j < needle.length; i += 1) {
          if (hay[i] === needle[j]) j += 1;
        }
        return j === needle.length;
      },
    [],
  );

  const dedupeById = useMemo(
    () =>
      (list: any[]) => {
        const map = new Map<string, any>();
        for (const p of list) {
          const id = String(p?.id || '').trim();
          if (!id) continue;
          if (!map.has(id)) map.set(id, p);
        }
        return Array.from(map.values());
      },
    [],
  );

  const runRemoteSearch = useCallback(
    async (qRaw: string) => {
      const qTrimmed = String(qRaw || '').trim();
      if (!qTrimmed) {
        setUsers([]);
        setSearching(false);
        return;
      }

      if (searchInFlightRef.current) return;
      searchInFlightRef.current = true;
      setSearching(true);

      try {
        const usersRef = collection(firestore, 'users');
        const q = query(
          usersRef,
          where('displayName', '>=', qTrimmed),
          where('displayName', '<=', qTrimmed + '\uf8ff'),
        );
        const querySnapshot = await getDocs(q);
        const usersData = querySnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setUsers(usersData);
      } catch {
        setUsers([]);
      } finally {
        setSearching(false);
        searchInFlightRef.current = false;
      }
    },
    [],
  );

  useEffect(() => {
    let alive = true;

    setLoadingSuggested(true);
    void getSuggestedPeople()
      .then((list) => {
        if (!alive) return;
        setSuggested(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (alive) setSuggested([]);
      })
      .finally(() => {
        if (alive) setLoadingSuggested(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const q = String(searchQuery || '');
    searchTimerRef.current = setTimeout(() => {
      void runRemoteSearch(q);
    }, 260);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [runRemoteSearch, searchQuery]);

  const handleProfilePress = (userId: string) => {
    router.push({ pathname: '/profile', params: { userId, backTo: '/profile-search' } } as any);
  };

  const toggleFollow = async (targetId: string) => {
    if (!targetId) return;
    if (!viewerId) {
      router.push('/(auth)/login');
      return;
    }
    if (targetId === viewerId) return;
    if (blockedSet.has(targetId)) return;

    setBusyId(targetId);
    try {
      const isFollowing = followingSet.has(targetId);
      if (isFollowing) {
        await unfollowUser({ viewerId, targetId });
        setFollowingSet((prev) => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
      } else {
        await followUser({
          viewerId,
          targetId,
          actorName: user?.displayName || 'A new user',
          actorAvatar: (user as any)?.photoURL || null,
          notify: true,
        });
        setFollowingSet((prev) => new Set(prev).add(targetId));
      }
    } catch (err) {
      console.warn('[profile-search] follow toggle failed', err);
    } finally {
      setBusyId(null);
    }
  };

  const q = normalize(searchQuery);
  const typeahead = useMemo(() => {
    if (!q) return [];
    const tokens = q.split(' ').filter(Boolean);
    const pool = dedupeById([...(users || []), ...(suggested || [])]);

    const scored = pool
      .map((p: any) => {
        const name = normalize(p?.displayName || '');
        const compact = name.replace(/\s+/g, '');
        const qCompact = q.replace(/\s+/g, '');
        let score = 0;
        if (name.startsWith(q)) score += 60;
        if (name.includes(q)) score += 30;
        if (tokens.every((t) => name.includes(t))) score += 18;
        if (isSubsequence(qCompact, compact)) score += 10;
        if (viewerId && String(p?.id) === viewerId) score -= 5;
        return { p, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map(({ p }) => p);

    return scored;
  }, [dedupeById, isSubsequence, normalize, q, suggested, users, viewerId]);

  const themeColors = useMemo(
    () =>
      [
        '#e50914',
        '#ff8a00',
        '#4D8DFF',
        '#8b5cf6',
        '#10b981',
        '#06b6d4',
        '#f43f5e',
        '#ffffff',
      ] as const,
    [],
  );

  return (
    <ScreenWrapper>
      <LinearGradient
        colors={[`${(accentColor || '#e50914')}44`, '#150a13', '#05060f']}
        start={[0, 0]}
        end={[1, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="rgba(255,255,255,0.8)" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search users"
              placeholderTextColor="rgba(255,255,255,0.45)"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {searching ? <ActivityIndicator color="#fff" size="small" /> : null}
            {searchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
                <Ionicons name="close" size={16} color="#fff" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <View style={styles.themeCard}>
          <View style={styles.themeHeaderRow}>
            <Text style={styles.themeTitle}>Theme</Text>
            <Text style={styles.themeSubtitle}>Pick a color</Text>
          </View>
          <View style={styles.swatchRow}>
            {themeColors.map((c) => {
              const selected = (accentColor || '#e50914').toLowerCase() === c.toLowerCase();
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => setAccentColor(c)}
                  style={[styles.swatch, { backgroundColor: c }, selected ? styles.swatchSelected : null]}
                  activeOpacity={0.9}
                />
              );
            })}
          </View>
        </View>

        <FlatList
          data={q ? typeahead : suggested}
          keyExtractor={(item: any) => String(item.id)}
          ListHeaderComponent={
            <View style={styles.listHeaderRow}>
              <Text style={styles.listHeaderTitle}>{q ? 'Suggestions' : 'People you may know'}</Text>
              {(!q && loadingSuggested) || searching ? (
                <Text style={styles.listHeaderHint}>Loading…</Text>
              ) : (
                <Text style={styles.listHeaderHint}>Tap to open</Text>
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={26} color="rgba(255,255,255,0.65)" />
              <Text style={styles.emptyTitle}>{q ? 'No matches' : 'No suggestions yet'}</Text>
              <Text style={styles.emptySubtitle}>
                {q ? 'Try a different spelling or fewer words.' : 'Check your connection and try again.'}
              </Text>
            </View>
          }
          renderItem={({ item }: any) => (
            <TouchableOpacity onPress={() => handleProfilePress(String(item.id))} style={styles.userItem} activeOpacity={0.85}>
              <Image source={{ uri: item.photoURL || 'https://via.placeholder.com/50' }} style={styles.userAvatar} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.userName} numberOfLines={1} ellipsizeMode="tail">{item.displayName}</Text>
                {viewerId && String(item.id) === viewerId ? (
                  <Text style={styles.userMeta}>You</Text>
                ) : blockedSet.has(String(item.id)) ? (
                  <Text style={styles.userMeta}>Blocked</Text>
                ) : followingSet.has(String(item.id)) ? (
                  <Text style={styles.userMeta}>Following</Text>
                ) : (
                  <Text style={styles.userMeta}>Suggested</Text>
                )}
              </View>

              {viewerId && String(item.id) !== viewerId ? (
                <TouchableOpacity
                  style={[
                    styles.followBtn,
                    followingSet.has(String(item.id)) && styles.followingBtn,
                    blockedSet.has(String(item.id)) && styles.followBtnDisabled,
                    busyId === String(item.id) && { opacity: 0.6 },
                    !followingSet.has(String(item.id)) && !blockedSet.has(String(item.id)) && { backgroundColor: accentColor || '#e50914' },
                  ]}
                  onPress={(e) => {
                    // prevent triggering the row navigation
                    // @ts-ignore
                    e?.stopPropagation?.();
                    void toggleFollow(String(item.id));
                  }}
                  disabled={busyId === String(item.id) || blockedSet.has(String(item.id))}
                  activeOpacity={0.85}
                >
                  <Text style={styles.followBtnText}>
                    {followingSet.has(String(item.id)) ? 'Following' : 'Follow'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      </SafeAreaView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  backButton: {
    marginRight: 15,
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    minWidth: 0,
  },
  clearBtn: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },

  themeCard: {
    marginHorizontal: 14,
    marginBottom: 12,
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  themeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  themeTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 16,
  },
  themeSubtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '700',
    fontSize: 12,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  swatchSelected: {
    borderColor: '#fff',
    transform: [{ scale: 1.06 }],
  },

  listHeaderRow: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listHeaderTitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  listHeaderHint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '700',
  },

  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 14,
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  userAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 15,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  userName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  userMeta: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    marginTop: 2,
  },
  followBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#e50914',
    marginLeft: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  followingBtn: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  followBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  followBtnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 12,
  },

  emptyState: {
    paddingTop: 28,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 16,
  },
  emptySubtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'center',
  },
});

export default ProfileSearchScreen;
