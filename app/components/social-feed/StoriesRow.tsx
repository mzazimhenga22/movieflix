import { updateStreakForContext } from '@/lib/streaks/streakManager';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
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

  // Responsive sizing
  const itemSize = width >= 420 ? 76 : 68;
  const ringSize = itemSize + 6;

  // Animations
  const entranceAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Entrance animation
    Animated.spring(entranceAnim, {
      toValue: 1,
      tension: 60,
      friction: 10,
      useNativeDriver: true,
    }).start();

    // Subtle pulse for add button
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    setStories(seedStories || []);
  }, [seedStories]);

  useEffect(() => {
    if (disableLiveFetch) return;

    const viewerId = (user as any)?.uid ? String((user as any).uid) : null;
    const cacheKey = `__movieflix_stories_row_v1:${viewerId || 'anon'}`;

    let cancelled = false;
    void (async () => {
      const cached = await getPersistedCache<any[]>(cacheKey, { maxAgeMs: 2 * 60 * 1000 });
      if (cancelled) return;
      if (cached?.value?.length) setStories(cached.value as any);
    })();

    const unsubscribe = onStoriesUpdateForViewer(
      (rawStories) => {
        const grouped: Record<string, any[]> = {};
        rawStories.forEach((s) => {
          const uid = s.userId || 'unknown';
          if (!grouped[uid]) grouped[uid] = [];
          grouped[uid].push(s);
        });

        const groups = Object.values(grouped)
          .map((list) => {
            const sorted = [...list].sort((a, b) => {
              const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
              const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
              return ta - tb;
            });
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
              media: sorted
                .filter((s) => !!(s?.photoURL || (s as any)?.mediaUrl))
                .slice(0, 40)
                .map((s) => ({
                  type: ((s as any)?.mediaType === 'video' ? 'video' : 'image') as 'image' | 'video',
                  uri: String(s.photoURL || (s as any)?.mediaUrl),
                  storyId: String(s.id),
                  caption: typeof s.caption === 'string' ? s.caption : undefined,
                  overlayText: typeof s.overlayText === 'string' ? s.overlayText : undefined,
                  liveStreamId: (s as any)?.liveStreamId ? String((s as any).liveStreamId) : null,
                  createdAtMs:
                    s.createdAt && typeof s.createdAt?.toMillis === 'function' ? s.createdAt.toMillis() : null,
                })),
            };
          })
          .filter(Boolean);

        setStories(groups as any);
        void setPersistedCache(cacheKey, groups as any);
        void setPersistedCache(`__movieflix_stories_archive_v1:${viewerId || 'anon'}`, groups as any);
      },
      { viewerId },
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [disableLiveFetch, user]);

  const handleStoryUpload = () => {
    deferNav(() => router.push('/story-upload'));
  };

  const handleStoryPress = (story: any) => {
    setPressedStory(story.id);
    deferNav(() => {
      router.push({
        pathname: '/story-viewer',
        params: {
          stories: JSON.stringify(stories),
          initialStoryId: String(story.id),
        },
      } as any);
    });
    void updateStreakForContext({
      kind: 'story',
      userId: story.userId,
      username: story.username,
    });
    setTimeout(() => setPressedStory(null), 300);
  };

  const StoryItem = ({ story, index }: { story: any; index: number }) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const colors = useMemo(() => getStoryColors(story.id), [story.id]);
    const isPressed = pressedStory === story.id;

    const handlePressIn = () => {
      Animated.spring(scaleAnim, {
        toValue: 0.92,
        tension: 100,
        friction: 10,
        useNativeDriver: true,
      }).start();
    };

    const handlePressOut = () => {
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 80,
        friction: 8,
        useNativeDriver: true,
      }).start();
    };

    return (
      <Animated.View
        style={{
          transform: [
            { scale: scaleAnim },
            {
              translateY: entranceAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [20, 0],
              }),
            },
          ],
          opacity: entranceAnim,
        }}
      >
        <TouchableOpacity
          style={styles.storyItem}
          activeOpacity={1}
          onPress={() => handleStoryPress(story)}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          accessibilityRole="button"
          accessibilityLabel={`${story.username}'s story`}
        >
          {/* Gradient ring */}
          <LinearGradient
            colors={colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.storyRing, { width: ringSize, height: ringSize }]}
          >
            <View style={[styles.storyRingInner, { width: itemSize, height: itemSize }]}>
              {story.avatar || story.photoURL ? (
                <Image
                  source={{ uri: story.avatar || story.photoURL }}
                  style={styles.storyAvatar}
                />
              ) : (
                <LinearGradient
                  colors={['rgba(40,40,50,1)', 'rgba(25,25,35,1)']}
                  style={styles.storyAvatar}
                >
                  <Ionicons name="person" size={24} color="rgba(255,255,255,0.5)" />
                </LinearGradient>
              )}
            </View>
          </LinearGradient>

          {/* Story count badge */}
          {story.storyCount > 1 && (
            <View style={[styles.countBadge, { backgroundColor: colors[0] }]}>
              <Text style={styles.countText}>{story.storyCount}</Text>
            </View>
          )}

          {/* Username */}
          <Text style={styles.storyUsername} numberOfLines={1}>
            {story.username}
          </Text>

          {/* Live indicator or time */}
          {story.isLive ? (
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          ) : (
            <Text style={styles.storyTime}>Tap to view</Text>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Section header */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="sparkles" size={16} color="#7dd8ff" />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {displayedStories.length > 0 && !hideSeeAll && (
          <TouchableOpacity style={styles.seeAllBtn} activeOpacity={0.7}>
            <Text style={styles.seeAllText}>See all</Text>
            <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
      >
        {/* Add Story button */}
        {showAddStory && (
          <Animated.View
            style={{
              transform: [{ scale: pulseAnim }],
              opacity: entranceAnim,
            }}
          >
            <TouchableOpacity
              onPress={handleStoryUpload}
              style={styles.addStoryItem}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Add your story"
            >
              {/* Glass background */}
              <View style={[styles.addStoryRing, { width: ringSize, height: ringSize }]}>
                {Platform.OS === 'ios' ? (
                  <BlurView intensity={20} tint="dark" style={styles.addStoryBlur}>
                    <View style={[styles.addStoryInner, { width: itemSize, height: itemSize }]}>
                      <LinearGradient
                        colors={['rgba(229,9,20,0.3)', 'rgba(255,107,53,0.2)']}
                        style={styles.addStoryGradient}
                      >
                        <Ionicons name="add" size={28} color="#fff" />
                      </LinearGradient>
                    </View>
                  </BlurView>
                ) : (
                  <View style={styles.addStoryAndroid}>
                    <View style={[styles.addStoryInner, { width: itemSize, height: itemSize }]}>
                      <LinearGradient
                        colors={['rgba(229,9,20,0.4)', 'rgba(255,107,53,0.3)']}
                        style={styles.addStoryGradient}
                      >
                        <Ionicons name="add" size={28} color="#fff" />
                      </LinearGradient>
                    </View>
                  </View>
                )}
              </View>

              {/* Plus badge */}
              <View style={styles.addBadge}>
                <LinearGradient
                  colors={['#e50914', '#ff6b35']}
                  style={styles.addBadgeGradient}
                >
                  <Ionicons name="add" size={12} color="#fff" />
                </LinearGradient>
              </View>

              <Text style={styles.addStoryText}>Your story</Text>
              <Text style={styles.addStorySubtext}>Add new</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Story items */}
        {displayedStories.map((story, index) => (
          <StoryItem key={story.id} story={story} index={index} />
        ))}

        {/* Empty state */}
        {displayedStories.length === 0 && !showAddStory && (
          <View style={styles.emptyState}>
            <Ionicons name="images-outline" size={32} color="rgba(255,255,255,0.3)" />
            <Text style={styles.emptyText}>{emptyHint}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 2,
    gap: 14,
  },

  // Story item
  storyItem: {
    alignItems: 'center',
    width: 80,
  },
  storyRing: {
    borderRadius: 999,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyRingInner: {
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#0a0a0f',
    borderWidth: 2,
    borderColor: '#0a0a0f',
  },
  storyAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadge: {
    position: 'absolute',
    top: 0,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0a0a0f',
  },
  countText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  storyUsername: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
    maxWidth: 75,
    textAlign: 'center',
  },
  storyTime: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9,
    marginTop: 2,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e50914',
  },
  liveText: {
    color: '#e50914',
    fontSize: 9,
    fontWeight: '800',
  },

  // Add story
  addStoryItem: {
    alignItems: 'center',
    width: 80,
  },
  addStoryRing: {
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    borderStyle: 'dashed',
  },
  addStoryBlur: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addStoryAndroid: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,30,40,0.8)',
  },
  addStoryInner: {
    borderRadius: 999,
    overflow: 'hidden',
  },
  addStoryGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBadge: {
    position: 'absolute',
    bottom: 28,
    right: 8,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#0a0a0f',
  },
  addBadgeGradient: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addStoryText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
  },
  addStorySubtext: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9,
    marginTop: 2,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 20,
    gap: 8,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
});
