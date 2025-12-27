import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    Image,
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { firestore } from '../../constants/firebase';
import { getAccentFromPosterPath } from '../../constants/theme';
import { useUser } from '../../hooks/use-user';
import { useAccent } from '../components/AccentContext';
import { findOrCreateConversation, sendMessage, type Profile } from '../messaging/controller';

interface StoryDoc {
  photoURL: string;
  username?: string;
  caption?: string;
  overlayText?: string;
  userId?: string;
  createdAt?: any;
  userAvatar?: string | null;
}

const StoryScreen = () => {
  const { user } = useUser();
  const { id, photoURL: fallbackPhoto } = useLocalSearchParams();
  const router = useRouter();
  const [stories, setStories] = useState<(StoryDoc & { id: string })[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [replyText, setReplyText] = useState('');
  const progress = useRef(new Animated.Value(0)).current;
  const durationMs = 30000; // 30 seconds per story
  const { width } = Dimensions.get('window');
  const progressValueRef = useRef(0);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const viewerId = (user as any)?.uid ?? null;
  const STORY_WINDOW_MS = 24 * 60 * 60 * 1000;
  const { setAccentColor } = useAccent();

  useEffect(() => {
    const fetchStories = async () => {
      if (!id) return;
      try {
        const ref = doc(firestore, 'stories', String(id));
        const snap = await getDoc(ref);
        if (!snap.exists() && fallbackPhoto) {
          setStories([{ id: String(id), photoURL: String(fallbackPhoto) }]);
          setCurrentIndex(0);
          return;
        }

        if (snap.exists()) {
          const base = snap.data() as StoryDoc;
          const userId = base.userId;

          if (userId) {
            // Fetch all stories for this user in time order
            const storiesRef = collection(firestore, 'stories');
            // Fetch all stories for this user, then sort client-side by createdAt
            const q = query(storiesRef, where('userId', '==', userId));
            const listSnap = await getDocs(q);
            const unsorted: (StoryDoc & { id: string })[] = listSnap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as StoryDoc),
            }));
            const list = unsorted.sort((a, b) => {
              const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
              const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
              return ta - tb;
            });
            setStories(list);
            // Always start from the earliest story in the set
            setCurrentIndex(0);
          } else {
            setStories([{ id: snap.id, ...(base as StoryDoc) }]);
            setCurrentIndex(0);
          }
        } else if (fallbackPhoto) {
          setStories([{ id: String(id), photoURL: String(fallbackPhoto) }]);
          setCurrentIndex(0);
        }
      } catch (e) {
        console.warn('Failed to load story doc', e);
        if (fallbackPhoto) {
          setStories([{ id: String(id), photoURL: String(fallbackPhoto) }]);
          setCurrentIndex(0);
        }
      }
    };
    fetchStories();
  }, [id, fallbackPhoto]);

  const currentStory = stories[currentIndex];
  const imageUri = currentStory?.photoURL || (fallbackPhoto as string | undefined);

  const startProgress = useCallback(
    (fromValue = 0) => {
      progressValueRef.current = fromValue;
      progress.setValue(fromValue);
      animationRef.current?.stop();
      const remaining = Math.max(50, (1 - fromValue) * durationMs);
      animationRef.current = Animated.timing(progress, {
        toValue: 1,
        duration: remaining,
        useNativeDriver: false,
      });
      animationRef.current.start(({ finished }) => {
        if (finished) {
          handleNext();
        }
      });
    },
    [durationMs]
  );

  useEffect(() => {
    if (stories.length > 0) {
      startProgress(0);
    }
  }, [currentIndex, stories.length, startProgress]);

  useEffect(() => {
    return () => {
      animationRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (currentStory?.photoURL) {
      const accent = getAccentFromPosterPath(currentStory.photoURL);
      if (accent) {
        setAccentColor(accent);
      }
    }
  }, [currentStory?.photoURL, setAccentColor]);

  const handleNext = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex((idx) => idx + 1);
    } else {
      router.back();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((idx) => idx - 1);
    } else {
      router.back();
    }
  };

  const handleTap = (evt: any) => {
    const x = evt.nativeEvent.locationX;
    if (x < width / 2) {
      handlePrev();
    } else {
      handleNext();
    }
  };

  const handlePressIn = () => {
      progress.stopAnimation((value) => {
        progressValueRef.current = value ?? 0;
      });
  };

  const handlePressOut = () => {
    if (stories.length === 0) return;
    startProgress(progressValueRef.current);
  };

  const handleSendReply = useCallback(async () => {
    if (!replyText.trim() || !currentStory?.userId) return;
    try {
      const target: Profile = {
        id: currentStory.userId,
        displayName: currentStory.username || 'Story user',
        photoURL: currentStory.photoURL || '',
      } as any;
      const conversationId = await findOrCreateConversation(target);
      await sendMessage(conversationId, {
        text: replyText.trim(),
      });
      setReplyText('');
      router.push(`/messaging/chat/${conversationId}`);
    } catch (e) {
      console.warn('Failed to send story reply', e);
    }
  }, [currentStory?.photoURL, currentStory?.userId, currentStory?.username, replyText, router]);

  const handleQuickReaction = useCallback(
    async (reaction: string) => {
      if (!currentStory?.userId) return;
      try {
        const target: Profile = {
          id: currentStory.userId,
          displayName: currentStory.username || 'Story user',
          photoURL: currentStory.photoURL || '',
        } as any;
        const conversationId = await findOrCreateConversation(target);
        await sendMessage(conversationId, {
          text: reaction,
        });
        router.push(`/messaging/chat/${conversationId}`);
      } catch (e) {
        console.warn('Failed to send quick reaction', e);
      }
    },
    [currentStory?.photoURL, currentStory?.userId, currentStory?.username, router]
  );

  if (!imageUri) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#fff' }}>Story not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.header} />

      {/* Progress bars */}
      <View style={styles.progressRow}>
        {stories.map((s, index) => {
          const barWidth =
            index < currentIndex
              ? '100%'
              : index === currentIndex
              ? progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                })
              : '0%';
          return (
            <View key={s.id} style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { width: barWidth }]} />
            </View>
          );
        })}
      </View>

      {/* Header block below progress bar: avatar, back button and actions */}
      <SafeAreaView style={styles.headerBelow}>
        <View style={styles.headerRowBelow}>
          <View style={styles.headerUserBlock}>
            <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
              <Ionicons name="chevron-back" size={26} color="white" />
            </TouchableOpacity>
            <View style={styles.headerUserRow}>
              {currentStory?.photoURL ? (
                <Image source={{ uri: currentStory.photoURL }} style={styles.headerAvatar} />
              ) : (
                <View style={[styles.headerAvatar, { backgroundColor: '#333' }]} />
              )}
              <View>
                {currentStory?.username ? (
                  <Text style={styles.headerName}>{currentStory.username}</Text>
                ) : null}
                <Text style={styles.headerMeta}>
                  {stories.length > 0 ? `${currentIndex + 1}/${stories.length}` : ''}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerActionBtn}>
              <Ionicons name="volume-high-outline" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerActionBtn}>
              <Ionicons name="ellipsis-horizontal" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      <Pressable
        style={styles.tapLayer}
        onPress={handleTap}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <View style={styles.storyMedia}>
          <Image source={{ uri: imageUri }} style={styles.storyImage} resizeMode="cover" />
          <LinearGradient
            colors={['rgba(0,0,0,0.85)', 'transparent']}
            style={styles.mediaGradientTop}
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.85)']}
            style={styles.mediaGradientBottom}
          />
        </View>

        {currentStory?.overlayText ? (
          <View style={styles.overlayTextChip}>
            <Text style={styles.overlayText}>{currentStory.overlayText}</Text>
          </View>
        ) : null}

        {currentStory?.caption ? (
          <View style={styles.captionBar}>
            {currentStory?.username ? (
              <Text style={styles.captionUsername}>{currentStory.username}</Text>
            ) : null}
            <Text style={styles.captionText}>{currentStory.caption}</Text>
          </View>
        ) : null}

        <View style={styles.reactionsRow}>
          {['👍', '😍', '😂', '🔥'].map((emoji) => (
            <TouchableOpacity key={emoji} style={styles.reactionBtn} onPress={() => handleQuickReaction(emoji)}>
              <Text style={styles.reactionText}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.replyBar}>
          <Ionicons name="happy-outline" size={20} color="rgba(255,255,255,0.7)" />
          <TextInput
            style={styles.replyInput}
            placeholder="Send a message"
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={replyText}
            onChangeText={(text) => {
              setReplyText(text);
            }}
            returnKeyType="send"
            onSubmitEditing={handleSendReply}
          />
          <TouchableOpacity onPress={handleSendReply} style={styles.replySendBtn}>
            <Ionicons name="send" size={20} color="#25D366" />
          </TouchableOpacity>
        </View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    zIndex: 3,
  },
  headerBelow: {
    position: 'absolute',
    top: 68,
    left: 12,
    right: 12,
    zIndex: 4,
  },
  headerRowBelow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  storyImage: {
    width: '100%',
    height: '100%',
  },
  storyMedia: {
    flex: 1,
  },
  mediaGradientTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 180,
  },
  mediaGradientBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 200,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  headerUserBlock: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButton: {
    paddingVertical: 4,
    paddingRight: 12,
    paddingLeft: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerActionBtn: {
    marginLeft: 10,
    padding: 6,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  headerName: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  headerMeta: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
  },
  tapLayer: {
    flex: 1,
  },
  progressRow: {
    position: 'absolute',
    top: 58,
    left: 12,
    right: 12,
    zIndex: 2,
    flexDirection: 'row',
    gap: 4,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#fff',
  },
  overlayTextChip: {
    position: 'absolute',
    top: '22%',
    left: 24,
    right: 24,
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 18,
  },
  overlayText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  captionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 120,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  captionUsername: {
    color: '#fff',
    fontWeight: '700',
    marginBottom: 2,
  },
  captionText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
  },
  reactionsRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 70,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  reactionBtn: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  reactionText: {
    fontSize: 18,
    color: '#fff',
  },
  replyBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    zIndex: 8,
  },
  replyInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  replySendBtn: {
    paddingLeft: 8,
  },
});

export default StoryScreen;
