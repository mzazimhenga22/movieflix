import { updateStreakForContext } from '@/lib/streaks/streakManager';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions,
    Animated,
} from 'react-native';
import { onStoriesUpdate } from './storiesController';

interface Props {
  showAddStory?: boolean;
}

export default function StoriesRow({ showAddStory = false }: Props) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [stories, setStories] = useState<any[]>([]);
  const [pressedStory, setPressedStory] = useState<string | null>(null);

  // make item spacing responsive a bit
  const itemSize = width >= 420 ? 98 : 84;
  const avatarInner = Math.round(itemSize * 0.74);
  const ringSize = itemSize + 8;

  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const unsubscribe = onStoriesUpdate((rawStories) => {
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
            photoURL: last?.photoURL ?? null,
            avatar: last?.userAvatar ?? last?.avatar ?? null,
            media: sorted
              .filter((s) => !!s?.photoURL)
              .slice(0, 40)
              .map((s) => ({
                type: 'image' as const,
                uri: String(s.photoURL),
                storyId: String(s.id),
                caption: typeof s.caption === 'string' ? s.caption : undefined,
                overlayText: typeof s.overlayText === 'string' ? s.overlayText : undefined,
              })),
          };
        })
        .filter(Boolean);

      setStories(groups as any);
    });
    return () => unsubscribe();
  }, []);

  const handleStoryUpload = () => {
    router.push('/story-upload');
  };

  const handleStoryPress = (story: any) => {
    setPressedStory(story.id);
    // Add haptic feedback here if available
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.95, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start(() => {
      router.push({
        pathname: '/story-viewer',
        params: {
          stories: JSON.stringify(stories),
          initialStoryId: String(story.id),
        },
      } as any);
      void updateStreakForContext({
        kind: 'story',
        userId: story.userId,
        username: story.username,
      });
      setPressedStory(null);
    });
  };

  const formatTimeAgo = (timestamp: any) => {
    if (!timestamp) return '';
    const now = Date.now();
    const storyTime = timestamp?.toMillis ? timestamp.toMillis() : timestamp;
    const diff = now - storyTime;
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (hours < 1) return 'now';
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollViewContent}
      >
        {showAddStory && (
          <TouchableOpacity
            onPress={() => {
              handleStoryUpload();
            }}
            style={styles.storyCard}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Add your story"
          >
            <LinearGradient
              colors={['#3d3d3d', '#1c1c1c']}
              style={[styles.statusRing, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }]}
            >
              <View
                style={[
                  styles.avatarInnerWrap,
                  {
                    width: avatarInner,
                    height: avatarInner,
                    borderRadius: avatarInner / 2,
                  },
                ]}
              >
                <View
                  style={[
                    styles.avatar,
                    {
                      width: avatarInner,
                      height: avatarInner,
                      borderRadius: avatarInner / 2,
                    },
                  ]}
                />
                <View style={styles.plusBtn}>
                  <Ionicons name="add" size={16} color="#fff" />
                </View>
              </View>
            </LinearGradient>
            <Text style={styles.storyText} numberOfLines={1}>
              Your story
            </Text>
            <Text style={styles.smallText}>Tap to add</Text>
          </TouchableOpacity>
        )}

        {/* Other Stories */}
        {stories.map((story) => (
          <Animated.View
            key={story.id}
            style={{
              transform: [{ scale: pressedStory === story.id ? scaleAnim : 1 }],
            }}
          >
            <TouchableOpacity
              style={styles.storyCard}
              activeOpacity={0.92}
              accessibilityRole="button"
              accessibilityLabel={`${story.username}'s story`}
              onPress={() => handleStoryPress(story)}
            >
              <LinearGradient
                colors={
                  pressedStory === story.id
                    ? ['#128C7E', '#25D366']
                    : ['#25D366', '#128C7E']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.statusRing, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }]}
              >
                <View
                  style={[
                    styles.avatarInnerWrap,
                    {
                      width: avatarInner,
                      height: avatarInner,
                      borderRadius: avatarInner / 2,
                    },
                  ]}
                >
                  {story.photoURL ? (
                    <Image
                      source={{ uri: story.photoURL }}
                      style={[
                        styles.avatarImage,
                        { width: avatarInner, height: avatarInner, borderRadius: avatarInner / 2 },
                      ]}
                    />
                  ) : (
                    <View
                      style={[
                        styles.avatar,
                        { width: avatarInner, height: avatarInner, borderRadius: avatarInner / 2 },
                      ]}
                    />
                  )}
                </View>
              </LinearGradient>
              <Text style={styles.storyText} numberOfLines={1}>
                {story.username}
              </Text>
              <View style={styles.metaRow}>
                <View style={[styles.metaDot, pressedStory === story.id && styles.metaDotActive]} />
                <Text style={styles.metaText}>
                  {pressedStory === story.id ? 'Loading...' : 'Tap to view'}
                </Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  scrollViewContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  storyCard: {
    alignItems: 'center',
    marginRight: 18,
  },
  statusRing: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  avatarInnerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatar: {
    width: '100%',
    height: '100%',
    backgroundColor: '#2f2f2f',
  },
  plusBtn: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    backgroundColor: '#25D366',
    borderRadius: 16,
    padding: 6,
    borderWidth: 2,
    borderColor: '#050505',
  },
  storyText: {
    color: '#fff',
    fontSize: 13,
    marginTop: 10,
    fontWeight: '700',
    maxWidth: 110,
    textAlign: 'center',
  },
  smallText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  metaDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#25D366',
    marginRight: 6,
  },
  metaDotActive: {
    backgroundColor: '#FFD700',
  },
  metaText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
  },
});
