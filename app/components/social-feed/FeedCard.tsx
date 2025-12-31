import { updateStreakForContext } from '@/lib/streaks/streakManager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import MaskedView from '@react-native-masked-view/masked-view';
import { AVPlaybackStatus, ResizeMode, Video } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Alert,
  Dimensions,
  FlatList,
  GestureResponderEvent,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useActiveProfilePhoto } from '../../../hooks/use-active-profile-photo';
import { useUser } from '../../../hooks/use-user';
import { buildProfileScopedKey, getStoredActiveProfile } from '../../../lib/profileStorage';
import type { Comment, FeedCardItem } from '../../../types/social-feed';

type PlanTier = 'free' | 'plus' | 'premium';

type Props = {
  item: FeedCardItem;
  onLike: (id: FeedCardItem['id']) => void;
  onComment: (id: FeedCardItem['id'], text?: string) => void;
  onWatch: (id: FeedCardItem['id']) => void;
  onShare: (id: FeedCardItem['id']) => void;
  onBookmark: (id: FeedCardItem['id']) => void;
  onDelete?: (item: FeedCardItem) => void | Promise<void>;
  enableStreaks?: boolean;
  active?: boolean;
  currentPlan?: PlanTier;
};

// if your backend sometimes adds comment avatar fields, this keeps TS happy
type CommentWithAvatar = Comment & {
  avatar?: string | null;
  avatarUrl?: string | null;
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.72);
const MEDIA_HEIGHT = Math.round(SCREEN_HEIGHT * 0.75);

export default function FeedCard({
  item,
  onLike,
  onComment,
  onWatch,
  onShare,
  onBookmark,
  onDelete,
  enableStreaks,
  active,
  currentPlan,
}: Props) {
  const router = useRouter();
  const { user } = useUser();
  const activeProfilePhoto = useActiveProfilePhoto();

  const [chatBusy, setChatBusy] = useState(false);

  const [commentsVisible, setCommentsVisible] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [spoilerRevealed, setSpoilerRevealed] = useState<Record<string, boolean>>({});
  const [autoPlayFeedVideos, setAutoPlayFeedVideos] = useState(true);
  const [hideSpoilers, setHideSpoilers] = useState(true);
  const [reactionsVisible, setReactionsVisible] = useState(false);
  const [selectedReaction, setSelectedReaction] = useState<string>('');

  const heartAnim = useRef(new Animated.Value(0)).current;
  const lastTapRef = useRef(0);
  const tapTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [heartPosition, setHeartPosition] = useState({
    x: MEDIA_HEIGHT / 2,
    y: MEDIA_HEIGHT / 2,
  });

  const translateY = useRef(new Animated.Value(SHEET_MAX_HEIGHT)).current;

  const likers = item.likerAvatars?.slice(0, 3) ?? [];

  const userInitial = useMemo(
    () => item.user?.trim()?.charAt(0)?.toUpperCase() || 'W',
    [item.user]
  );

  // ✅ this matches ProfileScreen intent: check by UID
  const isOwnItem = !!user?.uid && !!item.userId && user.uid === item.userId;

  const confirmDelete = useCallback(() => {
    if (!isOwnItem || !onDelete) return;
    Alert.alert('Delete post?', 'This will remove it from your feed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          try {
            void onDelete(item);
          } catch {}
        },
      },
    ]);
  }, [isOwnItem, item, onDelete]);

  const fallbackAvatar =
    'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&q=80&w=1780&ixlib=rb-4.0.3';

  // ✅ EXACT ProfileScreen priority:
  // (own item ? activeProfilePhoto : null) || item.avatar || fallbackAvatar
  const resolveAvatarUri = (avatarFromItem?: string | null) =>
    (isOwnItem ? activeProfilePhoto : null) || avatarFromItem || fallbackAvatar;

  // AvatarBubble with profile navigation
  const AvatarBubble = ({ variant = 'default' }: { variant?: 'default' | 'overlay' }) => {
    const uri = resolveAvatarUri(item.avatar ?? null);
    return (
      <TouchableOpacity
        onPress={() => {
          if (!item.userId) return;
          // If already on this profile, do nothing
          router.push({ pathname: '/profile', params: { userId: item.userId, from: 'social-feed' } } as any);
        }}
        accessibilityLabel="View profile"
        accessibilityRole="button"
        style={variant === 'overlay' ? styles.avatarOverlay : styles.avatar}
      >
        <Image source={{ uri }} style={styles.avatarImage} />
      </TouchableOpacity>
    );
  };

  // 🔹 Video refs & state
  const videoRef = useRef<Video | null>(null);
  const [videoStatus, setVideoStatus] = useState<AVPlaybackStatus | null>(null);
  const [muted, setMuted] = useState(true);
  const hasPlayed = useRef(false);

  useEffect(() => {
    let mounted = true;
    const parseBool = (raw: string | null, fallback: boolean) => {
      if (raw == null) return fallback;
      try {
        const parsed = JSON.parse(raw);
        return typeof parsed === 'boolean' ? parsed : fallback;
      } catch {
        if (raw === 'true') return true;
        if (raw === 'false') return false;
        return fallback;
      }
    };

    (async () => {
      try {
        const profile = await getStoredActiveProfile();
        const feedKey = buildProfileScopedKey('socialSettings:autoPlayFeedVideos', profile?.id ?? undefined);
        const spoilerKey = buildProfileScopedKey('socialSettings:hideSpoilers', profile?.id ?? undefined);
        const [rawFeed, rawSpoilers] = await Promise.all([
          AsyncStorage.getItem(feedKey).catch(() => null),
          AsyncStorage.getItem(spoilerKey).catch(() => null),
        ]);
        if (!mounted) return;
        setAutoPlayFeedVideos(parseBool(rawFeed, true));
        setHideSpoilers(parseBool(rawSpoilers, true));
      } catch {
        if (!mounted) return;
        setAutoPlayFeedVideos(true);
        setHideSpoilers(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    hasPlayed.current = false;
    videoRef.current?.pauseAsync();
  }, [item.videoUrl]);

  useEffect(() => {
    if (autoPlayFeedVideos && active && item.videoUrl && videoRef.current && !hasPlayed.current) {
      videoRef.current
        .playAsync()
        .then(() => {
          hasPlayed.current = true;
        })
        .catch((e) => console.warn('FeedCard video play error', e));
    } else if ((!active || !autoPlayFeedVideos) && videoRef.current) {
      videoRef.current.pauseAsync();
      hasPlayed.current = false;
    }
  }, [active, autoPlayFeedVideos, item.videoUrl]);

  useEffect(() => {
    if (commentsVisible) {
      Animated.timing(translateY, { toValue: 0, duration: 260, useNativeDriver: true }).start();
    } else {
      Animated.timing(translateY, { toValue: SHEET_MAX_HEIGHT, duration: 200, useNativeDriver: true }).start();
    }
  }, [commentsVisible, translateY]);

  const openComments = useCallback(() => {
    setCommentsVisible(true);
    if (enableStreaks) void updateStreakForContext({ kind: 'feed_comment' });
  }, [enableStreaks]);

  const triggerHeart = () => {
    heartAnim.setValue(0);
    Animated.timing(heartAnim, {
      toValue: 1,
      duration: 3000,
      useNativeDriver: true,
    }).start();
  };

  const handleDoubleTap = () => {
    onLike(item.id);
    triggerHeart();
    if (enableStreaks) void updateStreakForContext({ kind: 'feed_like' });
  };

  const handleTap = (e: GestureResponderEvent) => {
    const now = Date.now();

    if (now - lastTapRef.current < 320) {
      if (tapTimeout.current) {
        clearTimeout(tapTimeout.current);
        tapTimeout.current = null;
      }
      const { locationX, locationY } = e.nativeEvent;
      setHeartPosition({ x: locationX, y: locationY });
      handleDoubleTap();
      lastTapRef.current = 0;
      return;
    }

    lastTapRef.current = now;
    tapTimeout.current = setTimeout(() => {
      onWatch(item.id);

      if (item.videoUrl) {
        const reelPayload = {
          id: String(item.id),
          mediaType: 'feed',
          title: (item.movie || item.review || 'Reel').slice(0, 120),
          docId: (item as any).docId ?? null,
          videoUrl: item.videoUrl,
          avatar: item.avatar ?? null,
          userId: item.userId ?? null,
          username: item.user ?? null,
          user: item.user ?? null,
          likes: item.likes ?? 0,
          commentsCount: item.commentsCount ?? 0,
          likerAvatars: [],
          music: `Original Sound - ${item.user ?? 'MovieFlix'}`,
        };

        router.push(
          {
            pathname: '/reels/feed',
            params: {
              id: String(item.id),
              list: JSON.stringify([reelPayload]),
              title: 'Reels',
            },
          } as any,
        );
      }
      tapTimeout.current = null;
    }, 320);
  };

  const heartScale = heartAnim.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 1.15, 0],
  });

  const heartOpacity = heartAnim.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0, 1, 0],
  });

  const closeSheets = () => {
    setCommentsVisible(false);
    Keyboard.dismiss();
    setNewComment('');
  };

  const submitComment = () => {
    const trimmed = newComment.trim();
    if (!trimmed) return;
    try {
      onComment(item.id, trimmed);
    } catch (err) {
      console.warn('Failed to submit comment', err);
    }
    setNewComment('');
    Keyboard.dismiss();
  };

  const renderCommentItem = ({ item: c }: { item: CommentWithAvatar }) => {
    const isSpoiler = !!c.spoiler;
    const revealed = !hideSpoilers || spoilerRevealed[String(c.id)];

    const commentAvatarUri = resolveAvatarUri(c.avatar ?? c.avatarUrl ?? null);

    return (
      <View style={styles.commentRow}>
        <View style={styles.commentAvatar}>
          <Image source={{ uri: commentAvatarUri }} style={styles.avatarImage} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.commentUser}>{c.user}</Text>

          {isSpoiler && !revealed ? (
            <TouchableOpacity
              style={styles.spoilerPill}
              onPress={() =>
                setSpoilerRevealed((prev) => ({
                  ...prev,
                  [String(c.id)]: true,
                }))
              }
            >
              <Text style={styles.spoilerText}>Spoiler – tap to reveal</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.commentText}>{c.text}</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardSheen} />

      {item.videoUrl ? (
        <Pressable style={styles.imageWrap} onPress={handleTap}>
          <Video
            ref={videoRef}
            source={{ uri: item.videoUrl }}
            style={styles.image}
            resizeMode={ResizeMode.COVER}
            isLooping
            isMuted={muted}
            onPlaybackStatusUpdate={(status) => setVideoStatus(status)}
            onError={(error) => {
              console.error('FeedCard video error', error);
              console.log('FeedCard video URL', item.videoUrl);
            }}
          />

          <LinearGradient colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.6)']} style={styles.imageGradient} />

          <Animated.View
            pointerEvents="none"
            style={[
              styles.heartBurst,
              {
                opacity: heartOpacity,
                transform: [{ scale: heartScale }],
                left: heartPosition.x - 48,
                top: heartPosition.y - 48,
              },
            ]}
          >
            <MaskedView maskElement={<Feather name="heart" size={96} color="#fff" />}>
              <LinearGradient
                colors={['#ff7a45', '#ff2d55']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heartGradient}
              />
            </MaskedView>
          </Animated.View>

          <View style={styles.imageOverlay}>
            <AvatarBubble variant="overlay" />
            <View style={{ flex: 1, paddingLeft: 12 }}>
              <Text style={styles.userOverlay}>{item.user}</Text>
              <Text style={styles.reviewOverlay} numberOfLines={2}>
                {item.review}
              </Text>
            </View>
            {isOwnItem && onDelete ? (
              <TouchableOpacity style={styles.menuBtnOverlay} onPress={confirmDelete}>
                <Feather name="trash-2" size={18} color="#fff" />
              </TouchableOpacity>
            ) : null}
            <View style={styles.heartCount}>
              <Feather name="heart" size={18} color="#fff" />
              <Text style={styles.heartText}>{item.likes}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.volumeToggle} onPress={() => setMuted((m) => !m)}>
            <Feather name={muted ? 'volume-x' : 'volume-2'} size={18} color="#fff" />
          </TouchableOpacity>
        </Pressable>
      ) : item.image ? (
        <Pressable style={styles.imageWrap} onPress={handleTap}>
          <Image source={item.image} style={styles.image} resizeMode="cover" />
          <LinearGradient colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.7)']} style={styles.imageGradient} />

          <Animated.View
            pointerEvents="none"
            style={[
              styles.heartBurst,
              {
                opacity: heartOpacity,
                transform: [{ scale: heartScale }],
                left: heartPosition.x - 48,
                top: heartPosition.y - 48,
              },
            ]}
          >
            <MaskedView maskElement={<Feather name="heart" size={96} color="#fff" />}>
              <LinearGradient
                colors={['#ff7a45', '#ff2d55']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heartGradient}
              />
            </MaskedView>
          </Animated.View>

          <View style={styles.imageOverlay}>
            <AvatarBubble variant="overlay" />
            <View style={{ flex: 1, paddingLeft: 12 }}>
              <Text style={styles.userOverlay}>{item.user}</Text>
              <Text style={styles.reviewOverlay} numberOfLines={2}>
                {item.review}
              </Text>
            </View>
            <View style={styles.heartCount}>
              <Feather name="heart" size={18} color="#fff" />
              <Text style={styles.heartText}>{item.likes}</Text>
            </View>
          </View>
        </Pressable>
      ) : null}

      <View style={styles.content}>
        {!item.image && !item.videoUrl && (
          <View style={styles.headerRow}>
            <AvatarBubble variant="default" />
            <View>
              <TouchableOpacity
                onPress={() => {
                  if (!item.userId) return;
                  router.push({ pathname: '/profile', params: { userId: item.userId, from: 'social-feed' } } as any);
                }}
                accessibilityLabel="View profile"
                accessibilityRole="button"
              >
                <Text style={styles.user}>{item.user}</Text>
              </TouchableOpacity>
              <Text style={styles.date}>{item.date}</Text>
            </View>
            {isOwnItem && onDelete ? (
              <TouchableOpacity style={styles.menuBtn} onPress={confirmDelete}>
                <Feather name="trash-2" size={18} color="#fff" />
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {!item.image && !item.videoUrl && <Text style={styles.review}>{item.review}</Text>}
        {item.movie && !item.image && !item.videoUrl ? <Text style={styles.movie}>Movie: {item.movie}</Text> : null}

        <View style={styles.actionsBar}>
          <TouchableOpacity style={styles.actionPill} onPress={() => onLike(item.id)}>
            <Feather name="heart" size={18} color={item.liked ? '#e50914' : '#fff'} />
            <Text style={styles.actionText}>{item.likes}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionPill} onPress={openComments}>
            <Feather name="message-circle" size={18} color="#fff" />
            <Text style={styles.actionText}>{item.commentsCount}</Text>
          </TouchableOpacity>

          {currentPlan !== 'free' && (
            <TouchableOpacity
              style={styles.actionPill}
              onPress={() => setReactionsVisible(!reactionsVisible)}
            >
              <Text style={styles.actionText}>😀</Text>
              <Text style={styles.actionText}>React</Text>
            </TouchableOpacity>
          )}

          {/* Chat button for direct messaging */}
          <TouchableOpacity
            style={styles.actionPill}
            disabled={chatBusy || !item.userId || isOwnItem}
            onPress={async () => {
              if (chatBusy) return;
              if (!user?.uid) {
                Alert.alert('Sign in required', 'Please sign in to message people from the feed.');
                return;
              }
              if (!item.userId || item.userId === user.uid) return;

              setChatBusy(true);
              try {
                const { findOrCreateConversation, getProfileById } = await import('../../messaging/controller');
                const profile = await getProfileById(String(item.userId));

                const conversationId = await findOrCreateConversation({
                  id: String(item.userId),
                  displayName: profile?.displayName || item.user || 'User',
                  photoURL: profile?.photoURL || item.avatar || fallbackAvatar,
                });

                router.push({ pathname: '/messaging/chat/[id]', params: { id: conversationId } } as any);
              } catch (e) {
                Alert.alert('Unable to start chat', 'Please try again in a moment.');
              } finally {
                setChatBusy(false);
              }
            }}
            accessibilityLabel="Message user"
            accessibilityRole="button"
          >
            <Feather name="message-square" size={18} color="#fff" />
            <Text style={styles.actionText}>Chat</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionPill} onPress={() => onShare(item.id)}>
            <Feather name="share-2" size={18} color="#fff" />
            <Text style={styles.actionText}>Share</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionPill} onPress={() => onBookmark(item.id)}>
            <MaterialIcons
              name={item.bookmarked ? 'bookmark' : 'bookmark-border'}
              size={20}
              color={item.bookmarked ? '#ffd700' : '#fff'}
            />
          </TouchableOpacity>
        </View>

        {reactionsVisible && currentPlan !== 'free' && (
          <View style={styles.reactionsBar}>
            {['❤️', '👍', '😄', '😮', '😢', '😡'].map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={styles.reactionButton}
                onPress={() => {
                  // TODO: Add reaction logic
                  setSelectedReaction(emoji);
                  setReactionsVisible(false);
                }}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <Modal visible={commentsVisible} animationType="none" transparent onRequestClose={closeSheets}>
        <Pressable style={styles.modalBackdrop} onPress={closeSheets} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }], height: SHEET_MAX_HEIGHT }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Comments</Text>

          <FlatList
            data={(item.comments ?? []) as CommentWithAvatar[]}
            keyExtractor={(c) => String(c.id)}
            renderItem={renderCommentItem}
            contentContainerStyle={{ paddingBottom: 20 }}
            style={{ flex: 1 }}
          />

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.commentInputRow}>
              <TextInput
                style={styles.commentInput}
                value={newComment}
                placeholder="Write a comment..."
                placeholderTextColor="#999"
                onChangeText={setNewComment}
                returnKeyType="send"
                onSubmitEditing={submitComment}
              />
              <TouchableOpacity onPress={submitComment} style={styles.sendBtn}>
                <Text style={styles.sendText}>Send</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 18,
    marginVertical: 8,
    marginHorizontal: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.16,
        shadowRadius: 24,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  cardSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.16)',
    opacity: 0.3,
  },
  imageWrap: { height: MEDIA_HEIGHT * 0.75, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  imageGradient: { ...StyleSheet.absoluteFillObject },
  volumeToggle: {
    position: 'absolute',
    right: 14,
    top: 14,
    padding: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  heartBurst: { position: 'absolute' },
  heartGradient: { width: 96, height: 96 },

  imageOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },

  avatarOverlay: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e50914',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#e50914',
    marginRight: 10,
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },

  userOverlay: { color: '#fff', fontWeight: '700' },
  reviewOverlay: { color: '#f5f5f5', fontSize: 12, marginTop: 2 },

  menuBtnOverlay: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },

  heartCount: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  heartText: { color: '#fff', marginLeft: 6 },

  content: { paddingHorizontal: 14, paddingVertical: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  menuBtn: {
    marginLeft: 'auto',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  user: { color: '#fff', fontWeight: '700' },
  date: { color: '#999', fontSize: 11, marginTop: 2 },
  review: { color: '#e6e6e6', marginTop: 6 },
  movie: { color: '#bfbfbf', marginTop: 4 },

  actionsBar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 10 },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  actionText: { color: '#fff', marginLeft: 8 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(18,18,20,0.92)',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 20,
  },
  sheetHandle: {
    width: 46,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetTitle: { color: '#fff', fontWeight: '800', fontSize: 16, marginBottom: 8 },

  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomColor: 'rgba(255,255,255,0.03)',
    borderBottomWidth: 1,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e50914',
    marginRight: 10,
    overflow: 'hidden',
  },
  commentUser: { color: '#fff', fontWeight: '700' },
  commentText: { color: '#d9d9d9', marginTop: 4 },

  spoilerPill: {
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(229,9,20,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.4)',
  },
  spoilerText: { color: '#fff', fontWeight: '600', fontSize: 12 },

  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 24,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  commentInput: { flex: 1, color: '#fff', paddingVertical: 6, paddingHorizontal: 8 },
  sendBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  sendText: { color: '#7dd8ff', fontWeight: '700' },

  reactionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 12,
  },
  reactionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  reactionEmoji: {
    fontSize: 18,
  },
});
