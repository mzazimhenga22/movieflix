import BottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { Video } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  collection,
  doc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { firestore } from '../constants/firebase';
import { injectAdsWithPattern } from '../lib/ads/sequence';
import { usePromotedProducts } from '../hooks/use-promoted-products';
import { useUser } from '../hooks/use-user';
import { useSubscription } from '../providers/SubscriptionProvider';
import { followUser, unfollowUser } from '../lib/followGraph';
import { trackPromotionClick, trackPromotionImpression } from './marketplace/api';
import MessageInput from './messaging/chat/components/MessageInput';
import { findOrCreateConversation, sendMessage, type Profile } from './messaging/controller';

const { width } = Dimensions.get('window');

const STORY_IMAGE_DURATION_MS = 8000;
const STORY_VIDEO_FALLBACK_DURATION_MS = 10 * 60 * 1000;

type StoryMedia = {
  type: 'image' | 'video';
  uri: string;
  storyId?: string | number;
  caption?: string;
  overlayText?: string;
  createdAtMs?: number | null;
};

type Story = {
  id: string | number;
  title: string;
  image?: string;
  avatar?: string | null;
  userId?: string | null;
  username?: string | null;
  media: StoryMedia[];
};

type AdStory = { id: string; kind: 'ad'; title: string; media: StoryMedia[]; productId: string };
type StoryItem = Story | AdStory;

type ViewerEntry = {
  id: string;
  viewerId: string;
  viewerName?: string | null;
  viewerAvatar?: string | null;
  createdAtMs?: number | null;
};

const formatTimeAgo = (ms?: number | null) => {
  if (!ms) return '';
  const diff = Date.now() - ms;
  if (diff < 0) return 'now';
  const mins = Math.floor(diff / (60 * 1000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const StoryViewerScreen = () => {
  const router = useRouter();
  const { stories: storiesParam, initialStoryId: initialStoryIdParam, initialMediaId: initialMediaIdParam } =
    useLocalSearchParams();
  const isWeb = Platform.OS === 'web';
  const { currentPlan } = useSubscription();
  const { products: promoted } = usePromotedProducts({ placement: 'story', limit: 30 });
  const adPatternStartRef = useRef(Math.floor(Math.random() * 3));
  const { user } = useUser();
  const viewerId = (user as any)?.uid ? String((user as any).uid) : null;

  const storiesRaw: Story[] = useMemo(() => {
    if (!storiesParam) return [];
    try {
      const parsed = JSON.parse(storiesParam as string);
      return Array.isArray(parsed) ? (parsed as Story[]) : [];
    } catch {
      return [];
    }
  }, [storiesParam]);

  const stories: StoryItem[] = useMemo(() => {
    if (currentPlan !== 'free') return storiesRaw;
    if (!promoted.length) return storiesRaw;

    // Ads appear between users' story sets.
    return injectAdsWithPattern(storiesRaw, {
      pattern: [3, 2, 4],
      startPatternIndex: adPatternStartRef.current,
      isCountedItem: () => true,
      createAdItem: (seq) => {
        const product = promoted[seq % promoted.length];
        const img = String(product.imageUrl || '');
        return {
          id: `ad-${seq}`,
          kind: 'ad',
          title: 'Sponsored',
          productId: String(product.id || ''),
          image: img,
          avatar: img,
          media: [{ type: 'image', uri: img }],
        };
      },
    });
  }, [storiesRaw, currentPlan, promoted]);

  const initialStoryId = useMemo(() => {
    return initialStoryIdParam ? String(initialStoryIdParam) : undefined;
  }, [initialStoryIdParam]);

  const initialMediaId = useMemo(() => {
    return initialMediaIdParam ? String(initialMediaIdParam) : undefined;
  }, [initialMediaIdParam]);

  const initialStoryIndex = useMemo(() => {
    if (!stories.length) return 0;
    if (!initialStoryId) return 0;
    const idx = stories.findIndex((s: any) => String((s as any).id) === String(initialStoryId));
    return Math.max(0, idx);
  }, [stories, initialStoryId]);

  const initialMediaIndex = useMemo(() => {
    if (!initialMediaId) return 0;
    const story = stories[initialStoryIndex] as any;
    if (!story || story.kind === 'ad') return 0;
    const list: StoryMedia[] = Array.isArray(story.media) ? story.media : [];
    const idx = list.findIndex((m) => String((m as any).storyId ?? '') === String(initialMediaId));
    return idx >= 0 ? idx : 0;
  }, [initialMediaId, initialStoryIndex, stories]);

  const [currentStoryIndex, setCurrentStoryIndex] = useState(initialStoryIndex);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(initialMediaIndex);
  const [videoLoading, setVideoLoading] = useState(true);

  const [replyOpen, setReplyOpen] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);

  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [blockedSet, setBlockedSet] = useState<Set<string>>(new Set());
  const [followBusyId, setFollowBusyId] = useState<string | null>(null);

  useEffect(() => {
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

  const PagerView = useMemo(() => {
    if (isWeb) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-pager-view').default;
  }, [isWeb]);
  const pagerRef = useRef<any>(null);
  const videoRef = useRef<Video>(null);
  const webviewRef = useRef<any>(null);
  const handleNextMediaRef = useRef<(() => void) | null>(null);

  const viewersSheetRef = useRef<BottomSheet | null>(null);
  const viewersSheetSnapPoints = useMemo(() => ['45%', '75%'], []);
  const [viewCount, setViewCount] = useState(0);
  const [viewers, setViewers] = useState<ViewerEntry[]>([]);
  const seenViewsRecordedRef = useRef<Set<string>>(new Set());

  const progress = useRef(new Animated.Value(0)).current;
  const progressValueRef = useRef(0);
  const progressAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const overlayOpen = replyOpen || viewersOpen;

  const currentStory = stories[currentStoryIndex] ?? stories[0];
  const currentMedia =
    currentStory && Array.isArray((currentStory as any).media) && (currentStory as any).media.length > 0
      ? (currentStory as any).media[currentMediaIndex] ?? (currentStory as any).media[0]
      : undefined;

  // Helpers to detect YouTube links/IDs
  const extractYouTubeId = (uri: string | undefined) => {
    if (!uri) return null;
    const maybeId = uri.trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(maybeId)) return maybeId;
    const short = maybeId.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
    if (short && short[1]) return short[1];
    const long = maybeId.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    if (long && long[1]) return long[1];
    const embed = maybeId.match(/\/embed\/([A-Za-z0-9_-]{11})/);
    if (embed && embed[1]) return embed[1];
    return null;
  };

  const stopProgress = useCallback(() => {
    try {
      progress.stopAnimation((value) => {
        progressValueRef.current = typeof value === 'number' ? value : 0;
      });
    } catch {
      progressValueRef.current = 0;
    }
    try {
      progressAnimRef.current?.stop?.();
    } catch {
      // ignore
    }
  }, [progress]);

  const startProgress = useCallback(
    (fromValue = 0, durationMs = STORY_IMAGE_DURATION_MS) => {
      if (overlayOpen) return;
      progressValueRef.current = fromValue;
      progress.setValue(fromValue);
      progressAnimRef.current?.stop?.();
      const remaining = Math.max(80, (1 - fromValue) * durationMs);
      const anim = Animated.timing(progress, {
        toValue: 1,
        duration: remaining,
        easing: Easing.linear,
        useNativeDriver: false,
      });
      progressAnimRef.current = anim;
      anim.start(({ finished }) => {
        if (finished) handleNextMediaRef.current?.();
      });
    },
    [overlayOpen, progress]
  );

  const pausePlayback = useCallback(() => {
    if (overlayOpen) return;
    stopProgress();

    try {
      videoRef.current?.pauseAsync?.();
    } catch {
      // ignore
    }
    try {
      webviewRef.current?.injectJavaScript?.('window.__pauseStory && window.__pauseStory(); true;');
    } catch {
      // ignore
    }
  }, [overlayOpen, stopProgress]);

  const resumePlayback = useCallback(() => {
    if (overlayOpen) return;
    const isYouTube =
      currentMedia?.type === 'video' && !!extractYouTubeId((currentMedia as any)?.uri || (currentMedia as any)?.url);

    if (currentMedia?.type === 'image') {
      startProgress(progressValueRef.current, STORY_IMAGE_DURATION_MS);
    } else if (isYouTube) {
      startProgress(progressValueRef.current, STORY_VIDEO_FALLBACK_DURATION_MS);
    }

    try {
      if (currentMedia?.type === 'video') {
        videoRef.current?.playAsync?.();
      }
    } catch {
      // ignore
    }
    try {
      webviewRef.current?.injectJavaScript?.('window.__resumeStory && window.__resumeStory(); true;');
    } catch {
      // ignore
    }
  }, [currentMedia?.type, overlayOpen, startProgress]);

  const isAdStory = useMemo(() => Boolean((currentStory as any)?.kind === 'ad'), [currentStory]);
  const storyAdImpressionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (currentPlan !== 'free') return;
    const story: any = currentStory;
    if (!story || story.kind !== 'ad') return;
    const productId = story?.productId ? String(story.productId) : '';
    if (!productId) return;
    if (storyAdImpressionsRef.current.has(productId)) return;
    storyAdImpressionsRef.current.add(productId);
    void trackPromotionImpression({ productId, placement: 'story' }).catch(() => {});
  }, [currentPlan, currentStory]);

  const ownerId = useMemo(() => {
    const s: any = currentStory;
    return s && s.kind !== 'ad' && s.userId ? String(s.userId) : null;
  }, [currentStory]);
  const isOwner = Boolean(ownerId && viewerId && ownerId === viewerId);

  const canReply = useMemo(() => {
    return !!ownerId && !isOwner && !isAdStory;
  }, [isAdStory, isOwner, ownerId]);

  const openReply = useCallback(() => {
    if (!canReply) return;
    stopProgress();
    try {
      videoRef.current?.pauseAsync?.();
    } catch {
      // ignore
    }
    try {
      webviewRef.current?.injectJavaScript?.('window.__pauseStory && window.__pauseStory(); true;');
    } catch {
      // ignore
    }

    setReplyOpen(true);
  }, [canReply, stopProgress]);

  const openViewers = useCallback(() => {
    if (!isOwner) return;
    stopProgress();
    setViewersOpen(true);
    try {
      viewersSheetRef.current?.snapToIndex?.(0);
    } catch {
      // ignore
    }
  }, [isOwner, stopProgress]);

  const closeViewers = useCallback(() => {
    setViewersOpen(false);
    try {
      viewersSheetRef.current?.close?.();
    } catch {
      // ignore
    }
    setTimeout(() => resumePlayback(), 60);
  }, [resumePlayback]);

  const closeReply = useCallback(
    (options: { clearText?: boolean } = {}) => {
      setReplyOpen(false);
      Keyboard.dismiss();
      // resume where we paused
      setTimeout(() => resumePlayback(), 60);
    },
    [resumePlayback]
  );

  const handleSendReplyText = useCallback(
    async (text: string) => {
      const trimmed = String(text || '').trim();
      const story: any = currentStory;
      const targetUserId = story?.userId ? String(story.userId) : null;
      if (!trimmed || !targetUserId) return;

      try {
        const target: Profile = {
          id: targetUserId,
          displayName: story?.username || story?.title || 'Story',
          photoURL: story?.avatar || story?.image || '',
        } as any;
        const conversationId = await findOrCreateConversation(target);
        await sendMessage(conversationId, { text: trimmed });
        closeReply({ clearText: true });
      } catch (e) {
        console.warn('Failed to send story reply', e);
      }
    },
    [closeReply, currentStory]
  );

  const panResponder = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gesture) => {
        const absDx = Math.abs(gesture.dx);
        const absDy = Math.abs(gesture.dy);
        // only claim for a clear vertical swipe
        return absDy > 18 && absDy > absDx * 1.2;
      },
      onPanResponderRelease: (_evt, gesture) => {
        const dy = gesture.dy;
        const dx = gesture.dx;

        if (!overlayOpen && dy < -55 && Math.abs(dx) < 80) {
          if (isOwner) openViewers();
          else openReply();
          return;
        }

        if (overlayOpen && dy > 55 && Math.abs(dx) < 80) {
          if (replyOpen) closeReply();
          if (viewersOpen) closeViewers();
          return;
        }
      },
    });
  }, [closeReply, closeViewers, isOwner, openReply, openViewers, overlayOpen, replyOpen, viewersOpen]);

  useEffect(() => {
    if (!currentStory) return;
    if (overlayOpen) {
      stopProgress();
      return;
    }
    const isYouTube = currentMedia?.type === 'video' && !!extractYouTubeId((currentMedia as any)?.uri);

    if (currentMedia?.type === 'image') {
      startProgress(progressValueRef.current || 0, STORY_IMAGE_DURATION_MS);
    } else if (isYouTube) {
      startProgress(progressValueRef.current || 0, STORY_VIDEO_FALLBACK_DURATION_MS);
    } else {
      // Local video: progress is driven by playback status to match video duration.
      stopProgress();
      progressValueRef.current = 0;
      progress.setValue(0);
    }
    return () => {
      stopProgress();
    };
  }, [currentStoryIndex, currentMediaIndex, currentMedia?.type, overlayOpen, progress, startProgress, stopProgress]);

  const handleNextStory = useCallback(() => {
    if (currentStoryIndex < stories.length - 1) {
      progressValueRef.current = 0;
      pagerRef.current?.setPage(currentStoryIndex + 1);
      setCurrentStoryIndex((p) => p + 1);
      setCurrentMediaIndex(0);
    } else {
      router.back();
    }
  }, [currentStoryIndex, router, stories.length]);

  const handlePreviousStory = useCallback(() => {
    if (currentStoryIndex > 0) {
      progressValueRef.current = 0;
      pagerRef.current?.setPage(currentStoryIndex - 1);
      setCurrentStoryIndex((p) => p - 1);
      setCurrentMediaIndex(0);
    } else {
      router.back();
    }
  }, [currentStoryIndex, router]);

  const handleNextMedia = useCallback(() => {
    if (!currentStory) return;

    const mediaLen = Array.isArray(currentStory.media) ? currentStory.media.length : 0;
    if (currentMediaIndex < mediaLen - 1) {
      progressValueRef.current = 0;
      setCurrentMediaIndex((p) => p + 1);
    } else {
      handleNextStory();
    }
  }, [currentMediaIndex, currentStory, handleNextStory]);

  const handlePreviousMedia = useCallback(() => {
    if (!currentStory) return;
    if (currentMediaIndex > 0) {
      progressValueRef.current = 0;
      setCurrentMediaIndex((p) => p - 1);
    } else {
      handlePreviousStory();
    }
  }, [currentMediaIndex, currentStory, handlePreviousStory]);

  const didLongPressRef = useRef(false);

  const handlePressNext = useCallback(() => {
    if (didLongPressRef.current) return;
    handleNextMedia();
  }, [handleNextMedia]);

  const handlePressPrev = useCallback(() => {
    if (didLongPressRef.current) return;
    handlePreviousMedia();
  }, [handlePreviousMedia]);

  const handleLongPress = useCallback(() => {
    didLongPressRef.current = true;
    pausePlayback();
  }, [pausePlayback]);

  const handlePressOut = useCallback(() => {
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      resumePlayback();
    }
  }, [resumePlayback]);

  useEffect(() => {
    handleNextMediaRef.current = handleNextMedia;
  }, [handleNextMedia]);

  useEffect(() => {
    setCurrentStoryIndex(initialStoryIndex);
    setCurrentMediaIndex(initialMediaIndex);
    try {
      pagerRef.current?.setPage?.(initialStoryIndex);
    } catch {
      // ignore
    }
  }, [initialStoryIndex, initialMediaIndex]);

  const onPageSelected = useCallback(
    (e: any) => {
      const newIndex = e.nativeEvent.position;
      setReplyOpen(false);
      Keyboard.dismiss();
      progressValueRef.current = 0;
      setCurrentStoryIndex(newIndex);
      setCurrentMediaIndex(0);
    },
    []
  );

  const onVideoPlaybackStatusUpdate = useCallback(
    (status: any) => {
      if (status?.isLoaded) {
        setVideoLoading(false);
        if (typeof status.positionMillis === 'number' && typeof status.durationMillis === 'number' && status.durationMillis > 0) {
          const ratio = Math.max(0, Math.min(1, status.positionMillis / status.durationMillis));
          progressValueRef.current = ratio;
          progress.setValue(ratio);
        }
        if (status.didJustFinish) handleNextMedia();
      } else {
        setVideoLoading(true);
      }
    },
    [handleNextMedia, progress]
  );

  const onWebViewMessage = useCallback(
    (event: any) => {
      const data = event.nativeEvent?.data;
      if (data === 'ended') {
        handleNextMedia();
      } else if (data === 'playing') {
        setVideoLoading(false);
      }
    },
    [handleNextMedia]
  );

  const activeStoryDocId = useMemo(() => {
    const id = (currentMedia as any)?.storyId;
    return id != null ? String(id) : null;
  }, [currentMedia]);

  useEffect(() => {
    if (!viewerId) return;
    if (!activeStoryDocId) return;
    if (isOwner) return;

    const key = `${activeStoryDocId}:${viewerId}`;
    if (seenViewsRecordedRef.current.has(key)) return;
    seenViewsRecordedRef.current.add(key);

    void (async () => {
      try {
        const storyRef = doc(firestore, 'stories', activeStoryDocId);
        const viewRef = doc(firestore, 'stories', activeStoryDocId, 'views', viewerId);

        await runTransaction(firestore, async (tx) => {
          const existing = await tx.get(viewRef);
          if (existing.exists()) return;
          tx.set(
            viewRef,
            {
              viewerId,
              viewerName: (user as any)?.displayName ?? null,
              viewerAvatar: (user as any)?.photoURL ?? null,
              createdAt: serverTimestamp(),
            },
            { merge: true }
          );
          tx.set(storyRef, { viewsCount: increment(1) }, { merge: true });
        });
      } catch {
        // ignore (firestore rules / offline)
      }
    })();
  }, [activeStoryDocId, isOwner, user, viewerId]);

  useEffect(() => {
    if (!isOwner) {
      setViewCount(0);
      setViewers([]);
      return;
    }
    if (!activeStoryDocId) {
      setViewCount(0);
      setViewers([]);
      return;
    }

    const viewsRef = collection(firestore, 'stories', activeStoryDocId, 'views');
    const q = query(viewsRef, orderBy('createdAt', 'desc'), limit(200));
    return onSnapshot(
      q,
      (snap) => {
        setViewCount(snap.size);
        setViewers(
          snap.docs.map((d) => {
            const data: any = d.data();
            const ms = data?.createdAt && typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : null;
            return {
              id: d.id,
              viewerId: String(data?.viewerId ?? d.id),
              viewerName: data?.viewerName ?? null,
              viewerAvatar: data?.viewerAvatar ?? null,
              createdAtMs: ms,
            };
          })
        );
      },
      () => {
        setViewCount(0);
        setViewers([]);
      }
    );
  }, [activeStoryDocId, isOwner]);

  const youtubeEmbedHtml = (videoId: string) => `
    <!doctype html><html><head>
    <meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0"/>
    <style>html,body,#player{margin:0;padding:0;height:100%;background:#000}body{display:flex;align-items:center;justify-content:center;height:100%}iframe{width:100%;height:100%;border:0}</style>
    </head><body>
    <div id="player"></div>
    <script>
      var tag=document.createElement('script');tag.src="https://www.youtube.com/iframe_api";document.body.appendChild(tag);
      var player;
      function onYouTubeIframeAPIReady(){
        player=new YT.Player('player',{height:'100%',width:'100%',videoId:'${videoId}',playerVars:{controls:0,autoplay:1,playsinline:1,modestbranding:1,rel:0,fs:0,enablejsapi:1,iv_load_policy:3},events:{onReady:function(e){try{e.target.playVideo()}catch(e){}window.ReactNativeWebView.postMessage('playing')},onStateChange:function(event){if(event.data===0){window.ReactNativeWebView.postMessage('ended')}else if(event.data===1){window.ReactNativeWebView.postMessage('playing')}}}});
      }

      window.__pauseStory = function(){ try{ player && player.pauseVideo && player.pauseVideo(); }catch(e){} };
      window.__resumeStory = function(){ try{ player && player.playVideo && player.playVideo(); }catch(e){} };
    </script>
    </body></html>
  `;

  // If no stories passed, show loader and avoid any indexing
  if (!stories || stories.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFF" />
      </View>
    );
  }

  // Web fallback: avoid native pager-view; show simple first story view
  if (isWeb) {
    const webStory = stories[initialStoryIndex] ?? stories[0];
    const webMedia = webStory?.media?.[0];
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ padding: 16 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>
            {webStory?.title || 'Story'}
          </Text>
          {(webStory as any)?.kind === 'ad' ? (
            <Text style={{ color: '#aaa' }}>Sponsored</Text>
          ) : webMedia?.type === 'image' ? (
            <Image source={{ uri: webMedia.uri }} style={{ width: '100%', height: 320 }} resizeMode="cover" />
          ) : webMedia?.type === 'video' ? (
            <Video
              source={{ uri: webMedia.uri }}
              style={{ width: '100%', height: 320, backgroundColor: '#000' }}
              resizeMode="contain"
              useNativeControls
              shouldPlay
            />
          ) : (
            <Text style={{ color: '#aaa' }}>No media to show.</Text>
          )}
          <Text style={{ color: '#aaa', marginTop: 12 }}>Stories carousel is disabled on web.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // If still no media for the current story, show loader
  if (!currentMedia) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PagerView ref={pagerRef} style={styles.pagerView} initialPage={initialStoryIndex} onPageSelected={onPageSelected}>
        {stories.map((story, storyIdx) => {
          const mediaList = Array.isArray((story as any).media) ? ((story as any).media as StoryMedia[]) : [];
          const isActiveStory = storyIdx === currentStoryIndex;
          const activeMediaIndexForThisStory = isActiveStory ? currentMediaIndex : 0;
          const mediaItem = mediaList[activeMediaIndexForThisStory];

          const isAd = Boolean((story as any)?.kind === 'ad');
          const storyOwnerId = !isAd && (story as any)?.userId ? String((story as any).userId) : null;
          const isMine = Boolean(storyOwnerId && viewerId && storyOwnerId === viewerId);
          const headerTitle = String((story as any)?.username || (story as any)?.title || 'Story');
          const headerAvatar = String((story as any)?.avatar || (story as any)?.image || '');
          const timeLabel = mediaItem?.createdAtMs ? formatTimeAgo(mediaItem.createdAtMs) : '';
          const caption = (mediaItem as any)?.caption ? String((mediaItem as any).caption) : '';
          const overlayText = (mediaItem as any)?.overlayText ? String((mediaItem as any).overlayText) : '';

          return (
            <View key={String((story as any).id)} style={styles.page}>
              <SafeAreaView style={styles.header} pointerEvents="box-none">
                <View style={styles.progressRow}>
                  {mediaList.map((_, mediaIdx) => {
                    const widthValue =
                      storyIdx < currentStoryIndex
                        ? '100%'
                        : storyIdx > currentStoryIndex
                          ? '0%'
                          : mediaIdx < currentMediaIndex
                            ? '100%'
                            : mediaIdx > currentMediaIndex
                              ? '0%'
                              : progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

                    return (
                      <View key={mediaIdx} style={styles.progressTrack}>
                        <Animated.View style={[styles.progressFill, { width: widthValue }]} />
                      </View>
                    );
                  })}
                </View>

                <View style={styles.headerBar}>
                  <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.85}>
                    <Ionicons name="chevron-back" size={26} color="#fff" />
                  </TouchableOpacity>

                  <View style={styles.headerIdentity}>
                    {headerAvatar ? (
                      <Image source={{ uri: headerAvatar }} style={styles.headerAvatar} />
                    ) : (
                      <View style={styles.headerAvatarFallback} />
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.headerName} numberOfLines={1}>
                        {headerTitle}
                      </Text>
                      <Text style={styles.headerMeta} numberOfLines={1}>
                        {timeLabel || `${Math.min(activeMediaIndexForThisStory + 1, mediaList.length)}/${mediaList.length}`}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.headerRight}>
                    {isAd ? (
                      <View style={styles.adPill}>
                        <Text style={styles.adPillText}>AD</Text>
                      </View>
                    ) : storyOwnerId && viewerId && !isMine ? (
                      <TouchableOpacity
                        style={[
                          styles.followHeaderBtn,
                          followingSet.has(storyOwnerId) && styles.followHeaderBtnFollowing,
                          blockedSet.has(storyOwnerId) && styles.followHeaderBtnDisabled,
                          followBusyId === storyOwnerId && { opacity: 0.65 },
                        ]}
                        activeOpacity={0.85}
                        disabled={blockedSet.has(storyOwnerId) || followBusyId === storyOwnerId}
                        onPress={async () => {
                          if (!storyOwnerId || !viewerId) return;
                          if (storyOwnerId === viewerId) return;

                          setFollowBusyId(storyOwnerId);
                          try {
                            if (followingSet.has(storyOwnerId)) {
                              await unfollowUser({ viewerId, targetId: storyOwnerId });
                              setFollowingSet((prev) => {
                                const next = new Set(prev);
                                next.delete(storyOwnerId);
                                return next;
                              });
                            } else {
                              await followUser({
                                viewerId,
                                targetId: storyOwnerId,
                                actorName: (user as any)?.displayName || 'A new user',
                                actorAvatar: (user as any)?.photoURL || null,
                                notify: true,
                              });
                              setFollowingSet((prev) => new Set(prev).add(storyOwnerId));
                            }
                          } catch (e) {
                            console.warn('[story-viewer] follow toggle failed', e);
                          } finally {
                            setFollowBusyId(null);
                          }
                        }}
                      >
                        <Text style={styles.followHeaderBtnText}>
                          {blockedSet.has(storyOwnerId)
                            ? 'Blocked'
                            : followingSet.has(storyOwnerId)
                              ? 'Following'
                              : 'Follow'}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </SafeAreaView>

              <View style={styles.mediaContainer}>
                {isAd ? (
                  <View style={styles.adStory}>
                    {(() => {
                      const adImage = String((story as any)?.image || mediaList?.[0]?.uri || '');
                      return adImage ? (
                        <Image source={{ uri: adImage }} style={styles.adStoryImage} resizeMode="cover" />
                      ) : null;
                    })()}
                    <View style={styles.adStoryOverlay}>
                      <Text style={styles.adBadge}>Sponsored</Text>
                      <Text style={styles.adTitle}>Shop this drop</Text>
                      <Text style={styles.adSubtitle}>Support creators • Tap to view</Text>
                      <TouchableOpacity
                        activeOpacity={0.9}
                        style={styles.adCtaBtn}
                        onPress={() => {
                          const productId = String((story as any)?.productId || '');
                          if (!productId) return;
                          void trackPromotionClick({ productId, placement: 'story' }).catch(() => {});
                          router.push((`/marketplace/${productId}`) as any);
                        }}
                      >
                        <Text style={styles.adCtaText}>Shop</Text>
                      </TouchableOpacity>
                      <Text style={styles.adHint}>Swipe to continue</Text>
                    </View>
                  </View>
                ) : !isActiveStory ? (
                  <View style={styles.mediaFrame}>
                    <Image source={{ uri: String((story as any)?.image || mediaList?.[0]?.uri || '') }} style={styles.media} resizeMode="cover" />
                  </View>
                ) : mediaItem?.type === 'image' ? (
                  <View style={styles.mediaFrame}>
                    <Image source={{ uri: mediaItem.uri }} style={styles.media} resizeMode="cover" />
                  </View>
                ) : (
                  <View style={styles.videoWrapper}>
                    {(() => {
                      const ytId = extractYouTubeId(mediaItem?.uri);
                      if (ytId) {
                        return (
                          <>
                            {videoLoading && <ActivityIndicator size="large" color="#FFF" style={styles.videoLoader} />}
                            <WebView
                              ref={(r) => (webviewRef.current = r)}
                              source={{ html: youtubeEmbedHtml(ytId) }}
                              style={styles.media}
                              javaScriptEnabled
                              domStorageEnabled
                              allowsInlineMediaPlayback
                              mediaPlaybackRequiresUserAction={false}
                              onMessage={onWebViewMessage}
                              originWhitelist={['*']}
                              startInLoadingState
                              automaticallyAdjustContentInsets={false}
                              containerStyle={{ backgroundColor: 'black' }}
                            />
                          </>
                        );
                      }

                      return (
                        <>
                          {videoLoading && <ActivityIndicator size="large" color="#FFF" style={styles.videoLoader} />}
                          <Video
                            ref={videoRef}
                            style={styles.media}
                            source={{ uri: String(mediaItem?.uri || '') }}
                            useNativeControls={false}
                            resizeMode="cover"
                            isLooping={false}
                            shouldPlay={isActiveStory && !overlayOpen}
                            onPlaybackStatusUpdate={onVideoPlaybackStatusUpdate}
                            onLoadStart={() => setVideoLoading(true)}
                            onReadyForDisplay={() => setVideoLoading(false)}
                          />
                        </>
                      );
                    })()}
                  </View>
                )}

                <LinearGradient
                  colors={['rgba(0,0,0,0.65)', 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.topFade}
                  pointerEvents="none"
                />
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.72)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.bottomFade}
                  pointerEvents="none"
                />

                <View style={styles.touchOverlay} pointerEvents="box-none">
                  <Pressable
                    style={styles.touchZone}
                    onPress={handlePressPrev}
                    onLongPress={handleLongPress}
                    delayLongPress={180}
                    onPressOut={handlePressOut}
                    {...panResponder.panHandlers}
                  />
                  <Pressable
                    style={styles.touchZone}
                    onPress={handlePressNext}
                    onLongPress={handleLongPress}
                    delayLongPress={180}
                    onPressOut={handlePressOut}
                    {...panResponder.panHandlers}
                  />
                </View>
              </View>

              {isActiveStory && overlayText ? (
                <View style={styles.overlayTextChip} pointerEvents="none">
                  <Text style={styles.overlayText} numberOfLines={3}>
                    {overlayText}
                  </Text>
                </View>
              ) : null}

              {isActiveStory && (caption || isMine || canReply) ? (
                <View style={styles.bottomHud} pointerEvents={replyOpen ? 'none' : 'box-none'}>
                  {caption ? (
                    <View style={styles.captionPill} pointerEvents="none">
                      <Text style={styles.captionText} numberOfLines={3}>
                        {caption}
                      </Text>
                    </View>
                  ) : null}

                  {isMine ? (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={openViewers}
                      style={styles.viewsRow}
                      accessibilityRole="button"
                      accessibilityLabel="View story viewers"
                    >
                      <Ionicons name="eye-outline" size={18} color="rgba(255,255,255,0.92)" />
                      <Text style={styles.viewsText}>{viewCount}</Text>
                      <Ionicons name="chevron-up" size={16} color="rgba(255,255,255,0.75)" />
                    </TouchableOpacity>
                  ) : canReply && !replyOpen ? (
                    <View style={styles.swipeHint} pointerEvents="none">
                      <Ionicons name="chevron-up" size={18} color="rgba(255,255,255,0.75)" />
                      <Text style={styles.swipeHintText}>Swipe up to reply</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {isActiveStory && canReply && replyOpen ? (
                <KeyboardAvoidingView
                  behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                  style={styles.replyOverlay}
                >
                  <Pressable style={styles.replyBackdrop} onPress={() => closeReply()} />
                  <MessageInput
                    onSendMessage={handleSendReplyText}
                    onTypingChange={undefined}
                    disabled={false}
                  />
                </KeyboardAvoidingView>
              ) : null}
            </View>
          );
        })}
      </PagerView>

      {isOwner ? (
        <BottomSheet
          ref={(r) => (viewersSheetRef.current = r)}
          index={-1}
          snapPoints={viewersSheetSnapPoints}
          enablePanDownToClose
          onClose={() => {
            setViewersOpen(false);
            setTimeout(() => resumePlayback(), 60);
          }}
          onChange={(idx) => setViewersOpen(idx >= 0)}
          backdropComponent={(p) => <BottomSheetBackdrop {...p} disappearsOnIndex={-1} appearsOnIndex={0} />}
          backgroundStyle={styles.sheetBg}
          handleIndicatorStyle={styles.sheetHandle}
        >
          <View style={styles.sheetContent}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Viewed by</Text>
              <Text style={styles.sheetCount}>{viewCount}</Text>
            </View>

            {viewers.length === 0 ? (
              <View style={styles.sheetEmpty}>
                <Text style={styles.sheetEmptyText}>No views yet</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetList}>
                {viewers.map((v) => (
                  <View key={v.id} style={styles.viewerRow}>
                    {v.viewerAvatar ? (
                      <Image source={{ uri: v.viewerAvatar }} style={styles.viewerAvatar} />
                    ) : (
                      <View style={styles.viewerAvatarFallback} />
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.viewerName} numberOfLines={1}>
                        {v.viewerName || v.viewerId}
                      </Text>
                      <Text style={styles.viewerMeta} numberOfLines={1}>
                        {v.createdAtMs ? formatTimeAgo(v.createdAtMs) : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </BottomSheet>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  pagerView: { flex: 1 },
  page: { flex: 1, backgroundColor: '#000' },

  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, paddingHorizontal: 10, paddingTop: 6 },
  progressRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 2, paddingTop: 4 },
  progressTrack: {
    flex: 1,
    height: 2.6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 999 },

  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
    paddingTop: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  headerIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  headerAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.08)' },
  headerAvatarFallback: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.10)' },
  headerName: { color: '#fff', fontSize: 14, fontWeight: '800' },
  headerMeta: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },
  headerRight: { alignItems: 'flex-end' },
  adPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  adPillText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },

  followHeaderBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#e50914',
  },
  followHeaderBtnFollowing: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  followHeaderBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  followHeaderBtnText: { color: '#fff', fontSize: 12, fontWeight: '900' },

  mediaContainer: { flex: 1 },
  mediaFrame: { flex: 1, backgroundColor: '#000' },
  media: { width: '100%', height: '100%', backgroundColor: '#000' },
  videoWrapper: { flex: 1, backgroundColor: '#000' },
  videoLoader: { position: 'absolute', zIndex: 10, alignSelf: 'center', top: '48%' },
  topFade: { position: 'absolute', left: 0, right: 0, top: 0, height: 160, zIndex: 2 },
  bottomFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 220, zIndex: 2 },

  touchOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 5, flexDirection: 'row' },
  touchZone: { flex: 1 },

  overlayTextChip: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: '26%',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  overlayText: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center' },

  bottomHud: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 16,
    zIndex: 10,
    alignItems: 'center',
  },
  captionPill: {
    maxWidth: '100%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 10,
  },
  captionText: { color: 'rgba(255,255,255,0.92)', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  viewsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  viewsText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  swipeHint: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  swipeHintText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700' },

  replyOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 60, justifyContent: 'flex-end' },
  replyBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  replyBar: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(10,10,12,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 2, paddingHorizontal: 8 },
  replySendBtn: { paddingLeft: 10, paddingVertical: 6 },

  adStory: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#05060f' },
  adBadge: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 12,
  },
  adTitle: { color: '#fff', fontSize: 26, fontWeight: '900', marginBottom: 8 },
  adSubtitle: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '700' },
  adStoryImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    opacity: 0.35,
  },
  adStoryOverlay: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  adCtaBtn: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#e50914',
  },
  adCtaText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  adHint: {
    marginTop: 14,
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '700',
  },

  sheetBg: { backgroundColor: 'rgba(12,12,16,0.98)' },
  sheetHandle: { backgroundColor: 'rgba(255,255,255,0.22)' },
  sheetContent: { flex: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18 },
  sheetHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  sheetCount: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '800' },
  sheetEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sheetEmptyText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '700' },
  sheetList: { gap: 12, paddingBottom: 18 },
  viewerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  viewerAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.06)' },
  viewerAvatarFallback: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.08)' },
  viewerName: { color: '#fff', fontSize: 14, fontWeight: '800' },
  viewerMeta: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 },
});

export default StoryViewerScreen;
