import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { RTCView } from 'react-native-webrtc';
import Video from 'react-native-video';
import type { User } from 'firebase/auth';
import { onAuthChange } from '../../messaging/controller';
import { useAccent } from '../../components/AccentContext';
import {
  joinLiveStream,
  listenToLiveStream,
  listenToLiveSignaling,
  listenToLiveComments,
  listenToLiveGifts,
  listenToLiveViewers,
  leaveLiveStreamAsViewer,
  sendLiveAnswer,
  sendLiveComment,
  sendLiveGift,
  sendLiveIceCandidate,
  touchLiveEngagement,
  touchLiveViewer,
} from '@/lib/live/liveService';
import type { LiveStream, LiveStreamComment, LiveStreamGift, LiveStreamViewer } from '@/lib/live/types';
import {
  initializeViewer,
  createViewerAnswer,
  getViewerStream,
  closeViewer,
  addIceCandidateToViewer,
  setIceCandidateCallback,
} from '@/lib/live/webrtcLiveClient';
import { RTCIceCandidate } from 'react-native-webrtc';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const LiveRoomScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { accentColor } = useAccent();
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<User | null>(null);
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [viewerStream, setViewerStream] = useState<any>(null);
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState<LiveStreamComment[]>([]);
  const [viewers, setViewers] = useState<LiveStreamViewer[]>([]);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [viewersVisible, setViewersVisible] = useState(false);
  const [giftsVisible, setGiftsVisible] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const likedRef = useRef(false);
  const [giftsSent, setGiftsSent] = useState(0);
  const [chatDockExpanded, setChatDockExpanded] = useState(false);
  const [liveGifts, setLiveGifts] = useState<LiveStreamGift[]>([]);
  const [giftBursts, setGiftBursts] = useState<
    Array<{ id: string; text: string; y: Animated.Value; o: Animated.Value }>
  >([]);
  const [floating, setFloating] = useState<
    Array<{ id: string; text: string; y: Animated.Value; o: Animated.Value }>
  >([]);
  const joinedRef = useRef(false);
  const incrementedRef = useRef(false);
  const processedOfferRef = useRef(false);
  const processedHostIceRef = useRef<Set<string>>(new Set());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastEngagementRef = useRef(0);
  const seenCommentIdsRef = useRef<Set<string>>(new Set());
  const didInitCommentsRef = useRef(false);

  useEffect(() => {
    likedRef.current = liked;
  }, [liked]);
  const didInitViewersRef = useRef(false);
  const seenViewerIdsRef = useRef<Set<string>>(new Set());
  const seenGiftIdsRef = useRef<Set<string>>(new Set());
  const didInitGiftsRef = useRef(false);
  const chatDockListRef = useRef<FlatList<LiveStreamComment> | null>(null);
  const chatDockAtBottomRef = useRef(true);

  const lastTapRef = useRef(0);
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartAnim = useRef(new Animated.Value(0)).current;
  const [heartPos, setHeartPos] = useState({ x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2 });

  useEffect(() => {
    const unsubscribe = onAuthChange((authUser) => setUser(authUser));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!id) return;
    const unsubscribe = listenToLiveStream(String(id), (live) => {
      setStream(live);
    });
    return () => unsubscribe();
  }, [id]);

  const cleanup = useCallback(async () => {
    closeViewer(user?.uid || 'unknown');
    setJoined(false);
    setViewerStream(null);
    joinedRef.current = false;
    processedOfferRef.current = false;
    processedHostIceRef.current = new Set();
    if (tapTimeoutRef.current) {
      clearTimeout(tapTimeoutRef.current);
      tapTimeoutRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (id && incrementedRef.current) {
      try {
        await leaveLiveStreamAsViewer(String(id), user?.uid ?? 'unknown');
      } catch (err) {
        console.warn('Failed to decrement viewer count', err);
      } finally {
        incrementedRef.current = false;
      }
    }
  }, [id, user?.uid]);

  useEffect(() => {
    if (!stream || stream.status !== 'live') return;
    if (!user?.uid || !id || joinedRef.current) return;
    joinedRef.current = true;

    const joinAsync = async () => {
      setIsJoining(true);
      try {
        // Join the live stream session (increments viewer count)
        await joinLiveStream(String(id), user.uid, {
          username: user.displayName ?? (user.email ? String(user.email).split('@')[0] : null),
          userAvatar: (user as any)?.photoURL ?? null,
        });
        incrementedRef.current = true;

        // If the stream provides HLS, avoid P2P WebRTC entirely.
        if (stream?.playbackHlsUrl) {
          setJoined(true);
          return;
        }

        // Legacy P2P WebRTC viewer
        await initializeViewer(user.uid);
        setJoined(true);
      } catch (err) {
        console.error('Failed to join live stream', err);
        setIsJoining(false);
        joinedRef.current = false;
      } finally {
        setIsJoining(false);
      }
    };

    joinAsync();
  }, [id, stream, user?.uid]);

  const enqueueFloating = useCallback((key: string, text: string) => {
    const y = new Animated.Value(0);
    const o = new Animated.Value(1);
    setFloating((prev) => [...prev, { id: key, text, y, o }].slice(-12));

    Animated.parallel([
      Animated.timing(y, { toValue: -90, duration: 6500, useNativeDriver: true }),
      Animated.timing(o, { toValue: 0, duration: 6500, useNativeDriver: true }),
    ]).start(() => {
      setFloating((prev) => prev.filter((x) => x.id !== key));
    });
  }, []);

  const enqueueGiftBurst = useCallback((key: string, text: string) => {
    const y = new Animated.Value(0);
    const o = new Animated.Value(1);
    setGiftBursts((prev) => [...prev, { id: key, text, y, o }].slice(-6));

    Animated.parallel([
      Animated.timing(y, { toValue: -120, duration: 5200, useNativeDriver: true }),
      Animated.timing(o, { toValue: 0, duration: 5200, useNativeDriver: true }),
    ]).start(() => {
      setGiftBursts((prev) => prev.filter((x) => x.id !== key));
    });
  }, []);

  // Signaling (per-viewer doc) + viewer heartbeat
  useEffect(() => {
    if (!id || !user?.uid || !joined) return;
    const streamId = String(id);
    const viewerId = user.uid;
    const isHls = Boolean(stream?.playbackHlsUrl);

    if (!isHls) {
      // Viewer ICE -> Firestore (legacy P2P WebRTC)
      setIceCandidateCallback(async ({ viewerId: cbViewerId, candidate, from }) => {
        if (from !== 'viewer' || cbViewerId !== viewerId) return;
        await sendLiveIceCandidate(streamId, viewerId, 'viewer', candidate);
      });
    }

    // Heartbeat
    heartbeatRef.current = setInterval(() => {
      void touchLiveViewer(streamId, viewerId, {
        username: user?.displayName ?? ((user as any)?.email ? String((user as any).email).split('@')[0] : null),
        userAvatar: (user as any)?.photoURL ?? null,
      }).catch(() => {});
    }, 20_000);

    const unsub = !isHls
      ? listenToLiveSignaling(streamId, viewerId, (sig) => {
          if (!sig) return;

          if (sig.offer && !processedOfferRef.current) {
            processedOfferRef.current = true;
            void (async () => {
              try {
                const answer = await createViewerAnswer(viewerId, sig.offer as any);
                await sendLiveAnswer(streamId, viewerId, answer as any);
                const viewerMediaStream = getViewerStream(viewerId);
                if (viewerMediaStream) setViewerStream(viewerMediaStream);
              } catch (err) {
                console.warn('Failed to handle broadcaster offer', err);
                processedOfferRef.current = false;
              }
            })();
          }

          const candidates = Array.isArray((sig as any).hostIceCandidates) ? (sig as any).hostIceCandidates : [];
          for (const c of candidates) {
            const key = `${c?.candidate ?? ''}:${c?.sdpMid ?? ''}:${c?.sdpMLineIndex ?? ''}`;
            if (processedHostIceRef.current.has(key)) continue;
            processedHostIceRef.current.add(key);
            try {
              const ice = new RTCIceCandidate({
                candidate: c?.candidate ?? '',
                sdpMid: c?.sdpMid ?? null,
                sdpMLineIndex: c?.sdpMLineIndex ?? null,
              });
              void addIceCandidateToViewer(viewerId, ice as any).catch(() => {});
            } catch {
              // ignore
            }
          }
        })
      : () => {};

    const unsubComments = listenToLiveComments(
      streamId,
      (comments) => {
        setComments(comments);

        if (!didInitCommentsRef.current) {
          didInitCommentsRef.current = true;
          seenCommentIdsRef.current = new Set(comments.map((c) => String(c.id)));
          // Snap to latest on initial load.
          requestAnimationFrame(() => {
            try {
              chatDockListRef.current?.scrollToEnd({ animated: false });
            } catch {
              // ignore
            }
          });
          return;
        }

        for (const c of comments) {
          if (!c?.id || seenCommentIdsRef.current.has(String(c.id))) continue;
          seenCommentIdsRef.current.add(String(c.id));
          const text = `${c.username ? String(c.username) : 'Someone'}: ${String(c.text ?? '')}`;
          enqueueFloating(`comment-${String(c.id)}`, text);
        }

        // Keep chat dock pinned to the latest messages if the user hasn't scrolled away.
        if (chatDockAtBottomRef.current) {
          requestAnimationFrame(() => {
            try {
              chatDockListRef.current?.scrollToEnd({ animated: true });
            } catch {
              // ignore
            }
          });
        }
      },
      { limitCount: 40 },
    );

    const unsubViewers = listenToLiveViewers(streamId, (next) => {
      setViewers(next);

      // Avoid spamming join toasts on first load.
      if (!didInitViewersRef.current) {
        didInitViewersRef.current = true;
        seenViewerIdsRef.current = new Set(next.map((v) => String(v.id)));
        return;
      }

      for (const v of next) {
        const vid = String(v.id);
        if (!vid || seenViewerIdsRef.current.has(vid)) continue;
        seenViewerIdsRef.current.add(vid);
        const name = (v.username && String(v.username).trim())
          ? String(v.username)
          : `${vid.slice(0, 6)}…`;
        enqueueFloating(`join-${vid}`, `${name} joined`);
      }
    });

    const unsubGifts = listenToLiveGifts(
      streamId,
      (next) => {
        setLiveGifts(next);

        if (!didInitGiftsRef.current) {
          didInitGiftsRef.current = true;
          seenGiftIdsRef.current = new Set(next.map((g) => String(g.id)));
          return;
        }

        for (const g of next) {
          const gid = String(g.id);
          if (!gid || seenGiftIdsRef.current.has(gid)) continue;
          seenGiftIdsRef.current.add(gid);
          const who = g.senderName && String(g.senderName).trim()
            ? String(g.senderName)
            : `${String(g.senderId || '').slice(0, 6)}…`;
          const emoji = g.emoji ? String(g.emoji) : '🎁';
          const label = g.label ? String(g.label) : 'Gift';
          enqueueGiftBurst(`gift-${gid}`, `${who} sent ${emoji} ${label}`);
        }
      },
      { limitCount: 30 },
    );

    return () => {
      try {
        unsub();
      } catch {
        // ignore
      }
      try {
        unsubComments();
      } catch {
        // ignore
      }
      try {
        unsubViewers();
      } catch {
        // ignore
      }
      try {
        unsubGifts();
      } catch {
        // ignore
      }
    };
  }, [enqueueFloating, enqueueGiftBurst, id, joined, stream?.playbackHlsUrl, user]);

  const handleEngagementTap = useCallback(() => {
    if (!id || !user?.uid || !joined) return;
    const now = Date.now();
    if (now - lastEngagementRef.current < 1200) return;
    lastEngagementRef.current = now;
    void touchLiveEngagement(String(id), user.uid, 'tap').catch(() => {});
  }, [id, joined, user?.uid]);

  const playHeartBurst = useCallback(() => {
    heartAnim.setValue(0);
    Animated.timing(heartAnim, {
      toValue: 1,
      duration: 650,
      useNativeDriver: true,
    }).start();
  }, [heartAnim]);

  const heartScale = heartAnim.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0.2, 1.2, 1],
  });

  const heartOpacity = heartAnim.interpolate({
    inputRange: [0, 0.15, 0.8, 1],
    outputRange: [0, 1, 1, 0],
  });

  const handleVideoTap = useCallback(
    (e: any) => {
      if (!viewerStream && !stream?.playbackHlsUrl) return;
      const now = Date.now();
      const isDouble = now - lastTapRef.current < 280;

      if (isDouble) {
        if (tapTimeoutRef.current) {
          clearTimeout(tapTimeoutRef.current);
          tapTimeoutRef.current = null;
        }
        lastTapRef.current = 0;

        const { locationX, locationY } = e?.nativeEvent ?? {};
        if (typeof locationX === 'number' && typeof locationY === 'number') {
          setHeartPos({ x: locationX, y: locationY });
        }

        if (!likedRef.current) {
          likedRef.current = true;
          setLiked(true);
          setLikesCount((c) => c + 1);
        }
        playHeartBurst();
        handleEngagementTap();
        return;
      }

      lastTapRef.current = now;
      tapTimeoutRef.current = setTimeout(() => {
        setOverlayVisible((v) => !v);
        tapTimeoutRef.current = null;
        handleEngagementTap();
      }, 280);
    },
    [handleEngagementTap, playHeartBurst, stream?.playbackHlsUrl, viewerStream],
  );

  const handleSendComment = useCallback(() => {
    if (!id || !user?.uid || !joined) return;
    const text = commentText.trim();
    if (!text) return;
    setCommentText('');
    void sendLiveComment({
      streamId: String(id),
      userId: user.uid,
      username: user.displayName ?? null,
      userAvatar: (user as any)?.photoURL ?? null,
      text,
    }).catch(() => {});
  }, [commentText, id, joined, user]);

  useEffect(() => {
    return () => {
      void cleanup();
    };
  }, [cleanup]);

  const handleClose = useCallback(async () => {
    await cleanup();
    router.back();
  }, [cleanup, router]);

  const handleShare = useCallback(() => {
    if (!id) return;
    const streamId = String(id);
    const title = stream?.title ? String(stream.title) : 'Live on MovieFlix';
    void Share.share({
      message: `${title}\nJoin: /social-feed/live/${streamId}`,
    }).catch(() => {});
  }, [id, stream?.title]);

  const ended = stream && stream.status === 'ended';

  const gifts = [
    { id: 'rose', label: 'Rose', emoji: '🌹', coins: 1 },
    { id: 'popcorn', label: 'Popcorn', emoji: '🍿', coins: 5 },
    { id: 'clap', label: 'Claps', emoji: '👏', coins: 10 },
    { id: 'fire', label: 'Fire', emoji: '🔥', coins: 25 },
    { id: 'crown', label: 'Crown', emoji: '👑', coins: 99 },
  ];

  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient colors={[accentColor, '#020203']} style={StyleSheet.absoluteFill} />
      
      {/* Ambient orbs */}
      <View style={styles.ambientOrb1} pointerEvents="none">
        <LinearGradient
          colors={[`${accentColor}50`, `${accentColor}15`, 'transparent']}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </View>
      <View style={styles.ambientOrb2} pointerEvents="none">
        <LinearGradient
          colors={['rgba(255,75,75,0.35)', 'rgba(255,75,75,0.1)', 'transparent']}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </View>

      <View style={[styles.safeArea, { paddingTop: insets.top + 12 }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
            <Text style={styles.backLabel}>Back</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
            <Text style={styles.roomTitle}>{stream?.title ?? 'Live room'}</Text>
            <Text style={styles.roomSubtitle}>
              {stream?.hostName ?? 'Someone live'} · {Math.max(stream?.viewersCount ?? 0, 0)} watching
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.body}>
          {ended && (
            <View style={styles.centerMessage}>
              <Ionicons name="stop-circle-outline" size={56} color="#fff" />
              <Text style={styles.endTitle}>Live has ended</Text>
              <Text style={styles.endSubtitle}>Thanks for stopping by.</Text>
            </View>
          )}

          {!ended && (
            <>
              {stream?.playbackHlsUrl ? (
                <Pressable style={styles.remoteVideoPressable} onPress={handleVideoTap}>
                  <Video
                    source={{ uri: String(stream.playbackHlsUrl) }}
                    style={styles.remoteVideo}
                    resizeMode="cover"
                    repeat
                    paused={false}
                    controls={false}
                    ignoreSilentSwitch="ignore"
                  />

                  <Animated.View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: heartPos.x - 48,
                      top: heartPos.y - 48,
                      width: 96,
                      height: 96,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: heartOpacity,
                      transform: [{ scale: heartScale }],
                    }}
                  >
                    <Ionicons name="heart" size={96} color="#ff2d55" />
                  </Animated.View>

                  <View style={styles.floatingComments} pointerEvents="none">
                    {floating.map((c) => (
                      <Animated.View
                        key={c.id}
                        style={{
                          transform: [{ translateY: c.y }],
                          opacity: c.o,
                          marginBottom: 8,
                        }}
                      >
                        <View style={styles.floatBubble}>
                          <Text style={styles.floatText} numberOfLines={2}>
                            {c.text}
                          </Text>
                        </View>
                      </Animated.View>
                    ))}
                  </View>

                  <View style={styles.giftBursts} pointerEvents="none">
                    {giftBursts.map((g) => (
                      <Animated.View
                        key={g.id}
                        style={{
                          transform: [{ translateY: g.y }],
                          opacity: g.o,
                          marginBottom: 10,
                        }}
                      >
                        <View style={styles.giftBubble}>
                          <Ionicons name="sparkles" size={14} color="#fff" />
                          <Text style={styles.giftBubbleText} numberOfLines={2}>
                            {g.text}
                          </Text>
                        </View>
                      </Animated.View>
                    ))}
                  </View>
                </Pressable>
              ) : viewerStream ? (
                <Pressable style={styles.remoteVideoPressable} onPress={handleVideoTap}>
                  <RTCView
                    streamURL={viewerStream.toURL()}
                    style={styles.remoteVideo}
                    objectFit="cover"
                  />

                  <Animated.View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: heartPos.x - 48,
                      top: heartPos.y - 48,
                      width: 96,
                      height: 96,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: heartOpacity,
                      transform: [{ scale: heartScale }],
                    }}
                  >
                    <Ionicons name="heart" size={96} color="#ff2d55" />
                  </Animated.View>

                  <View style={styles.floatingComments} pointerEvents="none">
                    {floating.map((c) => (
                      <Animated.View
                        key={c.id}
                        style={{
                          transform: [{ translateY: c.y }],
                          opacity: c.o,
                          marginBottom: 8,
                        }}
                      >
                        <View style={styles.floatBubble}>
                          <Text style={styles.floatText} numberOfLines={2}>
                            {c.text}
                          </Text>
                        </View>
                      </Animated.View>
                    ))}
                  </View>

                  <View style={styles.giftBursts} pointerEvents="none">
                    {giftBursts.map((g) => (
                      <Animated.View
                        key={g.id}
                        style={{
                          transform: [{ translateY: g.y }],
                          opacity: g.o,
                          marginBottom: 10,
                        }}
                      >
                        <View style={styles.giftBubble}>
                          <Ionicons name="sparkles" size={14} color="#fff" />
                          <Text style={styles.giftBubbleText} numberOfLines={2}>
                            {g.text}
                          </Text>
                        </View>
                      </Animated.View>
                    ))}
                  </View>
                </Pressable>
              ) : (
                <View style={styles.centerMessage}>
                  {isJoining ? (
                    <>
                      <ActivityIndicator color="#fff" />
                      <Text style={styles.endSubtitle}>Joining room…</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="radio-outline" size={56} color="#fff" />
                      <Text style={styles.endSubtitle}>Waiting for host…</Text>
                    </>
                  )}
                </View>
              )}

              {/* Full-screen live overlay */}
              {(viewerStream || stream?.playbackHlsUrl) && overlayVisible && (
                <View style={styles.liveOverlay}>
                  <LinearGradient
                    colors={['rgba(0,0,0,0.55)', 'transparent']}
                    style={styles.topShade}
                    pointerEvents="none"
                  />
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.85)']}
                    style={styles.bottomShade}
                    pointerEvents="none"
                  />

                  {/* Top bar */}
                  <View style={styles.topBar}>
                    <View style={styles.hostPill}>
                      <View style={styles.livePillBadge}>
                        <View style={styles.livePillDot} />
                        <Text style={styles.livePillText}>LIVE</Text>
                      </View>
                      <View style={[styles.hostAvatar, { backgroundColor: accentColor }]}>
                        <Text style={styles.hostInitial}>
                          {(stream?.hostName ?? 'H')[0].toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.hostPillName} numberOfLines={1}>
                          {stream?.hostName ?? 'Host'}
                        </Text>
                        <Text style={styles.hostPillMeta} numberOfLines={1}>
                          {Math.max(stream?.viewersCount ?? 0, 0)} watching · {stream?.title ?? 'Live'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.followBtn, { borderColor: accentColor }]}
                        onPress={() => setLiked(true)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.followBtnText, { color: accentColor }]}>Follow</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={styles.topIconBtn}
                      onPress={() => setCommentsVisible(true)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.topIconBtn}
                      onPress={() => setGiftsVisible(true)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="gift-outline" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>

                  {/* Right-side controls */}
                  <View style={styles.rightControls}>
                    <TouchableOpacity
                      style={styles.controlButton}
                      onPress={() => {
                        if (!likedRef.current) {
                          likedRef.current = true;
                          setLiked(true);
                          setLikesCount((c) => c + 1);
                        }
                        handleEngagementTap();
                      }}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name={liked ? 'heart' : 'heart-outline'}
                        size={30}
                        color={liked ? '#ff2d55' : '#fff'}
                      />
                      <Text style={styles.controlLabel}>{likesCount}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.controlButton}
                      onPress={() => setCommentsVisible(true)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="chatbubble-outline" size={30} color="#fff" />
                      <Text style={styles.controlLabel}>{comments.length}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.controlButton}
                      onPress={() =>
                        router.push({ pathname: '/social-feed/live/leaderboard', params: { id: String(id) } } as any)
                      }
                      activeOpacity={0.85}
                    >
                      <Ionicons name="trophy-outline" size={30} color="#fff" />
                      <Text style={styles.controlLabel}>Top</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.controlButton}
                      onPress={handleShare}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="share-social-outline" size={30} color="#fff" />
                      <Text style={styles.controlLabel}>Share</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.controlButton}
                      onPress={() => setGiftsVisible(true)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="gift-outline" size={30} color="#fff" />
                      <Text style={styles.controlLabel}>
                        {Math.max(stream?.giftsCount ?? 0, liveGifts.length, 0)}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.controlButton}
                      onPress={() => router.push('/social-feed/live')}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="compass-outline" size={30} color="#fff" />
                      <Text style={styles.controlLabel}>More</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Scrollable live chat dock */}
                  <View
                    style={[
                      styles.chatDock,
                      { height: chatDockExpanded ? 280 : 150 },
                    ]}
                  >
                    <View style={styles.chatDockHeader}>
                      <TouchableOpacity
                        style={styles.chatDockHeaderLeft}
                        onPress={() => setChatDockExpanded((v) => !v)}
                        activeOpacity={0.85}
                      >
                        <Ionicons
                          name={chatDockExpanded ? 'chevron-down' : 'chevron-up'}
                          size={16}
                          color="#fff"
                        />
                        <Text style={styles.chatDockTitle}>Comments</Text>
                        <View style={styles.chatDockCountPill}>
                          <Text style={styles.chatDockCountText}>{comments.length}</Text>
                        </View>
                      </TouchableOpacity>

                      <View style={styles.chatDockHeaderRight}>
                        <TouchableOpacity
                          style={styles.chatDockHeaderBtn}
                          onPress={() => setViewersVisible(true)}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="people" size={16} color="#fff" />
                          <Text style={styles.chatDockHeaderBtnText}>{Math.max(stream?.viewersCount ?? 0, 0)}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.chatDockHeaderBtn}
                          onPress={() => setCommentsVisible(true)}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="expand-outline" size={16} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <FlatList
                      ref={(r) => {
                        chatDockListRef.current = r;
                      }}
                      data={comments}
                      keyExtractor={(c) => String(c.id)}
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={styles.chatDockListContent}
                      onScroll={(e) => {
                        const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
                        const atBottom =
                          layoutMeasurement.height + contentOffset.y >=
                          contentSize.height - 24;
                        chatDockAtBottomRef.current = atBottom;
                      }}
                      scrollEventThrottle={80}
                      renderItem={({ item }) => (
                        <View style={styles.chatDockLine}>
                          <Text style={styles.chatDockName} numberOfLines={1}>
                            {item.username ? String(item.username) : 'Someone'}
                          </Text>
                          <Text style={styles.chatDockText} numberOfLines={2}>
                            {String(item.text ?? '')}
                          </Text>
                        </View>
                      )}
                    />
                  </View>

                  {/* Composer */}
                  <View style={styles.commentComposer}>
                    <TouchableOpacity
                      style={styles.smallIconBtn}
                      onPress={() => setGiftsVisible(true)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="gift" size={18} color="#fff" />
                    </TouchableOpacity>
                    <TextInput
                      value={commentText}
                      onChangeText={setCommentText}
                      placeholder="Comment…"
                      placeholderTextColor="rgba(255,255,255,0.6)"
                      style={styles.commentInput}
                      onSubmitEditing={handleSendComment}
                      returnKeyType="send"
                    />
                    <TouchableOpacity style={styles.sendBtn} onPress={handleSendComment} activeOpacity={0.85}>
                      <Ionicons name="send" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </>
          )}
        </View>

        <Modal
          visible={commentsVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setCommentsVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <TouchableOpacity style={styles.modalBackdrop} onPress={() => setCommentsVisible(false)} />
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{comments.length} Comments</Text>
                <TouchableOpacity onPress={() => setCommentsVisible(false)}>
                  <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
              </View>

              <View style={{ flex: 1 }}>
                {comments.length ? (
                  <FlatList
                    data={comments}
                    keyExtractor={(c) => String(c.id)}
                    contentContainerStyle={{ paddingVertical: 12 }}
                    renderItem={({ item }) => (
                      <View style={styles.sheetCommentRow}>
                        <View style={styles.sheetAvatar}>
                          <Text style={styles.sheetAvatarInitial}>
                            {String(item.username ?? 'S').charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.sheetCommentName} numberOfLines={1}>
                            {item.username ? String(item.username) : 'Someone'}
                          </Text>
                          <Text style={styles.sheetCommentText}>{String(item.text ?? '')}</Text>
                        </View>
                      </View>
                    )}
                  />
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: 'rgba(255,255,255,0.7)' }}>No comments yet.</Text>
                  </View>
                )}
              </View>

              <View style={styles.sheetComposer}>
                <TextInput
                  value={commentText}
                  onChangeText={setCommentText}
                  placeholder="Add a comment…"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  style={styles.sheetInput}
                  onSubmitEditing={handleSendComment}
                  returnKeyType="send"
                />
                <TouchableOpacity style={styles.sheetSend} onPress={handleSendComment} activeOpacity={0.85}>
                  <Ionicons name="arrow-up-circle" size={30} color={accentColor} />
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <Modal
          visible={viewersVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setViewersVisible(false)}
        >
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setViewersVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{Math.max(stream?.viewersCount ?? 0, 0)} Viewers</Text>
              <TouchableOpacity onPress={() => setViewersVisible(false)}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1 }}>
              {viewers.length ? (
                <FlatList
                  data={viewers}
                  keyExtractor={(v) => String(v.id)}
                  contentContainerStyle={{ paddingVertical: 12 }}
                  renderItem={({ item }) => {
                    const name = item.username && String(item.username).trim()
                      ? String(item.username)
                      : String(item.id).slice(0, 10);
                    return (
                      <View style={styles.viewerRow}>
                        <View style={styles.viewerAvatar}>
                          <Text style={styles.viewerAvatarText}>
                            {name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.viewerName} numberOfLines={1}>
                            {name}
                          </Text>
                          <Text style={styles.viewerMeta} numberOfLines={1}>
                            {String(item.id)}
                          </Text>
                        </View>
                        <Ionicons name="eye" size={16} color="rgba(255,255,255,0.8)" />
                      </View>
                    );
                  }}
                />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: 'rgba(255,255,255,0.7)' }}>No viewers yet.</Text>
                </View>
              )}
            </View>
          </View>
        </Modal>

        <Modal
          visible={giftsVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setGiftsVisible(false)}
        >
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setGiftsVisible(false)} />
          <View style={[styles.sheet, { height: SCREEN_HEIGHT * 0.42 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Send a gift</Text>
              <TouchableOpacity onPress={() => setGiftsVisible(false)}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.giftsGrid}>
              {gifts.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={styles.giftTile}
                  activeOpacity={0.9}
                  onPress={() => {
                    if (!id || !user?.uid || !joined) return;
                    void sendLiveGift({
                      streamId: String(id),
                      senderId: user.uid,
                      senderName: user.displayName ?? (user.email ? String(user.email).split('@')[0] : null),
                      senderAvatar: (user as any)?.photoURL ?? null,
                      giftId: g.id,
                      label: g.label,
                      emoji: g.emoji,
                      coins: g.coins,
                    })
                      .then(() => {
                        setGiftsSent((c) => c + 1);
                        handleEngagementTap();
                      })
                      .catch(() => {});
                  }}
                >
                  <Text style={styles.giftEmoji}>{g.emoji}</Text>
                  <Text style={styles.giftLabel}>{g.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  ambientOrb1: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    top: -40,
    left: -60,
    overflow: 'hidden',
  },
  ambientOrb2: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    bottom: '20%',
    right: -40,
    overflow: 'hidden',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 0,
  },
  headerCenter: {
    alignItems: 'center',
    flex: 1,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(229,9,20,0.9)',
    marginBottom: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backLabel: {
    color: '#fff',
    marginLeft: 4,
    fontWeight: '600',
  },
  roomTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  roomSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    textAlign: 'center',
  },
  body: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  remoteVideo: {
    width: '100%',
    height: '100%',
  },
  remoteVideoPressable: {
    width: '100%',
    height: '100%',
  },
  centerMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  endTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  endSubtitle: {
    color: 'rgba(255,255,255,0.7)',
  },
  liveOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },

  floatingComments: {
    position: 'absolute',
    left: 12,
    bottom: 130,
    width: '70%',
  },
  floatBubble: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  floatText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },

  topShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  bottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 260,
  },

  topBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hostPill: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  livePillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(229,9,20,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.35)',
  },
  livePillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e50914',
  },
  livePillText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 0.6,
  },
  hostPillName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  hostPillMeta: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  followBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
  },
  followBtnText: {
    fontWeight: '900',
    fontSize: 12,
  },
  topIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightControls: {
    position: 'absolute',
    right: 16,
    bottom: 100,
    alignItems: 'center',
    gap: 16,
  },
  hostAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ff4b4b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostInitial: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  controlButton: {
    alignItems: 'center',
    gap: 4,
  },
  controlLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  giftBursts: {
    position: 'absolute',
    left: 12,
    top: 110,
    width: '70%',
  },
  giftBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(229,9,20,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  giftBubbleText: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },

  chatDock: {
    position: 'absolute',
    left: 12,
    bottom: 78,
    width: '72%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  chatDockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  chatDockHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatDockTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  chatDockCountPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  chatDockCountText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 11,
  },
  chatDockHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatDockHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  chatDockHeaderBtnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 11,
  },
  chatDockListContent: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  chatDockLine: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  chatDockName: {
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '900',
    fontSize: 12,
  },
  chatDockText: {
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '700',
    fontSize: 12,
    marginTop: 3,
  },

  chatPreview: {
    position: 'absolute',
    left: 12,
    bottom: 122,
    width: '72%',
    gap: 8,
  },
  chatLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  chatName: {
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '900',
    fontSize: 12,
    maxWidth: 120,
  },
  chatText: {
    color: 'rgba(255,255,255,0.88)',
    fontWeight: '700',
    fontSize: 12,
    flex: 1,
    minWidth: 0,
  },

  smallIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  commentComposer: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  commentInput: {
    flex: 1,
    height: 44,
    borderRadius: 999,
    paddingHorizontal: 14,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(229,9,20,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SCREEN_HEIGHT * 0.62,
    backgroundColor: '#111118',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  sheetTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
  },
  sheetCommentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
  },
  sheetAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  sheetAvatarInitial: {
    color: '#fff',
    fontWeight: '900',
  },
  sheetCommentName: {
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '800',
    fontSize: 12,
  },
  sheetCommentText: {
    color: '#fff',
    fontWeight: '600',
    marginTop: 2,
  },
  sheetComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  sheetInput: {
    flex: 1,
    height: 44,
    borderRadius: 999,
    paddingHorizontal: 14,
    color: '#fff',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sheetSend: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },

  viewerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  viewerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  viewerAvatarText: {
    color: '#fff',
    fontWeight: '900',
  },
  viewerName: {
    color: '#fff',
    fontWeight: '900',
  },
  viewerMeta: {
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '700',
    marginTop: 3,
  },

  giftsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingTop: 12,
  },
  giftTile: {
    width: (SCREEN_WIDTH - 12 * 2 - 10 * 2) / 3,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  giftEmoji: {
    fontSize: 24,
  },
  giftLabel: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
});

export default LiveRoomScreen;
