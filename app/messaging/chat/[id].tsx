import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
  Dimensions,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import {
  Conversation,
  acceptMessageRequest,
  addMessageReaction,
  blockUser,
  unblockUser,
  deleteConversation,
  deleteMessageForAll,
  deleteMessageForMe,
  editMessage,
  findOrCreateConversation,
  getLastSeen,
  getProfileById,
  leaveGroup,
  markConversationRead,
  muteConversation,
  removeMessageReaction,
  reportConversation,
  reportUser,
  onAuthChange,
  onConversationUpdate,
  onMessagesUpdate,
  onUserPresence,
  onUserProfileUpdate,
  onUserTyping,
  pinMessage,
  Profile,
  sendMessage,
  setTyping,
  unpinMessage,
  BROADCAST_ADMIN_EMAILS,
  BROADCAST_ADMIN_IDS
} from '../controller';

import { createCallSession } from '@/lib/calls/callService';
import type { CallType } from '@/lib/calls/types';
import { getChatStreak, updateStreakForContext } from '@/lib/streaks/streakManager';
import { Ionicons } from '@expo/vector-icons';

import { useMessagingSettings } from '@/hooks/useMessagingSettings';
import { ResizeMode, Video } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { LinearGradient } from 'expo-linear-gradient';
import ScreenWrapper from '../../../components/ScreenWrapper';
import AdBanner from '../../../components/ads/AdBanner';
import { supabase, supabaseConfigured } from '../../../constants/supabase';
import MessageBubble from './components/MessageBubble';
import MessageInput from './components/MessageInput';
import MessagingErrorBoundary, { useErrorHandler } from '../components/ErrorBoundary';
import { useAccent } from '../../components/AccentContext';
import { accentGradient, darkenColor, withAlpha } from '../../../lib/colorUtils';

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
  mediaType?: 'image' | 'video' | 'audio' | 'file' | null;
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
  [key: string]: any;
};

const ChatScreen = () => {
  const { id, fromStreak } = useLocalSearchParams();
  const router = useRouter();
  const { settings } = useMessagingSettings();
  const insets = useSafeAreaInsets();

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
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [inputDockHeight, setInputDockHeight] = useState(0);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [selectedMessageRect, setSelectedMessageRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [pendingMedia, setPendingMedia] = useState<{ uri: string; type: 'image' | 'video' | 'file' } | null>(null);
  const [pendingCaption, setPendingCaption] = useState<string>('');
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const [isAcceptingRequest, setIsAcceptingRequest] = useState(false);
  const [isDeletingChat, setIsDeletingChat] = useState(false);
  const [isBlockingUserAction, setIsBlockingUserAction] = useState(false);
  const [isMuting, setIsMuting] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const flatListRef = useRef<any>(null);
  const [streakCount, setStreakCount] = useState<number>(0);

  useEffect(() => {
    const isIOS = Platform.OS === 'ios';
    const showEvent = isIOS ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = isIOS ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: any) => {
      const rawHeight = typeof e?.endCoordinates?.height === 'number' ? e.endCoordinates.height : 0;
      const effectiveHeight = Math.max(0, rawHeight - (isIOS ? insets.bottom : 0));
      const duration = typeof e?.duration === 'number' ? e.duration : isIOS ? 250 : 150;

      setKeyboardInset(effectiveHeight);

      Animated.timing(keyboardOffset, {
        toValue: effectiveHeight + (isIOS ? 10 : 0),
        duration,
        useNativeDriver: false,
      }).start();
    };

    const onHide = (e: any) => {
      const duration = typeof e?.duration === 'number' ? e.duration : isIOS ? 250 : 150;
      setKeyboardInset(0);
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration,
        useNativeDriver: false,
      }).start();
    };

    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [insets.bottom, keyboardOffset]);
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
    ? conversation.name || 'Group chat'
    : conversation?.isBroadcast
    ? conversation.name || 'MovieFlix Onboarding'
    : otherUser?.displayName || 'Chat';
  const infoSubtitle = conversation?.isBroadcast
    ? 'Admin-only broadcast channel'
    : conversation?.isGroup
    ? `${conversation?.members?.length ?? 0} members`
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
  const infoAvatarUri = conversation?.isGroup || conversation?.isBroadcast ? null : otherUser?.photoURL || null;
  const infoBadgeIcon = conversation?.isBroadcast
    ? 'megaphone-outline'
    : conversation?.isGroup
    ? 'people-outline'
    : 'person-outline';

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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    flatListRef.current?.scrollToEnd({ animated });
  }, []);

  const lastMarkedRef = React.useRef<number>(0);
  const handleScroll = (e: any) => {
    // If user is near bottom, mark as read (debounced to once per 3s)
    try {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      const atBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 100;
      if (atBottom && conversation && user?.uid) {
        const now = Date.now();
        if (now - lastMarkedRef.current > 3000) {
          lastMarkedRef.current = now;
          if (conversationIdStr && conversation.lastMessageSenderId && conversation.lastMessageSenderId !== user.uid) {
            void markConversationRead(conversationIdStr, settings.readReceipts);
          }
        }
      }
    } catch (err) {
      // ignore
    }
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthChange((authUser) => {
      if (!authUser) {
        setUser(null);
        setViewerProfile(null);
        return;
      }
      setUser({
        uid: authUser.uid,
        displayName: (authUser.displayName as string) ?? null,
        email: (authUser.email as string) ?? null,
        photoURL: (authUser as any).photoURL ?? null,
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
    const unsubscribeMessages = onMessagesUpdate(conversationIdStr, setMessages);

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
        void markConversationRead(conversationIdStr, settings.readReceipts);
      }
    } catch (err) {
      console.warn('[chat] failed to mark conversation read on open', err);
    }
  }, [conversation, user?.uid, id, settings.readReceipts]);

  // When server messages arrive, remove any pending messages that were echoed back (match on clientId)
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    const serverClientIds = new Set(messages.map((m) => m.clientId).filter(Boolean));
    if (serverClientIds.size === 0) return;
    setPendingMessages((prev) => prev.filter((p) => !serverClientIds.has(p.clientId)));
  }, [messages]);

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
      try { router.back(); } catch {};
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
        try { router.back(); } catch {}
      }
    })();
  }, [conversation, user?.uid, id, router]);

  useEffect(() => {
    if (!conversation?.members || !user?.uid) return;

    const otherUserId = conversation.members.find((uid: string) => uid !== user.uid);
    if (!otherUserId) return;

    if (!conversationIdStr) return;

    const unsubscribeProfile = onUserProfileUpdate(otherUserId, setOtherUser);
    const unsubscribeTyping = onUserTyping(conversationIdStr, otherUserId, setIsOtherTyping);

    return () => {
      unsubscribeProfile();
      unsubscribeTyping();
    };
  }, [conversation, conversationIdStr, user?.uid]);

  useEffect(() => {
    if (otherUser?.id) {
      setParticipantProfiles((prev) =>
        prev[otherUser.id] ? prev : { ...prev, [otherUser.id]: otherUser },
      );
    }
  }, [otherUser]);

  // Subscribe to realtime presence (RTDB) for other user and update lastSeen accordingly
  useEffect(() => {
    if (!conversation?.members || !user?.uid) return;
    const otherUserId = conversation.members.find((uid: string) => uid !== user.uid);
    if (!otherUserId) return;

    const unsubPresence = onUserPresence(otherUserId, (status) => {
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
        void getLastSeen(otherUserId).then((d) => {
          if (d) setLastSeen(d);
        });
      }
    });

    return () => unsubPresence();
  }, [conversation, user?.uid, conversationIdStr]);

  // Load cached messages for offline viewing
  useEffect(() => {
    let mounted = true;
    const loadCache = async () => {
      if (!id) return;
      try {
        const key = `chat_cache_${id}`;
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return;
        const cached = JSON.parse(raw) as ChatMessage[];
        if (mounted && cached && cached.length > 0) {
          // only set if we don't yet have messages from server
          setMessages((prev) => (prev && prev.length > 0 ? prev : cached));
        }
      } catch (err) {
        // ignore cache errors
      }
    };

    void loadCache();
    return () => {
      mounted = false;
    };
  }, [id]);

  // Persist messages to cache whenever messages update
  useEffect(() => {
    if (!id) return;
    const key = `chat_cache_${id}`;
    try {
      void AsyncStorage.setItem(key, JSON.stringify(messages));
    } catch (err) {
      // ignore
    }
  }, [id, messages]);

  useEffect(() => {
    const loadStreak = async () => {
      if (!id) return;
      try {
        const streak = await getChatStreak(String(id));
        if (streak && typeof streak.count === 'number') {
          setStreakCount(streak.count);
        } else {
          setStreakCount(0);
        }
      } catch {
        setStreakCount(0);
      }
    };

    void loadStreak();
  }, [id]);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom(true);
    }
  }, [messages, scrollToBottom]);

  // Network state monitoring - simplified approach
  useEffect(() => {
    // Simple approach: assume online by default and detect failures
    // In production, you might want to use a more sophisticated approach
    // or integrate with a proper network library
    setIsConnected(true);
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

    // Filter out pending messages that have been echoed back by server (match on clientId)
    const serverClientIds = new Set(server.map((m) => m.clientId).filter(Boolean));
    const locals = pendingMessages.filter((p) => !serverClientIds.has(p.clientId));

    const combined = [...server, ...locals];

    const toMillis = (value: any): number => {
      if (!value) return 0;
      if (typeof value === 'number') return value;
      if (typeof value?.toMillis === 'function') return value.toMillis();
      if (typeof value?.toDate === 'function') return value.toDate().getTime();
      if (typeof value?.seconds === 'number') return value.seconds * 1000;
      return 0;
    };

    // WhatsApp-style flow relies on chronological ordering (oldest -> newest).
    return combined
      .slice()
      .sort((a, b) => {
        const aTime = toMillis((a as any).createdAt);
        const bTime = toMillis((b as any).createdAt);
        if (aTime !== bTime) return aTime - bTime;
        // stable fallback to keep optimistic messages consistent
        return String(a.id ?? '').localeCompare(String(b.id ?? ''));
      });
  }, [messages, pendingMessages, user]);

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
      if (!samePrev && sameNext) return 'first';
      if (samePrev && sameNext) return 'middle';
      return 'last';
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
            : otherUser?.displayName || 'Chat',
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
    [conversation, user?.uid, otherUser?.displayName, router, isStartingCall],
  );

  const uploadChatMedia = useCallback(
    async (uri: string, type: 'image' | 'video' | 'file'): Promise<{ url: string; mediaType: 'image' | 'video' | 'file' } | null> => {
      if (!user || !supabaseConfigured) return null;

      try {
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

  const updateChatStreak = useCallback(async () => {
    if (!id) return;
    await updateStreakForContext({
      kind: 'chat',
      conversationId: String(id),
      partnerId: otherUser?.id ?? null,
      partnerName: otherUser?.displayName ?? null,
    });
    const streak = await getChatStreak(String(id));
    if (streak && typeof streak.count === 'number') {
      setStreakCount(streak.count);
    }
  }, [id, otherUser]);

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
          const messageToSend = { ...message, clientId: message.clientId };
          // Filter out null mediaType to match Message type
          if (messageToSend.mediaType === null) {
            delete messageToSend.mediaType;
          }
          if (!conversationIdStr) throw new Error('Missing conversation id');
          await sendMessage(conversationIdStr, messageToSend);
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
  }, [isConnected, id, user?.uid]);

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
                ? participantProfiles[replySenderId]?.displayName
                : undefined;
          if (replySenderName) {
            (pending as any).replyToSenderName = replySenderName;
          }
        }

        setPendingMessages((prev) => [...prev, pending]);

        if (isConnected) {
          // Online: send immediately
          try {
            const messageToSend = { ...(pending as any), clientId };
            // Filter out null mediaType to match Message type
            if (messageToSend.mediaType === null) {
              delete messageToSend.mediaType;
            }
            if (conversationIdStr) {
              void sendMessage(conversationIdStr, messageToSend);
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

        if (fromStreak) {
          void updateChatStreak();
        }
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
              } catch {}
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
              } catch {}
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
              } catch {}
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

  const handleSendPendingMedia = async () => {
    if (!pendingMedia || !user) return;
    if (isBroadcastReadOnly) {
      Alert.alert('Read only', 'Only admins can post in this channel.');
      return;
    }
    if (!baseSendPermission) {
      Alert.alert('Request pending', 'Wait until they accept before sending media.');
      return;
    }
    const uploaded = await uploadChatMedia(pendingMedia.uri, pendingMedia.type);
    if (!uploaded) return;

    const newMessage: ChatMessage = {
      text:
        pendingCaption.trim() ||
        (pendingMedia.type === 'image'
          ? 'Photo'
          : pendingMedia.type === 'video'
          ? 'Video'
          : 'File'),
      sender: user.uid,
      mediaUrl: uploaded.url,
      mediaType: uploaded.mediaType,
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
    };
    setPendingMessages((prev) => [...prev, pending]);

    try {
      if (!conversationIdStr) throw new Error('Missing conversation id');
      void sendMessage(conversationIdStr, { ...(newMessage as any), clientId });
    } catch (err) {
      setPendingMessages((prev) => prev.map((p) => (p.clientId === clientId ? { ...p, failed: true } : p)));
    }
    setPendingMedia(null);
    setPendingCaption('');
  };

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
                        <View>
                          <Text style={styles.headerEyebrow} numberOfLines={1} ellipsizeMode="tail">
                            {conversation?.isGroup ? 'Group Chat' : 'Direct Message'}
                          </Text>
                          <Text style={styles.headerText} numberOfLines={1} ellipsizeMode="tail">
                            {conversation?.isGroup
                              ? conversation.name || 'Group'
                              : otherUser?.displayName || 'Chat'}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      <View style={styles.headerIcons}>
                        <TouchableOpacity style={[styles.iconBtn, iconShadowStyle]} onPress={handleOpenSearch}>
                          <LinearGradient
                            colors={iconGradientColors}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.iconBg}
                          >
                            <Ionicons name="search" size={22} color="#ffffff" style={styles.iconMargin} />
                          </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.iconBtn, iconShadowStyle]}
                          onPress={() => handleStartCall('voice')}
                          disabled={isStartingCall || !callAvailable}
                        >
                          <LinearGradient
                            colors={iconGradientColors}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.iconBg}
                          >
                            <Ionicons name="call" size={22} color="#ffffff" />
                          </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.iconBtn, iconShadowStyle]}
                          onPress={() => handleStartCall('video')}
                          disabled={isStartingCall || !callAvailable}
                        >
                          <LinearGradient
                            colors={iconGradientColors}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.iconBg}
                          >
                            <Ionicons name="videocam" size={22} color="#ffffff" />
                          </LinearGradient>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.headerMetaRow}>
                      <View style={styles.metaPill}>
                        <Ionicons name="flame" size={14} color="#fff" />
                        <Text style={styles.metaText}>
                          {streakCount > 0 ? `${streakCount} streak` : 'New chat'}
                        </Text>
                      </View>
                      <View style={[styles.metaPill, styles.metaPillSoft]}>
                        <Ionicons name="radio-button-on" size={14} color="#fff" />
                        <Text style={styles.metaText}>
                          {isOtherTyping
                            ? 'Typing...'
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
                  <AdBanner placement="feed" />
                </View>
              ) : null}

              {isSearchMode && (
                <View style={styles.inlineSearchPanel}>
                  {searchQuery.trim().length === 0 ? (
                    <Text style={styles.searchHintText}>Type a phrase to jump to that part of the chat.</Text>
                  ) : searchResults.length === 0 ? (
                    <Text style={styles.searchHintText}>No matches for “{searchQuery}”.</Text>
                  ) : (
                  <FlatList
                      data={searchResults}
                      keyExtractor={(item, index) => item.id ?? item.clientId ?? `result-${index}`}
                      renderItem={({ item }) => (
                        <TouchableOpacity style={styles.searchResultRow} onPress={() => handleJumpToMessage(item.id || '')}>
                          <View style={styles.searchResultDot} />
                          <View style={styles.searchResultCopy}>
                            <Text style={styles.searchResultText} numberOfLines={2}>{item.text}</Text>
                            {item.createdAt && (
                              <Text style={styles.searchResultTime}>{new Date(item.createdAt).toLocaleString()}</Text>
                            )}
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

              {/* Messages List */}
              <View style={styles.messagesContainer}>
                <FlashList
                  ref={flatListRef}
                  data={visibleMessages}
                  renderItem={({ item, index }: { item: ChatMessage; index: number }) => {
                    const isMe = item.sender === user?.uid;
                    const replySenderId = (item as any).replyToSenderId as string | undefined;
                    const existingReplyName = (item as any).replyToSenderName as string | undefined;
                    const shouldResolveReplyName =
                      !existingReplyName || existingReplyName === 'Someone' || existingReplyName === 'Unknown';
                    const resolvedReplyName = replySenderId
                      ? (shouldResolveReplyName ? resolveDisplayName(replySenderId) : existingReplyName)
                      : undefined;
                    const decoratedItem = resolvedReplyName && (item as any).replyToSenderName !== resolvedReplyName
                      ? ({ ...item, replyToSenderName: resolvedReplyName } as any)
                      : item;

                    const senderName = isMe ? user?.displayName || 'You' : resolveDisplayName(item.sender);
                    const avatarUri = !isMe
                      ? resolveAvatarUri(item.sender) || otherUser?.photoURL || ''
                      : '';

                    return (
                      <MessageBubble
                        item={decoratedItem}
                        isMe={isMe}
                        groupPosition={getBubbleGroupPosition(index)}
                        avatar={avatarUri}
                        senderName={senderName}
                        onLongPress={(msg, rect) => {
                          setSelectedMessage(msg);
                          setSelectedMessageRect(rect);
                        }}
                        onPressMedia={handleOpenMedia}
                        onPressReaction={(emoji) => handleReactionPress(item, emoji)}
                      />
                    );
                  }}
                  keyExtractor={(item: ChatMessage, index: number) => item.id ?? item.clientId ?? `message-${index}`}
                  estimatedItemSize={80}
                  showsVerticalScrollIndicator={false}
                  onScroll={handleScroll}
                  keyboardDismissMode="interactive"
                  keyboardShouldPersistTaps="handled"
                  inverted={false}
                  contentContainerStyle={[
                    styles.messageList,
                    {
                      flexGrow: 1,
                      justifyContent: 'flex-end',
                      paddingBottom: Math.max(10, inputDockHeight + 10 + keyboardInset),
                    },
                  ]}
                />
              </View>

              {/* Message Input */}
              <Animated.View
                style={[
                  styles.inputDock,
                  {
                    paddingBottom: (Platform.OS === 'ios' ? 10 : 6) + insets.bottom,
                    bottom: keyboardOffset,
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
                  <MessageInput
                    onSendMessage={handleSendMessage}
                    onTypingChange={handleTypingChange}
                    onPickMedia={handleMediaPicked}
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
                  />
                )}
                {showInitiatorPendingBanner && (
                  <View style={styles.pendingNoticeBanner}>
                    <Ionicons name="hourglass-outline" size={16} color="rgba(255,255,255,0.85)" />
                    <Text style={styles.pendingNoticeText}>
                      Waiting for them to accept your request.
                    </Text>
                  </View>
                )}
                </View>
              </Animated.View>
            </View>
          </View>
        </SafeAreaView>

        {selectedMessage && selectedMessageRect && (
          <View style={styles.spotlightOverlay} pointerEvents="box-none">
            {/* Heavy blur over entire chat */}
            <TouchableOpacity
              style={styles.spotlightTouch}
              activeOpacity={1}
              onPress={() => {
                setSelectedMessage(null);
                setSelectedMessageRect(null);
              }}
            >
              <View style={styles.spotlightBackdrop} />
            </TouchableOpacity>

            {/* Elevated bubble */}
            <View style={[styles.spotlightBubbleContainer, { top: selectedMessageRect.y }]}>
              {(() => {
                const isMe = selectedMessage.sender === user?.uid;
                const replySenderId = (selectedMessage as any).replyToSenderId as string | undefined;
                const existingReplyName = (selectedMessage as any).replyToSenderName as string | undefined;
                const shouldResolveReplyName =
                  !existingReplyName || existingReplyName === 'Someone' || existingReplyName === 'Unknown';
                const resolvedReplyName = replySenderId
                  ? (shouldResolveReplyName ? resolveDisplayName(replySenderId) : existingReplyName)
                  : undefined;
                const decoratedItem = resolvedReplyName && (selectedMessage as any).replyToSenderName !== resolvedReplyName
                  ? ({ ...selectedMessage, replyToSenderName: resolvedReplyName } as any)
                  : selectedMessage;

                const senderName = isMe ? user?.displayName || 'You' : resolveDisplayName(selectedMessage.sender);
                const avatarUri = !isMe
                  ? resolveAvatarUri(selectedMessage.sender) || otherUser?.photoURL || ''
                  : '';

                return (
                  <MessageBubble
                    item={decoratedItem}
                    isMe={isMe}
                    avatar={avatarUri}
                    senderName={senderName}
                    onLongPress={() => {}}
                    onPressReaction={(emoji) => handleReactionPress(selectedMessage, emoji)}
                  />
                );
              })()}
            </View>

            {/* Vertical actions under bubble */}
            <View
              style={[
                styles.spotlightActionsContainer,
                { top: selectedMessageRect.y + selectedMessageRect.height + 8 },
              ]}
            >
              <TouchableOpacity
                style={styles.spotlightPill}
                onPress={() => {
                  setReplyTo(selectedMessage);
                  setSelectedMessage(null);
                  setSelectedMessageRect(null);
                }}
              >
                <Text style={styles.spotlightPillText}>Reply</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.spotlightPill}
                onPress={() => {
                  if (selectedMessage?.id && user?.uid) {
                    const alreadyPinned =
                      Array.isArray(selectedMessage.pinnedBy) &&
                      selectedMessage.pinnedBy.includes(user.uid);
                    if (alreadyPinned) {
                      if (conversationIdStr) {
                        void unpinMessage(conversationIdStr, selectedMessage.id, user.uid);
                      }
                    } else {
                      if (conversationIdStr) {
                        void pinMessage(conversationIdStr, selectedMessage.id, user.uid);
                      }
                    }
                  }
                  setSelectedMessage(null);
                  setSelectedMessageRect(null);
                }}
              >
                <Text style={styles.spotlightPillText}>
                  {Array.isArray(selectedMessage?.pinnedBy) &&
                  user?.uid &&
                  selectedMessage.pinnedBy.includes(user.uid)
                    ? 'Unpin'
                    : 'Pin'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.spotlightPill, styles.spotlightPillDanger]}
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
                  setSelectedMessage(null);
                  setSelectedMessageRect(null);
                }}
              >
                <Text style={styles.spotlightPillDangerText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

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
                        useNativeControls
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
    </ScreenWrapper>
  </MessagingErrorBoundary>
);
};

const styles = StyleSheet.create({
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
  },
  messageList: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 10,
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
  spotlightOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  spotlightBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  spotlightTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  spotlightBubbleContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 8,
  },
  spotlightActionsContainer: {
    position: 'absolute',
    right: 40,
    paddingHorizontal: 8,
  },
  spotlightPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    marginBottom: 8,
  },
  spotlightPillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  spotlightPillDanger: {
    backgroundColor: 'rgba(255,75,75,0.15)',
    borderColor: 'rgba(255,75,75,0.6)',
  },
  spotlightPillDangerText: {
    color: '#ff4b4b',
    fontSize: 12,
    fontWeight: '700',
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
});

export default ChatScreen;
