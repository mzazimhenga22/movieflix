import { updateStreakForContext } from '@/lib/streaks/streakManager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather, Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import MaskedView from '@react-native-masked-view/masked-view';
import { AVPlaybackStatus, ResizeMode, Video } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
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
import { useNavigationGuard } from '@/hooks/use-navigation-guard';
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

type CommentWithAvatar = Comment & {
  avatar?: string | null;
  avatarUrl?: string | null;
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.72);
const MEDIA_HEIGHT = Math.round(SCREEN_HEIGHT * 0.65);

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
  const { deferNav } = useNavigationGuard({ cooldownMs: 900 });
  const { user } = useUser();
  const activeProfilePhoto = useActiveProfilePhoto();

  const [chatBusy, setChatBusy] = useState(false);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [spoilerRevealed, setSpoilerRevealed] = useState<Record<string, boolean>>({});
  const [autoPlayFeedVideos, setAutoPlayFeedVideos] = useState(true);
  const [hideSpoilers, setHideSpoilers] = useState(true);

  const heartAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const merchAnim = useRef(new Animated.Value(0)).current;
  const lastTapRef = useRef(0);
  const tapTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [heartPosition, setHeartPosition] = useState({ x: SCREEN_WIDTH / 2, y: MEDIA_HEIGHT / 2 });
  const translateY = useRef(new Animated.Value(SHEET_MAX_HEIGHT)).current;

  const likers = item.likerAvatars?.slice(0, 3) ?? [];
  const isOwnItem = !!user?.uid && !!item.userId && user.uid === item.userId;

  // Cinematic glow pulse
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    );
    pulse.start();
    
    if (item.movie) {
      Animated.sequence([
        Animated.delay(1000),
        Animated.spring(merchAnim, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true })
      ]).start();
    }

    return () => pulse.stop();
  }, [glowAnim, item.movie]);

  const triggerHaptic = useCallback((type: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(type);
    }
  }, []);

  const confirmDelete = useCallback(() => {
    if (!isOwnItem || !onDelete) return;
    Alert.alert('Delete post?', 'This will remove it from your feed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void onDelete(item) },
    ]);
  }, [isOwnItem, item, onDelete]);

  const fallbackAvatar = 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&q=80&w=1780';
  const resolveAvatarUri = (avatarFromItem?: string | null) =>
    (isOwnItem ? activeProfilePhoto : null) || avatarFromItem || fallbackAvatar;

  const AvatarBubble = ({ variant = 'default', size = 40 }: { variant?: 'default' | 'overlay'; size?: number }) => {
    const uri = resolveAvatarUri(item.avatar ?? null);
    return (
      <TouchableOpacity
        onPress={() => {
          if (!item.userId) return;
          deferNav(() => router.push({ pathname: '/profile', params: { userId: item.userId, from: 'social-feed' } } as any));
        }}
        style={[styles.avatarContainer, { width: size, height: size, borderRadius: size / 2 }]}
      >
        <LinearGradient colors={['#e50914', '#ff6b35', '#ffd700']} style={styles.avatarGradient}>
          <View style={[styles.avatarInner, { width: size - 4, height: size - 4, borderRadius: (size - 4) / 2 }]}>
            <Image source={{ uri }} style={styles.avatarImage} />
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  const videoRef = useRef<Video | null>(null);
  const [videoStatus, setVideoStatus] = useState<AVPlaybackStatus | null>(null);
  const [muted, setMuted] = useState(true);
  const hasPlayed = useRef(false);

  const showVideoThumb = useMemo(() => {
    const s: any = videoStatus as any;
    return !s?.isLoaded;
  }, [videoStatus]);

  useEffect(() => {
    let mounted = true;
    const parseBool = (raw: string | null, fallback: boolean) => {
      if (raw == null) return fallback;
      try {
        const parsed = JSON.parse(raw);
        return typeof parsed === 'boolean' ? parsed : fallback;
      } catch {
        return raw === 'true' ? true : raw === 'false' ? false : fallback;
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
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    hasPlayed.current = false;
    videoRef.current?.pauseAsync();
  }, [item.videoUrl]);

  useEffect(() => {
    if (autoPlayFeedVideos && active && item.videoUrl && videoRef.current && !hasPlayed.current) {
      videoRef.current.playAsync().then(() => { hasPlayed.current = true; }).catch(() => {});
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
    Animated.timing(heartAnim, { toValue: 1, duration: 2500, useNativeDriver: true }).start();
  };

  const handleDoubleTap = () => {
    onLike(item.id);
    triggerHaptic(Haptics.ImpactFeedbackStyle.Heavy);
    triggerHeart();
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.95, duration: 100, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 3, useNativeDriver: true }),
    ]).start();
    if (enableStreaks) void updateStreakForContext({ kind: 'feed_like' });
  };

  const handleTap = (e: GestureResponderEvent) => {
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      if (tapTimeout.current) { clearTimeout(tapTimeout.current); tapTimeout.current = null; }
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
        deferNav(() => {
          router.push({ pathname: '/reels/feed', params: { id: String(item.id), list: JSON.stringify([reelPayload]), title: 'Reels' } } as any);
        });
      }
      tapTimeout.current = null;
    }, 320);
  };

  const heartScale = heartAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1.2, 0] });
  const heartOpacity = heartAnim.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] });

  const closeSheets = () => { setCommentsVisible(false); Keyboard.dismiss(); setNewComment(''); };

  const submitComment = () => {
    const trimmed = newComment.trim();
    if (!trimmed) return;
    try { onComment(item.id, trimmed); } catch {}
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
            <TouchableOpacity style={styles.spoilerPill} onPress={() => setSpoilerRevealed((prev) => ({ ...prev, [String(c.id)]: true }))}>
              <Text style={styles.spoilerText}>Spoiler – tap to reveal</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.commentText}>{c.text}</Text>
          )}
        </View>
      </View>
    );
  };

  const formatLikes = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
      {/* Cinematic frame glow */}
      <Animated.View style={[styles.frameGlow, { opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.6] }) }]} />
      
      {/* Film strip decoration */}
      <View style={styles.filmStripTop}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} style={styles.filmHole} />
        ))}
      </View>

      {item.videoUrl || item.image ? (
        <Pressable style={styles.mediaWrap} onPress={handleTap}>
          {item.videoUrl ? (
            <>
              <Video
                ref={videoRef}
                source={{ uri: item.videoUrl }}
                style={styles.media}
                resizeMode={ResizeMode.COVER}
                isLooping
                isMuted={muted}
                onPlaybackStatusUpdate={(status) => setVideoStatus(status)}
              />
              {showVideoThumb && (
                <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
                  <Image source={{ uri: resolveAvatarUri(item.avatar ?? null) }} style={[styles.media, { opacity: 0.5 }]} resizeMode="cover" blurRadius={20} />
                </View>
              )}
            </>
          ) : (
            <Image source={item.image!} style={styles.media} resizeMode="cover" />
          )}

          {/* Cinematic gradient overlays */}
          <LinearGradient colors={['rgba(0,0,0,0.7)', 'transparent', 'transparent']} locations={[0, 0.3, 1]} style={styles.topGradient} />
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} locations={[0.4, 1]} style={styles.bottomGradient} />

          {/* Letterbox bars for cinematic feel */}
          <View style={styles.letterboxTop} />
          <View style={styles.letterboxBottom} />

          {/* Heart burst animation */}
          <Animated.View pointerEvents="none" style={[styles.heartBurst, { opacity: heartOpacity, transform: [{ scale: heartScale }], left: heartPosition.x - 52, top: heartPosition.y - 52 }]}>
            <MaskedView maskElement={<Ionicons name="heart" size={104} color="#fff" />}>
              <LinearGradient colors={['#ff2d55', '#ff6b35', '#ffd700']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heartGradient} />
            </MaskedView>
          </Animated.View>

          {/* Top bar with user info */}
          <View style={styles.topBar}>
            <AvatarBubble size={38} />
            <View style={styles.userInfo}>
              <Text style={styles.username}>{item.user}</Text>
              <Text style={styles.timestamp}>{item.date}</Text>
            </View>
            {item.videoUrl && (
              <TouchableOpacity 
                style={styles.volumeBtn} 
                onPress={() => {
                  triggerHaptic();
                  setMuted((m) => !m);
                }}
              >
                <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color="#fff" />
              </TouchableOpacity>
            )}
            {isOwnItem && onDelete && (
              <TouchableOpacity style={styles.menuBtn} onPress={confirmDelete}>
                <Ionicons name="trash-outline" size={18} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          {/* Discover Merch Button (New!) */}
          {item.movie && (
            <Animated.View 
              style={[
                styles.merchCtaContainer,
                {
                  opacity: merchAnim,
                  transform: [
                    { translateX: merchAnim.interpolate({ inputRange: [0, 1], outputRange: [-100, 0] }) }
                  ]
                }
              ]}
            >
              <TouchableOpacity 
                style={styles.merchCta}
                onPress={() => {
                  triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
                  deferNav(() => router.push(`/marketplace?category=merch&query=${encodeURIComponent(item.movie!)}` as any));
                }}
              >
                <LinearGradient
                  colors={['rgba(255,215,0,0.9)', 'rgba(255,140,0,0.9)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.merchGradient}
                >
                  <MaterialCommunityIcons name="shopping" size={16} color="#000" />
                  <Text style={styles.merchText}>Shop Merch</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Bottom content overlay */}
          <View style={styles.bottomOverlay}>
            {item.movie && (
              <TouchableOpacity 
                style={styles.movieBadge}
                onPress={() => deferNav(() => router.push(`/marketplace?query=${encodeURIComponent(item.movie!)}` as any))}
              >
                <Ionicons name="film" size={12} color="#ffd700" />
                <Text style={styles.movieText}>{item.movie}</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.reviewText} numberOfLines={3}>{item.review}</Text>
            
            {/* Likers row */}
            {likers.length > 0 && (
              <View style={styles.likersRow}>
                <View style={styles.likerAvatars}>
                  {likers.map((source, i) => (
                    <Image key={i} source={source} style={[styles.likerAvatar, { marginLeft: i > 0 ? -8 : 0, zIndex: 3 - i }]} />
                  ))}
                </View>
                <Text style={styles.likersText}>Liked by {formatLikes(item.likes)} others</Text>
              </View>
            )}
          </View>

          {/* Side action bar - Instagram Reels style */}
          <View style={styles.sideActions}>
            <TouchableOpacity 
              style={styles.sideActionBtn} 
              onPress={() => {
                triggerHaptic(item.liked ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
                onLike(item.id);
              }}
            >
              <Ionicons name={item.liked ? 'heart' : 'heart-outline'} size={28} color={item.liked ? '#ff2d55' : '#fff'} />
              <Text style={styles.sideActionText}>{formatLikes(item.likes)}</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.sideActionBtn} 
              onPress={() => {
                triggerHaptic();
                openComments();
              }}
            >
              <Ionicons name="chatbubble-outline" size={26} color="#fff" />
              <Text style={styles.sideActionText}>{item.commentsCount}</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.sideActionBtn} 
              onPress={() => {
                triggerHaptic();
                onShare(item.id);
              }}
            >
              <Ionicons name="paper-plane-outline" size={26} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.sideActionBtn} 
              onPress={() => {
                triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
                onBookmark(item.id);
              }}
            >
              <Ionicons name={item.bookmarked ? 'bookmark' : 'bookmark-outline'} size={26} color={item.bookmarked ? '#ffd700' : '#fff'} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sideActionBtn}
              disabled={chatBusy || !item.userId || isOwnItem}
              onPress={async () => {
                if (chatBusy || !user?.uid || !item.userId || item.userId === user.uid) return;
                setChatBusy(true);
                try {
                  const { findOrCreateConversation, getProfileById } = await import('../../messaging/controller');
                  const profile = await getProfileById(String(item.userId));
                  const conversationId = await findOrCreateConversation({
                    id: String(item.userId),
                    displayName: profile?.displayName || item.user || 'User',
                    photoURL: profile?.photoURL || item.avatar || fallbackAvatar,
                  });
                  deferNav(() => router.push({ pathname: '/messaging/chat/[id]', params: { id: conversationId } } as any));
                } catch { Alert.alert('Unable to start chat'); }
                finally { setChatBusy(false); }
              }}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </Pressable>
      ) : (
        // Text-only post
        <View style={styles.textOnlyCard}>
          <View style={styles.textOnlyHeader}>
            <AvatarBubble size={44} />
            <View style={styles.userInfo}>
              <Text style={styles.username}>{item.user}</Text>
              <Text style={styles.timestamp}>{item.date}</Text>
            </View>
            {isOwnItem && onDelete && (
              <TouchableOpacity style={styles.menuBtn} onPress={confirmDelete}>
                <Ionicons name="trash-outline" size={18} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.textOnlyReview}>{item.review}</Text>
          {item.movie && (
            <View style={styles.movieBadgeInline}>
              <Ionicons name="film" size={14} color="#ffd700" />
              <Text style={styles.movieTextInline}>{item.movie}</Text>
            </View>
          )}
          <View style={styles.textOnlyActions}>
            <TouchableOpacity 
              style={styles.actionChip} 
              onPress={() => {
                triggerHaptic(item.liked ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
                onLike(item.id);
              }}
            >
              <Ionicons name={item.liked ? 'heart' : 'heart-outline'} size={20} color={item.liked ? '#ff2d55' : '#fff'} />
              <Text style={styles.actionChipText}>{formatLikes(item.likes)}</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.actionChip} 
              onPress={() => {
                triggerHaptic();
                openComments();
              }}
            >
              <Ionicons name="chatbubble-outline" size={20} color="#fff" />
              <Text style={styles.actionChipText}>{item.commentsCount}</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.actionChip} 
              onPress={() => {
                triggerHaptic();
                onShare(item.id);
              }}
            >
              <Ionicons name="share-outline" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.actionChip} 
              onPress={() => {
                triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
                onBookmark(item.id);
              }}
            >
              <Ionicons name={item.bookmarked ? 'bookmark' : 'bookmark-outline'} size={20} color={item.bookmarked ? '#ffd700' : '#fff'} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Film strip decoration bottom */}
      <View style={styles.filmStripBottom}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} style={styles.filmHole} />
        ))}
      </View>

      {/* Comments Modal */}
      <Modal visible={commentsVisible} animationType="none" transparent onRequestClose={closeSheets}>
        <Pressable style={styles.modalBackdrop} onPress={closeSheets} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }], height: SHEET_MAX_HEIGHT }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Comments</Text>
            <Text style={styles.sheetCount}>{item.commentsCount}</Text>
          </View>

          <FlatList
            data={(item.comments ?? []) as CommentWithAvatar[]}
            keyExtractor={(c) => String(c.id)}
            renderItem={renderCommentItem}
            contentContainerStyle={{ paddingBottom: 20 }}
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
          />

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.commentInputRow}>
              <View style={styles.commentInputWrap}>
                <TextInput
                  style={styles.commentInput}
                  value={newComment}
                  placeholder="Add a comment..."
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  onChangeText={setNewComment}
                  returnKeyType="send"
                  onSubmitEditing={submitComment}
                />
              </View>
              <TouchableOpacity onPress={submitComment} style={styles.sendBtn}>
                <LinearGradient colors={['#e50914', '#ff6b35']} style={styles.sendBtnGradient}>
                  <Ionicons name="send" size={18} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: 6,
    marginHorizontal: 10,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0a0a0c',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    ...Platform.select({
      ios: { shadowColor: '#e50914', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 20 },
      android: { elevation: 8 },
    }),
  },
  frameGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(229,9,20,0.4)',
  },
  filmStripTop: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    height: 12,
    backgroundColor: '#1a1a1e',
    paddingHorizontal: 8,
  },
  filmStripBottom: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    height: 12,
    backgroundColor: '#1a1a1e',
    paddingHorizontal: 8,
  },
  filmHole: {
    width: 8,
    height: 6,
    borderRadius: 2,
    backgroundColor: '#0a0a0c',
  },
  mediaWrap: {
    height: MEDIA_HEIGHT,
    backgroundColor: '#0a0a0c',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  letterboxTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 20,
    backgroundColor: '#0a0a0c',
  },
  letterboxBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 20,
    backgroundColor: '#0a0a0c',
  },
  heartBurst: {
    position: 'absolute',
    zIndex: 100,
  },
  heartGradient: {
    width: 104,
    height: 104,
  },
  topBar: {
    position: 'absolute',
    top: 28,
    left: 12,
    right: 60,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  avatarContainer: {
    overflow: 'hidden',
  },
  avatarGradient: {
    flex: 1,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    overflow: 'hidden',
    backgroundColor: '#0a0a0c',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  userInfo: {
    flex: 1,
    marginLeft: 10,
  },
  username: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  timestamp: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginTop: 1,
  },
  volumeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 28,
    left: 12,
    right: 70,
    zIndex: 10,
  },
  movieBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
  },
  movieText: {
    color: '#ffd700',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 5,
  },
  reviewText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  likersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  likerAvatars: {
    flexDirection: 'row',
  },
  likerAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#0a0a0c',
  },
  likersText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginLeft: 8,
  },
  sideActions: {
    position: 'absolute',
    right: 8,
    bottom: 40,
    alignItems: 'center',
    gap: 16,
    zIndex: 10,
  },
  sideActionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48,
  },
  sideActionText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  textOnlyCard: {
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  textOnlyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  textOnlyReview: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  movieBadgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,215,0,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.25)',
  },
  movieTextInline: {
    color: '#ffd700',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  textOnlyActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  actionChipText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(12,12,16,0.98)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sheetTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  sheetCount: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '600',
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomColor: 'rgba(255,255,255,0.04)',
    borderBottomWidth: 1,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    marginRight: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  commentUser: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  commentText: {
    color: 'rgba(255,255,255,0.8)',
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
  },
  spoilerPill: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(229,9,20,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.35)',
    alignSelf: 'flex-start',
  },
  spoilerText: {
    color: '#ff6b6b',
    fontWeight: '600',
    fontSize: 12,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  commentInputWrap: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 24,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  commentInput: {
    color: '#fff',
    fontSize: 14,
    paddingVertical: 12,
  },
  sendBtn: {
    overflow: 'hidden',
    borderRadius: 22,
  },
  sendBtnGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  merchCtaContainer: {
    position: 'absolute',
    left: 12,
    top: 80,
    zIndex: 20,
  },
  merchCta: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#ffd700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  merchGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  merchText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});