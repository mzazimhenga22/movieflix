import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { FlashList } from '@shopify/flash-list';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as RN from 'react-native';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text as WebText } from 'react-native-web';
import {
  acceptMessageRequest,
  addMessageReaction,
  blockUser,
  BROADCAST_ADMIN_EMAILS,
  BROADCAST_ADMIN_IDS,
  Conversation,
  deleteConversation,
  deleteMessageForAll,
  deleteMessageForMe,
  editMessage,
  findOrCreateConversation,
  forwardMessage,
  getLastSeen,
  getProfileById,
  GLOBAL_BROADCAST_CHANNEL_ID,
  leaveGroup,
  loadOlderMessages,
  markConversationRead,
  markMessagesDelivered,
  muteConversation,
  onAuthChange,
  onConversationsUpdate,
  onConversationUpdate,
  onMessagesUpdate,
  onUserPresence,
  onUserProfileUpdate,
  onUserTyping,
  pinMessage,
  Profile,
  removeMessageReaction,
  reportConversation,
  reportUser,
  sendMessage,
  setTyping,
  unblockUser,
  unpinMessage
} from '../controller';

import { createCallSession } from '@/lib/calls/callService';
import type { CallType } from '@/lib/calls/types';
import { Ionicons } from '@expo/vector-icons';

import { useActiveProfile } from '@/hooks/use-active-profile';
import { useMessagingSettings } from '@/hooks/useMessagingSettings';
import {
  buildOnboardingBotMessage,
  fetchMovieDetails,
  fetchOnboardingTrending,
  generateBotMessageWithDetails,
  markBotMessageSent,
  ONBOARDING_BOT_SENDER_ID,
  shouldSendBotMessage,
  type TmdbTrendingItem
} from '@/lib/onboardingChatBot';
import { ResizeMode, Video } from 'expo-av';
import { BlurView } from 'expo-blur';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { LinearGradient } from 'expo-linear-gradient';
import ScreenWrapper from '../../../components/ScreenWrapper';
import AdBanner from '../../../components/ads/AdBanner';
import { supabase, supabaseConfigured } from '../../../constants/supabase';
import { accentGradient, darkenColor, withAlpha } from '../../../lib/colorUtils';
import { useAccent } from '../../components/AccentContext';
import MessagingErrorBoundary from '../components/ErrorBoundary';
import MessageBubble from './components/MessageBubble';
import MessageInput from './components/MessageInput';

const Text = (Platform.OS === 'web' ? (WebText as unknown as typeof RN.Text) : RN.Text);

const localReadStorageKey = (uid: string) => `chat_local_lastReadAtBy_${uid}`;

const markLocalConversationRead = async (uid: string, conversationId: string) => {
  if (!uid || !conversationId) return;
  try {
    const key = localReadStorageKey(uid);
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const next = { ...(parsed && typeof parsed === 'object' ? parsed : {}), [conversationId]: Date.now() };
    await AsyncStorage.setItem(key, JSON.stringify(next));
  } catch {
    // ignore
  }
};

const mergeMessages = (current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] => {
  const map = new Map<string, ChatMessage>();
  current.forEach((m) => {
    const key = m.id || m.clientId || '';
    if (key) map.set(key, m);
  });
  incoming.forEach((m) => {
    const key = m.id || m.clientId || '';
    if (key) map.set(key, m);
  });
  return Array.from(map.values());
};

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type AuthUser = {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
} & Partial<Profile>;

type ChatMessage = {
  id?: string;
  text?: string;
  sender?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'file' | 'music' | 'movie' | null;
  deleted?: boolean;
  deletedFor?: string[];
  pinnedBy?: string[];
  clientId?: string | null;
  createdAt?: number;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  reactions?: { [emoji: string]: string[] };
  forwarded?: boolean;
  forwardedFrom?: string;
  replyToMessageId?: string;
  replyToText?: string;
  replyToSenderId?: string;
  replyToSenderName?: string;
  musicData?: {
    videoId: string;
    title: string;
    artist: string;
    thumbnail: string;
  };
  movieData?: {
    id: number;
    title: string;
    poster: string;
    runtime: number;
    year: string;
    type: 'movie' | 'tv';
  };
  [key: string]: any;
};

const ChatScreen = () => {
  const { id, fromStreak, title, avatar, otherUserId } = useLocalSearchParams();
  const router = useRouter();
  const { settings } = useMessagingSettings();
  const insets = useSafeAreaInsets();
  const activeProfile = useActiveProfile();
  const activeProfileRef = useRef(activeProfile);

  useEffect(() => {
    activeProfileRef.current = activeProfile;
  }, [activeProfile]);

  const routeTitle = useMemo(() => {
    const raw = Array.isArray(title) ? title[0] : title;
    return typeof raw === 'string' ? raw : '';
  }, [title]);

  const routeAvatar = useMemo(() => {
    const raw = Array.isArray(avatar) ? avatar[0] : avatar;
    return typeof raw === 'string' ? raw : '';
  }, [avatar]);

  const formatTime = useCallback((createdAt: any) => {
    try {
      if (!createdAt) return '';
      if (typeof createdAt === 'number') {
        return new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      if (typeof createdAt?.toMillis === 'function') {
        return new Date(createdAt.toMillis()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      if (typeof createdAt?.toDate === 'function') {
        return createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      if (typeof createdAt?.seconds === 'number') {
        return new Date(createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return '';
    } catch {
      return '';
    }
  }, []);

  const routeOtherUserId = useMemo(() => {
    const raw = Array.isArray(otherUserId) ? otherUserId[0] : otherUserId;
    return typeof raw === 'string' ? raw : '';
  }, [otherUserId]);

  const conversationId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id]);
  const conversationIdStr = typeof conversationId === 'string' ? conversationId : '';

  const [user, setUser] = useState<AuthUser | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]); // server-backed messages
  const [pendingMessages, setPendingMessages] = useState<ChatMessage[]>([]); // optimistic local messages
  const [otherUser, setOtherUser] = useState<Profile | null>(null);
  const [viewerProfile, setViewerProfile] = useState<Profile | null>(null);
  const [participantProfiles, setParticipantProfiles] = useState<Record<string, Profile>>({});
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [inputDockHeight, setInputDockHeight] = useState(0);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [selectedMessageRect, setSelectedMessageRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [selectedMessageGroupPosition, setSelectedMessageGroupPosition] = useState<
    'single' | 'first' | 'middle' | 'last' | null
  >(null);
  const [callSheetMessage, setCallSheetMessage] = useState<ChatMessage | null>(null);
  const spotlightAnim = useRef(new Animated.Value(0)).current;
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [pendingMedia, setPendingMedia] = useState<{ uri: string; type: 'image' | 'video' | 'file' } | null>(null);
  const [pendingCaption, setPendingCaption] = useState<string>('');
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const [showForwardSheet, setShowForwardSheet] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null);
  const [showMessageInfoSheet, setShowMessageInfoSheet] = useState(false);
  const [messageInfoTarget, setMessageInfoTarget] = useState<ChatMessage | null>(null);
  const [recentConversations, setRecentConversations] = useState<Conversation[]>([]);
  const [forwardSearchQuery, setForwardSearchQuery] = useState('');
  const [selectedForwardTargets, setSelectedForwardTargets] = useState<string[]>([]);
  const [isForwarding, setIsForwarding] = useState(false);
  const [isAcceptingRequest, setIsAcceptingRequest] = useState(false);
  const [isDeletingChat, setIsDeletingChat] = useState(false);
  const [isBlockingUserAction, setIsBlockingUserAction] = useState(false);
  const [isMuting, setIsMuting] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const flatListRef = useRef<any>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [hasInitialMessageSnapshot, setHasInitialMessageSnapshot] = useState(false);
  const [renderMessageList, setRenderMessageList] = useState(false);
  const [revealToken, setRevealToken] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const loadMoreThrottleRef = useRef(false);
  const retryAttemptsRef = useRef<Record<string, number>>({});
  const deliveredThrottleRef = useRef(0);

  const isOnboardingConversation =
    conversationIdStr === GLOBAL_BROADCAST_CHANNEL_ID ||
    (conversation?.isBroadcast && conversation?.channelSlug === 'onboarding');

  const [onboardingAutoMessages, setOnboardingAutoMessages] = useState<ChatMessage[]>([]);
  const onboardingTrendingRef = useRef<{ items: TmdbTrendingItem[]; idx: number } | null>(null);

  const entryOpacity = useRef(new Animated.Value(0)).current;
  const entryTranslateY = useRef(new Animated.Value(10)).current;
  const didPlayEntryAnimRef = useRef(false);

  const atBottomRef = useRef(true);
  const skipNextAutoScrollRef = useRef(false);

  const directOtherUserId = useMemo(() => {
    if (routeOtherUserId) return routeOtherUserId;
    if (!user?.uid) return '';
    if (conversation?.isGroup || conversation?.isBroadcast) return '';
    const members: string[] = Array.isArray(conversation?.members) ? (conversation?.members as any) : [];
    const otherId = members.find((uid) => uid && uid !== user.uid) ?? '';
    return typeof otherId === 'string' ? otherId : String(otherId || '');
  }, [routeOtherUserId, conversation?.isGroup, conversation?.isBroadcast, conversation?.members, user?.uid]);

  const rawStreakCount = useMemo(() => Number((conversation as any)?.streakCount ?? 0) || 0, [conversation]);
  const streakExpiresAtMs = useMemo(
    () => Number((conversation as any)?.streakExpiresAtMs ?? 0) || 0,
    [conversation],
  );
  const streakCount = useMemo(() => {
    if (!rawStreakCount) return 0;
    if (streakExpiresAtMs > 0 && streakExpiresAtMs <= nowMs) return 0;
    return rawStreakCount;
  }, [rawStreakCount, streakExpiresAtMs, nowMs]);

  useEffect(() => {
    if (!streakCount) return;
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [streakCount]);

  const streakMetaLabel = useMemo(() => {
    if (!streakCount) return 'New chat';
    if (!streakExpiresAtMs) return `${streakCount} streak`;

    const msLeft = streakExpiresAtMs - nowMs;
    if (!Number.isFinite(msLeft) || msLeft <= 0) return `${streakCount} streak`;

    // Only show countdown when it’s close to expiring.
    const dangerWindowMs = 6 * 60 * 60 * 1000;
    if (msLeft > dangerWindowMs) return `${streakCount} streak`;

    const totalMinutes = Math.max(0, Math.floor(msLeft / 60_000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${streakCount} streak · ${hours}h ${minutes}m left`;
  }, [streakCount, streakExpiresAtMs, nowMs]);

  useEffect(() => {
    if (!routeOtherUserId) return;
    if (conversation?.isGroup || conversation?.isBroadcast) return;

    setOtherUser((prev) => {
      if (prev?.id && prev.id !== routeOtherUserId) return prev;
      return {
        id: routeOtherUserId,
        displayName: routeTitle || prev?.displayName || 'Chat',
        photoURL: routeAvatar || prev?.photoURL || '',
        status: prev?.status,
      } as Profile;
    });

    setParticipantProfiles((prev) => {
      if (prev[routeOtherUserId]) return prev;
      return {
        ...prev,
        [routeOtherUserId]: {
          id: routeOtherUserId,
          displayName: routeTitle || 'Chat',
          photoURL: routeAvatar || '',
        } as Profile,
      };
    });
  }, [routeOtherUserId, routeTitle, routeAvatar, conversation?.isGroup, conversation?.isBroadcast]);

  useEffect(() => {
    const isIOS = Platform.OS === 'ios';
    const showEvent = isIOS ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = isIOS ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: any) => {
      const rawHeight = typeof e?.endCoordinates?.height === 'number' ? e.endCoordinates.height : 0;
      const effectiveHeight = Math.max(0, rawHeight - (isIOS ? insets.bottom : 0));
      const duration = typeof e?.duration === 'number' ? e.duration : isIOS ? 250 : 150;

      setKeyboardHeight(effectiveHeight);

      Animated.timing(keyboardOffset, {
        // Move only the input dock above the keyboard.
        toValue: -effectiveHeight,
        duration,
        useNativeDriver: true,
      }).start();
    };

    const onHide = (e: any) => {
      const duration = typeof e?.duration === 'number' ? e.duration : isIOS ? 250 : 150;

      setKeyboardHeight(0);
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration,
        useNativeDriver: true,
      }).start();
    };

    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [insets.bottom, keyboardOffset]);

  const closeSpotlight = useCallback(() => {
    Animated.timing(spotlightAnim, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setSelectedMessage(null);
      setSelectedMessageRect(null);
      setSelectedMessageGroupPosition(null);
    });
  }, [spotlightAnim]);

  const closeCallSheet = useCallback(() => setCallSheetMessage(null), []);

  useEffect(() => {
    if (selectedMessage && selectedMessageRect) {
      spotlightAnim.setValue(0);
      Animated.spring(spotlightAnim, {
        toValue: 1,
        damping: 18,
        stiffness: 220,
        mass: 0.9,
        useNativeDriver: true,
      }).start();
    }
  }, [selectedMessage, selectedMessageRect, spotlightAnim]);
  const [isStartingCall, setIsStartingCall] = useState(false);
  const [lastSeen, setLastSeen] = useState<Date | null>(null);
  const [isSearchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);
  const [otherPresence, setOtherPresence] = useState<{ state: 'online' | 'offline'; last_changed: number | null } | null>(null);

  // Network state and offline queue management
  const [isConnected, setIsConnected] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const offlineQueueRef = useRef<ChatMessage[]>([]);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { accentColor } = useAccent();
  const accent = accentColor || '#e50914';
  const accentDark = darkenColor(accent, 0.35);
  const accentDeeper = darkenColor(accent, 0.6);
  const accentGlow = withAlpha(accent, 0.24);
  const iconGradientColors = accentGradient(accent, 0.2);
  const accentDotStyle = { backgroundColor: accent, shadowColor: accent };
  const iconShadowStyle = { shadowColor: withAlpha(accent, 0.65) };
  const sendButtonStyle = { backgroundColor: accent };
  const infoTitle = conversation?.isGroup
    ? conversation.name || routeTitle || 'Group chat'
    : conversation?.isBroadcast
      ? conversation.name || 'MovieFlix Onboarding'
      : otherUser?.displayName || routeTitle || 'Chat';
  const infoSubtitle = conversation?.isBroadcast
    ? 'Admin-only broadcast channel'
    : conversation?.isGroup
      ? `${conversation?.members?.length ?? 0} members`
      : settings.hibernate
        ? '—'
        : otherPresence?.state === 'online'
          ? 'Online'
          : lastSeen
            ? `Last seen ${lastSeen.toLocaleString()}`
            : 'Offline';
  const infoDescription = conversation?.isBroadcast
    ? 'Everyone automatically follows MovieFlix Onboarding. Admins drop updates, launch notes, and onboarding tips here.'
    : conversation?.isGroup
      ? conversation.description || 'Shared space for your watch party and friends.'
      : otherUser?.status === 'online'
        ? 'Direct message thread'
        : 'Private conversation';
  const infoPrimaryLabel = conversation?.isBroadcast
    ? 'Channel guide'
    : conversation?.isGroup
      ? 'Open group details'
      : 'View full profile';
  const infoAvatarUri =
    conversation?.isGroup || conversation?.isBroadcast
      ? null
      : otherUser?.photoURL || routeAvatar || null;
  const infoBadgeIcon = conversation?.isBroadcast
    ? 'megaphone-outline'
    : conversation?.isGroup
      ? 'people-outline'
      : 'person-outline';

  const headerBio = useMemo(() => {
    if (conversation?.isGroup || conversation?.isBroadcast) return '';
    return String(otherUser?.bio ?? otherUser?.status ?? '').trim();
  }, [conversation?.isBroadcast, conversation?.isGroup, otherUser?.bio, otherUser?.status]);

  const handleInfoPrimaryAction = useCallback(() => {
    if (conversation?.isGroup && conversation.id) {
      setShowInfoSheet(false);
      router.push(`/messaging/group-details?conversationId=${conversation.id}`);
      return;
    }
    if (conversation?.isBroadcast) {
      setShowInfoSheet(false);
      Alert.alert(
        'MovieFlix Onboarding',
        'You are already following this channel. Admins share release updates, onboarding instructions, and feature drops here—no approval needed.'
      );
      return;
    }
    if (otherUser?.id) {
      setShowInfoSheet(false);
      router.push(`/profile?userId=${otherUser.id}&from=messages`);
    }
  }, [conversation?.id, conversation?.isGroup, conversation?.isBroadcast, otherUser?.id, router]);

  const handleCloseInfoSheet = useCallback(() => setShowInfoSheet(false), []);

  const handleOpenSearch = useCallback(() => setSearchMode(true), []);
  const handleCloseSearch = useCallback(() => {
    setSearchMode(false);
    setSearchQuery('');
    setSearchResults([]);
  }, []);

  const isBroadcastChannel = Boolean(conversation?.isBroadcast);
  const normalizedEmail = (user?.email || '').trim().toLowerCase();
  const platformBroadcastAdmin =
    (user?.uid ? BROADCAST_ADMIN_IDS.includes(user.uid) : false) ||
    (normalizedEmail ? BROADCAST_ADMIN_EMAILS.includes(normalizedEmail) : false);
  const conversationAdmin = user?.uid ? Boolean(conversation?.admins?.includes(user.uid)) : false;
  const isBroadcastAdmin = isBroadcastChannel && (platformBroadcastAdmin || conversationAdmin);
  const isBroadcastReadOnly = isBroadcastChannel && !isBroadcastAdmin;

  const isRequest = conversation?.status === 'pending';
  const requestInitiatorId =
    conversation?.requestInitiatorId ||
    conversation?.creator ||
    (Array.isArray(conversation?.members) ? conversation?.members?.[0] : null) ||
    null;
  const isRequestRecipient = Boolean(
    isRequest &&
    requestInitiatorId &&
    user?.uid &&
    requestInitiatorId !== user.uid,
  );
  const canAccept = Boolean(isRequestRecipient);
  const baseSendPermission = Boolean(
    !isRequest ||
    (requestInitiatorId !== null && user?.uid && requestInitiatorId === user.uid),
  );
  const isUserBlocked = useMemo(() => {
    if (!otherUser?.id || !viewerProfile?.blockedUsers) return false;
    if (conversation?.isGroup || conversation?.isBroadcast) return false;
    return viewerProfile.blockedUsers.includes(otherUser.id);
  }, [viewerProfile?.blockedUsers, otherUser?.id, conversation?.isGroup, conversation?.isBroadcast]);

  const canSend = baseSendPermission && !isBroadcastReadOnly && !isUserBlocked;
  const showInitiatorPendingBanner = Boolean(
    isRequest &&
    !isRequestRecipient &&
    requestInitiatorId &&
    user?.uid &&
    requestInitiatorId === user.uid,
  );

  const callAvailable = !isUserBlocked && !isBroadcastChannel && !isRequest;

  const scrollToBottom = useCallback((animated = true) => {
    flatListRef.current?.scrollToIndex({ index: 0, animated });
  }, []);

  useEffect(() => {
    if (!isOnboardingConversation) return;
    setParticipantProfiles((prev) => {
      if (prev[ONBOARDING_BOT_SENDER_ID]) return prev;
      return {
        ...prev,
        [ONBOARDING_BOT_SENDER_ID]: {
          id: ONBOARDING_BOT_SENDER_ID,
          displayName: 'MovieFlix',
          photoURL: '',
          status: 'online',
        } as Profile,
      };
    });
  }, [isOnboardingConversation]);

  const lastMarkedRef = React.useRef<number>(0);
  const handleScroll = (e: any) => {
    // If user is near bottom, mark as read (debounced to once per 3s)
    try {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      const atBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 100;
      atBottomRef.current = atBottom;
      if (atBottom && conversation && user?.uid) {
        const now = Date.now();
        if (now - lastMarkedRef.current > 3000) {
          lastMarkedRef.current = now;
          if (conversationIdStr && conversation.lastMessageSenderId && conversation.lastMessageSenderId !== user.uid) {
            void markLocalConversationRead(user.uid, conversationIdStr);
            void markConversationRead(conversationIdStr, settings.readReceipts);
          }
        }
      }
    } catch (err) {
      // ignore
    }
  };

  useEffect(() => {
    // Reset entry UX when opening a (new) chat.
    didPlayEntryAnimRef.current = false;
    atBottomRef.current = true;
    skipNextAutoScrollRef.current = true;
    setHasInitialMessageSnapshot(false);
    setRevealToken(0);
    entryOpacity.setValue(0);
    entryTranslateY.setValue(10);

    setMessages([]);
    setPendingMessages([]);

    setRenderMessageList(false);
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) setRenderMessageList(true);
    });
    const fallback = setTimeout(() => {
      if (!cancelled) setRenderMessageList(true);
    }, 450);

    return () => {
      cancelled = true;
      try {
        task?.cancel?.();
      } catch { }
      clearTimeout(fallback);
    };
  }, [conversationIdStr]);

  useEffect(() => {
    if (!isOnboardingConversation) {
      onboardingTrendingRef.current = null;
      setOnboardingAutoMessages([]);
      return;
    }

    let mounted = true;
    const ctrl = new AbortController();

    (async () => {
      const items = await fetchOnboardingTrending(ctrl.signal).catch(() => []);
      if (!mounted) return;

      const safeItems = Array.isArray(items) ? items : [];
      onboardingTrendingRef.current = {
        items: safeItems,
        idx: Math.min(2, safeItems.length),
      };

      const now = Date.now();
      const seed: ChatMessage[] = [];

      // Fetch details for two random items to keep onboarding fresh (avoid always showing the same top results)
      const usedIds = new Set<number>();
      const pickRandomItem = () => {
        if (!safeItems.length) return null;
        for (let attempt = 0; attempt < 12; attempt++) {
          const candidate = safeItems[Math.floor(Math.random() * safeItems.length)];
          if (!candidate?.id) continue;
          if (usedIds.has(candidate.id)) continue;
          usedIds.add(candidate.id);
          return candidate;
        }
        return safeItems.find((it) => it?.id && !usedIds.has(it.id)) || safeItems[0] || null;
      };

      for (let i = 0; i < Math.min(2, safeItems.length); i++) {
        const item = pickRandomItem();
        if (!item) continue;
        try {
          const mediaType = item.media_type || 'movie';
          const details = await fetchMovieDetails(item.id, mediaType, ctrl.signal);
          if (!mounted) return;
          seed.push(buildOnboardingBotMessage(item, details, { now: now - (20_000 - i * 5_000) }) as any);
        } catch {
          seed.push(buildOnboardingBotMessage(item, null, { now: now - (20_000 - i * 5_000) }) as any);
        }
      }

      // Add a welcome message if no facts were generated
      if (seed.length === 0) {
        seed.push(buildOnboardingBotMessage(null, null, { now: now - 25_000 }) as any);
      }

      setOnboardingAutoMessages(seed);
    })();

    return () => {
      mounted = false;
      ctrl.abort();
      setIsOtherTyping(false);
    };
  }, [isOnboardingConversation]);

  useEffect(() => {
    if (!isOnboardingConversation) return;

    let typingTimeout: any = null;
    let isMounted = true;

    const enqueueWithDetails = async () => {
      // Check if an hour has passed since the last bot message
      const canSend = await shouldSendBotMessage();
      if (!canSend || !isMounted) return;

      // Generate a message with real movie details
      const msg = await generateBotMessageWithDetails();
      if (!msg || !isMounted) return;

      // Show typing indicator
      setIsOtherTyping(true);
      typingTimeout = setTimeout(() => {
        if (!isMounted) return;
        setIsOtherTyping(false);
        setOnboardingAutoMessages((prev) => {
          const next = [...prev, msg as any];
          return next.length > 60 ? next.slice(next.length - 60) : next;
        });
        // Mark that we sent a message
        void markBotMessageSent();
      }, 1200);
    };

    // Check immediately on mount if we should send (in case user returns after an hour)
    const initialCheck = setTimeout(() => void enqueueWithDetails(), 3_000);

    // Then check every hour (the function internally checks if enough time has passed)
    const interval = setInterval(() => void enqueueWithDetails(), 60 * 60 * 1000);

    return () => {
      isMounted = false;
      clearTimeout(initialCheck);
      clearInterval(interval);
      if (typingTimeout) clearTimeout(typingTimeout);
      setIsOtherTyping(false);
    };
  }, [isOnboardingConversation]);

  useEffect(() => {
    if (!renderMessageList || !hasInitialMessageSnapshot) return;
    if (didPlayEntryAnimRef.current) return;
    didPlayEntryAnimRef.current = true;

    const timer = setTimeout(() => {
      setRevealToken((t) => t + 1);
      Animated.parallel([
        Animated.timing(entryOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(entryTranslateY, { toValue: 0, speed: 16, bounciness: 3, useNativeDriver: true }),
      ]).start(() => {
        skipNextAutoScrollRef.current = false;
      });
    }, 60);

    return () => clearTimeout(timer);
  }, [renderMessageList, hasInitialMessageSnapshot, entryOpacity, entryTranslateY, scrollToBottom, messages.length, pendingMessages.length]);

  useEffect(() => {
    const unsubscribeAuth = onAuthChange((authUser) => {
      if (!authUser) {
        setUser(null);
        setViewerProfile(null);
        return;
      }
      const ap = activeProfileRef.current;
      const apName = typeof ap?.name === 'string' && ap.name.trim() ? ap.name.trim() : null;
      const apPhoto = typeof ap?.photoURL === 'string' && ap.photoURL.trim() ? ap.photoURL.trim() : null;
      setUser({
        uid: authUser.uid,
        displayName: apName ?? ((authUser.displayName as string) ?? null),
        email: (authUser.email as string) ?? null,
        photoURL: apPhoto ?? ((authUser as any).photoURL ?? null),
      });
    });

    if (!conversationIdStr) {
      setConversation(null);
      setMessages([]);
      return () => {
        unsubscribeAuth();
      };
    }

    const unsubscribeConversation = onConversationUpdate(conversationIdStr, setConversation);
    const unsubscribeMessages = onMessagesUpdate(
      conversationIdStr,
      (next) => {
        setMessages((prev) => mergeMessages(prev, next));
        setHasInitialMessageSnapshot(true);
        // If we got fewer than initial limit, there are no more older messages
        if (next.length < 100) {
          setHasMoreMessages(false);
        }
      },
      { initialLimit: 100 }
    );

    return () => {
      unsubscribeAuth();
      unsubscribeConversation();
      unsubscribeMessages();
    };
  }, [conversationIdStr]);

  useEffect(() => {
    if (!user?.uid) return;
    let mounted = true;
    void getProfileById(user.uid)
      .then((profile) => {
        if (mounted && profile) setViewerProfile(profile);
      })
      .catch((err) => {
        console.warn('[chat] failed to load viewer profile', err);
      });
    return () => {
      mounted = false;
    };
  }, [user?.uid]);

  // Mark conversation read when user opens the chat (if the last message isn't from them)
  useEffect(() => {
    if (!conversation || !user?.uid) return;
    try {
      if (conversationIdStr && conversation.lastMessageSenderId && conversation.lastMessageSenderId !== user.uid) {
        void markLocalConversationRead(user.uid, conversationIdStr);
        void markConversationRead(conversationIdStr, settings.readReceipts);
      }
    } catch (err) {
      console.warn('[chat] failed to mark conversation read on open', err);
    }
  }, [conversation, user?.uid, id, settings.readReceipts]);

  // Prevent showing a conversation that the current user is not a member of.
  // If we detect the user is not in the conversation members, try to create/find
  // a proper 1:1 conversation with the other participant and redirect there.
  useEffect(() => {
    if (!conversation || !user?.uid) return;
    if (conversation.isBroadcast || conversation.audience === 'everyone') return;
    const members: string[] = Array.isArray(conversation.members) ? conversation.members : [];
    if (members.includes(user.uid)) return;

    // Not a member — attempt to find the other participant and open a correct convo
    const otherId = members.length === 2 ? members.find((m: string) => m !== undefined && m !== null) ?? null : null;
    if (!otherId) {
      // No valid other participant, navigate back
      try { router.back(); } catch { };
      return;
    }

    (async () => {
      try {
        const profile = await getProfileById(otherId);
        if (!profile) {
          router.back();
          return;
        }
        const newConvId = await findOrCreateConversation(profile as Profile);
        if (newConvId && newConvId !== conversationIdStr) {
          router.replace(`/messaging/chat/${newConvId}`);
        } else {
          router.back();
        }
      } catch (err) {
        console.warn('[chat] failed to migrate conversation for current user', err);
        try { router.back(); } catch { }
      }
    })();
  }, [conversation, user?.uid, id, router]);

  useEffect(() => {
    if (!conversationIdStr) return;
    if (!user?.uid) return;
    if (conversation?.isGroup || conversation?.isBroadcast) return;
    if (!directOtherUserId) return;

    const unsubscribeProfile = onUserProfileUpdate(directOtherUserId, setOtherUser);
    const unsubscribeTyping = onUserTyping(conversationIdStr, directOtherUserId, setIsOtherTyping);

    return () => {
      unsubscribeProfile();
      unsubscribeTyping();
    };
  }, [conversationIdStr, conversation?.isGroup, conversation?.isBroadcast, directOtherUserId, user?.uid]);

  useEffect(() => {
    if (otherUser?.id) {
      setParticipantProfiles((prev) =>
        prev[otherUser.id] ? prev : { ...prev, [otherUser.id]: otherUser },
      );
    }
  }, [otherUser]);

  // Subscribe to realtime presence (RTDB) for other user and update lastSeen accordingly
  useEffect(() => {
    if (settings.hibernate) {
      setOtherPresence(null);
      setLastSeen(null);
      return;
    }
    if (!user?.uid) return;
    if (conversation?.isGroup || conversation?.isBroadcast) return;
    if (!directOtherUserId) return;

    const unsubPresence = onUserPresence(directOtherUserId, (status) => {
      setOtherPresence(status);
      if (status.state === 'online') {
        setLastSeen(null);
      } else if (status.last_changed) {
        try {
          setLastSeen(new Date(status.last_changed));
        } catch {
          setLastSeen(null);
        }
      } else {
        void getLastSeen(directOtherUserId).then((d) => {
          if (d) setLastSeen(d);
        });
      }
    });

    return () => unsubPresence();
  }, [conversation?.isGroup, conversation?.isBroadcast, directOtherUserId, settings.hibernate, user?.uid]);

  // Load cached messages for offline viewing
  useEffect(() => {
    let mounted = true;
    const loadCache = async () => {
      if (!conversationIdStr) return;
      try {
        const key = `chat_cache_${conversationIdStr}`;
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return;
        const cached = JSON.parse(raw) as ChatMessage[];
        if (mounted && cached && cached.length > 0) {
          // only set if we don't yet have messages from server
          setMessages((prev) => (prev && prev.length > 0 ? prev : cached));
          setHasInitialMessageSnapshot(true);

          // Show cached content immediately (WhatsApp-style) instead of placeholders.
          setRenderMessageList(true);
          entryOpacity.setValue(1);
          entryTranslateY.setValue(0);
          setRevealToken((t) => t + 1);
          setTimeout(() => scrollToBottom(false), 0);
        }
      } catch (err) {
        // ignore cache errors
      }
    };

    void loadCache();
    return () => {
      mounted = false;
    };
  }, [conversationIdStr, entryOpacity, entryTranslateY, scrollToBottom]);

  // Persist messages to cache whenever messages update
  useEffect(() => {
    if (!conversationIdStr) return;
    const key = `chat_cache_${conversationIdStr}`;
    try {
      void AsyncStorage.setItem(key, JSON.stringify(messages));
    } catch (err) {
      // ignore
    }
  }, [conversationIdStr, messages]);

  useEffect(() => {
    const newestServer = messages?.[0] as ChatMessage | undefined;
    const newestPending = pendingMessages?.[pendingMessages.length - 1] as ChatMessage | undefined;

    if (!renderMessageList) return;

    const newestFromMe = Boolean(
      (newestPending?.sender && newestPending.sender === user?.uid) ||
      (newestServer?.sender && newestServer.sender === user?.uid),
    );

    if (messages.length === 0 && pendingMessages.length === 0) return;

    if (skipNextAutoScrollRef.current && !newestFromMe) return;

    const shouldAutoScroll = atBottomRef.current || newestFromMe;
    if (!shouldAutoScroll) return;

    requestAnimationFrame(() => scrollToBottom(true));
  }, [messages, pendingMessages, scrollToBottom, user?.uid, renderMessageList]);

  // Mark messages delivered (server-side) when we see incoming messages.
  useEffect(() => {
    if (!conversationIdStr || !user?.uid) return;
    if (conversation?.isGroup || conversation?.isBroadcast) return;
    const hasOtherMessages = messages.some((m) => {
      const sender = (m as any).sender ?? (m as any).from;
      return sender && sender !== user.uid;
    });
    if (!hasOtherMessages) return;

    const now = Date.now();
    if (now - deliveredThrottleRef.current < 4000) return;
    deliveredThrottleRef.current = now;

    void markMessagesDelivered(conversationIdStr, user.uid).catch(() => { });
  }, [messages, conversationIdStr, user?.uid, conversation?.isGroup, conversation?.isBroadcast]);

  const toMillisValue = useCallback((value: any): number => {
    try {
      if (!value) return 0;
      if (typeof value === 'number') return value;
      if (typeof value?.toMillis === 'function') return value.toMillis();
      if (typeof value?.toDate === 'function') return value.toDate().getTime();
      if (typeof value?.seconds === 'number') return value.seconds * 1000;
    } catch {
      // ignore
    }
    return 0;
  }, []);

  const buildSendPayload = useCallback((msg: Partial<ChatMessage>) => {
    const { status, failed, __local, __onboardingBot, __offline, ...rest } = msg as any;
    if (rest.mediaType === null) delete rest.mediaType;
    return rest;
  }, []);

  // Auto-retry failed/stuck pending messages when online
  useEffect(() => {
    if (!isConnected || !conversationIdStr) return;

    const now = Date.now();
    pendingMessages.forEach((pending) => {
      const key = pending.clientId || pending.id || '';
      if (!key) return;
      const attempts = retryAttemptsRef.current[key] || 0;
      if (attempts >= 3) return;

      const createdAtMs = toMillisValue((pending as any).createdAt);
      const age = now - createdAtMs;
      const isFailed = pending.failed === true;
      const stuckSending = pending.status === 'sending' && age > 12_000;
      if (!isFailed && !stuckSending) return;

      retryAttemptsRef.current[key] = attempts + 1;
      const payload = buildSendPayload({ ...pending, clientId: pending.clientId || key });
      void sendMessage(conversationIdStr, payload)
        .then(() => {
          setPendingMessages((prev) =>
            prev.map((p) => (p.clientId === pending.clientId ? { ...p, status: 'sent', failed: false } : p)),
          );
        })
        .catch(() => {
          setPendingMessages((prev) =>
            prev.map((p) => (p.clientId === pending.clientId ? { ...p, failed: true } : p)),
          );
        });
    });
  }, [pendingMessages, isConnected, conversationIdStr, toMillisValue, buildSendPayload]);

  // Network state monitoring (used for offline queue + offline status icon)
  useEffect(() => {
    let mounted = true;

    const handle = NetInfo.addEventListener((state) => {
      if (!mounted) return;
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsConnected(online);
    });

    void NetInfo.fetch()
      .then((state) => {
        if (!mounted) return;
        const online = Boolean(state.isConnected && state.isInternetReachable !== false);
        setIsConnected(online);
      })
      .catch(() => {
        // ignore
      });

    return () => {
      mounted = false;
      try {
        handle();
      } catch { }
    };
  }, []);

  // Load offline queue on mount
  useEffect(() => {
    if (!id) return;
    const loadOfflineQueue = async () => {
      try {
      } catch (err) {
        console.warn('[chat] Failed to load offline queue', err);
      }
    };

    void loadOfflineQueue();
  }, [id]);

  // Save offline queue whenever it changes
  useEffect(() => {
    if (!id) return;
    const saveOfflineQueue = async () => {
      try {
        const key = `offline_queue_${id}`;
        await AsyncStorage.setItem(key, JSON.stringify(offlineQueueRef.current));
      } catch (err) {
        console.warn('[chat] Failed to save offline queue', err);
      }
    };

    void saveOfflineQueue();
  }, [id]);

  const visibleMessages = useMemo<ChatMessage[]>(() => {
    const server = messages.filter((m) => {
      if (m.deleted) return false;
      if (Array.isArray(m.deletedFor) && user?.uid && m.deletedFor.includes(user.uid)) return false;
      return true;
    });

    const serverByClientId = new Map<string, ChatMessage>();
    server.forEach((m) => {
      const cid = m.clientId ? String(m.clientId) : '';
      if (cid) serverByClientId.set(cid, m);
    });

    const merged: ChatMessage[] = [];
    const consumed = new Set<string>();

    pendingMessages.forEach((p) => {
      const cid = p.clientId ? String(p.clientId) : '';

      if (cid && serverByClientId.has(cid)) {
        const s = serverByClientId.get(cid)!;
        consumed.add(cid);
        merged.push({
          ...s,
          ...p,
          id: p.id ?? s.id,
          clientId: cid,
          createdAt: p.createdAt ?? s.createdAt,
          status: s.status ?? p.status ?? 'sent',
          failed: false,
        });
      } else {
        merged.push(p);
      }
    });

    server.forEach((s) => {
      const cid = s.clientId ? String(s.clientId) : '';
      if (cid && consumed.has(cid)) return;
      merged.push(s);
    });

    if (isOnboardingConversation) {
      merged.push(...onboardingAutoMessages);
    }

    const toMillis = (value: any, status?: string): number => {
      if (!value) {
        // If no timestamp but status is sending, assume it's brand new (now).
        // If it's a server message with null timestamp (pending write), also assume now.
        if (status === 'sending' || status === undefined) return Date.now();
        return 0;
      }
      if (typeof value === 'number') return value;
      if (typeof value?.toMillis === 'function') return value.toMillis();
      if (typeof value?.toDate === 'function') return value.toDate().getTime();
      if (typeof value?.seconds === 'number') return value.seconds * 1000;
      return 0;
    };

    return merged
      .slice()
      .sort((a, b) => {
        const aTime = toMillis((a as any).createdAt, (a as any).status);
        const bTime = toMillis((b as any).createdAt, (b as any).status);
        // Sort newest-first (bTime - aTime) so with inverted list, newest appears at bottom
        if (aTime !== bTime) return bTime - aTime;
        return String(b.clientId ?? b.id ?? '').localeCompare(String(a.clientId ?? a.id ?? ''));
      });
  }, [messages, pendingMessages, user, isOnboardingConversation, onboardingAutoMessages]);

  useEffect(() => {
    if (!isOnboardingConversation) return;
    if (!renderMessageList) return;
    if (!atBottomRef.current) return;
    if (onboardingAutoMessages.length === 0) return;
    requestAnimationFrame(() => scrollToBottom(true));
  }, [isOnboardingConversation, onboardingAutoMessages.length, renderMessageList, scrollToBottom]);

  const pendingClientIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of pendingMessages) {
      if (m.clientId) ids.add(String(m.clientId));
    }
    return ids;
  }, [pendingMessages]);

  // Load older messages when scrolling to top
  const handleLoadMoreMessages = useCallback(async () => {
    if (!conversationIdStr || !hasMoreMessages || isLoadingMore || loadMoreThrottleRef.current) return;
    if (messages.length === 0) return;

    // Throttle to prevent rapid calls
    loadMoreThrottleRef.current = true;
    setTimeout(() => { loadMoreThrottleRef.current = false; }, 1000);

    const oldestMessage = messages[messages.length - 1];
    const oldestTimestamp = (oldestMessage as any)?.createdAt;
    if (!oldestTimestamp) return;

    setIsLoadingMore(true);
    try {
      const olderMessages = await loadOlderMessages(conversationIdStr, oldestTimestamp, 50);
      if (olderMessages.length === 0) {
        setHasMoreMessages(false);
      } else {
        setMessages(prev => [...prev, ...olderMessages]);
        if (olderMessages.length < 50) {
          setHasMoreMessages(false);
        }
      }
    } catch (err) {
      console.warn('[chat] Failed to load older messages', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [conversationIdStr, hasMoreMessages, isLoadingMore, messages]);

  const showLoadingIndicator =
    renderMessageList &&
    !hasInitialMessageSnapshot &&
    messages.length === 0 &&
    pendingMessages.length === 0;

  const otherLastReadAtMs = useMemo(() => {
    if (!directOtherUserId) return 0;
    return toMillisValue((conversation as any)?.lastReadAtBy?.[directOtherUserId]);
  }, [conversation, directOtherUserId, toMillisValue]);

  const getBubbleGroupPosition = useCallback(
    (index: number): 'single' | 'first' | 'middle' | 'last' => {
      const current = visibleMessages[index];
      if (!current) return 'single';

      const toMillis = (value: any): number => {
        if (!value) return 0;
        if (typeof value === 'number') return value;
        if (typeof value?.toMillis === 'function') return value.toMillis();
        if (typeof value?.toDate === 'function') return value.toDate().getTime();
        if (typeof value?.seconds === 'number') return value.seconds * 1000;
        return 0;
      };

      const GROUP_WINDOW_MS = 5 * 60 * 1000;
      const prev = index > 0 ? visibleMessages[index - 1] : null;
      const next = index < visibleMessages.length - 1 ? visibleMessages[index + 1] : null;

      const currentTime = toMillis((current as any).createdAt);
      const prevTime = prev ? toMillis((prev as any).createdAt) : 0;
      const nextTime = next ? toMillis((next as any).createdAt) : 0;

      const samePrev = !!(
        prev &&
        prev.sender &&
        current.sender &&
        prev.sender === current.sender &&
        Math.abs(currentTime - prevTime) <= GROUP_WINDOW_MS
      );
      const sameNext = !!(
        next &&
        next.sender &&
        current.sender &&
        next.sender === current.sender &&
        Math.abs(nextTime - currentTime) <= GROUP_WINDOW_MS
      );

      if (!samePrev && !sameNext) return 'single';
      if (!samePrev && sameNext) return 'last';
      if (samePrev && sameNext) return 'middle';
      return 'first';
    },
    [visibleMessages],
  );

  const mediaMessages = useMemo<ChatMessage[]>(() => {
    return visibleMessages.filter((m) => m.mediaUrl && (m.mediaType === 'image' || m.mediaType === 'video'));
  }, [visibleMessages]);

  const pinnedMessage = useMemo<ChatMessage | null>(() => {
    if (!user?.uid) return null;
    const combined = [...messages, ...pendingMessages];
    for (let i = combined.length - 1; i >= 0; i -= 1) {
      const message = combined[i];
      if (Array.isArray(message.pinnedBy) && message.pinnedBy.includes(user.uid)) {
        return message;
      }
    }
    return null;
  }, [messages, pendingMessages, user?.uid]);

  const resolveDisplayName = useCallback(
    (uid?: string | null) => {
      if (!uid) return 'Unknown';
      if (uid === user?.uid) return user?.displayName || 'You';
      return participantProfiles[uid]?.displayName || 'Unknown';
    },
    [user?.uid, user?.displayName, participantProfiles],
  );

  const resolveAvatarUri = useCallback(
    (uid?: string | null) => {
      if (!uid || uid === user?.uid) return '';
      return participantProfiles[uid]?.photoURL || '';
    },
    [user?.uid, participantProfiles],
  );

  useEffect(() => {
    if (!user?.uid) return;
    let active = true;

    const ids = new Set<string>();
    for (const message of visibleMessages) {
      if (message.sender && message.sender !== user.uid) ids.add(message.sender);
      if ((message as any).replyToSenderId && (message as any).replyToSenderId !== user.uid) {
        ids.add((message as any).replyToSenderId);
      }
    }

    const missing = Array.from(ids).filter((uid) => !participantProfiles[uid]);
    if (missing.length === 0) return;

    (async () => {
      try {
        const results = await Promise.all(
          missing.map(async (uid) => ({
            uid,
            profile: await getProfileById(uid).catch(() => null),
          })),
        );
        if (!active) return;
        setParticipantProfiles((prev) => {
          const next = { ...prev };
          for (const result of results) {
            if (result.profile?.id) {
              next[result.profile.id] = result.profile;
            } else {
              next[result.uid] = {
                id: result.uid,
                displayName: 'Unknown',
                photoURL: '',
              } as Profile;
            }
          }
          return next;
        });
      } catch {
        // ignore
      }
    })();

    return () => {
      active = false;
    };
  }, [visibleMessages, participantProfiles, user?.uid]);

  const handleReactionPress = useCallback(
    (message: ChatMessage, emoji: string) => {
      if (!conversationIdStr || !user?.uid) return;
      if (!message?.id) return;

      // Optimistic update
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== message.id) return m;
          const reactions = { ...(m.reactions || {}) };
          const users = reactions[emoji] || [];
          if (users.includes(user.uid)) {
            reactions[emoji] = users.filter((u) => u !== user.uid);
          } else {
            reactions[emoji] = [...users, user.uid];
          }
          return { ...m, reactions };
        })
      );

      const reactedUsers = message.reactions?.[emoji] ?? [];
      const alreadyReacted = reactedUsers.includes(user.uid);

      if (alreadyReacted) {
        void removeMessageReaction(conversationIdStr, message.id, emoji, user.uid);
      } else {
        void addMessageReaction(conversationIdStr, message.id, emoji, user.uid);
      }
    },
    [conversationIdStr, user?.uid],
  );

  const handleStartCall = useCallback(
    async (mode: CallType) => {
      if (conversation?.isBroadcast) {
        Alert.alert('Calls unavailable', 'Calls are disabled inside announcement channels.');
        return;
      }
      if (conversation?.status === 'pending') {
        Alert.alert('Calls unavailable', 'Complete the message request before starting a call.');
        return;
      }
      if (!conversation || !conversation.id || !Array.isArray(conversation.members)) {
        Alert.alert('Call unavailable', 'Conversation members are missing.');
        return;
      }
      if (!user?.uid) {
        Alert.alert('Call unavailable', 'Please sign in to start a call.');
        return;
      }
      if (isStartingCall) return;
      setIsStartingCall(true);
      try {
        const call = await createCallSession({
          conversationId: conversation.id,
          members: conversation.members,
          type: mode,
          initiatorId: user.uid,
          isGroup: !!conversation.isGroup,
          conversationName: conversation.isGroup
            ? conversation.name || 'Group'
            : otherUser?.displayName || routeTitle || 'Chat',
          initiatorName: user.displayName ?? null,
        });
        router.push({ pathname: '/calls/[id]', params: { id: call.callId } });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'We could not start the call.';
        Alert.alert('Unable to start call', message);
      } finally {
        setIsStartingCall(false);
      }
    },
    [conversation, user?.uid, otherUser?.displayName, routeTitle, router, isStartingCall],
  );

  const uploadChatMedia = useCallback(
    async (uri: string, type: 'image' | 'video' | 'audio' | 'file'): Promise<{ url: string; mediaType: 'image' | 'video' | 'audio' | 'file' } | null> => {
      if (!user || !supabaseConfigured) return null;

      try {
        const ext = (uri.split('?')[0]?.split('#')[0]?.split('.').pop() || '').toLowerCase();
        const audioContentType = (() => {
          switch (ext) {
            case 'm4a':
              return 'audio/m4a';
            case 'mp3':
              return 'audio/mpeg';
            case 'wav':
              return 'audio/wav';
            case 'aac':
              return 'audio/aac';
            case 'caf':
              return 'audio/x-caf';
            case '3gp':
              return 'audio/3gpp';
            case 'amr':
              return 'audio/amr';
            default:
              return 'audio/m4a';
          }
        })();

        const finalUri = uri;
        const base64Data = await FileSystem.readAsStringAsync(finalUri, { encoding: 'base64' });
        const binary: string = atob(base64Data);
        const fileBuffer = Uint8Array.from(binary, (c: string) => c.charCodeAt(0)).buffer;

        const rawName = finalUri.split('/').pop() || `chat-${Date.now()}`;
        const safeName = rawName.replace(/\s+/g, '_');
        const bucket = 'chats';
        const fileName = `${id}/${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(fileName, fileBuffer, {
            contentType:
              type === 'image'
                ? 'image/jpeg'
                : type === 'video'
                  ? 'video/mp4'
                  : type === 'audio'
                    ? audioContentType
                    : 'application/octet-stream',
            upsert: true,
          });

        if (uploadError) {
          console.error('Chat media upload error', uploadError);
          return null;
        }

        const { data: publicUrl } = supabase.storage.from(bucket).getPublicUrl(fileName);
        const url = (publicUrl as any)?.publicUrl ?? (publicUrl as any)?.public_url ?? null;
        if (!url) return null;

        return { url, mediaType: type };
      } catch (err) {
        console.error('Failed to upload chat media', err);
        return null;
      }
    },
    [conversation?.isGroup, id, user],
  );

  // Offline message sync function
  const syncOfflineMessages = useCallback(async () => {
    if (!isConnected || offlineQueueRef.current.length === 0 || !id || !user?.uid) return;

    setIsReconnecting(true);
    const queue = [...offlineQueueRef.current];
    offlineQueueRef.current = [];

    // Clear sync timeout if exists
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }

    try {
      for (const message of queue) {
        try {
          const messageToSend = buildSendPayload({ ...message, clientId: message.clientId });
          if (!conversationIdStr) throw new Error('Missing conversation id');
          await sendMessage(conversationIdStr, messageToSend);
          setPendingMessages((prev) =>
            prev.map((p) => (p.clientId === message.clientId ? { ...p, status: 'sent', failed: false } : p)),
          );
          // Remove from pending messages after successful send
          setPendingMessages(prev => prev.filter(p => p.clientId !== message.clientId));
        } catch (err) {
          console.warn('[chat] Failed to sync offline message', message.clientId, err);
          // Re-queue failed message
          offlineQueueRef.current.push(message);
          setPendingMessages(prev => prev.map(p =>
            p.clientId === message.clientId ? { ...p, failed: true } : p
          ));
        }
      }

      // Save updated queue
      const key = `offline_queue_${id}`;
      await AsyncStorage.setItem(key, JSON.stringify(offlineQueueRef.current));

    } catch (err) {
      console.warn('[chat] Error during offline sync', err);
    } finally {
      setIsReconnecting(false);
    }
  }, [isConnected, id, user?.uid, conversationIdStr, buildSendPayload]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || !user) return;
    if (isBroadcastReadOnly) {
      Alert.alert('Read only', 'Only MovieFlix admins can post in this channel.');
      return;
    }
    if (!baseSendPermission) {
      Alert.alert('Request pending', 'Wait until your request is accepted before replying.');
      return;
    }

    const trimmed = text.trim();

    if (editingMessage && editingMessage.id) {
      if (conversationIdStr) {
        void editMessage(conversationIdStr, editingMessage.id, trimmed);
      }
      setEditingMessage(null);
      setReplyTo(null);
    } else {
      const clientId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const tempId = `temp-${clientId}`;
      const pending: ChatMessage = {
        id: tempId,
        text: trimmed,
        sender: user.uid,
        createdAt: Date.now(),
        clientId,
        status: 'sending',
      };

      if (replyTo) {
        (pending as any).replyToMessageId = replyTo.id;
        (pending as any).replyToText = replyTo.text;
        (pending as any).replyToSenderId = replyTo.sender;
        const replySenderId = replyTo.sender;
        const replySenderName =
          replySenderId === user.uid
            ? user.displayName || 'You'
            : replySenderId
              ? (participantProfiles[replySenderId]?.displayName || conversation?.name || routeTitle || 'User')
              : 'User';
        (pending as any).replyToSenderName = replySenderName;
      }

      setPendingMessages((prev) => [...prev, pending]);
      requestAnimationFrame(() => scrollToBottom(false));

      if (isConnected) {
        // Online: send immediately
        try {
          const messageToSend = { ...(pending as any), clientId };
          // Filter out null mediaType to match Message type
          if (messageToSend.mediaType === null) {
            delete messageToSend.mediaType;
          }
          if (conversationIdStr) {
            await sendMessage(conversationIdStr, buildSendPayload(messageToSend));
            setPendingMessages((prev) =>
              prev.map((p) => (p.clientId === clientId ? { ...p, status: 'sent', failed: false } : p)),
            );
          }
        } catch (err) {
          console.warn('[chat] Failed to send message', err);
          // Queue for later retry
          offlineQueueRef.current.push(pending);
          setPendingMessages((prev) => prev.map((p) =>
            p.clientId === clientId ? { ...p, failed: true } : p
          ));
        }
      } else {
        // Offline: queue message
        offlineQueueRef.current.push(pending);
        setPendingMessages((prev) => prev.map((p) =>
          p.clientId === clientId ? { ...p, status: 'sending' as const } : p
        ));
      }

      // Streaks are updated automatically on message send via Firestore.
    }

    setReplyTo(null);
    if (conversationIdStr) {
      void setTyping(conversationIdStr, user.uid, false, settings.typingIndicators);
    }
  };

  const handleAcceptRequest = () => {
    if (!canAccept || isAcceptingRequest) return;
    setIsAcceptingRequest(true);
    if (!conversationIdStr) {
      setIsAcceptingRequest(false);
      return;
    }

    void acceptMessageRequest(conversationIdStr)
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Unable to accept request.';
        Alert.alert('Unable to accept', message);
      })
      .finally(() => setIsAcceptingRequest(false));
  };

  const handleDeclineRequest = () => {
    Alert.alert('Decline request?', 'They will not be notified.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: () => {
          if (!conversationIdStr) return;
          void deleteConversation(conversationIdStr)
            .then(() => {
              try {
                router.back();
              } catch { }
            })
            .catch((err) => {
              const message = err instanceof Error ? err.message : 'Unable to decline request.';
              Alert.alert('Unable to decline', message);
            });
        },
      },
    ]);
  };

  const handleDeleteChat = useCallback(() => {
    if (!conversation?.id) return;
    Alert.alert('Delete chat?', 'This removes the entire conversation for you.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setIsDeletingChat(true);
          void deleteConversation(conversation.id)
            .then(() => {
              setShowInfoSheet(false);
              try {
                router.back();
              } catch { }
            })
            .catch((err) => {
              const message = err instanceof Error ? err.message : 'Unable to delete chat';
              Alert.alert('Delete failed', message);
            })
            .finally(() => setIsDeletingChat(false));
        },
      },
    ]);
  }, [conversation?.id, router]);

  const handleToggleBlock = useCallback(() => {
    if (!otherUser?.id) return;
    const action = isUserBlocked ? 'Unblock' : 'Block';
    Alert.alert(`${action} ${otherUser.displayName ?? 'user'}?`, isUserBlocked ? 'They can message you again.' : 'They will no longer be able to reach you.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: action,
        style: 'destructive',
        onPress: () => {
          setIsBlockingUserAction(true);
          const op = isUserBlocked ? unblockUser : blockUser;
          void op(otherUser.id)
            .then(() => {
              setViewerProfile((prev) => {
                if (!prev) return prev;
                const blocked = new Set(prev.blockedUsers ?? []);
                if (isUserBlocked) {
                  blocked.delete(otherUser.id);
                } else {
                  blocked.add(otherUser.id);
                }
                return { ...prev, blockedUsers: Array.from(blocked) };
              });
            })
            .catch((err) => {
              const message = err instanceof Error ? err.message : `${action} failed`;
              Alert.alert(`${action} failed`, message);
            })
            .finally(() => setIsBlockingUserAction(false));
        },
      },
    ]);
  }, [otherUser?.id, otherUser?.displayName, isUserBlocked]);

  const handleToggleMute = useCallback(() => {
    if (!conversation?.id) return;
    setIsMuting(true);
    void muteConversation(conversation.id, !conversation?.muted)
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Unable to update mute setting';
        Alert.alert('Mute failed', message);
      })
      .finally(() => setIsMuting(false));
  }, [conversation?.id, conversation?.muted]);

  const handleReportAction = useCallback(() => {
    if (isReporting) return;
    if (!conversation?.id) return;

    const subjectLabel = conversation.isGroup
      ? conversation.name || 'this group'
      : otherUser?.displayName || 'this user';

    const submit = (reason: string) => {
      setIsReporting(true);

      const op = conversation.isGroup
        ? reportConversation(conversation.id, { reason })
        : otherUser?.id
          ? reportUser(otherUser.id, { conversationId: conversation.id, reason })
          : Promise.reject(new Error('Missing user'));

      void op
        .then(() => {
          Alert.alert('Report sent', 'Thanks for letting us know. We’ll review it.')
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : 'Unable to send report'
          Alert.alert('Report failed', message)
        })
        .finally(() => setIsReporting(false));
    };

    Alert.alert(`Report ${subjectLabel}?`, 'Choose a reason.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Spam', onPress: () => submit('spam') },
      { text: 'Harassment', onPress: () => submit('harassment') },
      { text: 'Other', onPress: () => submit('other') },
    ]);
  }, [conversation?.id, conversation?.isGroup, conversation?.name, otherUser?.id, otherUser?.displayName, isReporting]);

  const handleLeaveGroupAction = useCallback(() => {
    if (!conversation?.id || !conversation?.isGroup) return;
    Alert.alert('Leave group?', 'You will no longer receive messages from this group.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => {
          setIsDeletingChat(true);
          void leaveGroup(conversation.id)
            .then(() => {
              setShowInfoSheet(false);
              try {
                router.back();
              } catch { }
            })
            .catch((err) => {
              const message = err instanceof Error ? err.message : 'Unable to leave group';
              Alert.alert('Leave failed', message);
            })
            .finally(() => setIsDeletingChat(false));
        },
      },
    ]);
  }, [conversation?.id, conversation?.isGroup, router]);

  // Copy message text to clipboard
  const handleCopyMessage = useCallback(async (message: ChatMessage) => {
    if (!message?.text) return;
    try {
      await Clipboard.setStringAsync(message.text);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      closeSpotlight();
    } catch (err) {
      console.warn('[chat] Failed to copy message', err);
    }
  }, [closeSpotlight]);

  // Share message
  const handleShareMessage = useCallback(async (message: ChatMessage) => {
    if (!message?.text && !message?.mediaUrl) return;
    try {
      const shareContent: { message: string; url?: string } = {
        message: message.text || message.mediaUrl || '',
      };
      if (message.mediaUrl) shareContent.url = message.mediaUrl;
      await Share.share(shareContent);
      closeSpotlight();
    } catch (err) {
      console.warn('[chat] Failed to share message', err);
    }
  }, [closeSpotlight]);

  // Open forward sheet
  const handleOpenForward = useCallback((message: ChatMessage) => {
    setForwardingMessage(message);
    setShowForwardSheet(true);
    setSelectedForwardTargets([]);
    setForwardSearchQuery('');
    closeSpotlight();
  }, [closeSpotlight]);

  // Load recent conversations for forwarding
  useEffect(() => {
    if (!showForwardSheet || !user?.uid) return;
    const unsub = onConversationsUpdate(
      (convos) => {
        // Filter out current conversation and broadcast channels
        const filtered = convos.filter(c =>
          c.id !== conversationIdStr &&
          !c.isBroadcast &&
          c.status !== 'pending'
        ).slice(0, 20);
        setRecentConversations(filtered);
      },
      { uid: user.uid }
    );
    return () => unsub();
  }, [showForwardSheet, user?.uid, conversationIdStr]);

  // Forward message to selected conversations
  const handleForwardMessage = useCallback(async () => {
    if (!forwardingMessage || selectedForwardTargets.length === 0 || !user?.uid) return;
    if (!conversationIdStr || !forwardingMessage.id) return;
    setIsForwarding(true);
    try {
      await forwardMessage(conversationIdStr, forwardingMessage.id, selectedForwardTargets, user.uid);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setShowForwardSheet(false);
      setForwardingMessage(null);
      setSelectedForwardTargets([]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to forward message';
      Alert.alert('Forward failed', message);
    } finally {
      setIsForwarding(false);
    }
  }, [forwardingMessage, selectedForwardTargets, user?.uid, conversationIdStr]);

  // Toggle forward target selection
  const toggleForwardTarget = useCallback((targetId: string) => {
    setSelectedForwardTargets(prev =>
      prev.includes(targetId)
        ? prev.filter(id => id !== targetId)
        : [...prev, targetId]
    );
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  // Show message info
  const handleShowMessageInfo = useCallback((message: ChatMessage) => {
    setMessageInfoTarget(message);
    setShowMessageInfoSheet(true);
    closeSpotlight();
  }, [closeSpotlight]);

  // Edit message handler
  const handleEditMessage = useCallback((message: ChatMessage) => {
    if (!message?.id || message.sender !== user?.uid) return;
    setEditingMessage(message);
    closeSpotlight();
  }, [user?.uid, closeSpotlight]);

  // Format timestamp for message info
  const formatFullTimestamp = useCallback((createdAt: any): string => {
    try {
      let date: Date;
      if (typeof createdAt === 'number') {
        date = new Date(createdAt);
      } else if (typeof createdAt?.toMillis === 'function') {
        date = new Date(createdAt.toMillis());
      } else if (typeof createdAt?.toDate === 'function') {
        date = createdAt.toDate();
      } else if (typeof createdAt?.seconds === 'number') {
        date = new Date(createdAt.seconds * 1000);
      } else {
        return 'Unknown';
      }
      return date.toLocaleString([], {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Unknown';
    }
  }, []);

  // Filter conversations for forward search
  const filteredForwardConversations = useMemo(() => {
    if (!forwardSearchQuery.trim()) return recentConversations;
    const query = forwardSearchQuery.toLowerCase();
    return recentConversations.filter(c => {
      const name = c.name || '';
      return name.toLowerCase().includes(query);
    });
  }, [recentConversations, forwardSearchQuery]);

  const handleTypingChange = (typing: boolean) => {
    if (!user || !canSend) return;
    if (conversationIdStr) {
      void setTyping(conversationIdStr, user.uid, typing, settings.typingIndicators);
    }
  };

  const handleMediaPicked = async (uri: string, type: 'image' | 'video') => {
    if (isBroadcastReadOnly) {
      Alert.alert('Read only', 'Only admins can share media in this channel.');
      return;
    }
    if (!baseSendPermission) {
      Alert.alert('Request pending', 'Wait until the recipient accepts before sharing media.');
      return;
    }
    setPendingMedia({ uri, type });
    setPendingCaption('');
  };

  const handleAudioPicked = async (uri: string) => {
    if (!user) return;
    if (isBroadcastReadOnly) {
      Alert.alert('Read only', 'Only admins can post in this channel.');
      return;
    }
    if (!baseSendPermission) {
      Alert.alert('Request pending', 'Wait until the recipient accepts before sending audio.');
      return;
    }

    const uploaded = await uploadChatMedia(uri, 'audio');
    if (!uploaded) return;

    const clientId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempId = `temp-${clientId}`;
    const pending: ChatMessage = {
      id: tempId,
      text: 'Voice message',
      sender: user.uid,
      mediaUrl: uploaded.url,
      mediaType: uploaded.mediaType,
      createdAt: Date.now(),
      clientId,
      status: 'sending',
    };
    setPendingMessages((prev) => [...prev, pending]);
    requestAnimationFrame(() => scrollToBottom(false));

    try {
      if (!conversationIdStr) throw new Error('Missing conversation id');
      await sendMessage(
        conversationIdStr,
        buildSendPayload({
          text: 'Voice message',
          mediaUrl: uploaded.url,
          mediaType: uploaded.mediaType,
          clientId,
        }),
      );
      setPendingMessages((prev) =>
        prev.map((p) => (p.clientId === clientId ? { ...p, status: 'sent', failed: false } : p)),
      );
    } catch (err) {
      setPendingMessages((prev) => prev.map((p) => (p.clientId === clientId ? { ...p, failed: true } : p)));
    }
  };

  const handleSendMusic = useCallback((music: { videoId: string; title: string; artist: string; thumbnail: string }) => {
    if (!conversationIdStr || !user) return;
    const clientId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempId = `temp-${clientId}`;

    // Create optimistic message
    const pending: ChatMessage = {
      id: tempId,
      text: '',
      mediaType: 'music',
      musicData: music,
      sender: user.uid,
      createdAt: Date.now(),
      clientId,
      status: 'sending',
    };

    setPendingMessages((prev) => [...prev, pending]);
    requestAnimationFrame(() => scrollToBottom(false));

    void sendMessage(conversationIdStr, {
      text: '',
      mediaType: 'music',
      musicData: music,
      clientId,
    })
      .then(() => {
        setPendingMessages((prev) =>
          prev.map((p) => (p.clientId === clientId ? { ...p, status: 'sent', failed: false } : p)),
        );
      })
      .catch((err) => {
        console.warn('Failed to send music', err);
        setPendingMessages((prev) => prev.map((p) => (p.clientId === clientId ? { ...p, failed: true } : p)));
      });
  }, [conversationIdStr, user]);

  const handleSendMovie = useCallback((movie: { id: number; title: string; poster: string; runtime: number; year: string; type: 'movie' | 'tv' }) => {
    if (!conversationIdStr || !user) return;
    const clientId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempId = `temp-${clientId}`;

    const pending: ChatMessage = {
      id: tempId,
      text: '',
      mediaType: 'movie',
      movieData: movie,
      sender: user.uid,
      createdAt: Date.now(),
      clientId,
      status: 'sending',
    };

    setPendingMessages((prev) => [...prev, pending]);
    requestAnimationFrame(() => scrollToBottom(false));

    void sendMessage(conversationIdStr, {
      text: '',
      mediaType: 'movie',
      movieData: movie,
      clientId,
    })
      .then(() => {
        setPendingMessages((prev) =>
          prev.map((p) => (p.clientId === clientId ? { ...p, status: 'sent', failed: false } : p)),
        );
      })
      .catch((err) => {
        console.warn('Failed to send movie', err);
        setPendingMessages((prev) => prev.map((p) => (p.clientId === clientId ? { ...p, failed: true } : p)));
      });
  }, [conversationIdStr, user]);

  const handlePressMusic = useCallback((item: ChatMessage) => {
    Alert.alert('Music', `Playing ${item.musicData?.title || 'Track'} is coming soon!`);
  }, []);

  const handlePressMovie = useCallback((item: ChatMessage) => {
    if (!item.movieData) return;
    router.push({
      pathname: '/video-player',
      params: {
        tmdbId: String(item.movieData.id),
        mediaType: item.movieData.type,
        title: item.movieData.title,
        posterPath: item.movieData.poster,
      }
    });
  }, [router]);

  const handleCropPendingMedia = async () => {
    if (!pendingMedia || pendingMedia.type !== 'image') return;
    try {
      const result = await manipulateAsync(
        pendingMedia.uri,
        [{ resize: { width: 900 } }],
        { compress: 0.8, format: SaveFormat.JPEG },
      );
      setPendingMedia({ ...pendingMedia, uri: result.uri });
    } catch (err) {
      console.error('Failed to crop media', err);
    }
  };

  const handleSendPendingMedia = () => {
    if (!pendingMedia || !user) return;
    if (isBroadcastReadOnly) {
      Alert.alert('Read only', 'Only admins can post in this channel.');
      return;
    }
    if (!baseSendPermission) {
      Alert.alert('Request pending', 'Wait until they accept before sending media.');
      return;
    }
    const media = pendingMedia;
    const caption = pendingCaption.trim();
    setPendingMedia(null);
    setPendingCaption('');

    const newMessage: ChatMessage = {
      text: caption || (media.type === 'image' ? 'Photo' : media.type === 'video' ? 'Video' : 'File'),
      sender: user.uid,
      mediaUrl: media.uri,
      mediaType: media.type,
    };
    // optimistic pending media message
    const clientId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempId = `temp-${clientId}`;
    const pending: ChatMessage = {
      id: tempId,
      text: newMessage.text,
      sender: user.uid,
      mediaUrl: newMessage.mediaUrl,
      mediaType: newMessage.mediaType,
      createdAt: Date.now(),
      clientId,
      status: 'sending',
    };
    setPendingMessages((prev) => [...prev, pending]);
    requestAnimationFrame(() => scrollToBottom(false));

    void (async () => {
      try {
        const uploaded = await uploadChatMedia(media.uri, media.type);
        if (!uploaded) throw new Error('Upload failed');
        if (!conversationIdStr) throw new Error('Missing conversation id');
        await sendMessage(
          conversationIdStr,
          buildSendPayload({
            text: newMessage.text,
            mediaUrl: uploaded.url,
            mediaType: uploaded.mediaType,
            clientId,
          } as any),
        );
        setPendingMessages((prev) =>
          prev.map((p) =>
            p.clientId === clientId
              ? { ...p, status: 'sent', failed: false, mediaUrl: uploaded.url, mediaType: uploaded.mediaType }
              : p,
          ),
        );
      } catch (err) {
        setPendingMessages((prev) => prev.map((p) => (p.clientId === clientId ? { ...p, failed: true } : p)));
      }
    })();
  };

  const handleRetryMessage = useCallback(
    async (msg: ChatMessage) => {
      if (!conversationIdStr) return;
      const clientId = msg.clientId || `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      setPendingMessages((prev) =>
        prev.map((p) => {
          const match = (p.clientId && msg.clientId && p.clientId === msg.clientId) || (!p.clientId && p.id === msg.id);
          if (!match) return p;
          return { ...p, clientId, failed: false, status: 'sending' };
        }),
      );

      try {
        await sendMessage(conversationIdStr, buildSendPayload({ ...msg, clientId }));
        setPendingMessages((prev) =>
          prev.map((p) => (p.clientId === clientId ? { ...p, status: 'sent', failed: false } : p)),
        );
      } catch (err) {
        setPendingMessages((prev) => prev.map((p) => (p.clientId === clientId ? { ...p, failed: true } : p)));
      }
    },
    [conversationIdStr, buildSendPayload],
  );

  const handleOpenMedia = (message: ChatMessage) => {
    if (!conversationIdStr) return;
    if (!message?.mediaUrl || !message.mediaType) return;
    if (message.mediaType !== 'image' && message.mediaType !== 'video') return;

    const index = mediaMessages.findIndex((m) => m.id === message.id);
    if (index < 0) return;

    const mediaPayload = mediaMessages.map((m, idx) => ({
      id: m.id ?? `media-${idx}`,
      url: m.mediaUrl,
      type: m.mediaType,
    }));

    router.push({
      pathname: '/messaging/chat/media-viewer',
      params: {
        conversationId: conversationIdStr,
        media: JSON.stringify(mediaPayload),
        index: String(index),
      },
    });
  };

  // Search functionality
  const handleSearchMessages = useCallback((query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const filtered = visibleMessages.filter(message =>
      message.text?.toLowerCase().includes(query.toLowerCase())
    );
    setSearchResults(filtered);
  }, [visibleMessages]);

  const handleJumpToMessage = useCallback((messageId: string) => {
    const messageIndex = visibleMessages.findIndex((msg) => msg.id === messageId);
    if (messageIndex >= 0) {
      flatListRef.current?.scrollToIndex({
        index: messageIndex,
        animated: true,
        viewPosition: 0.5,
      });
    }
    handleCloseSearch();
  }, [visibleMessages, handleCloseSearch]);

  return (
    <MessagingErrorBoundary>
      <ScreenWrapper>
        <LinearGradient
          colors={[accent, accentDark, accentDeeper]}
          start={[0, 0]}
          end={[1, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.flex}>
            <View style={styles.container}>
              {/* Header (glassy hero) */}
              <View style={[styles.headerWrap, { marginTop: Platform.OS === 'ios' ? Math.max(4, insets.top - 12) : 6 }]}>
                <LinearGradient
                  colors={[accentGlow, 'rgba(10,12,24,0.4)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.headerGlow}
                />
                {isSearchMode ? (
                  <View style={styles.headerBar}>
                    <TouchableOpacity onPress={handleCloseSearch} style={styles.backButton}>
                      <Ionicons name="arrow-back" size={22} color="#fff" />
                    </TouchableOpacity>
                    <View style={styles.chatSearchRow}>
                      <Ionicons name="search" size={18} color="rgba(255,255,255,0.8)" />
                      <TextInput
                        style={styles.chatSearchInput}
                        placeholder="Search in chat"
                        placeholderTextColor="rgba(255,255,255,0.5)"
                        value={searchQuery}
                        onChangeText={handleSearchMessages}
                        autoFocus
                      />
                      {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => handleSearchMessages('')} style={styles.chatSearchClear}>
                          <Ionicons name="close" size={16} color="#fff" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ) : (
                  <>
                    <View style={styles.headerBar}>
                      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.titleRow} activeOpacity={0.9} onPress={() => setShowInfoSheet(true)}>
                        <View style={[styles.accentDot, accentDotStyle]} />
                        {conversation?.isGroup ? (
                          <View style={styles.headerAvatarFallback}>
                            <Text style={styles.headerAvatarFallbackText}>
                              {String(conversation.name || routeTitle || 'G')
                                .split(' ')
                                .filter(Boolean)
                                .map((p) => p[0])
                                .join('')
                                .slice(0, 2)
                                .toUpperCase()}
                            </Text>
                          </View>
                        ) : conversation?.isBroadcast ? (
                          <View style={styles.headerAvatarFallback}>
                            <Ionicons name="megaphone" size={16} color="#fff" />
                          </View>
                        ) : otherUser?.photoURL || routeAvatar ? (
                          <Image source={{ uri: String(otherUser?.photoURL || routeAvatar) }} style={styles.headerAvatar} />
                        ) : (
                          <View style={styles.headerAvatarFallback}>
                            <Text style={styles.headerAvatarFallbackText}>
                              {String(otherUser?.displayName || routeTitle || 'U')
                                .split(' ')
                                .filter(Boolean)
                                .map((p) => p[0])
                                .join('')
                                .slice(0, 2)
                                .toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View style={styles.headerTitleCol}>
                          <Text style={styles.headerEyebrow} numberOfLines={1} ellipsizeMode="tail">
                            {conversation?.isGroup ? 'Group Chat' : 'Direct Message'}
                          </Text>
                          <Text style={styles.headerText} numberOfLines={1} ellipsizeMode="tail">
                            {conversation?.isGroup
                              ? conversation.name || routeTitle || 'Group'
                              : otherUser?.displayName || routeTitle || 'Chat'}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      <View style={styles.headerIcons}>
                        <Pressable
                          style={[styles.iconBtn, iconShadowStyle]}
                          onPress={handleOpenSearch}
                          android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true, radius: 20 }}
                        >
                          <LinearGradient
                            colors={iconGradientColors}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.iconBg}
                          >
                            <Ionicons name="search" size={22} color="#ffffff" style={styles.iconMargin} />
                          </LinearGradient>
                        </Pressable>

                        <Pressable
                          style={[styles.iconBtn, iconShadowStyle]}
                          onPress={() => handleStartCall('voice')}
                          disabled={isStartingCall || !callAvailable}
                          android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true, radius: 20 }}
                        >
                          <LinearGradient
                            colors={iconGradientColors}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.iconBg}
                          >
                            <Ionicons name="call" size={22} color="#ffffff" />
                          </LinearGradient>
                        </Pressable>

                        <Pressable
                          style={[styles.iconBtn, iconShadowStyle]}
                          onPress={() => handleStartCall('video')}
                          disabled={isStartingCall || !callAvailable}
                          android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true, radius: 20 }}
                        >
                          <LinearGradient
                            colors={iconGradientColors}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.iconBg}
                          >
                            <Ionicons name="videocam" size={22} color="#ffffff" />
                          </LinearGradient>
                        </Pressable>
                      </View>
                    </View>

                    <View style={styles.headerMetaRow}>
                      {Boolean(streakMetaLabel) && (
                        <View style={styles.metaPill}>
                          <Ionicons name="flame" size={14} color="#fff" />
                          <Text style={styles.metaText}>
                            {streakMetaLabel}
                          </Text>
                        </View>
                      )}
                      <View style={[styles.metaPill, styles.metaPillSoft]}>
                        <Ionicons name="radio-button-on" size={14} color="#fff" />
                        <Text style={styles.metaText}>
                          {isOtherTyping
                            ? 'Typing...'
                            : settings.hibernate
                              ? '—'
                              : otherPresence?.state === 'online'
                                ? 'Online'
                                : lastSeen
                                  ? `Last seen ${lastSeen.toLocaleString()}`
                                  : 'Offline'}
                        </Text>
                      </View>
                      <View style={[styles.metaPill, styles.metaPillOutline]}>
                        <Ionicons name="shield-checkmark" size={14} color="#fff" />
                        <Text style={styles.metaText}>Encrypted</Text>
                      </View>
                    </View>
                  </>
                )}
              </View>

              {!isSearchMode ? (
                <View style={styles.chatAdWrap}>
                  {/* Status/Bio Bubble */}
                  {headerBio ? (
                    <View style={styles.statusBubbleContainer}>
                      <View style={styles.statusBubble}>
                        {Platform.OS === 'ios' ? (
                          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
                        ) : null}
                        <LinearGradient
                          colors={[withAlpha(accent, 0.3), 'rgba(255,255,255,0.08)']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={StyleSheet.absoluteFillObject}
                        />
                        {/* Status indicator dot */}
                        <View style={[
                          styles.statusDot,
                          otherPresence?.state === 'online'
                            ? styles.statusDotOnline
                            : styles.statusDotOffline
                        ]} />
                        {/* Bio text */}
                        <Text style={styles.statusBubbleText} numberOfLines={2} ellipsizeMode="tail">
                          {headerBio}
                        </Text>
                        {/* Glass border highlight */}
                        <View style={styles.statusBubbleBorder} pointerEvents="none" />
                      </View>
                      {/* Speech bubble tail */}
                      <View style={styles.statusBubbleTail}>
                        <View style={[styles.statusTailInner, { backgroundColor: withAlpha(accent, 0.25) }]} />
                      </View>
                    </View>
                  ) : null}
                  <AdBanner placement="feed" />
                </View>
              ) : null}

              {isSearchMode && (
                <View style={styles.inlineSearchPanel}>
                  {searchQuery.trim().length === 0 ? (
                    <Text style={styles.searchHintText}>Type a phrase to jump to that part of the chat.</Text>
                  ) : searchResults.length === 0 ? (
                    <Text style={styles.searchHintText}>
                      No matches for {`“${searchQuery}”`}.
                    </Text>
                  ) : (
                    <FlatList
                      data={searchResults}
                      keyExtractor={(item, index) => item.id ?? item.clientId ?? `result-${index}`}
                      renderItem={({ item }) => (
                        <TouchableOpacity style={styles.searchResultRow} onPress={() => handleJumpToMessage(item.id || '')}>
                          <View style={styles.searchResultDot} />
                          <View style={styles.searchResultCopy}>
                            {item.text ? <Text style={styles.searchResultText} numberOfLines={2}>{item.text}</Text> : null}
                            {item.createdAt ? (
                              <Text style={styles.searchResultTime}>{new Date(item.createdAt).toLocaleString()}</Text>
                            ) : null}
                          </View>
                        </TouchableOpacity>
                      )}
                      ItemSeparatorComponent={() => <View style={styles.searchDivider} />}
                      style={{ maxHeight: 140 }}
                    />
                  )}
                </View>
              )}
              {pinnedMessage && (
                <View style={styles.pinnedBanner}>
                  <Ionicons name="pin" size={14} color="rgba(255,255,255,0.9)" style={{ marginRight: 6 }} />
                  <Text
                    style={styles.pinnedText}
                    numberOfLines={1}
                  >
                    {pinnedMessage.text || ''}
                  </Text>
                </View>
              )}

              <View style={{ flex: 1 }}>
                <View style={styles.messagesContainer}>
                  <LinearGradient
                    colors={[withAlpha(accent, 0.14), 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0.72)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <LinearGradient
                    colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.00)']}
                    start={{ x: 0.1, y: 0 }}
                    end={{ x: 0.8, y: 1 }}
                    style={styles.messagesHighlight}
                  />
                  {renderMessageList ? (
                    <Animated.View
                      style={{
                        flex: 1,
                        opacity: entryOpacity,
                        transform: [{ translateY: entryTranslateY }],
                      }}
                    >
                      <FlashList
                        inverted
                        ref={flatListRef}
                        data={visibleMessages}
                        renderItem={({ item, index }: { item: ChatMessage; index: number }) => {
                          const senderId = String((item as any).sender ?? (item as any).from ?? '').trim();
                          const isMe = Boolean(senderId && user?.uid && senderId === user.uid);

                          const replySenderId = (item as any).replyToSenderId as string | undefined;
                          const existingReplyName = (item as any).replyToSenderName as string | undefined;
                          const shouldResolveReplyName =
                            !existingReplyName || existingReplyName === 'Someone' || existingReplyName === 'Unknown';
                          const resolvedReplyName = replySenderId
                            ? (shouldResolveReplyName ? resolveDisplayName(replySenderId) : existingReplyName)
                            : undefined;
                          const decoratedItem =
                            resolvedReplyName && (item as any).replyToSenderName !== resolvedReplyName
                              ? ({ ...item, replyToSenderName: resolvedReplyName } as any)
                              : item;

                          const createdAtMs = toMillisValue((decoratedItem as any).createdAt);
                          const isPendingLocal = Boolean(
                            (decoratedItem as any).clientId &&
                            pendingClientIds.has(String((decoratedItem as any).clientId)),
                          );

                          const computedStatus = (() => {
                            if (!isMe) return undefined;
                            if ((decoratedItem as any).failed === true) return 'sending' as const;
                            if (isPendingLocal || String((decoratedItem as any).id || '').startsWith('temp-')) {
                              return 'sending' as const;
                            }

                            const canUseReadReceipts = Boolean(
                              settings.readReceipts &&
                              directOtherUserId &&
                              !conversation?.isGroup &&
                              !conversation?.isBroadcast,
                            );
                            const didRead = canUseReadReceipts && otherLastReadAtMs > 0 && otherLastReadAtMs >= createdAtMs;
                            if (didRead) return 'read' as const;

                            const delivered = Boolean(
                              directOtherUserId &&
                              !conversation?.isGroup &&
                              !conversation?.isBroadcast &&
                              otherPresence?.state === 'online',
                            );
                            return delivered ? ('delivered' as const) : ('sent' as const);
                          })();

                          const senderName = isMe ? user?.displayName || 'You' : resolveDisplayName(senderId);
                          const avatarUri = !isMe ? resolveAvatarUri(senderId) || otherUser?.photoURL || '' : '';

                          const statusDecorated = isMe
                            ? ({
                              ...(decoratedItem as any),
                              status: computedStatus,
                              __offline: !isConnected,
                            } as any)
                            : decoratedItem;

                          let swipeableRef: any = null;

                          const renderReplyAction = (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
                            const scale = dragX.interpolate({
                              inputRange: isMe ? [-80, 0] : [0, 80],
                              outputRange: isMe ? [1, 0] : [0, 1],
                              extrapolate: 'clamp',
                            });
                            return (
                              <View style={{ justifyContent: 'center', alignItems: 'center', width: 80 }}>
                                <Animated.View style={{ transform: [{ scale }] }}>
                                  <Ionicons name="return-up-back" size={24} color="#fff" />
                                </Animated.View>
                              </View>
                            );
                          };

                          return (
                            <Swipeable
                              ref={(ref) => { swipeableRef = ref; }}
                              renderRightActions={isMe ? renderReplyAction : undefined}
                              renderLeftActions={!isMe ? renderReplyAction : undefined}
                              onSwipeableOpen={() => {
                                setReplyTo(item);
                                if (Platform.OS !== 'web') {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }
                                // Close the swipeable after action
                                setTimeout(() => {
                                  swipeableRef?.close();
                                }, 150);
                              }}
                            >
                              <MessageBubble
                                item={statusDecorated}
                                isMe={isMe}
                                revealToken={revealToken}
                                groupPosition={getBubbleGroupPosition(index)}
                                avatar={avatarUri}
                                senderName={senderName}
                                onLongPress={(msg: ChatMessage, rect: { x: number; y: number; width: number; height: number }) => {
                                  setSelectedMessage(msg);
                                  setSelectedMessageRect(rect);
                                  setSelectedMessageGroupPosition(getBubbleGroupPosition(index));
                                }}
                                onPressCall={(msg: ChatMessage) => {
                                  setCallSheetMessage(msg as any);
                                }}
                                onPressMedia={handleOpenMedia}
                                onPressReaction={(emoji: string) => handleReactionPress(item, emoji)}
                                onRetry={handleRetryMessage as any}
                                onPressMusic={handlePressMusic}
                                onPressMovie={handlePressMovie}
                              />
                            </Swipeable>
                          );
                        }}
                        keyExtractor={(item: ChatMessage) => item.clientId ?? item.id ?? `msg-${item.createdAt}`}
                        estimatedItemSize={110}
                        getItemType={(itm: ChatMessage) => {
                          const anyItem = itm as any;
                          if (anyItem.callType) return 'call';
                          if (anyItem.mediaUrl) return 'media';
                          if (anyItem.system) return 'system';
                          return 'text';
                        }}
                        showsVerticalScrollIndicator={false}
                        onScroll={handleScroll}
                        maintainVisibleContentPosition={{
                          minIndexForVisible: 0,
                        }}
                        keyboardDismissMode="interactive"
                        keyboardShouldPersistTaps="handled"

                        drawDistance={720}
                        onEndReached={handleLoadMoreMessages}
                        onEndReachedThreshold={0.3}
                        ListFooterComponent={
                          hasMoreMessages && messages.length >= 100 ? (
                            <Pressable
                              onPress={handleLoadMoreMessages}
                              style={styles.loadMoreButton}
                              disabled={isLoadingMore}
                            >
                              {isLoadingMore ? (
                                <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
                              ) : (
                                <Text style={styles.loadMoreText}>Load earlier messages</Text>
                              )}
                            </Pressable>
                          ) : null
                        }
                        contentContainerStyle={[
                          styles.messageList,
                          {
                            flexGrow: 1,
                            justifyContent: 'flex-end',
                            paddingBottom: Math.max(10, inputDockHeight + keyboardHeight + 10),
                          },
                        ]}
                      />
                    </Animated.View>
                  ) : (
                    <View style={{ flex: 1 }} />
                  )}

                  {showLoadingIndicator ? (
                    <View pointerEvents="none" style={styles.loadingOverlay}>
                      <ActivityIndicator color="#fff" />
                    </View>
                  ) : null}
                </View>

                <Animated.View
                  style={{ transform: [{ translateY: keyboardOffset }] }}
                >
                  <View
                    style={[
                      styles.inputDock,
                      {
                        paddingBottom: (Platform.OS === 'ios' ? 10 : 6) + insets.bottom,
                      },
                    ]}
                    onLayout={(e) => {
                      const h = e.nativeEvent.layout.height;
                      if (typeof h === 'number' && h > 0 && Math.abs(h - inputDockHeight) > 1) {
                        setInputDockHeight(h);
                      }
                    }}
                  >
                    <View style={styles.inputContainer}>
                      {isBroadcastReadOnly && (
                        <View style={styles.readOnlyBanner}>
                          <Ionicons name="megaphone-outline" size={16} color="rgba(255,255,255,0.85)" />
                          <Text style={styles.readOnlyText} numberOfLines={2}>
                            Official announcements channel · Only MovieFlix admins can post updates here.
                          </Text>
                        </View>
                      )}
                      {isUserBlocked ? (
                        <View style={styles.blockedBanner}>
                          <Ionicons name="ban-outline" size={16} color="rgba(255,255,255,0.9)" />
                          <Text style={styles.blockedText} numberOfLines={2}>
                            You blocked {otherUser?.displayName ?? 'this user'}. Unblock to send messages.
                          </Text>
                          <TouchableOpacity
                            style={styles.blockedCta}
                            onPress={handleToggleBlock}
                            disabled={isBlockingUserAction}
                          >
                            {isBlockingUserAction ? (
                              <ActivityIndicator color="#fff" size="small" />
                            ) : (
                              <Text style={styles.blockedCtaText}>Unblock</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      ) : canAccept ? (
                        <View style={styles.requestBar}>
                          <View style={styles.requestInfo}>
                            <Text style={styles.requestTitle}>Message request</Text>
                            <Text style={styles.requestSubtitle} numberOfLines={2}>
                              Allow this chat to reply, call, and see when you’ve read messages.
                            </Text>
                          </View>
                          <View style={styles.requestButtons}>
                            <TouchableOpacity
                              onPress={handleDeclineRequest}
                              style={styles.declineButton}
                              disabled={isAcceptingRequest}
                            >
                              <Text style={styles.declineButtonText}>Decline</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={handleAcceptRequest}
                              style={[styles.acceptButton, isAcceptingRequest && styles.acceptButtonDisabled]}
                              disabled={isAcceptingRequest}
                            >
                              <Text style={styles.acceptButtonText}>
                                {isAcceptingRequest ? 'Allowing…' : 'Allow'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <>
                          {showInitiatorPendingBanner ? (
                            <View style={styles.pendingNoticeBanner}>
                              <Ionicons name="hourglass-outline" size={16} color="rgba(255,255,255,0.85)" />
                              <Text style={styles.pendingNoticeText}>
                                Waiting for them to accept your request.
                              </Text>
                            </View>
                          ) : null}
                          <MessageInput
                            onSendMessage={handleSendMessage}
                            onTypingChange={handleTypingChange}
                            onPickMedia={handleMediaPicked}
                            onPickAudio={handleAudioPicked}
                            onPickMusic={handleSendMusic}
                            onPickMovie={handleSendMovie}
                            disabled={!canSend}
                            disabledPlaceholder={
                              isBroadcastReadOnly
                                ? 'Only admins can share updates in this channel'
                                : !baseSendPermission
                                  ? 'Your request is pending approval'
                                  : isUserBlocked
                                    ? 'Unblock to message'
                                    : undefined
                            }
                            replyLabel={replyTo ? (replyTo.text || '').slice(0, 60) : undefined}
                            isEditing={!!editingMessage}
                            onCloseContext={() => {
                              setReplyTo(null);
                              setEditingMessage(null);
                            }}
                          />
                        </>
                      )}
                    </View>
                  </View>
                </Animated.View>
              </View>
            </View>
          </View>
        </SafeAreaView>

        <Modal
          visible={!!callSheetMessage}
          transparent
          animationType="slide"
          onRequestClose={closeCallSheet}
        >
          <View style={styles.callSheetOverlay}>
            <Pressable style={styles.callSheetBackdrop} onPress={closeCallSheet} />
            <View style={[styles.callSheetCard, { paddingBottom: Math.max(12, insets.bottom + 8) }]}>
              <View style={styles.callSheetHandle} />

              {(() => {
                const msg = callSheetMessage as any;
                const callType = msg?.callType === 'video' ? ('video' as const) : ('voice' as const);
                const typeLabel = callType === 'video' ? 'Video call' : 'Voice call';
                const status = String(msg?.callStatus || 'ended');
                const statusLabel =
                  status === 'missed'
                    ? 'Missed'
                    : status === 'declined'
                      ? 'Declined'
                      : status === 'started'
                        ? 'Started'
                        : 'Ended';
                const time = formatTime(msg?.createdAt);

                return (
                  <>
                    <View style={styles.callSheetHeaderRow}>
                      <View style={styles.callSheetIcon}>
                        <Ionicons name={callType === 'video' ? 'videocam' : 'call'} size={18} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.callSheetTitle} numberOfLines={1}>
                          {typeLabel}
                        </Text>
                        <Text
                          style={[
                            styles.callSheetSubtitle,
                            status === 'missed' && styles.callSheetSubtitleMissed,
                          ]}
                          numberOfLines={1}
                        >
                          {statusLabel}{time ? ` · ${time}` : ''}
                        </Text>
                      </View>
                      <TouchableOpacity style={styles.callSheetCloseBtn} onPress={closeCallSheet}>
                        <Ionicons name="close" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={[styles.callSheetPrimaryBtn, (isStartingCall || !callAvailable) && styles.callSheetBtnDisabled]}
                      onPress={() => {
                        closeCallSheet();
                        void handleStartCall(callType);
                      }}
                      disabled={isStartingCall || !callAvailable}
                    >
                      <Ionicons name={callType === 'video' ? 'videocam' : 'call'} size={18} color="#fff" />
                      <Text style={styles.callSheetPrimaryText}>{isStartingCall ? 'Starting…' : 'Call back'}</Text>
                    </TouchableOpacity>
                  </>
                );
              })()}
            </View>
          </View>
        </Modal>

        <Modal
          visible={!!(selectedMessage && selectedMessageRect)}
          transparent
          animationType="none"
          onRequestClose={closeSpotlight}
        >
          {selectedMessage && selectedMessageRect ? (
            <View style={styles.spotlightOverlay}>
              <Animated.View
                style={[
                  styles.spotlightBackdrop,
                  {
                    opacity: spotlightAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
                  },
                ]}
              >
                {Platform.OS === 'ios' ? (
                  <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFillObject} />
                ) : (
                  <View style={styles.spotlightBackdropAndroid} />
                )}
                <LinearGradient
                  colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.75)', 'rgba(0,0,0,0.65)']}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.8, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                {/* Animated gradient orbs */}
                <Animated.View
                  style={[
                    styles.spotlightOrb1,
                    {
                      opacity: spotlightAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 0.5],
                      }),
                    },
                  ]}
                >
                  <LinearGradient
                    colors={[`${accent}60`, `${accent}20`, 'transparent']}
                    style={StyleSheet.absoluteFillObject}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                  />
                </Animated.View>
                <Animated.View
                  style={[
                    styles.spotlightOrb2,
                    {
                      opacity: spotlightAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 0.4],
                      }),
                    },
                  ]}
                >
                  <LinearGradient
                    colors={['rgba(100,130,255,0.4)', 'rgba(100,130,255,0.1)', 'transparent']}
                    style={StyleSheet.absoluteFillObject}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                  />
                </Animated.View>
              </Animated.View>

              <Pressable style={styles.spotlightTouch} onPress={closeSpotlight} />

              {(() => {
                const senderId = String((selectedMessage as any).sender ?? (selectedMessage as any).from ?? '').trim();
                const isMe = Boolean(senderId && user?.uid && senderId === user.uid);
                const replySenderId = (selectedMessage as any).replyToSenderId as string | undefined;
                const existingReplyName = (selectedMessage as any).replyToSenderName as string | undefined;
                const shouldResolveReplyName =
                  !existingReplyName || existingReplyName === 'Someone' || existingReplyName === 'Unknown';
                const resolvedReplyName = replySenderId
                  ? (shouldResolveReplyName ? resolveDisplayName(replySenderId) : existingReplyName)
                  : undefined;
                const decoratedItem =
                  resolvedReplyName && (selectedMessage as any).replyToSenderName !== resolvedReplyName
                    ? ({ ...selectedMessage, replyToSenderName: resolvedReplyName } as any)
                    : selectedMessage;

                const createdAtMs = toMillisValue((decoratedItem as any).createdAt);
                const isPendingLocal = Boolean(
                  (decoratedItem as any).clientId && pendingClientIds.has(String((decoratedItem as any).clientId)),
                );
                const computedStatus = (() => {
                  if (!isMe) return undefined;
                  if ((decoratedItem as any).failed === true) return 'sending' as const;
                  if (isPendingLocal || String((decoratedItem as any).id || '').startsWith('temp-')) {
                    return 'sending' as const;
                  }

                  const canUseReadReceipts = Boolean(
                    settings.readReceipts &&
                    directOtherUserId &&
                    !conversation?.isGroup &&
                    !conversation?.isBroadcast,
                  );
                  const didRead = canUseReadReceipts && otherLastReadAtMs > 0 && otherLastReadAtMs >= createdAtMs;
                  if (didRead) return 'read' as const;

                  const delivered = Boolean(
                    directOtherUserId &&
                    !conversation?.isGroup &&
                    !conversation?.isBroadcast &&
                    otherPresence?.state === 'online',
                  );
                  return delivered ? ('delivered' as const) : ('sent' as const);
                })();

                const senderName = isMe ? user?.displayName || 'You' : resolveDisplayName(senderId);
                const avatarUri = !isMe
                  ? resolveAvatarUri(senderId) || otherUser?.photoURL || ''
                  : '';

                const statusDecorated = isMe
                  ? ({
                    ...(decoratedItem as any),
                    status: computedStatus,
                    __offline: !isConnected,
                  } as any)
                  : decoratedItem;

                const groupPosition = selectedMessageGroupPosition ?? 'single';
                const wrapMarginTop =
                  groupPosition === 'middle' ? 1 : groupPosition === 'first' ? 8 : groupPosition === 'last' ? 1 : 8;

                const window = Dimensions.get('window');
                const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

                // Align the spotlight bubble EXACTLY where it was long-pressed.
                // `MessageBubble` applies an outer marginTop, so we offset the container by that margin.
                const left = clamp(
                  selectedMessageRect.x,
                  0,
                  Math.max(0, window.width - Math.max(1, selectedMessageRect.width)),
                );
                const top = clamp(
                  selectedMessageRect.y - wrapMarginTop,
                  0,
                  Math.max(0, window.height - Math.max(1, selectedMessageRect.height)),
                );

                return (
                  <>
                    <Animated.View
                      style={[
                        styles.spotlightBubbleContainer,
                        {
                          left,
                          top,
                          width: selectedMessageRect.width,
                          opacity: spotlightAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
                          transform: [
                            {
                              scale: spotlightAnim.interpolate({ inputRange: [0, 1], outputRange: [0.996, 1] }),
                            },
                          ],
                        },
                      ]}
                    >
                      <View style={styles.spotlightBubbleShadow}>
                        <MessageBubble
                          item={statusDecorated}
                          isMe={isMe}
                          revealToken={revealToken}
                          groupPosition={groupPosition}
                          avatar={avatarUri}
                          senderName={senderName}
                          onLongPress={() => { }}
                          onPressReaction={(emoji: string) => handleReactionPress(selectedMessage, emoji)}
                        />
                      </View>
                    </Animated.View>

                    <Animated.View
                      style={[
                        styles.spotlightActionBar,
                        {
                          opacity: spotlightAnim,
                          transform: [
                            {
                              translateY: spotlightAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }),
                            },
                          ],
                        },
                      ]}
                    >
                      <BlurView intensity={85} tint="dark" style={styles.spotlightActionBarBlur} />
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.spotlightActionScroll}
                      >
                        {/* Reply */}
                        <TouchableOpacity
                          style={styles.spotlightActionBtn}
                          onPress={() => {
                            setReplyTo(selectedMessage);
                            closeSpotlight();
                          }}
                        >
                          <Ionicons name="return-up-back" size={18} color="#fff" />
                          <Text style={styles.spotlightActionText}>Reply</Text>
                        </TouchableOpacity>

                        {/* Forward */}
                        <TouchableOpacity
                          style={styles.spotlightActionBtn}
                          onPress={() => handleOpenForward(selectedMessage)}
                        >
                          <Ionicons name="arrow-redo" size={18} color="#fff" />
                          <Text style={styles.spotlightActionText}>Forward</Text>
                        </TouchableOpacity>

                        {/* Copy (only for text messages) */}
                        {selectedMessage?.text && (
                          <TouchableOpacity
                            style={styles.spotlightActionBtn}
                            onPress={() => handleCopyMessage(selectedMessage)}
                          >
                            <Ionicons name="copy" size={18} color="#fff" />
                            <Text style={styles.spotlightActionText}>Copy</Text>
                          </TouchableOpacity>
                        )}

                        {/* Edit (only for own messages) */}
                        {selectedMessage?.sender === user?.uid && selectedMessage?.text && (
                          <TouchableOpacity
                            style={styles.spotlightActionBtn}
                            onPress={() => handleEditMessage(selectedMessage)}
                          >
                            <Ionicons name="pencil" size={18} color="#fff" />
                            <Text style={styles.spotlightActionText}>Edit</Text>
                          </TouchableOpacity>
                        )}

                        {/* Pin/Unpin */}
                        <TouchableOpacity
                          style={styles.spotlightActionBtn}
                          onPress={() => {
                            if (selectedMessage?.id && user?.uid) {
                              const alreadyPinned =
                                Array.isArray(selectedMessage.pinnedBy) &&
                                selectedMessage.pinnedBy.includes(user.uid);
                              if (conversationIdStr) {
                                void (alreadyPinned
                                  ? unpinMessage(conversationIdStr, selectedMessage.id, user.uid)
                                  : pinMessage(conversationIdStr, selectedMessage.id, user.uid));
                              }
                            }
                            closeSpotlight();
                          }}
                        >
                          <Ionicons
                            name={
                              Array.isArray(selectedMessage?.pinnedBy) && user?.uid && selectedMessage.pinnedBy.includes(user.uid)
                                ? 'pin-outline'
                                : 'pin'
                            }
                            size={18}
                            color="#fff"
                          />
                          <Text style={styles.spotlightActionText}>
                            {Array.isArray(selectedMessage?.pinnedBy) && user?.uid && selectedMessage.pinnedBy.includes(user.uid)
                              ? 'Unpin'
                              : 'Pin'}
                          </Text>
                        </TouchableOpacity>

                        {/* Share */}
                        <TouchableOpacity
                          style={styles.spotlightActionBtn}
                          onPress={() => handleShareMessage(selectedMessage)}
                        >
                          <Ionicons name="share-outline" size={18} color="#fff" />
                          <Text style={styles.spotlightActionText}>Share</Text>
                        </TouchableOpacity>

                        {/* Info */}
                        <TouchableOpacity
                          style={styles.spotlightActionBtn}
                          onPress={() => handleShowMessageInfo(selectedMessage)}
                        >
                          <Ionicons name="information-circle-outline" size={18} color="#fff" />
                          <Text style={styles.spotlightActionText}>Info</Text>
                        </TouchableOpacity>

                        {/* Delete */}
                        <TouchableOpacity
                          style={[styles.spotlightActionBtn, styles.spotlightActionBtnDanger]}
                          onPress={() => {
                            if (selectedMessage?.id && user?.uid) {
                              if (selectedMessage.sender === user.uid) {
                                if (conversationIdStr) {
                                  void deleteMessageForAll(conversationIdStr, selectedMessage.id);
                                }
                              } else {
                                if (conversationIdStr) {
                                  void deleteMessageForMe(conversationIdStr, selectedMessage.id, user.uid);
                                }
                              }
                            }
                            closeSpotlight();
                          }}
                        >
                          <Ionicons name="trash" size={18} color="#ff6b6b" />
                          <Text style={styles.spotlightActionTextDanger}>Delete</Text>
                        </TouchableOpacity>
                      </ScrollView>
                    </Animated.View>
                  </>
                );
              })()}
            </View>
          ) : null}
        </Modal>

        {pendingMedia && (
          <View style={styles.mediaSheetOverlay} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.mediaSheetBackdrop}
              activeOpacity={1}
              onPress={() => {
                setPendingMedia(null);
                setPendingCaption('');
              }}
            />
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
              keyboardVerticalOffset={0}
              style={styles.mediaSheetAvoid}
            >
              <View style={styles.mediaSheet}>
                <View style={styles.mediaSheetHandle} />
                <View style={styles.mediaPreviewHeader}>
                  <Text style={styles.mediaPreviewTitle}>Preview</Text>
                  {pendingMedia.type === 'image' && (
                    <TouchableOpacity onPress={handleCropPendingMedia} style={styles.mediaCropButton}>
                      <Ionicons name="crop-outline" size={18} color="#fff" />
                      <Text style={styles.mediaCropLabel}>Crop</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.mediaPreviewWrap}>
                  {pendingMedia.type === 'image' ? (
                    <Image
                      source={{ uri: pendingMedia.uri }}
                      style={styles.mediaPreviewImage}
                      resizeMode={ResizeMode.CONTAIN}
                    />
                  ) : pendingMedia.type === 'video' ? (
                    <Video
                      source={{ uri: pendingMedia.uri }}
                      style={styles.mediaPreviewImage}
                      resizeMode={ResizeMode.CONTAIN}
                      useNativeControls={false}
                      shouldPlay={false}
                      isMuted
                    />
                  ) : (
                    <View style={styles.mediaPreviewPlaceholder}>
                      <Ionicons
                        name="document-outline"
                        size={32}
                        color="#fff"
                      />
                      <Text style={styles.mediaPreviewLabel}>
                        File selected
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.mediaCaptionRow}>
                  <TextInput
                    style={styles.mediaCaptionInput}
                    placeholder="Add a caption..."
                    placeholderTextColor="rgba(255,255,255,0.6)"
                    value={pendingCaption}
                    onChangeText={setPendingCaption}
                    multiline
                  />
                  <TouchableOpacity
                    style={[styles.mediaSendButton, sendButtonStyle]}
                    onPress={handleSendPendingMedia}
                  >
                    <Ionicons name="send" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        )}
        <Modal
          visible={showInfoSheet}
          animationType="slide"
          transparent
          onRequestClose={handleCloseInfoSheet}
        >
          <View style={styles.infoSheetOverlay}>
            <TouchableOpacity style={styles.infoSheetBackdrop} activeOpacity={1} onPress={handleCloseInfoSheet} />
            <View style={[styles.infoSheet, { paddingBottom: (Platform.OS === 'ios' ? 18 : 12) + insets.bottom }]}>
              <View style={styles.infoSheetHandle} />
              <View style={styles.infoSheetHeader}>
                {infoAvatarUri ? (
                  <Image source={{ uri: infoAvatarUri }} style={styles.infoSheetAvatar} />
                ) : (
                  <View style={styles.infoSheetAvatarFallback}>
                    <Ionicons name={infoBadgeIcon as any} size={26} color="#fff" />
                  </View>
                )}
                <View style={styles.infoSheetTitles}>
                  <Text style={styles.infoSheetTitle}>{infoTitle}</Text>
                  <Text style={styles.infoSheetSubtitle}>{infoSubtitle}</Text>
                </View>
              </View>

              <View style={styles.infoBadgeRow}>
                {conversation?.isBroadcast && (
                  <View style={styles.infoBadge}>
                    <Ionicons name="shield-checkmark" size={12} color="#fff" />
                    <Text style={styles.infoBadgeText}>Official channel</Text>
                  </View>
                )}
                {conversation?.isGroup && (
                  <View style={styles.infoBadge}>
                    <Ionicons name="people" size={12} color="#fff" />
                    <Text style={styles.infoBadgeText}>Group chat</Text>
                  </View>
                )}
              </View>

              <Text style={styles.infoSheetDescription}>{infoDescription}</Text>

              <View style={styles.infoQuickRow}>
                <TouchableOpacity
                  style={styles.infoQuickButton}
                  onPress={() => {
                    setShowInfoSheet(false);
                    handleStartCall('voice');
                  }}
                  disabled={isStartingCall || !callAvailable}
                >
                  <Ionicons name="call" size={18} color="#fff" />
                  <Text style={styles.infoQuickText}>Voice call</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.infoQuickButton}
                  onPress={() => {
                    setShowInfoSheet(false);
                    handleStartCall('video');
                  }}
                  disabled={isStartingCall || !callAvailable}
                >
                  <Ionicons name="videocam" size={18} color="#fff" />
                  <Text style={styles.infoQuickText}>Video call</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.infoActionList}>
                <Text style={styles.infoSectionTitle}>Chat actions</Text>

                {!conversation?.isBroadcast && (
                  <TouchableOpacity
                    style={styles.infoRow}
                    onPress={handleToggleMute}
                    disabled={isMuting}
                  >
                    <Ionicons
                      name={conversation?.muted ? 'notifications-outline' : 'notifications-off-outline'}
                      size={18}
                      color="#fff"
                    />
                    <Text style={styles.infoRowText}>
                      {conversation?.muted ? 'Unmute' : 'Mute'} notifications
                    </Text>
                    {isMuting && <ActivityIndicator color="#fff" size="small" />}
                  </TouchableOpacity>
                )}

                {!conversation?.isGroup && !conversation?.isBroadcast && otherUser?.id && (
                  <TouchableOpacity
                    style={[styles.infoRow, styles.infoRowDanger]}
                    onPress={handleToggleBlock}
                    disabled={isBlockingUserAction}
                  >
                    <Ionicons name={isUserBlocked ? 'shield-checkmark-outline' : 'shield-outline'} size={18} color="#fff" />
                    <Text style={styles.infoRowText}>
                      {isUserBlocked ? 'Unblock user' : 'Block user'}
                    </Text>
                    {isBlockingUserAction && <ActivityIndicator color="#fff" size="small" />}
                  </TouchableOpacity>
                )}

                {!conversation?.isBroadcast && (
                  <TouchableOpacity
                    style={[styles.infoRow, styles.infoRowDanger]}
                    onPress={handleReportAction}
                    disabled={isReporting}
                  >
                    <Ionicons name="flag-outline" size={18} color="#fff" />
                    <Text style={styles.infoRowText}>
                      {conversation?.isGroup ? 'Report group' : 'Report user'}
                    </Text>
                    {isReporting && <ActivityIndicator color="#fff" size="small" />}
                  </TouchableOpacity>
                )}

                {conversation?.isGroup && (
                  <TouchableOpacity
                    style={[styles.infoRow, styles.infoRowDanger]}
                    onPress={handleLeaveGroupAction}
                    disabled={isDeletingChat}
                  >
                    <Ionicons name="exit-outline" size={18} color="#fff" />
                    <Text style={styles.infoRowText}>Leave group</Text>
                    {isDeletingChat && <ActivityIndicator color="#fff" size="small" />}
                  </TouchableOpacity>
                )}

                {!conversation?.isBroadcast && (
                  <TouchableOpacity
                    style={[styles.infoRow, styles.infoRowDanger]}
                    onPress={handleDeleteChat}
                    disabled={isDeletingChat}
                  >
                    <Ionicons name="trash-outline" size={18} color="#fff" />
                    <Text style={styles.infoRowText}>Delete chat</Text>
                    {isDeletingChat && <ActivityIndicator color="#fff" size="small" />}
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.infoActionRow}>
                <TouchableOpacity style={styles.infoPrimaryBtn} onPress={handleInfoPrimaryAction}>
                  <Text style={styles.infoPrimaryText}>{infoPrimaryLabel}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.infoSecondaryBtn} onPress={handleCloseInfoSheet}>
                  <Text style={styles.infoSecondaryText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Forward Message Sheet */}
        <Modal
          visible={showForwardSheet}
          animationType="slide"
          transparent
          onRequestClose={() => setShowForwardSheet(false)}
        >
          <View style={styles.forwardSheetOverlay}>
            <TouchableOpacity
              style={styles.forwardSheetBackdrop}
              activeOpacity={1}
              onPress={() => setShowForwardSheet(false)}
            />
            <View style={[styles.forwardSheet, { paddingBottom: (Platform.OS === 'ios' ? 18 : 12) + insets.bottom }]}>
              <View style={styles.forwardSheetHandle} />

              <View style={styles.forwardSheetHeader}>
                <Text style={styles.forwardSheetTitle}>Forward to</Text>
                <TouchableOpacity onPress={() => setShowForwardSheet(false)}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* Search bar */}
              <View style={styles.forwardSearchBar}>
                <Ionicons name="search" size={18} color="rgba(255,255,255,0.5)" />
                <TextInput
                  style={styles.forwardSearchInput}
                  placeholder="Search conversations..."
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={forwardSearchQuery}
                  onChangeText={setForwardSearchQuery}
                />
                {forwardSearchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setForwardSearchQuery('')}>
                    <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.5)" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Message preview */}
              {forwardingMessage && (
                <View style={styles.forwardPreview}>
                  <View style={styles.forwardPreviewIcon}>
                    <Ionicons name="arrow-redo" size={16} color={accent} />
                  </View>
                  <Text style={styles.forwardPreviewText} numberOfLines={2}>
                    {forwardingMessage.text || (forwardingMessage.mediaType === 'image' ? 'Photo' : forwardingMessage.mediaType === 'video' ? 'Video' : 'Media')}
                  </Text>
                </View>
              )}

              {/* Conversation list */}
              <FlatList
                data={filteredForwardConversations}
                keyExtractor={(item) => item.id}
                style={styles.forwardList}
                renderItem={({ item }) => {
                  const isSelected = selectedForwardTargets.includes(item.id);
                  return (
                    <TouchableOpacity
                      style={[styles.forwardItem, isSelected && styles.forwardItemSelected]}
                      onPress={() => toggleForwardTarget(item.id)}
                    >
                      <View style={styles.forwardItemAvatar}>
                        {item.isGroup ? (
                          <Ionicons name="people" size={20} color="#fff" />
                        ) : (
                          <Ionicons name="person" size={20} color="#fff" />
                        )}
                      </View>
                      <View style={styles.forwardItemInfo}>
                        <Text style={styles.forwardItemName} numberOfLines={1}>
                          {item.name || 'Chat'}
                        </Text>
                        {item.lastMessage && (
                          <Text style={styles.forwardItemPreview} numberOfLines={1}>
                            {item.lastMessage}
                          </Text>
                        )}
                      </View>
                      <View style={[styles.forwardCheckbox, isSelected && styles.forwardCheckboxSelected]}>
                        {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.forwardEmpty}>
                    <Ionicons name="chatbubbles-outline" size={48} color="rgba(255,255,255,0.3)" />
                    <Text style={styles.forwardEmptyText}>No conversations found</Text>
                  </View>
                }
              />

              {/* Selected count and send button */}
              <View style={styles.forwardActions}>
                <Text style={styles.forwardSelectedCount}>
                  {selectedForwardTargets.length} selected
                </Text>
                <TouchableOpacity
                  style={[
                    styles.forwardSendBtn,
                    { backgroundColor: accent },
                    (selectedForwardTargets.length === 0 || isForwarding) && styles.forwardSendBtnDisabled
                  ]}
                  onPress={handleForwardMessage}
                  disabled={selectedForwardTargets.length === 0 || isForwarding}
                >
                  {isForwarding ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="send" size={18} color="#fff" />
                      <Text style={styles.forwardSendText}>Forward</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Message Info Sheet */}
        <Modal
          visible={showMessageInfoSheet}
          animationType="slide"
          transparent
          onRequestClose={() => setShowMessageInfoSheet(false)}
        >
          <View style={styles.messageInfoOverlay}>
            <TouchableOpacity
              style={styles.messageInfoBackdrop}
              activeOpacity={1}
              onPress={() => setShowMessageInfoSheet(false)}
            />
            <View style={[styles.messageInfoSheet, { paddingBottom: (Platform.OS === 'ios' ? 18 : 12) + insets.bottom }]}>
              <View style={styles.messageInfoHandle} />

              <View style={styles.messageInfoHeader}>
                <Text style={styles.messageInfoTitle}>Message Info</Text>
                <TouchableOpacity onPress={() => setShowMessageInfoSheet(false)}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>

              {messageInfoTarget && (
                <ScrollView style={styles.messageInfoContent}>
                  {/* Message preview */}
                  <View style={styles.messageInfoPreview}>
                    {messageInfoTarget.mediaUrl && messageInfoTarget.mediaType === 'image' && (
                      <Image
                        source={{ uri: messageInfoTarget.mediaUrl }}
                        style={styles.messageInfoMedia}
                      />
                    )}
                    {messageInfoTarget.text && (
                      <Text style={styles.messageInfoText}>{messageInfoTarget.text}</Text>
                    )}
                  </View>

                  {/* Info rows */}
                  <View style={styles.messageInfoSection}>
                    <View style={styles.messageInfoRow}>
                      <View style={styles.messageInfoRowIcon}>
                        <Ionicons name="time-outline" size={18} color={accent} />
                      </View>
                      <View style={styles.messageInfoRowContent}>
                        <Text style={styles.messageInfoLabel}>Sent</Text>
                        <Text style={styles.messageInfoValue}>
                          {formatFullTimestamp(messageInfoTarget.createdAt)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.messageInfoRow}>
                      <View style={styles.messageInfoRowIcon}>
                        <Ionicons name="person-outline" size={18} color={accent} />
                      </View>
                      <View style={styles.messageInfoRowContent}>
                        <Text style={styles.messageInfoLabel}>From</Text>
                        <Text style={styles.messageInfoValue}>
                          {messageInfoTarget.sender === user?.uid
                            ? 'You'
                            : resolveDisplayName(messageInfoTarget.sender)}
                        </Text>
                      </View>
                    </View>

                    {messageInfoTarget.sender === user?.uid && (
                      <View style={styles.messageInfoRow}>
                        <View style={styles.messageInfoRowIcon}>
                          <Ionicons
                            name={
                              messageInfoTarget.status === 'read' ? 'checkmark-done' :
                                messageInfoTarget.status === 'delivered' ? 'checkmark-done' :
                                  messageInfoTarget.status === 'sent' ? 'checkmark' :
                                    'time-outline'
                            }
                            size={18}
                            color={messageInfoTarget.status === 'read' ? '#4FC3F7' : accent}
                          />
                        </View>
                        <View style={styles.messageInfoRowContent}>
                          <Text style={styles.messageInfoLabel}>Status</Text>
                          <Text style={styles.messageInfoValue}>
                            {messageInfoTarget.status === 'read' ? 'Read' :
                              messageInfoTarget.status === 'delivered' ? 'Delivered' :
                                messageInfoTarget.status === 'sent' ? 'Sent' : 'Sending'}
                          </Text>
                        </View>
                      </View>
                    )}

                    {messageInfoTarget.forwarded && (
                      <View style={styles.messageInfoRow}>
                        <View style={styles.messageInfoRowIcon}>
                          <Ionicons name="arrow-redo" size={18} color={accent} />
                        </View>
                        <View style={styles.messageInfoRowContent}>
                          <Text style={styles.messageInfoLabel}>Forwarded</Text>
                          <Text style={styles.messageInfoValue}>Yes</Text>
                        </View>
                      </View>
                    )}

                    {messageInfoTarget.mediaType && (
                      <View style={styles.messageInfoRow}>
                        <View style={styles.messageInfoRowIcon}>
                          <Ionicons
                            name={
                              messageInfoTarget.mediaType === 'image' ? 'image-outline' :
                                messageInfoTarget.mediaType === 'video' ? 'videocam-outline' :
                                  messageInfoTarget.mediaType === 'audio' ? 'musical-notes-outline' :
                                    'document-outline'
                            }
                            size={18}
                            color={accent}
                          />
                        </View>
                        <View style={styles.messageInfoRowContent}>
                          <Text style={styles.messageInfoLabel}>Media Type</Text>
                          <Text style={styles.messageInfoValue}>
                            {messageInfoTarget.mediaType.charAt(0).toUpperCase() + messageInfoTarget.mediaType.slice(1)}
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Reactions */}
                    {messageInfoTarget.reactions && Object.keys(messageInfoTarget.reactions).length > 0 && (
                      <View style={styles.messageInfoReactions}>
                        <Text style={styles.messageInfoSectionTitle}>Reactions</Text>
                        <View style={styles.messageInfoReactionList}>
                          {Object.entries(messageInfoTarget.reactions).map(([emoji, users]) => (
                            <View key={emoji} style={styles.messageInfoReactionItem}>
                              <Text style={styles.messageInfoReactionEmoji}>{emoji}</Text>
                              <Text style={styles.messageInfoReactionCount}>{users.length}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>
                </ScrollView>
              )}

              <TouchableOpacity
                style={styles.messageInfoCloseBtn}
                onPress={() => setShowMessageInfoSheet(false)}
              >
                <Text style={styles.messageInfoCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScreenWrapper>
    </MessagingErrorBoundary>
  );
};

const styles = StyleSheet.create({
  loadMoreButton: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  loadMoreText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '500',
  },
  // Header glass hero
  headerWrap: {
    marginHorizontal: 12,
    marginTop: Platform.OS === 'ios' ? 18 : 10,
    marginBottom: 4,
    borderRadius: 18,
    overflow: 'hidden',
  },
  chatAdWrap: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 6,
    position: 'relative',
  },
  headerGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.7,
  },
  headerBar: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
  },
  backButton: {
    padding: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    justifyContent: 'flex-start',
  },
  accentDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  headerAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarFallbackText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    letterSpacing: 0.6,
  },
  headerText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerTitleCol: {
    minWidth: 0,
    flexShrink: 1,
  },
  // Status/Bio Bubble - Redesigned
  statusBubbleContainer: {
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  statusBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Platform.OS === 'android' ? 'rgba(20,20,30,0.85)' : 'transparent',
    overflow: 'hidden',
    maxWidth: '85%',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotOnline: {
    backgroundColor: '#4ade80',
    shadowColor: '#4ade80',
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  statusDotOffline: {
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  statusBubbleText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    flexShrink: 1,
  },
  statusBubbleBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  statusBubbleTail: {
    marginLeft: 16,
    marginTop: -2,
    width: 12,
    height: 8,
    overflow: 'hidden',
  },
  statusTailInner: {
    width: 12,
    height: 12,
    borderRadius: 3,
    transform: [{ rotate: '45deg' }],
    marginTop: -8,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  iconBtn: {
    marginLeft: 8,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  iconBg: {
    padding: 10,
    borderRadius: 12,
  },
  iconMargin: {
    marginRight: 4,
  },
  headerMetaRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    rowGap: 10,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    maxWidth: '100%',
    flexShrink: 1,
  },
  metaPillSoft: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  metaPillOutline: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  metaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  mediaSheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 60,
    justifyContent: 'flex-end',
  },
  mediaSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  mediaSheet: {
    backgroundColor: '#05060f',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
  },
  mediaSheetAvoid: {
    justifyContent: 'flex-end',
  },
  mediaSheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: 10,
  },
  mediaPreviewWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
  mediaPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  mediaPreviewTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  mediaCropButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  mediaCropLabel: {
    marginLeft: 4,
    color: '#fff',
    fontSize: 12,
  },
  mediaPreviewImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  mediaPreviewPlaceholder: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaPreviewLabel: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
  },
  mediaCaptionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 6,
  },
  mediaCaptionInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    color: '#fff',
    fontSize: 15,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  mediaSendButton: {
    marginLeft: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinnedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  pinnedText: {
    flex: 1,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
  },
  messagesContainer: {
    flex: 1,
    marginHorizontal: 12,
    marginTop: 6,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  messagesHighlight: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.85,
  },
  messageList: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  inputDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  inputContainer: {
    paddingBottom: 0,
  },
  readOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  readOnlyText: {
    flex: 1,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  infoSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(3,5,12,0.8)',
    justifyContent: 'flex-end',
  },
  infoSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  infoSheet: {
    backgroundColor: '#05060f',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  infoSheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 12,
  },
  infoSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  infoSheetAvatar: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  infoSheetAvatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  infoSheetTitles: {
    flex: 1,
  },
  infoSheetTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  infoSheetSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    marginTop: 4,
  },
  infoBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  infoBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  infoSheetDescription: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    lineHeight: 18,
  },
  infoQuickRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  infoQuickButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  infoQuickText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  infoActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  infoPrimaryBtn: {
    flex: 1,
    backgroundColor: '#19c37d',
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
  },
  infoPrimaryText: {
    color: '#02060f',
    fontSize: 14,
    fontWeight: '800',
  },
  infoSecondaryBtn: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  infoSecondaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  requestBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginHorizontal: 12,
    marginBottom: 12,
    gap: 16,
  },
  requestInfo: {
    flex: 1,
  },
  requestTitle: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
    marginBottom: 4,
  },
  requestSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  requestButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  acceptButton: {
    backgroundColor: '#19c37d',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
  },
  acceptButtonText: {
    color: '#02060f',
    fontWeight: '800',
  },
  acceptButtonDisabled: {
    opacity: 0.6,
  },
  declineButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'transparent',
  },
  declineButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  pendingNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    marginTop: -2,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pendingNoticeText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  blockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,75,75,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,75,75,0.4)',
  },
  blockedText: {
    flex: 1,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  blockedCta: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    minWidth: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockedCtaText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  infoActionList: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  infoSectionTitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 10,
  },
  infoRowDanger: {
    backgroundColor: 'rgba(255,75,75,0.10)',
    borderColor: 'rgba(255,75,75,0.25)',
  },
  infoRowText: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  callSheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  callSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  callSheetCard: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(18,20,30,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 14,
  },
  callSheetHandle: {
    alignSelf: 'center',
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 12,
  },
  callSheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  callSheetIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  callSheetCloseBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  callSheetTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
  },
  callSheetSubtitle: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '800',
    fontSize: 12,
  },
  callSheetSubtitleMissed: {
    color: '#ff6b6b',
  },
  callSheetPrimaryBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(229,9,20,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  callSheetPrimaryText: {
    color: '#fff',
    fontWeight: '900',
  },
  callSheetBtnDisabled: {
    opacity: 0.55,
  },
  spotlightOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
  },
  spotlightBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  spotlightBackdropAndroid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.88)',
  },
  spotlightOrb1: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    top: '15%',
    left: -40,
    overflow: 'hidden',
  },
  spotlightOrb2: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    bottom: '20%',
    right: -30,
    overflow: 'hidden',
  },
  spotlightTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  spotlightBubbleContainer: {
    position: 'absolute',
  },
  spotlightBubbleShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
    elevation: 16,
  },
  spotlightActionBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 18,
    borderRadius: 20,
    overflow: 'hidden',
  },
  spotlightActionBarBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  spotlightActionRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: Platform.OS === 'android' ? 'rgba(15,15,25,0.95)' : 'rgba(15,15,25,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
  },
  spotlightActionBtn: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    minWidth: 60,
  },
  spotlightActionText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  spotlightActionBtnDanger: {
    backgroundColor: 'rgba(255,75,75,0.12)',
    borderColor: 'rgba(255,75,75,0.25)',
  },
  spotlightActionTextDanger: {
    color: '#ff6b6b',
    fontSize: 11,
    fontWeight: '900',
  },
  chatSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  chatSearchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
  },
  chatSearchClear: {
    padding: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  inlineSearchPanel: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 4,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchHintText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  searchResultDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
    opacity: 0.6,
  },
  searchResultCopy: {
    flex: 1,
  },
  searchResultText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  searchResultTime: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    marginTop: 2,
  },
  searchDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  spotlightActionScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: Platform.OS === 'android' ? 'rgba(15,15,25,0.95)' : 'rgba(15,15,25,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
  },
  // Forward Sheet Styles
  forwardSheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  forwardSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  forwardSheet: {
    backgroundColor: '#0a0b14',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 12,
    maxHeight: '80%',
  },
  forwardSheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: 16,
  },
  forwardSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  forwardSheetTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  forwardSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 12,
  },
  forwardSearchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
  },
  forwardPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 12,
  },
  forwardPreviewIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  forwardPreviewText: {
    flex: 1,
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
  },
  forwardList: {
    flex: 1,
    marginBottom: 12,
  },
  forwardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  forwardItemSelected: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  forwardItemAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  forwardItemInfo: {
    flex: 1,
  },
  forwardItemName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  forwardItemPreview: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  forwardCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  forwardCheckboxSelected: {
    backgroundColor: '#4ade80',
    borderColor: '#4ade80',
  },
  forwardEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  forwardEmptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginTop: 12,
  },
  forwardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  forwardSelectedCount: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '600',
  },
  forwardSendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  forwardSendBtnDisabled: {
    opacity: 0.5,
  },
  forwardSendText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  // Message Info Sheet Styles
  messageInfoOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  messageInfoBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  messageInfoSheet: {
    backgroundColor: '#0a0b14',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 12,
    maxHeight: '70%',
  },
  messageInfoHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: 16,
  },
  messageInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  messageInfoTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  messageInfoContent: {
    flex: 1,
  },
  messageInfoPreview: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 16,
  },
  messageInfoMedia: {
    width: '100%',
    height: 150,
    borderRadius: 12,
    marginBottom: 12,
  },
  messageInfoText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
  },
  messageInfoSection: {
    marginBottom: 16,
  },
  messageInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  messageInfoRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageInfoRowContent: {
    flex: 1,
  },
  messageInfoLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
  },
  messageInfoValue: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 2,
  },
  messageInfoReactions: {
    marginTop: 16,
  },
  messageInfoSectionTitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  messageInfoReactionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  messageInfoReactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  messageInfoReactionEmoji: {
    fontSize: 18,
  },
  messageInfoReactionCount: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  messageInfoCloseBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginTop: 12,
  },
  messageInfoCloseBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default ChatScreen;
