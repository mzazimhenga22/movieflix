import { Ionicons } from '@expo/vector-icons';
import type { Transaction } from '@firebase/firestore';
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
} from '@firebase/firestore';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useVideoPlayer, VideoView } from 'expo-video';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { State as GestureState, PanGestureHandler, TapGestureHandler } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


import { useStoryAudio } from '@/hooks/use-story-audio';
import { firestore } from '../constants/firebase';
import { usePromotedProducts } from '../hooks/use-promoted-products';
import { useUser } from '../hooks/use-user';
import { injectAdsWithPattern } from '../lib/ads/sequence';
import { followUser, unfollowUser } from '../lib/followGraph';
import { useSubscription } from '../providers/SubscriptionProvider';
import { trackPromotionClick, trackPromotionImpression } from './marketplace/api';
import { findOrCreateConversation, sendMessage, type Profile } from './messaging/controller';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const STORY_IMAGE_DURATION_MS = 8000;
const REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👏'] as const;

type StoryMedia = {
  type: 'image' | 'video';
  uri: string;
  storyId?: string | number;
  caption?: string;
  overlayText?: string;
  liveStreamId?: string | null;
  createdAtMs?: number | null;
};

type MusicTrack = {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  startTime?: number;
  duration?: number;
};

type Story = {
  id: string | number;
  title: string;
  image?: string;
  avatar?: string | null;
  userId?: string | null;
  username?: string | null;
  media: StoryMedia[];
  musicTrack?: MusicTrack | null;
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
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
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

  // Cinematic animations
  const ambientPulse = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.92)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const ringRotation = useRef(new Animated.Value(0)).current;
  const glowIntensity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Entrance animation
    Animated.parallel([
      Animated.spring(cardScale, { toValue: 1, tension: 60, friction: 12, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // Ambient pulse loop
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(ambientPulse, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(ambientPulse, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    pulse.start();

    // Ring rotation
    const spin = Animated.loop(
      Animated.timing(ringRotation, { toValue: 1, duration: 20000, easing: Easing.linear, useNativeDriver: true })
    );
    spin.start();

    // Glow pulse
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowIntensity, { toValue: 0.7, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowIntensity, { toValue: 0.3, duration: 2000, useNativeDriver: true }),
      ])
    );
    glow.start();

    return () => {
      pulse.stop();
      spin.stop();
      glow.stop();
    };
  }, [ambientPulse, cardScale, cardOpacity, ringRotation, glowIntensity]);

  // preload preference: start muted unless a story music track is present
  // (currentMusicTrack is declared later at line ~397, so we read from currentStory directly)
  const earlyMusicTrack = useMemo(() => {
    const story: any = stories[0];
    return story?.musicTrack ?? null;
  }, [stories]);

  useEffect(() => {
    if (earlyMusicTrack) {
      setIsMuted(false);
    } else {
      setIsMuted(true);
    }
  }, [earlyMusicTrack]);

  const storiesRaw: Story[] = useMemo(() => {
    if (!storiesParam) return [];
    try {
      const parsed = JSON.parse(storiesParam as string);
      return Array.isArray(parsed) ? (parsed as Story[]) : [];
    } catch {
      return [];
    }
  }, [storiesParam]);

  const prefetchUris = useCallback((uris: string[]) => {
    const tasks = uris
      .filter(Boolean)
      .slice(0, 4)
      .map((uri) => ExpoImage.prefetch(uri));
    if (tasks.length) {
      void Promise.all(tasks).catch(() => { });
    }
  }, []);

  const stories: StoryItem[] = useMemo(() => {
    if (currentPlan !== 'free') return storiesRaw;
    if (!promoted.length) return storiesRaw;

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

  const insets = useSafeAreaInsets();
  const [currentStoryIndex, setCurrentStoryIndex] = useState(initialStoryIndex);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(initialMediaIndex);
  const [videoLoading, setVideoLoading] = useState(true);
  const [mediaError, setMediaError] = useState(false);
  const [mediaReloadNonce, setMediaReloadNonce] = useState(0);

  const [replyOpen, setReplyOpen] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [showHeart, setShowHeart] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [replyText, setReplyText] = useState('');

  // TikTok Live-style floating emoji reactions
  type FloatingEmoji = { id: number; emoji: string; x: number; anim: any };
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const floatingIdRef = useRef(0);

  // Smooth animations
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const reactionBarOpacity = useRef(new Animated.Value(0)).current;
  const muteIconScale = useRef(new Animated.Value(1)).current;

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
      (snap: any) => {
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
  const handleNextMediaRef = useRef<(() => void) | null>(null);
  const handleNextStoryRef = useRef<(() => void) | null>(null);
  const handlePreviousStoryRef = useRef<(() => void) | null>(null);
  const gestureTranslationRef = useRef({ x: 0, y: 0 });

  const currentStory = stories[currentStoryIndex] ?? stories[0];
  const currentMedia =
    currentStory && Array.isArray((currentStory as any).media) && (currentStory as any).media.length > 0
      ? (currentStory as any).media[currentMediaIndex] ?? (currentStory as any).media[0]
      : undefined;

  const player = useVideoPlayer(currentMedia?.type === 'video' ? currentMedia.uri : null, (p) => {
    p.loop = false;
    p.muted = isMuted;
  });

  const viewersSheetRef = useRef<BottomSheetModal | null>(null);
  const viewersSheetSnapPoints = useMemo(() => ['50%', '80%'], []);


  // Refactor: Manual keyboard handling for reply
  const replyInputRef = useRef<any>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const keyboardHeightAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!replyOpen) return;
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e: any) => {
        setKeyboardVisible(true);
        Animated.timing(keyboardHeightAnim, {
          toValue: e.endCoordinates.height,
          duration: Math.min(e.duration || 250, 250), // Cap duration for snappiness
          useNativeDriver: false,
          easing: Easing.out(Easing.poly(4)), // Smoother easing
        }).start();
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      (e: any) => {
        setKeyboardVisible(false);
        Animated.timing(keyboardHeightAnim, {
          toValue: 0,
          duration: Math.min(e.duration || 250, 200),
          useNativeDriver: false,
          easing: Easing.out(Easing.poly(4)),
        }).start();
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [replyOpen]);
  const [viewCount, setViewCount] = useState(0);
  const [viewers, setViewers] = useState<ViewerEntry[]>([]);
  const seenViewsRecordedRef = useRef<Set<string>>(new Set());

  const progress = useRef(new Animated.Value(0)).current;
  const progressValueRef = useRef(0);
  const progressAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const videoProgressDriveRef = useRef({
    key: '',
    isPlaying: false,
    isBuffering: false,
    durationMillis: 0,
    started: false,
  });

  const overlayOpen = replyOpen || viewersOpen;

  useEffect(() => {
    if (!stories.length) return;
    const story = stories[currentStoryIndex] as any;
    if (!story || story.kind === 'ad') return;

    const list: StoryMedia[] = Array.isArray(story.media) ? story.media : [];
    const current = list[currentMediaIndex] || list[0];
    const nextMedia = list[currentMediaIndex + 1];
    const prevMedia = currentMediaIndex > 0 ? list[currentMediaIndex - 1] : null;

    const nextStory = stories[currentStoryIndex + 1] as any;
    const prevStory = currentStoryIndex > 0 ? (stories[currentStoryIndex - 1] as any) : null;

    const uris: string[] = [];
    if (current?.uri) uris.push(String(current.uri));
    if (nextMedia?.uri) uris.push(String(nextMedia.uri));
    if (prevMedia?.uri) uris.push(String(prevMedia.uri));
    if (nextStory?.media?.[0]?.uri) uris.push(String(nextStory.media[0].uri));
    if (prevStory?.media?.[0]?.uri) uris.push(String(prevStory.media[0].uri));

    prefetchUris(uris);
  }, [currentStoryIndex, currentMediaIndex, prefetchUris, stories]);

  // Music Playback
  const currentMusicTrack = (currentStory as any)?.musicTrack ?? null;
  useStoryAudio({
    musicTrack: currentMusicTrack,
    active: !overlayOpen && !videoLoading && !mediaError,
    muted: isMuted,
  });

  const stopProgress = useCallback(() => {
    try {
      progress.stopAnimation((value: number) => {
        progressValueRef.current = typeof value === 'number' ? value : 0;
      });
    } catch {
      progressValueRef.current = 0;
    }
    try {
      progressAnimRef.current?.stop?.();
    } catch { }
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
        useNativeDriver: true,
      });
      progressAnimRef.current = anim;
      anim.start(({ finished }: { finished: boolean }) => {
        if (finished) handleNextMediaRef.current?.();
      });
    },
    [overlayOpen, progress]
  );

  const retryCurrentMedia = useCallback(() => {
    setMediaError(false);
    setMediaReloadNonce((n) => n + 1);
    setVideoLoading(true);
    stopProgress();
    progressValueRef.current = 0;
    progress.setValue(0);
    if (currentMedia?.type === 'image') {
      startProgress(0, STORY_IMAGE_DURATION_MS);
    }
  }, [currentMedia?.type, progress, startProgress, stopProgress]);

  useEffect(() => {
    setMediaError(false);
    setVideoLoading(true);
  }, [currentStoryIndex, currentMediaIndex]);

  const pausePlayback = useCallback(() => {
    if (overlayOpen) return;
    stopProgress();
    try { player.pause(); } catch { }
  }, [overlayOpen, stopProgress, player]);

  const resumePlayback = useCallback(() => {
    if (overlayOpen) return;

    if (currentMedia?.type === 'image') {
      startProgress(progressValueRef.current, STORY_IMAGE_DURATION_MS);
    }

    try { if (currentMedia?.type === 'video') player.play(); } catch { }
  }, [currentMedia?.type, overlayOpen, startProgress, player]);

  // Navigation and gesture handlers
  const handlePressPrev = useCallback(() => {
    const mediaList = Array.isArray((currentStory as any).media) ? ((currentStory as any).media as StoryMedia[]) : [];
    if (currentMediaIndex > 0) {
      setCurrentMediaIndex(currentMediaIndex - 1);
    } else if (currentStoryIndex > 0) {
      const prevStory = stories[currentStoryIndex - 1] as any;
      const prevMediaList = Array.isArray(prevStory?.media) ? prevStory.media : [];
      setCurrentStoryIndex(currentStoryIndex - 1);
      setCurrentMediaIndex(Math.max(0, prevMediaList.length - 1));
    }
    stopProgress();
    progressValueRef.current = 0;
    progress.setValue(0);
  }, [currentMediaIndex, currentStoryIndex, currentStory, stories, stopProgress, progress]);

  const handlePressNext = useCallback(() => {
    const mediaList = Array.isArray((currentStory as any).media) ? ((currentStory as any).media as StoryMedia[]) : [];
    if (currentMediaIndex < mediaList.length - 1) {
      setCurrentMediaIndex(currentMediaIndex + 1);
    } else if (currentStoryIndex < stories.length - 1) {
      setCurrentStoryIndex(currentStoryIndex + 1);
      setCurrentMediaIndex(0);
    } else {
      router.back();
    }
    stopProgress();
    progressValueRef.current = 0;
    progress.setValue(0);
  }, [currentMediaIndex, currentStoryIndex, currentStory, stories, stopProgress, progress, router]);

  const handleLongPress = useCallback(() => {
    pausePlayback();
  }, [pausePlayback]);

  const handlePressOut = useCallback(() => {
    resumePlayback();
  }, [resumePlayback]);

  const handleSwipeGestureEvent = useCallback((event: any) => {
    gestureTranslationRef.current = {
      x: event.nativeEvent?.translationX ?? 0,
      y: event.nativeEvent?.translationY ?? 0,
    };
  }, []);

  const handleSwipeStateChange = useCallback((event: any) => {
    if (event.nativeEvent?.state === GestureState.END) {
      const { x, y } = gestureTranslationRef.current;
      
      // Swipe down to close
      if (y > 80) {
        router.back();
        return;
      }
      
      // Swipe left for next story
      if (x < -60 && currentStoryIndex < stories.length - 1) {
        setCurrentStoryIndex(currentStoryIndex + 1);
        setCurrentMediaIndex(0);
        stopProgress();
        progressValueRef.current = 0;
        progress.setValue(0);
        return;
      }
      
      // Swipe right for previous story
      if (x > 60 && currentStoryIndex > 0) {
        setCurrentStoryIndex(currentStoryIndex - 1);
        setCurrentMediaIndex(0);
        stopProgress();
        progressValueRef.current = 0;
        progress.setValue(0);
        return;
      }
    }
  }, [currentStoryIndex, stories, stopProgress, progress, router]);

  const onPageSelected = useCallback((event: any) => {
    const position = event.nativeEvent?.position;
    if (typeof position === 'number' && position !== currentStoryIndex) {
      setCurrentStoryIndex(position);
      setCurrentMediaIndex(0);
      stopProgress();
      progressValueRef.current = 0;
      progress.setValue(0);
    }
  }, [currentStoryIndex, stopProgress, progress]);

  // Store navigation handlers in refs
  useEffect(() => {
    handleNextMediaRef.current = handlePressNext;
    handleNextStoryRef.current = () => {
      if (currentStoryIndex < stories.length - 1) {
        setCurrentStoryIndex(currentStoryIndex + 1);
        setCurrentMediaIndex(0);
      }
    };
    handlePreviousStoryRef.current = () => {
      if (currentStoryIndex > 0) {
        setCurrentStoryIndex(currentStoryIndex - 1);
        setCurrentMediaIndex(0);
      }
    };
  }, [handlePressNext, currentStoryIndex, stories.length]);

  useEffect(() => {
    player.muted = isMuted;
  }, [isMuted, player]);

  useEffect(() => {
    if (currentMedia?.type === 'video' && !overlayOpen) {
      player.play();
    } else {
      player.pause();
    }
  }, [currentMedia?.type, overlayOpen, player]);

  useEffect(() => {
    const subStatus = player.addListener('statusChange', (status) => {
      if (status === 'ready') setVideoLoading(false);
      if (status === 'loading') setVideoLoading(true);
      if (status === 'error') {
        setMediaError(true);
        setVideoLoading(false);
        stopProgress();
      }
    });

    const subTime = player.addListener('timeUpdate', (data) => {
      const durationMillis = data.duration * 1000;
      const positionMillis = data.currentTime * 1000;

      if (durationMillis > 0) {
        const ratio = Math.max(0, Math.min(1, positionMillis / durationMillis));
        progressValueRef.current = ratio;

        const driveKey = `${currentStoryIndex}:${currentMediaIndex}:${durationMillis}`;
        const drive = videoProgressDriveRef.current;
        const keyChanged = drive.key !== driveKey;
        if (keyChanged) {
          drive.key = driveKey;
          drive.started = false;
          try { progress.setValue(ratio); } catch { }
        }

        const isPlaying = player.playing;
        const isBuffering = player.status === 'buffering';
        const shouldDrive = isPlaying && !isBuffering && !overlayOpen;

        if (shouldDrive) {
          if (!drive.started || drive.durationMillis !== durationMillis) {
            drive.durationMillis = durationMillis;
            drive.started = true;
            try { progress.setValue(ratio); } catch { }
            startProgress(ratio, durationMillis);
          }
        } else {
          if (drive.started) stopProgress();
          drive.started = false;
          try { progress.setValue(ratio); } catch { }
        }
      }
    });

    const subEnd = player.addListener('playToEnd', () => {
      handleNextMediaRef.current?.();
    });

    return () => {
      subStatus.remove();
      subTime.remove();
      subEnd.remove();
    };
  }, [currentMediaIndex, currentStoryIndex, overlayOpen, player, progress, startProgress, stopProgress]);

  const activeStoryDocId = useMemo(() => {
    const id = (currentMedia as any)?.storyId;
    return id != null ? String(id) : null;
  }, [currentMedia]);

  useEffect(() => {
    if (!viewerId || !activeStoryDocId || isOwner) return;

    const key = `${activeStoryDocId}:${viewerId}`;
    if (seenViewsRecordedRef.current.has(key)) return;
    seenViewsRecordedRef.current.add(key);

    void (async () => {
      try {
        const storyRef = doc(firestore, 'stories', activeStoryDocId);
        const viewRef = doc(firestore, 'stories', activeStoryDocId, 'views', viewerId);

        await runTransaction(firestore, async (tx: Transaction) => {
          const existing = await tx.get(viewRef);
          if (existing.exists()) return;
          tx.set(viewRef, {
            viewerId,
            viewerName: (user as any)?.displayName ?? null,
            viewerAvatar: (user as any)?.photoURL ?? null,
            createdAt: serverTimestamp(),
          }, { merge: true });
          tx.set(storyRef, { viewsCount: increment(1) }, { merge: true });
        });
      } catch { }
    })();
  }, [activeStoryDocId, isOwner, user, viewerId]);

  useEffect(() => {
    if (!isOwner || !activeStoryDocId) {
      setViewCount(0);
      setViewers([]);
      return;
    }

    const viewsRef = collection(firestore, 'stories', activeStoryDocId, 'views');
    const q = query(viewsRef, orderBy('createdAt', 'desc'), limit(200));
    return onSnapshot(q, (snap: any) => {
      setViewCount(snap.size);
      setViewers(snap.docs.map((d: any) => {
        const data: any = d.data();
        const ms = data?.createdAt && typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : null;
        return {
          id: d.id,
          viewerId: String(data?.viewerId ?? d.id),
          viewerName: data?.viewerName ?? null,
          viewerAvatar: data?.viewerAvatar ?? null,
          createdAtMs: ms,
        };
      }));
    }, () => { setViewCount(0); setViewers([]); });
  }, [activeStoryDocId, isOwner]);

  // Double tap to like with heart animation
  const triggerDoubleTapLike = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setShowHeart(true);
    heartScale.setValue(0);
    heartOpacity.setValue(1);

    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.2, tension: 100, friction: 5, useNativeDriver: true }),
      Animated.timing(heartScale, { toValue: 1, duration: 100, useNativeDriver: true }),
      Animated.delay(600),
      Animated.timing(heartOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setShowHeart(false));
  }, [heartScale, heartOpacity]);

  // Toggle mute with feedback
  const toggleMute = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsMuted(prev => !prev);
    Animated.sequence([
      Animated.timing(muteIconScale, { toValue: 1.3, duration: 100, useNativeDriver: true }),
      Animated.spring(muteIconScale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  }, [muteIconScale]);

  // Show/hide reactions bar
  const toggleReactions = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const toValue = showReactions ? 0 : 1;
    setShowReactions(!showReactions);
    Animated.spring(reactionBarOpacity, { toValue, tension: 100, friction: 8, useNativeDriver: true }).start();
  }, [showReactions, reactionBarOpacity]);

  // Send reaction — TikTok Live-style float-up
  const sendReaction = useCallback((emoji: string) => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setShowReactions(false);
    reactionBarOpacity.setValue(0);

    // Spawn a floating emoji with unique id and random x-offset
    const id = floatingIdRef.current++;
    const x = 20 + Math.random() * 60; // random right-side offset
    const anim = new Animated.Value(0);
    const entry: FloatingEmoji = { id, emoji, x, anim };
    setFloatingEmojis((prev) => [...prev, entry]);

    Animated.timing(anim, {
      toValue: 1,
      duration: 1800,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      setFloatingEmojis((prev) => prev.filter((e) => e.id !== id));
    });
  }, [reactionBarOpacity]);

  // Share story
  const handleShare = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    try {
      const story: any = currentStory;
      const title = story?.username || story?.title || 'Story';
      await Share.share({
        message: `Check out ${title}'s story on MovieFlix!`,
        title: 'Share Story',
      });
    } catch { }
  }, [currentStory]);

  const handleFollowToggle = useCallback(async (storyOwnerId: string) => {
    if (!storyOwnerId || !viewerId || storyOwnerId === viewerId) return;
    setFollowBusyId(storyOwnerId);
    try {
      if (followingSet.has(storyOwnerId)) {
        await unfollowUser({ viewerId, targetId: storyOwnerId });
        setFollowingSet((prev) => { const next = new Set(prev); next.delete(storyOwnerId); return next; });
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
  }, [followingSet, user, viewerId]);

  // Loading states
  if (!stories || stories.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient colors={['#0a0a12', '#151520', '#0a0a12']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color="#e50914" />
      </View>
    );
  }

  if (isWeb) {
    const webStory = stories[initialStoryIndex] ?? stories[0];
    const webMedia = webStory?.media?.[0];
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#0a0a12', '#151520']} style={StyleSheet.absoluteFill} />
        <View style={{ padding: 24, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{webStory?.title || 'Story'}</Text>
          {webMedia?.type === 'image' && (
            <Image source={{ uri: webMedia.uri }} style={{ width: 320, height: 480, borderRadius: 24, marginTop: 20 }} resizeMode="cover" />
          )}
          <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 16 }}>Stories viewer is optimized for mobile</Text>
        </View>
      </View>
    );
  }

  if (!currentMedia) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient colors={['#0a0a12', '#151520', '#0a0a12']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color="#e50914" />
      </View>
    );
  }

  const mediaList = Array.isArray((currentStory as any).media) ? ((currentStory as any).media as StoryMedia[]) : [];
  const isAd = Boolean((currentStory as any)?.kind === 'ad');
  const storyOwnerId = !isAd && (currentStory as any)?.userId ? String((currentStory as any).userId) : null;
  const isMine = Boolean(storyOwnerId && viewerId && storyOwnerId === viewerId);
  const headerTitle = String((currentStory as any)?.username || (currentStory as any)?.title || 'Story');
  const headerAvatar = String((currentStory as any)?.avatar || (currentStory as any)?.image || '');
  const timeLabel = currentMedia?.createdAtMs ? formatTimeAgo(currentMedia.createdAtMs) : '';
  const caption = (currentMedia as any)?.caption ? String((currentMedia as any).caption) : '';
  const overlayText = (currentMedia as any)?.overlayText ? String((currentMedia as any).overlayText) : '';
  const liveStreamId = (currentMedia as any)?.liveStreamId ? String((currentMedia as any).liveStreamId) : null;

  const spinInterpolate = ringRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#08080f', '#0f0f18', '#08080f']} style={StyleSheet.absoluteFill} />

      {/* Ambient background orbs */}
      <Animated.View style={[styles.ambientOrb, styles.ambientOrb1, { opacity: ambientPulse }]} />
      <Animated.View style={[styles.ambientOrb, styles.ambientOrb2, { opacity: Animated.subtract(1, ambientPulse) }]} />

      <PagerView ref={pagerRef} style={styles.pagerView} initialPage={initialStoryIndex} onPageSelected={onPageSelected}>
        {stories.map((story, storyIdx) => (
          <View key={String((story as any).id)} style={styles.page}>
            {/* Cinematic card container */}
            <Animated.View style={[styles.cinematicCard, { transform: [{ scale: cardScale }], opacity: cardOpacity }]}>
              {/* Rotating ring indicator */}
              <Animated.View style={[styles.ringContainer, { transform: [{ rotate: spinInterpolate }] }]}>
                <View style={styles.ringTrack}>
                  <Animated.View
                    style={[
                      styles.ringProgress,
                      {
                        width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                      }
                    ]}
                  />
                </View>
              </Animated.View>

              {/* Glass frame */}
              <View style={styles.glassFrame}>
                {Platform.OS === 'ios' ? (
                  <BlurView intensity={40} tint="dark" style={styles.glassBlur} />
                ) : (
                  <View style={[styles.glassBlur, { backgroundColor: 'rgba(20,20,30,0.85)' }]} />
                )}

                {/* Media content */}
                <View style={styles.mediaContainer}>
                  {isAd ? (
                    <View style={styles.adContainer}>
                      {(() => {
                        const adImage = String((story as any)?.image || (story as any)?.media?.[0]?.uri || '');
                        return adImage ? <ExpoImage source={{ uri: adImage }} style={styles.adImage} contentFit="cover" /> : null;
                      })()}
                      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.9)']} style={styles.adOverlay}>
                        <View style={styles.adBadge}>
                          <Text style={styles.adBadgeText}>SPONSORED</Text>
                        </View>
                        <Text style={styles.adTitle}>Discover Something New</Text>
                        <TouchableOpacity
                          style={styles.adCta}
                          onPress={() => {
                            const productId = String((story as any)?.productId || '');
                            if (!productId) return;
                            void trackPromotionClick({ productId, placement: 'story' }).catch(() => { });
                            router.push((`/marketplace/${productId}`) as any);
                          }}
                        >
                          <LinearGradient colors={['#e50914', '#b20710']} style={styles.adCtaGradient}>
                            <Text style={styles.adCtaText}>View Product</Text>
                            <Ionicons name="arrow-forward" size={16} color="#fff" />
                          </LinearGradient>
                        </TouchableOpacity>
                      </LinearGradient>
                    </View>
                  ) : storyIdx !== currentStoryIndex ? (
                    <ExpoImage
                      source={{ uri: String((story as any)?.image || (story as any)?.media?.[0]?.uri || '') }}
                      style={styles.mediaImage}
                      contentFit="cover"
                      transition={200}
                    />
                  ) : currentMedia?.type === 'image' ? (
                    <ExpoImage
                      key={`${currentMedia.uri}-${mediaReloadNonce}`}
                      source={{ uri: currentMedia.uri }}
                      style={styles.mediaImage}
                      contentFit="cover"
                      transition={150}
                      onError={() => setMediaError(true)}
                      onLoadEnd={() => setVideoLoading(false)}
                    />
                  ) : (
                    <View style={styles.videoContainer}>
                      {(videoLoading || mediaError) && (
                        <View style={styles.videoLoader}>
                          {mediaError ? (
                            <TouchableOpacity style={styles.retryPill} onPress={retryCurrentMedia}>
                              <Ionicons name="refresh" size={16} color="#fff" />
                              <Text style={styles.retryText}>Retry</Text>
                            </TouchableOpacity>
                          ) : (
                            <ActivityIndicator size="large" color="#e50914" />
                          )}
                        </View>
                      )}
                      {overlayOpen ? <View style={styles.mediaVideo} /> : (
                        <VideoView
                          player={player}
                          style={styles.mediaVideo}
                          contentFit="cover"
                          showsPlaybackControls={false}
                        />
                      )}
                    </View>
                  )}

                  {/* Top gradient */}
                  <LinearGradient colors={['rgba(0,0,0,0.7)', 'transparent']} style={styles.topGradient} pointerEvents="none" />

                  {/* Bottom gradient */}
                  <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.bottomGradient} pointerEvents="none" />

                  {/* Touch zones with double-tap detection */}
                  <PanGestureHandler
                    activeOffsetX={[-24, 24]}
                    activeOffsetY={[-16, 16]}
                    onGestureEvent={handleSwipeGestureEvent}
                    onHandlerStateChange={handleSwipeStateChange}
                  >
                    <View style={styles.touchOverlay}>
                      <TapGestureHandler numberOfTaps={2} onActivated={triggerDoubleTapLike}>
                        <View style={styles.touchZone}>
                          <Pressable style={StyleSheet.absoluteFill} onPress={handlePressPrev} onLongPress={handleLongPress} delayLongPress={180} onPressOut={handlePressOut} />
                        </View>
                      </TapGestureHandler>
                      <TapGestureHandler numberOfTaps={2} onActivated={triggerDoubleTapLike}>
                        <View style={styles.touchZone}>
                          <Pressable style={StyleSheet.absoluteFill} onPress={handlePressNext} onLongPress={handleLongPress} delayLongPress={180} onPressOut={handlePressOut} />
                        </View>
                      </TapGestureHandler>
                    </View>
                  </PanGestureHandler>

                  {/* Double-tap heart animation */}
                  {showHeart && (
                    <Animated.View style={[styles.heartOverlay, { transform: [{ scale: heartScale }], opacity: heartOpacity }]} pointerEvents="none">
                      <Text style={styles.heartEmoji}>❤️</Text>
                    </Animated.View>
                  )}
                </View>

                {/* Segment indicators */}
                <View style={[styles.segmentRow, { top: insets.top + 10 }]}>
                  {mediaList.map((_, mediaIdx) => {
                    const isComplete = storyIdx < currentStoryIndex || (storyIdx === currentStoryIndex && mediaIdx < currentMediaIndex);
                    const isCurrent = storyIdx === currentStoryIndex && mediaIdx === currentMediaIndex;
                    const isPending = storyIdx > currentStoryIndex || (storyIdx === currentStoryIndex && mediaIdx > currentMediaIndex);

                    return (
                      <View key={mediaIdx} style={styles.segment}>
                        <View style={[styles.segmentTrack, isComplete && styles.segmentComplete, isPending && styles.segmentPending]}>
                          {isCurrent && (
                            <Animated.View
                              style={[
                                styles.segmentFill,
                                StyleSheet.absoluteFill,
                                {
                                  transformOrigin: 'left center',
                                  transform: [
                                    { scaleX: progress }
                                  ]
                                }
                              ]}
                            />
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Floating header */}
              <View style={[styles.floatingHeader, { top: insets.top + 32 }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
                  <LinearGradient colors={['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.05)']} style={styles.closeBtnGradient}>
                    <Ionicons name="close" size={22} color="#fff" />
                  </LinearGradient>
                </TouchableOpacity>

                <View style={styles.userInfo}>
                  <View style={styles.avatarRing}>
                    <Animated.View style={[styles.avatarGlow, { opacity: glowIntensity }]} />
                    {headerAvatar ? (
                      <ExpoImage source={{ uri: headerAvatar }} style={styles.avatar} contentFit="cover" />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Ionicons name="person" size={18} color="rgba(255,255,255,0.6)" />
                      </View>
                    )}
                  </View>
                  <View style={styles.userMeta}>
                    <Text style={styles.username} numberOfLines={1}>{headerTitle}</Text>
                    <Text style={styles.timestamp}>{timeLabel || `${currentMediaIndex + 1} of ${mediaList.length}`}</Text>
                  </View>
                </View>

                <View style={styles.headerActions}>
                  {/* Mute button for videos */}
                  {currentMedia?.type === 'video' && storyIdx === currentStoryIndex && (
                    <TouchableOpacity onPress={toggleMute} style={styles.actionBtn}>
                      <Animated.View style={{ transform: [{ scale: muteIconScale }] }}>
                        <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={18} color="#fff" />
                      </Animated.View>
                    </TouchableOpacity>
                  )}

                  {isMine ? (
                    <TouchableOpacity onPress={handleDeleteStory} style={styles.actionBtn}>
                      <Ionicons name="trash-outline" size={18} color="#fff" />
                    </TouchableOpacity>
                  ) : null}

                  {/* Share button */}
                  <TouchableOpacity onPress={handleShare} style={styles.actionBtn}>
                    <Ionicons name="paper-plane-outline" size={18} color="#fff" />
                  </TouchableOpacity>

                  {isAd ? (
                    <View style={styles.sponsoredPill}>
                      <Ionicons name="megaphone" size={12} color="rgba(255,255,255,0.8)" />
                      <Text style={styles.sponsoredText}>AD</Text>
                    </View>
                  ) : storyOwnerId && viewerId && !isMine ? (
                    <TouchableOpacity
                      style={[styles.followBtn, followingSet.has(storyOwnerId) && styles.followBtnActive]}
                      disabled={blockedSet.has(storyOwnerId) || followBusyId === storyOwnerId}
                      onPress={() => handleFollowToggle(storyOwnerId)}
                    >
                      <Text style={styles.followBtnText}>
                        {blockedSet.has(storyOwnerId) ? 'Blocked' : followingSet.has(storyOwnerId) ? 'Following' : 'Follow'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {/* Overlay text */}
              {storyIdx === currentStoryIndex && overlayText ? (
                <View style={styles.overlayTextContainer}>
                  <LinearGradient colors={['rgba(229,9,20,0.2)', 'rgba(0,0,0,0.6)']} style={styles.overlayTextBg}>
                    <Text style={styles.overlayTextContent}>{overlayText}</Text>
                  </LinearGradient>
                </View>
              ) : null}

              {/* Live stream CTA */}
              {storyIdx === currentStoryIndex && liveStreamId ? (
                <TouchableOpacity
                  style={styles.liveCta}
                  onPress={() => router.push({ pathname: '/social-feed/live/[id]', params: { id: liveStreamId } } as any)}
                >
                  <LinearGradient colors={['#e50914', '#b20710']} style={styles.liveCtaGradient}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveCtaText}>Join Live</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ) : null}

              {/* Caption */}
              {storyIdx === currentStoryIndex && caption ? (
                <View style={styles.captionContainer}>
                  <Text style={styles.captionText} numberOfLines={3}>{caption}</Text>
                </View>
              ) : null}

              {/* TikTok Live-style floating emoji reactions */}
              {floatingEmojis.map((fe) => (
                <Animated.View
                  key={fe.id}
                  pointerEvents="none"
                  style={[
                    styles.floatingReaction,
                    {
                      right: fe.x,
                      transform: [
                        { translateY: fe.anim.interpolate({ inputRange: [0, 1], outputRange: [0, -300] }) },
                        { scale: fe.anim.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0.5, 1.2, 1, 0.6] }) },
                      ],
                      opacity: fe.anim.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 1, 1, 0] }),
                    },
                  ]}
                >
                  <Text style={styles.floatingReactionEmoji}>{fe.emoji}</Text>
                </Animated.View>
              ))}

              {/* Music badge */}
              {currentMusicTrack && !isAd && storyIdx === currentStoryIndex && (
                <View style={[styles.musicBadge, { top: insets.top + 70 }]}>
                  <View style={styles.musicArtContainer}>
                    <ExpoImage source={{ uri: currentMusicTrack.thumbnail }} style={styles.musicArt} contentFit="cover" />
                    <View style={styles.musicArtCenter} />
                  </View>
                  <Text style={styles.musicBadgeText} numberOfLines={1}>{currentMusicTrack.title} • {currentMusicTrack.artist}</Text>
                </View>
              )}

              {/* Bottom actions */}
              {storyIdx === currentStoryIndex && (
                <View style={styles.bottomActions}>
                  {/* Reactions bar */}
                  {showReactions && (
                    <Animated.View style={[styles.reactionsBar, { opacity: reactionBarOpacity }]}>
                      {REACTIONS.map((emoji) => (
                        <TouchableOpacity key={emoji} onPress={() => sendReaction(emoji)} style={styles.reactionBtn}>
                          <Text style={styles.reactionEmoji}>{emoji}</Text>
                        </TouchableOpacity>
                      ))}
                    </Animated.View>
                  )}

                  <View style={styles.bottomRow}>
                    {/* Emoji reaction trigger */}
                    {!isMine && (
                      <TouchableOpacity onPress={toggleReactions} style={styles.emojiTrigger}>
                        <LinearGradient colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.04)']} style={styles.emojiTriggerGradient}>
                          <Text style={styles.emojiTriggerText}>😊</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    )}

                    {isMine ? (
                      <TouchableOpacity onPress={openViewers} style={styles.viewersBtn}>
                        <LinearGradient colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.04)']} style={styles.viewersBtnGradient}>
                          <Ionicons name="eye" size={18} color="#fff" />
                          <Text style={styles.viewersCount}>{viewCount}</Text>
                          <Ionicons name="chevron-up" size={14} color="rgba(255,255,255,0.6)" />
                        </LinearGradient>
                      </TouchableOpacity>
                    ) : canReply ? (
                      <TouchableOpacity onPress={openReply} style={styles.replyHint}>
                        <LinearGradient colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.02)']} style={styles.replyHintGradient}>
                          <Ionicons name="chatbubble-outline" size={16} color="rgba(255,255,255,0.8)" />
                          <Text style={styles.replyHintText}>Send a message</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              )}
            </Animated.View>
          </View>
        ))}
      </PagerView>

      {/* Custom Reply Input Overlay */}
      {replyOpen && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => closeReply()}
        >
          <BlurView intensity={20} style={StyleSheet.absoluteFill} tint="dark" />
          <Animated.View
            style={[
              styles.replyDockedContainer,
              { paddingBottom: keyboardHeightAnim }
            ]}
          >
            <View style={styles.replyInputWrapper}>
              <View style={styles.replyInputBar}>
                <TextInput
                  ref={replyInputRef}
                  style={styles.replyTextInput}
                  placeholder="Send a message..."
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  returnKeyType="send"
                  value={replyText}
                  onChangeText={setReplyText}
                  onSubmitEditing={() => {
                    if (replyText.trim()) {
                      handleSendReplyText(replyText);
                      setReplyText('');
                    }
                  }}
                  blurOnSubmit
                />
                <TouchableOpacity
                  style={styles.replySendBtn}
                  onPress={() => {
                    if (replyText.trim()) {
                      handleSendReplyText(replyText);
                      setReplyText('');
                    }
                  }}
                >
                  <Ionicons name="arrow-up-circle" size={32} color="#e50914" />
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </Pressable>
      )}

      {/* Viewers sheet */}
      {isOwner ? (
        <BottomSheetModal
          ref={(r) => (viewersSheetRef.current = r)}
          snapPoints={viewersSheetSnapPoints}
          enablePanDownToClose
          onDismiss={() => { setViewersOpen(false); setTimeout(() => resumePlayback(), 60); }}
          backdropComponent={(p) => <BottomSheetBackdrop {...p} disappearsOnIndex={-1} appearsOnIndex={0} />}
          backgroundStyle={styles.sheetBg}
          handleIndicatorStyle={styles.sheetHandle}
        >
          <BottomSheetScrollView
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Story Views</Text>
              <View style={styles.viewCountBadge}>
                <Text style={styles.viewCountText}>{viewCount}</Text>
              </View>
            </View>

            {viewers.length === 0 ? (
              <View style={styles.emptyViewers}>
                <Ionicons name="eye-off-outline" size={48} color="rgba(255,255,255,0.2)" />
                <Text style={styles.emptyViewersText}>No views yet</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.viewersList}>
                {viewers.map((v) => (
                  <View key={v.id} style={styles.viewerItem}>
                    {v.viewerAvatar ? (
                      <ExpoImage source={{ uri: v.viewerAvatar }} style={styles.viewerAvatar} contentFit="cover" />
                    ) : (
                      <View style={styles.viewerAvatarFallback}>
                        <Ionicons name="person" size={16} color="rgba(255,255,255,0.5)" />
                      </View>
                    )}
                    <View style={styles.viewerInfo}>
                      <Text style={styles.viewerName} numberOfLines={1}>{v.viewerName || 'Anonymous'}</Text>
                      <Text style={styles.viewerTime}>{v.createdAtMs ? formatTimeAgo(v.createdAtMs) : ''}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </BottomSheetScrollView>
        </BottomSheetModal>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#08080f' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pagerView: { flex: 1 },
  page: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 12 },

  ambientOrb: { position: 'absolute', borderRadius: 999 },
  ambientOrb1: { width: 300, height: 300, top: -100, left: -100, backgroundColor: 'rgba(229,9,20,0.08)' },
  ambientOrb2: { width: 250, height: 250, bottom: -80, right: -80, backgroundColor: 'rgba(125,216,255,0.06)' },

  cinematicCard: { flex: 1, width: '100%', maxWidth: 420 },

  ringContainer: { position: 'absolute', top: -6, left: -6, right: -6, bottom: -6, justifyContent: 'center', alignItems: 'center' },
  ringTrack: { width: '100%', height: '100%', borderRadius: 32, borderWidth: 2, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  ringProgress: { position: 'absolute', top: 0, left: 0, bottom: 0, backgroundColor: '#e50914', borderRadius: 32 },

  glassFrame: { flex: 1, borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  glassBlur: { ...StyleSheet.absoluteFillObject },

  mediaContainer: { flex: 1, borderRadius: 26, overflow: 'hidden', margin: 4 },
  mediaImage: { width: '100%', height: '100%' },
  videoContainer: { flex: 1, backgroundColor: '#000' },
  mediaVideo: { width: '100%', height: '100%' },
  videoLoader: { position: 'absolute', zIndex: 10, alignSelf: 'center', top: '45%', alignItems: 'center' },
  retryPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  retryText: { color: '#fff', fontWeight: '700' },

  topGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 140 },
  bottomGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 200 },

  touchOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 5, flexDirection: 'row' },
  touchZone: { flex: 1 },

  segmentRow: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 3 },
  segmentTrack: { flex: 1, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  segmentComplete: { backgroundColor: '#fff' },
  segmentPending: { backgroundColor: 'rgba(255,255,255,0.2)' },
  segmentFill: { height: '100%', backgroundColor: '#fff', borderRadius: 2 },

  floatingHeader: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12, zIndex: 20 },
  closeBtn: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
  closeBtnGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  userInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarRing: { width: 44, height: 44, borderRadius: 22, padding: 2, backgroundColor: 'rgba(229,9,20,0.3)' },
  avatarGlow: { ...StyleSheet.absoluteFillObject, borderRadius: 22, backgroundColor: '#e50914' },
  avatar: { width: '100%', height: '100%', borderRadius: 20 },
  avatarFallback: { width: '100%', height: '100%', borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  userMeta: { flex: 1 },
  username: { color: '#fff', fontSize: 15, fontWeight: '800' },
  timestamp: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 },

  sponsoredPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)' },
  sponsoredText: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '900' },

  followBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: '#e50914' },
  followBtnActive: { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  followBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  overlayTextContainer: { position: 'absolute', top: '30%', left: 20, right: 20 },
  overlayTextBg: { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16 },
  overlayTextContent: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' },

  liveCta: { position: 'absolute', bottom: 120, alignSelf: 'center', borderRadius: 20, overflow: 'hidden' },
  liveCtaGradient: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 12 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  liveCtaText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  captionContainer: { position: 'absolute', bottom: 80, left: 16, right: 16, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.5)' },
  captionText: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '600', textAlign: 'center' },

  bottomActions: { position: 'absolute', bottom: 24, left: 16, right: 16, alignItems: 'center' },
  viewersBtn: { borderRadius: 20, overflow: 'hidden' },
  viewersBtnGradient: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  viewersCount: { color: '#fff', fontSize: 14, fontWeight: '800' },

  musicBadge: { position: 'absolute', right: 12, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  musicArtContainer: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a' },
  musicArt: { width: '100%', height: '100%' },
  musicArtCenter: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: '#000' },
  musicBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700', paddingRight: 4, maxWidth: 160 },
  replyHint: { borderRadius: 24, overflow: 'hidden', width: '100%' },
  replyHintGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14 },
  replyHintText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },

  adContainer: { flex: 1, backgroundColor: '#0a0a12' },
  adImage: { ...StyleSheet.absoluteFillObject, opacity: 0.4 },
  adOverlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 60, paddingHorizontal: 24 },
  adBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 16 },
  adBadgeText: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  adTitle: { color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 20, textAlign: 'center' },
  adCta: { borderRadius: 16, overflow: 'hidden' },
  adCtaGradient: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 14 },
  adCtaText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  sheetBg: { backgroundColor: '#1F2C34', borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  sheetHandle: { backgroundColor: 'rgba(255,255,255,0.4)', width: 40, top: 8 },
  sheetContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingTop: 8 },
  sheetTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },

  viewCountBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(229,9,20,0.2)' },
  viewCountText: { color: '#e50914', fontSize: 14, fontWeight: '800' },

  emptyViewers: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyViewersText: { color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: '600' },

  viewersList: { gap: 12, paddingBottom: 24 },
  viewerItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)' },
  viewerAvatar: { width: 44, height: 44, borderRadius: 22 },
  viewerAvatarFallback: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  viewerInfo: { flex: 1 },
  viewerName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  viewerTime: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },

  // New feature styles
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },

  heartOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -50,
    marginTop: -50,
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartEmoji: { fontSize: 80 },

  floatingReaction: {
    position: 'absolute',
    bottom: 100,
  },
  floatingReactionEmoji: { fontSize: 44 },

  reactionsBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 28,
    alignSelf: 'center',
  },
  reactionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionEmoji: { fontSize: 24 },

  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%' },
  emojiTrigger: { borderRadius: 24, overflow: 'hidden' },
  emojiTriggerGradient: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  emojiTriggerText: { fontSize: 24 },



  replyDockedContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent', // The blur view handles the background
  },
  replyInputWrapper: {
    backgroundColor: '#000',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 12 : 12, // This will be overridden by keyboardHeightAnim
  },
  replyInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  replyTextInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 8,
    maxHeight: 100,
  },
  replySendBtn: {
    marginLeft: 8,
  },
});

export default StoryViewerScreen;
