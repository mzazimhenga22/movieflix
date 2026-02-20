import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import ScreenWrapper from '../components/ScreenWrapper';
import { useUser } from '../hooks/use-user';
import {
  fetchProfilesByIds,
  followUser,
  getFollowingIds,
  type SocialProfile,
  unfollowUser,
} from '../lib/followGraph';

const FollowingScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useUser();

  const targetUserId = useMemo(() => {
    const raw = params.userId;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    return user?.uid ? String(user.uid) : '';
  }, [params.userId, user?.uid]);

  const viewerId = user?.uid ? String(user.uid) : '';

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<SocialProfile[]>([]);
  const [search, setSearch] = useState('');

  const [viewerFollowing, setViewerFollowing] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!targetUserId) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const ids = await getFollowingIds(targetUserId);
      const profiles = await fetchProfilesByIds(ids);
      setItems(profiles);
    } catch (e) {
      console.warn('[following] failed to load', e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  const loadViewerFollowing = useCallback(async () => {
    if (!viewerId) {
      setViewerFollowing(new Set());
      return;
    }
    try {
      const ids = await getFollowingIds(viewerId);
      setViewerFollowing(new Set(ids.map(String)));
    } catch {
      setViewerFollowing(new Set());
    }
  }, [viewerId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadViewerFollowing();
  }, [loadViewerFollowing]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) => String(p.displayName || '').toLowerCase().includes(q));
  }, [items, search]);

  const toggleFollow = useCallback(
    async (target: SocialProfile) => {
      if (!viewerId) {
        router.push('/(auth)/login');
        return;
      }
      if (!target?.id || target.id === viewerId) return;

      setBusyId(target.id);
      try {
        const isFollowing = viewerFollowing.has(target.id);
        if (isFollowing) {
          const { didUnfollow } = await unfollowUser({ viewerId, targetId: target.id });
          if (didUnfollow) {
            setViewerFollowing((prev) => {
              const next = new Set(prev);
              next.delete(target.id);
              return next;
            });
          }
        } else {
          const { didFollow } = await followUser({
            viewerId,
            targetId: target.id,
            actorName: user?.displayName || 'A new user',
            actorAvatar: (user as any)?.photoURL || null,
            notify: true,
          });
          if (didFollow) {
            setViewerFollowing((prev) => new Set(prev).add(target.id));
          }
        }
      } finally {
        setBusyId(null);
      }
    },
    [router, user, viewerFollowing, viewerId],
  );

  const renderRow = ({ item }: { item: SocialProfile }) => {
    const isSelf = viewerId && item.id === viewerId;
    const isFollowing = viewerFollowing.has(item.id);

    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.85}
        onPress={() => router.push({ pathname: '/profile', params: { userId: item.id, backTo: '/following' } } as any)}
      >
        {item.photoURL ? (
          <Image source={{ uri: item.photoURL }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback} />
        )}

        <View style={styles.rowMain}>
          <Text style={styles.name} numberOfLines={1}>
            {item.displayName || 'User'}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {isFollowing ? 'Following' : 'Not followed'}
          </Text>
        </View>

        {isSelf ? (
          <View style={styles.selfPill}>
            <Text style={styles.selfText}>You</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.followBtn, isFollowing && styles.followingBtn]}
            onPress={() => void toggleFollow(item)}
            disabled={busyId === item.id}
            activeOpacity={0.85}
          >
            <Text style={styles.followBtnText}>{isFollowing ? 'Unfollow' : 'Follow'}</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <ScreenWrapper>
      <LinearGradient
        colors={['rgba(95,132,255,0.22)', '#150a13', '#05060f']}
        start={[0, 0]}
        end={[1, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Following</Text>
            <Text style={styles.subtitle}>{items.length} total</Text>
          </View>
          <TouchableOpacity onPress={() => void load()} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="rgba(255,255,255,0.7)" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search following"
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(i) => i.id}
            renderItem={renderRow}
            contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : undefined}
            ListEmptyComponent={
              <Text style={styles.emptyText}>{search.trim() ? 'No matches.' : 'Not following anyone yet.'}</Text>
            }
          />
        )}
      </SafeAreaView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '900' },
  subtitle: { color: 'rgba(255,255,255,0.7)', marginTop: 2, fontSize: 12 },
  searchBox: {
    marginHorizontal: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 14 },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', padding: 18 },
  emptyText: { color: 'rgba(255,255,255,0.7)', textAlign: 'center' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.08)' },
  avatarFallback: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.08)' },
  rowMain: { flex: 1 },
  name: { color: '#fff', fontWeight: '800', fontSize: 15 },
  sub: { color: 'rgba(255,255,255,0.6)', marginTop: 3, fontSize: 12 },
  followBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  followingBtn: { backgroundColor: '#e50914' },
  followBtnText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  selfPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  selfText: { color: 'rgba(255,255,255,0.9)', fontWeight: '800', fontSize: 12 },
});

export default FollowingScreen;
