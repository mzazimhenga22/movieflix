import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { useAccent } from '../../components/AccentContext';
import { listenToBoostedLiveStreams, listenToLiveStreams } from '@/lib/live/liveService';
import type { LiveStream } from '@/lib/live/types';

export default function LiveDiscoverScreen() {
  const router = useRouter();
  const { accentColor } = useAccent();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [boosted, setBoosted] = useState<LiveStream[]>([]);
  const [q, setQ] = useState('');
  const [activeCategory, setActiveCategory] = useState<'For You' | 'Movies' | 'Friends' | 'Music' | 'Gaming'>('For You');

  useEffect(() => {
    let didFirst = false;
    const unsub = listenToLiveStreams((next) => {
      setStreams(next);
      if (!didFirst) {
        didFirst = true;
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = listenToBoostedLiveStreams((next) => setBoosted(next));
    return () => unsub();
  }, []);

  const categories = useMemo(
    () => ['For You', 'Movies', 'Friends', 'Music', 'Gaming'] as const,
    [],
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const base = streams;
    if (!query) return base;
    return base.filter((s) => {
      const hay = `${s.title ?? ''} ${s.hostName ?? ''}`.toLowerCase();
      return hay.includes(query);
    });
  }, [q, streams]);

  const Header = (
    <View style={{ gap: 12 }}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>Live</Text>
          <Text style={styles.subtitle}>Discover streams, jump in, and chat.</Text>
        </View>
        <TouchableOpacity
          style={[styles.goLiveBtn, { backgroundColor: accentColor }]}
          onPress={() => router.push('/social-feed/go-live')}
          activeOpacity={0.9}
        >
          <Ionicons name="videocam" size={18} color="#fff" />
          <Text style={styles.goLiveText}>Go Live</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color="rgba(255,255,255,0.7)" />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search hosts or titles"
          placeholderTextColor="rgba(255,255,255,0.55)"
          style={styles.searchInput}
        />
        {q ? (
          <TouchableOpacity onPress={() => setQ('')} activeOpacity={0.85}>
            <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.categoriesRow}>
        {categories.map((c) => {
          const active = c === activeCategory;
          return (
            <TouchableOpacity
              key={c}
              style={[styles.categoryChip, active && { borderColor: accentColor, backgroundColor: 'rgba(0,0,0,0.35)' }]}
              onPress={() => setActiveCategory(c)}
              activeOpacity={0.85}
            >
              <Text style={[styles.categoryText, active && { color: '#fff' }]}>{c}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {boosted.length ? (
        <View style={{ gap: 10 }}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Featured</Text>
            <Text style={styles.sectionHint}>boosted</Text>
          </View>

          <FlatList
            data={boosted.slice(0, 10)}
            horizontal
            keyExtractor={(s) => String(s.id)}
            showsHorizontalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.featureCard}
                onPress={() => router.push(`/social-feed/live/${item.id}`)}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={['rgba(229,9,20,0.22)', 'rgba(10,12,24,0.85)']}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.featureTopRow}>
                  <View style={styles.liveBadge}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveBadgeText}>LIVE</Text>
                  </View>
                  <View style={styles.viewerPill}>
                    <Ionicons name="eye" size={13} color="#fff" />
                    <Text style={styles.viewerText}>{Math.max(item.viewersCount ?? 0, 0)}</Text>
                  </View>
                </View>
                <View style={{ gap: 4 }}>
                  <Text style={styles.featureTitle} numberOfLines={1}>
                    {item.title || 'Live'}
                  </Text>
                  <Text style={styles.featureSubtitle} numberOfLines={1}>
                    {item.hostName || 'Host'}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      ) : null}

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Live now</Text>
        <Text style={styles.sectionHint}>{filtered.length} rooms</Text>
      </View>
    </View>
  );

  return (
    <LinearGradient colors={[accentColor, '#05050a']} style={StyleSheet.absoluteFill}>
      <View style={[styles.safeArea, { paddingTop: insets.top + 10 }]}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.loadingText}>Loading live streams…</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(s) => String(s.id)}
            ListHeaderComponent={Header}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/social-feed/live/${item.id}`)}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={['rgba(255,255,255,0.10)', 'rgba(0,0,0,0.40)']}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.cardLeft}>
                  <View style={[styles.avatar, { backgroundColor: accentColor }]}>
                    <Text style={styles.avatarInitial}>
                      {(item.hostName || 'H').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.title || 'Live on MovieFlix'}
                    </Text>
                    <Text style={styles.cardSubtitle} numberOfLines={1}>
                      {item.hostName || 'Host'} · {Math.max(item.viewersCount ?? 0, 0)} watching
                    </Text>
                  </View>
                </View>
                <View style={styles.cardRight}>
                  <View style={styles.liveBadge}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveBadgeText}>LIVE</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.85)" />
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 0,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '700',
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
    fontWeight: '600',
  },
  goLiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  goLiveText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 12,
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontWeight: '700',
  },

  categoriesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  categoryText: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '800',
    fontSize: 12,
  },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  sectionHint: {
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '800',
    fontSize: 12,
  },

  featureCard: {
    width: 250,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 14,
    gap: 10,
  },
  featureTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  featureTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
  },
  featureSubtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontWeight: '700',
    fontSize: 12,
  },

  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(229,9,20,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.35)',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e50914',
  },
  liveBadgeText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 0.6,
  },
  viewerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  viewerText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 12,
  },

  card: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontWeight: '900',
  },
  cardTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
  },
  cardSubtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontWeight: '700',
    fontSize: 12,
    marginTop: 4,
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: 10,
    paddingLeft: 10,
  },
});
