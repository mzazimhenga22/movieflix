import { updateStreakForContext } from '@/lib/streaks/streakManager';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Animated,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useUser } from '../../../hooks/use-user';
import { useNavigationGuard } from '@/hooks/use-navigation-guard';
import { getPersistedCache, setPersistedCache } from '@/lib/persistedCache';
import { onStoriesUpdateForViewer } from './storiesController';
import LiquidGlass from '@/components/app-components/LiquidGlass';

interface Props {
  showAddStory?: boolean;
  title?: string;
  offset?: number;
  limit?: number;
  emptyHint?: string;
  hideSeeAll?: boolean;
  seedStories?: any[];
  disableLiveFetch?: boolean;
}

const RING_COLORS = [
  ['#e50914', '#ff6b35'],
  ['#a855f7', '#ec4899'],
  ['#7dd8ff', '#22c55e'],
  ['#f59e0b', '#ef4444'],
  ['#06b6d4', '#8b5cf6'],
];

function getStoryColors(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  return RING_COLORS[Math.abs(h) % RING_COLORS.length];
}

export default function StoriesRow({
  showAddStory = false,
  title = 'Stories',
  offset = 0,
  limit,
  emptyHint = 'No stories yet',
  hideSeeAll = false,
  seedStories,
  disableLiveFetch = false,
}: Props) {
  const router = useRouter();
  const { deferNav } = useNavigationGuard({ cooldownMs: 900 });
  const { width } = useWindowDimensions();
  const { user } = useUser();
  const [stories, setStories] = useState<any[]>(seedStories || []);
  const [pressedStory, setPressedStory] = useState<string | null>(null);
  
  const clampedOffset = Math.max(0, offset);
  const sliceLimit = limit && limit > 0 ? limit : undefined;
  const displayedStories = useMemo(
    () => stories.slice(clampedOffset, sliceLimit ? clampedOffset + sliceLimit : undefined),
    [clampedOffset, sliceLimit, stories],
  );

  const itemSize = width >= 420 ? 76 : 68;
  const ringSize = itemSize + 6;

  const entranceAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(entranceAnim, { toValue: 1, tension: 60, friction: 10, useNativeDriver: true }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 2000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => { setStories(seedStories || []); }, [seedStories]);

  useEffect(() => {
    if (disableLiveFetch) return;
    const viewerId = (user as any)?.uid ? String((user as any).uid) : null;
    const cacheKey = `__movieflix_stories_row_v1:${viewerId || 'anon'}`;
    let cancelled = false;
    void (async () => {
      const cached = await getPersistedCache<any[]>(cacheKey, { maxAgeMs: 2 * 60 * 1000 });
      if (!cancelled && cached?.value?.length) setStories(cached.value as any);
    })();

    const unsubscribe = onStoriesUpdateForViewer(
      (rawStories) => {
        const grouped: Record<string, any[]> = {};
        rawStories.forEach((s) => {
          const uid = s.userId || 'unknown';
          if (!grouped[uid]) grouped[uid] = [];
          grouped[uid].push(s);
        });
        const groups = Object.values(grouped).map((list) => {
            const sorted = [...list].sort((a, b) => (a.createdAt?.toMillis || 0) - (b.createdAt?.toMillis || 0));
            const first = sorted[0];
            const last = sorted[sorted.length - 1];
            const userId = first?.userId ? String(first.userId) : null;
            if (!userId || userId === 'unknown') return null;
            return {
              id: userId,
              userId,
              username: first?.username ?? 'Story',
              photoURL: last?.photoURL ?? last?.mediaUrl ?? null,
              avatar: last?.userAvatar ?? last?.avatar ?? null,
              storyCount: sorted.length,
              media: sorted.filter(s => !!(s?.photoURL || s?.mediaUrl)).map(s => ({
                  type: (s?.mediaType === 'video' ? 'video' : 'image'),
                  uri: String(s.photoURL || s.mediaUrl),
                  storyId: String(s.id),
                  caption: s.caption,
                  createdAtMs: s.createdAt?.toMillis?.() || null,
              })),
            };
          }).filter(Boolean);
        setStories(groups as any);
        void setPersistedCache(cacheKey, groups as any);
      },
      { viewerId }
    );
    return () => { cancelled = true; unsubscribe(); };
  }, [disableLiveFetch, user]);

  const handleStoryPress = (story: any) => {
    setPressedStory(story.id);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    deferNav(() => router.push({ pathname: '/story-viewer', params: { stories: JSON.stringify(stories), initialStoryId: String(story.id) } } as any));
    void updateStreakForContext({ kind: 'story', userId: story.userId, username: story.username });
    setTimeout(() => setPressedStory(null), 300);
  };

  const StoryItem = ({ story, index }: { story: any; index: number }) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const colors = useMemo(() => getStoryColors(story.id), [story.id]);
    return (
      <Animated.View style={{ transform: [{ scale: scaleAnim }, { translateY: entranceAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }], opacity: entranceAnim }}>
        <TouchableOpacity 
            style={styles.storyItem} activeOpacity={1} 
            onPress={() => handleStoryPress(story)}
            onPressIn={() => Animated.spring(scaleAnim, { toValue: 0.92, useNativeDriver: true }).start()}
            onPressOut={() => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start()}
        >
          <LinearGradient colors={colors} style={[styles.storyRing, { width: ringSize, height: ringSize }]}>
            <View style={[styles.storyRingInner, { width: itemSize, height: itemSize }]}>
              {story.avatar || story.photoURL ? (
                <Image source={{ uri: story.avatar || story.photoURL }} style={styles.storyAvatar} />
              ) : (
                <View style={styles.avatarFallback}><Ionicons name="person" size={24} color="rgba(255,255,255,0.3)" /></View>
              )}
            </View>
          </LinearGradient>
          {story.storyCount > 1 && (
            <View style={[styles.countBadge, { backgroundColor: colors[0] }]}><Text style={styles.countText}>{story.storyCount}</Text></View>
          )}
          <Text style={styles.storyUsername} numberOfLines={1}>{story.username}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="sparkles" size={16} color="#7dd8ff" />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {showAddStory && (
          <Animated.View style={{ transform: [{ scale: pulseAnim }], opacity: entranceAnim }}>
            <TouchableOpacity onPress={() => deferNav(() => router.push('/story-upload'))} style={styles.addStoryItem} activeOpacity={0.9}>
              <View style={[styles.addStoryContainer, { width: ringSize, height: ringSize }]}>
                <LiquidGlass cornerRadius={ringSize / 2} tintOpacity={0.15} tintColor="#fff" glowColor="#e50914" glowIntensity={0.2} style={StyleSheet.absoluteFill} />
                <View style={[styles.addStoryInner, { width: itemSize, height: itemSize }]}>
                    <Ionicons name="camera" size={28} color="rgba(255,255,255,0.8)" />
                </View>
              </View>
              <View style={styles.addBadge}>
                <LiquidGlass cornerRadius={10} tintOpacity={0.9} tintColor="#e50914" glowColor="#ff4b4b" glowIntensity={0.5} style={styles.addBadgeGlass}>
                  <Ionicons name="add" size={14} color="#fff" />
                </LiquidGlass>
              </View>
              <Text style={styles.addStoryText}>Your story</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {displayedStories.map((story, index) => (
          <StoryItem key={story.id} story={story} index={index} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, marginBottom: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  scrollContent: { paddingHorizontal: 12, gap: 16 },
  storyItem: { alignItems: 'center', width: 80 },
  storyRing: { borderRadius: 999, padding: 2.5, alignItems: 'center', justifyContent: 'center' },
  storyRingInner: { borderRadius: 999, overflow: 'hidden', backgroundColor: '#050508', borderWidth: 2, borderColor: '#050508' },
  storyAvatar: { width: '100%', height: '100%', borderRadius: 999 },
  avatarFallback: { flex: 1, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  countBadge: { position: 'absolute', top: 0, right: 4, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#050508' },
  countText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  storyUsername: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '700', marginTop: 8, maxWidth: 75, textAlign: 'center' },
  addStoryItem: { alignItems: 'center', width: 80 },
  addStoryContainer: { borderRadius: 999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  addStoryInner: { borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.03)' },
  addBadge: { position: 'absolute', bottom: 24, right: 4, zIndex: 10 },
  addBadgeGlass: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 4 },
  addStoryText: { color: '#fff', fontSize: 11, fontWeight: '800', marginTop: 8 },
});
