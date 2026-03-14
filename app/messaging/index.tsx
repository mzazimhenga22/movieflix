import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { createCallSession, listenToCallHistory } from '@/lib/calls/callService'
import type { CallSession, CallType } from '@/lib/calls/types'
import { getProfileScopedKey } from '@/lib/profileStorage'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import type { User } from 'firebase/auth'
import { collection, doc, getDocs, limit, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore'

import { listenToLiveStreams } from '@/lib/live/liveService'
import type { LiveStream } from '@/lib/live/types'

import { useMessagingSettings } from '@/hooks/useMessagingSettings'
import ScreenWrapper from '../../components/ScreenWrapper'
import { firestore } from '../../constants/firebase'
import { useActiveProfile } from '../../hooks/use-active-profile'
import { accentGradient, darkenColor, withAlpha } from '../../lib/colorUtils'
import MessagingModule from '../../modules/MessagingModule'
import { Media } from '../../types/index'
import { useAccent } from '../../components/app-components/AccentContext'
import { onStoriesUpdateForViewer } from '../../components/app-components/social-feed/storiesController'
import LiquidGlass from '../../components/app-components/LiquidGlass'
import { FlashList } from '@shopify/flash-list'

import AmbientBackground from './components/AmbientBackground'
import MessagingErrorBoundary from './components/ErrorBoundary'
import FAB from './components/FAB'
import MessageItem from './components/MessageItem'
import NewChatSheet from './components/NewChatSheet'
import NoMessages from './components/NoMessages'
import SnowOverlay from './components/SnowOverlay'
import StoryItem from './components/StoryItem'
import {
  acceptMessageRequest,
  Conversation,
  createGroupConversation,
  deleteConversation,
  ensureGlobalBroadcastChannel,
  findOrCreateConversation,
  getFollowing,
  getProfilesByIds,
  getSuggestedPeople,
  GLOBAL_BROADCAST_CHANNEL_ID,
  loadOlderConversations,
  markConversationRead,
  onAuthChange,
  onConversationsUpdate,
  onConversationUpdate,
  onUserTyping,
  Profile,
  setConversationPinned
} from './controller'

const HEADER_HEIGHT = 120
const STORY_WINDOW_MS = 24 * 60 * 60 * 1000
const VERIFIED_CHANNEL_IDS = new Set([GLOBAL_BROADCAST_CHANNEL_ID])

type ConversationListItem = Conversation & { unread: number }

type ChatRouteParams = { id: string | number } & Record<string, string | number | undefined>

type Story = {
  id: string
  userId: string
  username?: string
  avatar?: string
  mediaUrl?: string
  photoURL?: string
  userAvatar?: string | null
  caption?: string
  createdAt?: any
}

type StoryRailEntry = Story & {
  latestStoryId?: string | null
  latestCreatedAt?: number | null
  hasStory?: boolean
  isSelf?: boolean
  timestampLabel?: string | null
  displayAvatar?: string | null
}

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList as any);

const formatStoryTime = (timestamp?: number | null) => {
  if (!timestamp) return null
  const diff = Date.now() - timestamp
  if (diff < 60 * 1000) return 'Just now'
  if (diff < 60 * 60 * 1000) return `${Math.max(1, Math.floor(diff / (60 * 1000)))}m ago`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.max(1, Math.floor(diff / (60 * 60 * 1000)))}h ago`
  return new Date(timestamp).toLocaleDateString()
}

const MessagingScreen = () => {
  const router = useRouter()
  const { streakUserId, startStreaksWithFollowing } = useLocalSearchParams()
  const insets = useSafeAreaInsets()
  const { settings } = useMessagingSettings()

  const headerOpacity = useRef(new Animated.Value(1)).current
  const promoTranslateX = useRef(new Animated.Value(40)).current
  const scrollY = useRef(new Animated.Value(0)).current;

  // Header animations - Liquid glass effect
  const headerFadeAnim = useRef(new Animated.Value(0)).current;
  const headerSlideAnim = useRef(new Animated.Value(-30)).current;

  // Dynamic Island Animations
  const islandWidth = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: ['100%', '60%'],
    extrapolate: 'clamp',
  });

  const islandTranslateY = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, -5],
    extrapolate: 'clamp',
  });

  const textOpacity = scrollY.interpolate({
    inputRange: [0, 40],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    // Entrance animation
    Animated.parallel([
      Animated.timing(headerFadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(headerSlideAnim, { toValue: 0, tension: 60, friction: 12, useNativeDriver: true }),
    ]).start();
  }, []);

  const HeaderComponent = () => (
    <Animated.View
      style={[
        styles.headerContainerIsland,
        {
          paddingTop: Math.max(insets.top, 12),
          opacity: headerFadeAnim,
          transform: [{ translateY: headerSlideAnim }],
          alignItems: 'center',
          width: '100%',
          zIndex: 10,
        }
      ]}
    >
      <Animated.View style={[
        styles.islandWrap,
        {
          width: islandWidth,
          transform: [{ translateY: islandTranslateY }]
        }
      ]}>
        <LiquidGlass
          tintOpacity={0.18}
          tintColor="#000000"
          cornerRadius={32}
          borderOpacity={0.25}
          glowIntensity={0.2}
          glowColor={accentColor || '#e50914'}
          chromaticAberration={true}
          style={StyleSheet.absoluteFill}
        />
        
        <View style={styles.islandContent}>
          {/* Left: Profile & Welcome */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push('/profile')}
            style={styles.profileSectionIsland}
          >
            <View style={[styles.avatarDot, { backgroundColor: accentColor || '#e50914', shadowColor: accentColor || '#e50914' }]} />
            <Animated.View style={{ opacity: textOpacity, marginLeft: 8, overflow: 'hidden' }}>
              <Text style={styles.eyebrowIsland}>MOVIEFLIX</Text>
              <Text style={styles.headerTextIsland} numberOfLines={1}>
                Hey, {profileGreetingName}
              </Text>
            </Animated.View>
          </TouchableOpacity>

          {/* Right: Quick Actions */}
          <View style={styles.actionSectionIsland}>
             <TouchableOpacity style={styles.iconBtnIsland} onPress={() => setSearchMode(true)}>
              <Ionicons name="search" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.iconBtnIsland, styles.lastIconBtnIsland]} onPress={() => router.push('/messaging/settings')}>
              <Ionicons name="settings-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );

  const [user, setUser] = useState<User | null>(null)
  const [isAuthReady, setAuthReady] = useState(false)

  const [snowing, setSnowing] = useState(false)

  const [stories, setStories] = useState<Story[]>([])
  const [following, setFollowing] = useState<Profile[]>([])
  const [suggestedPeople, setSuggestedPeople] = useState<Profile[]>([])
  const [liveConversations, setLiveConversations] = useState<Conversation[]>([])
  const [olderConversations, setOlderConversations] = useState<Conversation[]>([])
  const [callHistory, setCallHistory] = useState<CallSession[]>([])
  const [liveStreams, setLiveStreams] = useState<LiveStream[]>([])
  const [liveLoading, setLiveLoading] = useState(false)
  const [broadcastConversation, setBroadcastConversation] = useState<Conversation | null>(null)
  const [profileCache, setProfileCache] = useState<Record<string, Profile>>({})
  const profileCacheStorageKey = user?.uid ? `chat_profile_cache_${user.uid}` : null
  const profileCachePersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const navigatingToRef = useRef<string | null>(null)
  const [navigatingToId, setNavigatingToId] = useState<string | null>(null)
  const [isRequestSheetVisible, setRequestSheetVisible] = useState(false)
  const [requestActionId, setRequestActionId] = useState<string | null>(null)
  const [isConversationsLoading, setConversationsLoading] = useState(true)

  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchMode, setSearchMode] = useState(false)
  const [isSheetVisible, setSheetVisible] = useState(false)

  const startChatInFlightRef = useRef(false)
  const [startingChatUserId, setStartingChatUserId] = useState<string | null>(null)

  const [activeFilter, setActiveFilter] = useState<'All' | 'Unread'>('All')
  const [activeKind, setActiveKind] = useState<'Chats' | 'Groups' | 'Calls'>('Chats')

  const [spotlightConversation, setSpotlightConversation] = useState<ConversationListItem | null>(
    null,
  )
  const [spotlightRect, setSpotlightRect] = useState<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)

  const [showPromoRow, setShowPromoRow] = useState(false)
  const [continueWatching, setContinueWatching] = useState<Media[]>([])

  const [didNavigateFromStreak, setDidNavigateFromStreak] = useState(false)
  const [didBootstrapFollowingStreaks, setDidBootstrapFollowingStreaks] = useState(false)

  const [isStartingCall, setIsStartingCall] = useState(false)
  const [isLoadingMoreConvos, setIsLoadingMoreConvos] = useState(false)
  const [hasMoreConversations, setHasMoreConversations] = useState(true)
  const [typingByConversation, setTypingByConversation] = useState<Record<string, boolean>>({})
  const activeProfile = useActiveProfile()
  const profileGreetingName = activeProfile?.name ?? 'streamer'
  const activeProfilePhotoUrl =
    typeof activeProfile?.photoURL === 'string' && activeProfile.photoURL.trim()
      ? activeProfile.photoURL.trim()
      : null

  useEffect(() => {
    // Sync selected profile name/avatar into Firestore user profile so chat lists/headers resolve correctly.
    if (!user?.uid) return
    const displayName =
      typeof activeProfile?.name === 'string' && activeProfile.name.trim() ? activeProfile.name.trim() : null
    const photoURL = activeProfilePhotoUrl
    if (!displayName && !photoURL) return

    void setDoc(
      doc(firestore, 'users', user.uid),
      {
        ...(displayName ? { displayName } : {}),
        ...(photoURL ? { photoURL } : {}),
        activeProfileId: activeProfile?.id ?? null,
        activeProfileUpdatedAt: serverTimestamp(),
      },
      { merge: true },
    ).catch(() => { })
  }, [activeProfile?.id, activeProfile?.name, activeProfilePhotoUrl, user?.uid])

  // Local read tracking (used when read receipts are disabled and as a fast UI fallback).
  const localReadStorageKey = user?.uid ? `chat_local_lastReadAtBy_${user.uid}` : null
  const [localReadAtByConversation, setLocalReadAtByConversation] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!localReadStorageKey) {
      setLocalReadAtByConversation({})
      return
    }

    let alive = true
    void AsyncStorage.getItem(localReadStorageKey)
      .then((raw) => {
        if (!alive) return
        if (!raw) {
          setLocalReadAtByConversation({})
          return
        }
        try {
          const parsed = JSON.parse(raw) as Record<string, number>
          setLocalReadAtByConversation(parsed && typeof parsed === 'object' ? parsed : {})
        } catch {
          setLocalReadAtByConversation({})
        }
      })
      .catch(() => {
        if (alive) setLocalReadAtByConversation({})
      })

    return () => {
      alive = false
    }
  }, [localReadStorageKey])

  useEffect(() => {
    if (!profileCacheStorageKey) {
      setProfileCache({})
      return
    }

    let alive = true
    void AsyncStorage.getItem(profileCacheStorageKey)
      .then((raw) => {
        if (!alive) return
        if (!raw) return
        try {
          const parsed = JSON.parse(raw) as Record<string, Profile>
          if (parsed && typeof parsed === 'object') {
            setProfileCache((prev) => ({ ...parsed, ...prev }))
          }
        } catch {
          // ignore
        }
      })
      .catch(() => { })

    return () => {
      alive = false
    }
  }, [profileCacheStorageKey])

  useEffect(() => {
    if (!profileCacheStorageKey) return
    if (profileCachePersistTimer.current) clearTimeout(profileCachePersistTimer.current)
    profileCachePersistTimer.current = setTimeout(() => {
      void AsyncStorage.setItem(profileCacheStorageKey, JSON.stringify(profileCache)).catch(() => { })
    }, 500)
    return () => {
      if (profileCachePersistTimer.current) clearTimeout(profileCachePersistTimer.current)
    }
  }, [profileCache, profileCacheStorageKey])

  const markLocalConversationRead = useCallback(
    (conversationId: string) => {
      if (!localReadStorageKey) return
      const now = Date.now()

      setLocalReadAtByConversation((prev) => {
        const next = { ...prev, [conversationId]: now }
        void AsyncStorage.setItem(localReadStorageKey, JSON.stringify(next)).catch(() => { })
        return next
      })
    },
    [localReadStorageKey],
  )

  const { accentColor } = useAccent()
  const accent = accentColor || '#e50914'
  const accentDark = darkenColor(accent, 0.35)
  const accentDeeper = darkenColor(accent, 0.6)
  const accentGlow = withAlpha(accent, 0.24)
  const accentOrb = withAlpha(accent, 0.18)
  const accentOrbSecondary = withAlpha(accent, 0.1)
  const iconGradientColors = accentGradient(accent, 0.2)
  const activePillStyle = { backgroundColor: withAlpha(accent, 0.9), borderColor: accent }
  const accentDotStyle = { backgroundColor: accent, shadowColor: accent }
  const iconShadowStyle = { shadowColor: withAlpha(accent, 0.65) }
  const callIconStyle = { backgroundColor: withAlpha(accent, 0.2) }

  useFocusEffect(
    useCallback(() => {
      setLiveLoading(true)
      let didFirst = false
      const unsub = listenToLiveStreams((streams) => {
        setLiveStreams(streams)
        if (!didFirst) {
          didFirst = true
          setLiveLoading(false)
        }
      })
      return () => {
        try {
          unsub()
        } catch { }
      }
    }, []),
  )

  // ----------------------------
  /* 
   * STORIES: Native Offload
   * We offload the grouping, sorting, and media type detection to Kotlin.
   */
  const [groupedStoriesNative, setGroupedStoriesNative] = useState<any[]>([])

  useEffect(() => {
    let active = true
    if (stories.length === 0) {
      setGroupedStoriesNative([])
      return
    }

    void (async () => {
      try {
        const json = await MessagingModule.groupStories(JSON.stringify(stories))
        if (!active) return
        const parsed = JSON.parse(json)
        // Simple stability check
        setGroupedStoriesNative(parsed)
      } catch (e) {
        console.warn('Native Stories Grouping Failed', e)
      }
    })()
    return () => { active = false }
  }, [stories])

  const storyRailData = useMemo<StoryRailEntry[]>(() => {
    const entries: StoryRailEntry[] = []

    const myEntry = (user?.uid ? groupedStoriesNative.find((e) => e.userId === user.uid) : null) ?? null
    const selfAvatar = activeProfilePhotoUrl ?? user?.photoURL ?? myEntry?.displayAvatar ?? myEntry?.photoURL ?? myEntry?.avatar ?? null

    entries.push({
      id: user?.uid ?? 'self-story',
      userId: user?.uid ?? 'self-story',
      username: activeProfile?.name ?? user?.displayName ?? 'My Story',
      photoURL: myEntry?.image ?? selfAvatar ?? undefined,
      userAvatar: selfAvatar,
      latestStoryId: null, // Native doesn't bubble this up explicitly but we check hasStory
      latestCreatedAt: myEntry?.__latestCreatedAt ?? null,
      hasStory: !!myEntry,
      isSelf: true,
      timestampLabel: myEntry?.__latestCreatedAt ? formatStoryTime(myEntry.__latestCreatedAt) : 'Tap to add',
      displayAvatar: selfAvatar,
    })

    for (const entry of groupedStoriesNative) {
      if (entry.userId === user?.uid) continue
      entries.push({
        ...entry,
        id: entry.id, // Group ID is user ID
        hasStory: true,
        timestampLabel: formatStoryTime(entry.__latestCreatedAt),
        displayAvatar: entry.image ?? entry.avatar ?? null,
      })
    }

    return entries
  }, [activeProfile?.name, activeProfilePhotoUrl, groupedStoriesNative, user?.uid, user?.displayName, user?.photoURL])

  // Native returns the exact format needed for the viewer
  const storyViewerStories = groupedStoriesNative

  /*
   * CONVERSATIONS: Native Offload
   * We offload the merging, unread calculation, filtering, and sorting to Kotlin.
   */
  const [processedConversations, setProcessedConversations] = useState<ConversationListItem[]>([])

  useEffect(() => {
    if (!user?.uid) return
    let active = true

    void (async () => {
      try {
        // Merge locally first to avoid sending duplicates to Native
        // (Native processes keys, but passing smaller JSON is better)
        const map: Record<string, Conversation> = {}
        const liveList = Array.isArray(liveConversations) ? liveConversations : []
        const olderList = Array.isArray(olderConversations) ? olderConversations : []

        // liveList takes precedence
        liveList.forEach((c) => { if (c?.id) map[c.id] = c })
        olderList.forEach((c) => { if (c?.id && !map[c.id]) map[c.id] = c })

        const merged = Object.values(map)
        if (merged.length === 0) {
          if (active) setProcessedConversations([])
          return
        }

        const json = await MessagingModule.processConversations(
          JSON.stringify(merged),
          user.uid,
          activeKind,
          activeFilter,
          searchQuery,
          JSON.stringify(localReadAtByConversation)
        )

        if (!active) return
        const parsed = JSON.parse(json)

        // ID-based stability check
        setProcessedConversations(parsed)
      } catch (e) {
        console.warn('Native Conversation Processing Failed', e)
        // Fallback?
      }
    })()

    return () => { active = false }
  }, [liveConversations, olderConversations, activeKind, activeFilter, searchQuery, localReadAtByConversation, user?.uid])

  // Alias for compatibility with rest of the file
  const allConversations = processedConversations

  /* 
   * REQUEST INBOX:
   * Native processConversations filters these out, so we must calculate them separately from the raw list.
   * This is fast enough in JS since it's typically small.
   */
  const requestInbox = useMemo(() => {
    if (!user?.uid) return []
    // Use liveConversations directly for requests as they are usually current
    return liveConversations.filter(
      (conv) =>
        conv.status === 'pending' &&
        !conv.isGroup &&
        (conv.requestInitiatorId ?? null) !== user.uid,
    )
  }, [liveConversations, user?.uid])

  const pendingRequestCount = requestInbox.length

  const broadcastUpdatedLabel = useMemo(() => {
    if (!broadcastConversation?.updatedAt) return 'Updated moments ago'
    const raw = broadcastConversation.updatedAt
    const date =
      raw && typeof raw === 'object' && typeof raw.toDate === 'function'
        ? raw.toDate()
        : raw && typeof raw.seconds === 'number'
          ? new Date(raw.seconds * 1000)
          : typeof raw === 'number'
            ? new Date(raw)
            : new Date()

    return formatStoryTime(date.getTime()) ?? 'Updated moments ago'
  }, [broadcastConversation?.updatedAt])

  const isConversationVerified = useCallback((conv: Conversation | null | undefined) => {
    if (!conv) return false
    if (conv.isBroadcast) return true
    return VERIFIED_CHANNEL_IDS.has(conv.id)
  }, [])

  const getRequestDisplayName = useCallback(
    (conversation: Conversation) => {
      const initiatorId = conversation.requestInitiatorId
      if (initiatorId && profileCache[initiatorId]?.displayName) {
        return profileCache[initiatorId].displayName
      }
      if (conversation.name) return conversation.name
      const fallbackId = conversation.members?.find((member) => member !== user?.uid)
      if (fallbackId && profileCache[fallbackId]?.displayName) {
        return profileCache[fallbackId].displayName
      }
      if (fallbackId) return `@${fallbackId.slice(0, 6)}…`
      return 'New request'
    },
    [profileCache, user?.uid],
  )

  const getRequestAvatar = useCallback(
    (conversation: Conversation) => {
      const initiatorId = conversation.requestInitiatorId
      const fallbackId = conversation.members?.find((member) => member !== user?.uid)
      const targetId = initiatorId || fallbackId
      if (targetId && profileCache[targetId]?.photoURL) {
        return profileCache[targetId]?.photoURL ?? null
      }
      return null
    },
    [profileCache, user?.uid],
  )

  useEffect(() => {
    if (!user?.uid) return

    const ids = new Set<string>()

    for (const conv of requestInbox) {
      const initiatorId = conv.requestInitiatorId
      if (initiatorId) ids.add(String(initiatorId))

      if (!initiatorId && Array.isArray(conv.members)) {
        const fallbackId = conv.members.find((m) => m && m !== user.uid)
        if (fallbackId) ids.add(String(fallbackId))
      }
    }

    for (const conv of allConversations) {
      if (conv.isGroup || conv.isBroadcast) continue
      if (!Array.isArray(conv.members)) continue
      const otherId = conv.members.find((m) => m && m !== user.uid)
      if (otherId) ids.add(String(otherId))
    }

    const missingIds = Array.from(ids).filter((id) => id && !profileCache[id])
    if (!missingIds.length) return

    let isMounted = true
    void (async () => {
      try {
        const profiles = await getProfilesByIds(missingIds.slice(0, 40))
        if (!isMounted) return
        setProfileCache((prev) => {
          const next = { ...prev }
          for (const profile of profiles) {
            if (profile?.id) next[profile.id] = profile
          }
          return next
        })
      } catch (err) {
        console.warn('[messaging] failed loading profiles', err)
      }
    })()

    return () => {
      isMounted = false
    }
  }, [user?.uid, requestInbox, allConversations, profileCache])

  useEffect(() => {
    if (requestInbox.length === 0) {
      setRequestSheetVisible(false)
    }
  }, [requestInbox.length])

  // ----------------------------
  // Auth bootstrap
  // ----------------------------
  useEffect(() => {
    const unsub = onAuthChange((currentUser) => {
      setUser(currentUser)
      setAuthReady(true)
      if (!currentUser) {
        setLiveConversations([])
        setOlderConversations([])
        setConversationsLoading(true)
      }
    })
    return () => unsub()
  }, [])

  // ----------------------------
  // Live subscriptions (guard + cancel safe)
  // ----------------------------
  useEffect(() => {
    if (!isAuthReady || !user?.uid) return

    let alive = true
    const initialLimit = 40
    const unsubConversations = onConversationsUpdate(
      (list) => {
        if (!alive) return
        const safe = Array.isArray(list) ? list : []
        setLiveConversations(safe)
        setConversationsLoading(false)
        setHasMoreConversations(safe.length >= initialLimit)
        // drop older duplicates if they re-appear in live window
        setOlderConversations((prev) => prev.filter((c) => !safe.find((l) => l.id === c.id)))
      },
      { uid: user.uid, limit: initialLimit },
    )
    const unsubStories = onStoriesUpdateForViewer(
      (list) => {
        if (alive) setStories(list as any)
      },
      { viewerId: user.uid },
    )
    const unsubCallHistory = listenToCallHistory(user.uid, (calls) => {
      if (alive) setCallHistory(Array.isArray(calls) ? calls : [])
    })

      ; (async () => {
        try {
          const list = await getFollowing()
          if (!alive) return
          setFollowing(list)
          setProfileCache((prev) => {
            const next = { ...prev }
            list.forEach((profile) => {
              if (profile?.id) next[profile.id] = profile
            })
            return next
          })
        } catch (e) {
          if (alive) setFollowing([])
        }
      })()

      ; (async () => {
        try {
          const list = await getSuggestedPeople()
          if (!alive) return
          setSuggestedPeople(list)
        } catch {
          if (alive) setSuggestedPeople([])
        }
      })()

    return () => {
      alive = false
      unsubConversations()
      unsubStories()
      unsubCallHistory()
    }
  }, [isAuthReady, user?.uid])

  // ----------------------------
  // Navigate from streak
  // ----------------------------
  useEffect(() => {
    if (!isAuthReady || !streakUserId || didNavigateFromStreak) return

    const run = async () => {
      try {
        const { getProfileById } = await import('./controller')
        const profile = await getProfileById(String(streakUserId))
        if (!profile) return

        const conversationId = await findOrCreateConversation(profile)
        setProfileCache((prev) => (prev[profile.id] ? prev : { ...prev, [profile.id]: profile }))
        setDidNavigateFromStreak(true)

        router.push({
          pathname: '/messaging/chat/[id]',
          params: {
            id: conversationId,
            fromStreak: '1',
            otherUserId: profile.id,
            title: profile.displayName || 'Chat',
            ...(profile.photoURL ? { avatar: profile.photoURL } : {}),
          },
        })
      } catch (err) {
        console.error('Failed to navigate from streak', err)
      }
    }

    void run()
  }, [isAuthReady, streakUserId, didNavigateFromStreak, router])

  // ----------------------------
  // Bootstrap streaks with following (one-time)
  // ----------------------------
  useEffect(() => {
    const flag = String(startStreaksWithFollowing || '')
    if (!isAuthReady || flag !== '1' || didBootstrapFollowingStreaks) return
    if (!following || following.length === 0) return

    const bootstrap = async () => {
      try {
        for (const person of following) {
          try {
            await findOrCreateConversation(person)
          } catch (err) {
            console.error('Failed to start streak with', person.id, err)
          }
        }
      } finally {
        setDidBootstrapFollowingStreaks(true)
      }
    }

    void bootstrap()
  }, [isAuthReady, startStreaksWithFollowing, didBootstrapFollowingStreaks, following])

  // ----------------------------
  // Continue watching (focus-based) + cancel guard
  // ----------------------------
  useFocusEffect(
    useCallback(() => {
      let alive = true

      const load = async () => {
        try {
          const key = await getProfileScopedKey('watchHistory')
          const mergedByKey: Record<string, Media> = {}

          const stored = await AsyncStorage.getItem(key)
          if (stored) {
            try {
              const parsed = JSON.parse(stored) as Media[]
              parsed.forEach((entry) => {
                const mediaType = String((entry as any)?.media_type || (entry as any)?.mediaType || 'movie')
                const id = entry?.id ?? (entry as any)?.tmdbId ?? entry?.title ?? entry?.name
                if (id == null) return
                mergedByKey[`${mediaType}:${String(id)}`] = entry
              })
            } catch { }
          }

          if (user?.uid) {
            try {
              const profileId = activeProfile?.id ?? 'default'
              const ref = collection(firestore, 'users', user.uid, 'watchHistory')
              const q = query(ref, orderBy('updatedAtMs', 'desc'), limit(60))
              const snap = await getDocs(q)
              snap.docs.forEach((docSnap: any) => {
                const data = docSnap.data() as any
                if (data?.profileId && data.profileId !== profileId) return
                if (data?.completed === true) return
                const tmdbId = data?.tmdbId
                if (!tmdbId) return
                const mediaType = String(data?.mediaType || 'movie')
                const entryKey = `${mediaType}:${String(tmdbId)}`

                const existing = mergedByKey[entryKey]
                const existingTs = existing?.watchProgress?.updatedAt ?? 0
                const incomingTs = data?.watchProgress?.updatedAtMs ?? data?.updatedAtMs ?? 0
                if (existing && existingTs >= incomingTs) return

                mergedByKey[entryKey] = {
                  id: tmdbId,
                  title: data?.title ?? undefined,
                  name: data?.title ?? undefined,
                  media_type: mediaType,
                  poster_path: data?.posterPath ?? undefined,
                  backdrop_path: data?.backdropPath ?? undefined,
                  genre_ids: Array.isArray(data?.genreIds) ? data.genreIds : undefined,
                  seasonNumber: typeof data?.seasonNumber === 'number' ? data.seasonNumber : undefined,
                  episodeNumber: typeof data?.episodeNumber === 'number' ? data.episodeNumber : undefined,
                  seasonTitle: typeof data?.seasonTitle === 'string' ? data.seasonTitle : undefined,
                  watchProgress: {
                    positionMillis: data?.watchProgress?.positionMillis ?? 0,
                    durationMillis: data?.watchProgress?.durationMillis ?? 0,
                    progress: data?.watchProgress?.progress ?? 0,
                    updatedAt: incomingTs || Date.now(),
                  },
                } as Media
              })
            } catch { }
          }

          if (!alive) return
          const merged = Object.values(mergedByKey)
            .filter((entry) => (entry.watchProgress?.progress ?? 0) < 0.985)
            .sort((a, b) => (b.watchProgress?.updatedAt ?? 0) - (a.watchProgress?.updatedAt ?? 0))
            .slice(0, 40)
          setContinueWatching(merged)
        } catch (err) {
          if (alive) setContinueWatching([])
        }
      }

      if (isAuthReady) void load()
      else setContinueWatching([])

      return () => {
        alive = false
      }
    }, [isAuthReady, user?.uid, activeProfile?.id]),
  )

  // ----------------------------
  // Header fade -> promo row
  // ----------------------------
  useEffect(() => {
    if (!isAuthReady) return
    const timer = setTimeout(() => {
      Animated.timing(headerOpacity, {
        toValue: 0,
        duration: 650,
        useNativeDriver: true,
      }).start(() => {
        setShowPromoRow(true)
        promoTranslateX.setValue(24)
        Animated.spring(promoTranslateX, {
          toValue: 0,
          useNativeDriver: true,
          friction: 9,
          tension: 55,
        }).start()
      })
    }, 45000)
    return () => clearTimeout(timer)
  }, [isAuthReady, headerOpacity, promoTranslateX])

  useEffect(() => {
    let unsubscribe: (() => void) | undefined

    const initChannel = async () => {
      try {
        await ensureGlobalBroadcastChannel()
        unsubscribe = onConversationUpdate(GLOBAL_BROADCAST_CHANNEL_ID, (conv) => {
          setBroadcastConversation(conv)
        })
      } catch (err) {
        console.warn('[messaging] broadcast channel init failed', err)
      }
    }

    void initChannel()

    return () => {
      if (unsubscribe) {
        try {
          unsubscribe()
        } catch { }
      }
    }
  }, [])

  // Typing subscriptions for recent conversations (non-groups).
  useEffect(() => {
    const subs: Array<() => void> = []
    const nextTyping: Record<string, boolean> = {}

    liveConversations
      .filter((c) => !c.isGroup && !c.isBroadcast)
      .slice(0, 30)
      .forEach((conv) => {
        const members: string[] = Array.isArray(conv.members) ? (conv.members as any) : []
        const otherId = user?.uid ? members.find((m) => m && m !== user.uid) : null
        if (!otherId) return
        try {
          const unsub = onUserTyping(conv.id, otherId, (typing) => {
            setTypingByConversation((prev) => ({ ...prev, [conv.id]: typing }))
          })
          subs.push(unsub)
        } catch {
          // ignore
        }
        nextTyping[conv.id] = typingByConversation[conv.id] ?? false
      })

    // cleanup
    return () => subs.forEach((fn) => {
      try { fn() } catch { }
    })
  }, [liveConversations, user?.uid])

  // Native Filtering State
  const [filteredItems, setFilteredItems] = useState<any[]>([])

  useEffect(() => {
    let active = true

    if (activeKind === 'Calls') {
      const q = searchQuery.trim().toLowerCase()
      let base = callHistory
      if (activeFilter === 'Unread') {
        base = base.filter((call) => call.status === 'ended' && call.initiatorId !== user?.uid)
      }
      if (q) {
        base = base.filter(
          (call) =>
            (call.conversationName && String(call.conversationName).toLowerCase().includes(q)) ||
            (call.initiatorName && String(call.initiatorName).toLowerCase().includes(q)),
        )
      }
      if (active) setFilteredItems(base)
      return
    }

    if (!allConversations || allConversations.length === 0) {
      if (active) setFilteredItems([])
      return
    }

    const run = async () => {
      try {
        const json = JSON.stringify(allConversations)
        const mapJson = JSON.stringify(localReadAtByConversation)
        const uid = user?.uid || ''
        const res = await MessagingModule.processConversations(
          json,
          uid,
          activeKind,
          activeFilter,
          searchQuery,
          mapJson,
        )
        if (active) setFilteredItems(JSON.parse(res))
      } catch (e) {
        console.warn('Native messaging processing failed', e)
        if (active) setFilteredItems([])
      }
    }
    run()
    return () => {
      active = false
    }
  }, [
    allConversations,
    callHistory,
    activeKind,
    activeFilter,
    searchQuery,
    localReadAtByConversation,
    user?.uid,
  ])

  const handleLoadMoreConversations = useCallback(async () => {
    if (!user?.uid) return
    if (isLoadingMoreConvos || !hasMoreConversations) return
    const oldest = allConversations[allConversations.length - 1]
    const cursor = oldest?.updatedAt
    if (!cursor) {
      setHasMoreConversations(false)
      return
    }
    setIsLoadingMoreConvos(true)
    try {
      const older = await loadOlderConversations(user.uid, cursor, 40)
      if (!older.length) {
        setHasMoreConversations(false)
      }
      setOlderConversations((prev) => {
        const map: Record<string, Conversation> = {}
        older.forEach((c) => { if (c?.id) map[c.id] = c })
        prev.forEach((c) => { if (c?.id && !map[c.id]) map[c.id] = c })
        return Object.values(map)
      })
    } catch (err) {
      console.warn('[messaging] loadMoreConversations failed', err)
    } finally {
      setIsLoadingMoreConvos(false)
    }
  }, [user?.uid, isLoadingMoreConvos, hasMoreConversations, allConversations, loadOlderConversations])

  // ----------------------------
  // Handlers
  // ----------------------------
  const buildChatRouteParams = useCallback(
    (conversation: Conversation): ChatRouteParams => {
      const params: ChatRouteParams = { id: conversation.id }

      const titleFromConversation =
        conversation.name || (conversation as any)?.title || (conversation as any)?.displayName || ''

      if (conversation.isGroup || conversation.isBroadcast) {
        if (titleFromConversation) params.title = titleFromConversation
        return params
      }

      const uid = user?.uid
      const members = Array.isArray(conversation.members) ? conversation.members : []
      const otherId = uid ? members.find((m) => m && m !== uid) : null
      if (!otherId) return params

      params.otherUserId = String(otherId)
      const cached = profileCache[String(otherId)]
      if (cached?.displayName) params.title = cached.displayName
      if (cached?.photoURL) params.avatar = cached.photoURL
      return params
    },
    [profileCache, user?.uid],
  )

  const handleConversationPress = useCallback(
    (conversation: Conversation) => {
      const id = conversation?.id
      if (!id) return
      if (navigatingToRef.current === id) return

      navigatingToRef.current = id
      setNavigatingToId(id)

      router.push({ pathname: '/messaging/chat/[id]', params: buildChatRouteParams(conversation) })

      // Do not block navigation on network writes.
      try {
        markLocalConversationRead(id)
        void markConversationRead(id, settings.readReceipts)
      } catch { }

      setTimeout(() => {
        if (navigatingToRef.current === id) navigatingToRef.current = null
        setNavigatingToId((prev) => (prev === id ? null : prev))
      }, 900)
    },
    [buildChatRouteParams, markLocalConversationRead, router, settings.readReceipts],
  )

  const handleMessageLongPress = useCallback(
    (conversation: Conversation, rect: { x: number; y: number; width: number; height: number }) => {
      const enriched =
        filteredItems.find((c: any) => c.id === conversation.id) ??
        ({ ...conversation, unread: 0 } as ConversationListItem)
      setSpotlightConversation(enriched)
      setSpotlightRect(rect)
    },
    [filteredItems],
  )

  const handleCloseSpotlight = useCallback(() => {
    setSpotlightConversation(null)
    setSpotlightRect(null)
  }, [])

  const handleQuickAccept = useCallback(
    async (conversationId: string) => {
      setRequestActionId(conversationId)
      try {
        await acceptMessageRequest(conversationId)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to accept request'
        Alert.alert('Unable to accept', message)
      } finally {
        setRequestActionId(null)
      }
    },
    [],
  )

  const handleQuickDecline = useCallback(
    (conversationId: string) => {
      Alert.alert('Decline request?', 'They will not be notified.', [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: () => {
            setRequestActionId(conversationId)
            void deleteConversation(conversationId)
              .catch((err) => {
                const message = err instanceof Error ? err.message : 'Unable to decline request'
                Alert.alert('Unable to decline', message)
              })
              .finally(() => setRequestActionId(null))
          },
        },
      ])
    },
    [],
  )

  const handleStartChat = useCallback(
    async (person: Profile) => {
      if (!person?.id) return
      if (startChatInFlightRef.current) return
      try {
        startChatInFlightRef.current = true
        setStartingChatUserId(person.id)
        const conversationId = await findOrCreateConversation(person)
        setProfileCache((prev) => (prev[person.id] ? prev : { ...prev, [person.id]: person }))
        setSheetVisible(false)
        const params: ChatRouteParams = {
          id: conversationId,
          otherUserId: person.id,
          title: person.displayName || 'Chat',
        }
        if (person.photoURL) params.avatar = person.photoURL
        router.push({ pathname: '/messaging/chat/[id]', params })
      } catch (error) {
        console.error('Error starting chat: ', error)
      } finally {
        setTimeout(() => {
          startChatInFlightRef.current = false
          setStartingChatUserId(null)
        }, 700)
      }
    },
    [router],
  )

  const handleCreateGroup = useCallback(
    async (name: string, members: Profile[]) => {
      try {
        const memberIds = members.map((m) => m.id)
        const conversationId = await createGroupConversation({ name, memberIds })
        setSheetVisible(false)
        const params: ChatRouteParams = { id: conversationId, title: name || 'Group' }
        router.push({ pathname: '/messaging/chat/[id]', params })
      } catch (error) {
        console.error('Error creating group chat: ', error)
      }
    },
    [router],
  )

  const handleStoryPress = useCallback(
    (story: any) => {
      const isSelf = Boolean(story?.isSelf)
      const hasStory = Boolean(story?.hasStory)

      if (isSelf && !hasStory) {
        router.push('/story-upload')
        return
      }

      const initialStoryId = story?.userId ? String(story.userId) : String(story?.id ?? '')
      if (!initialStoryId) return

      router.push({
        pathname: '/story-viewer',
        params: {
          stories: JSON.stringify(storyViewerStories),
          initialStoryId,
          ...(story?.latestStoryId ? { initialMediaId: String(story.latestStoryId) } : {}),
        },
      } as any)
    },
    [router, storyViewerStories],
  )

  const handleOpenSearch = useCallback(() => setSearchMode(true), [])
  const handleCloseSearch = useCallback(() => setSearchMode(false), [])

  const handleStartCall = useCallback(
    async (conversation: Conversation, mode: CallType) => {
      if (!user?.uid) {
        Alert.alert('Call unavailable', 'Sign in to place a call.')
        return
      }

      const memberIds = Array.isArray((conversation as any)?.members) ? (conversation as any).members : []
      if (!conversation?.id || memberIds.length === 0) {
        Alert.alert('Call unavailable', 'Conversation has no members yet.')
        return
      }

      if (isStartingCall) return
      setIsStartingCall(true)

      const meta = (conversation as Record<string, any>) || {}
      const conversationLabel = conversation.isGroup
        ? conversation.name || meta.title || 'Group'
        : meta.displayName || meta.title || 'Chat'

      try {
        const result = await createCallSession({
          conversationId: conversation.id,
          members: memberIds,
          type: mode,
          initiatorId: user.uid,
          isGroup: !!conversation.isGroup,
          conversationName: conversationLabel,
          initiatorName: user.displayName ?? null,
        })
        router.push({ pathname: '/calls/[id]', params: { id: result.callId } })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Please try again later.'
        Alert.alert('Unable to start call', message)
      } finally {
        setIsStartingCall(false)
      }
    },
    [user?.uid, user?.displayName, router, isStartingCall],
  )

  const openSheet = useCallback(() => setSheetVisible(true), [])
  const navigateTo = useCallback((path: any) => router.push(path), [router])

  const keyExtractor = useCallback((item: any) => String(item.id), [])

  const renderConversationItem = useCallback(
    ({ item }: { item: ConversationListItem }) => {
      const otherId =
        !item.isGroup &&
          !item.isBroadcast &&
          user?.uid &&
          Array.isArray(item.members)
          ? item.members.find((m: any) => m && m !== user.uid)
          : null
      const otherProfile = otherId ? profileCache[String(otherId)] ?? null : null
      const isTyping = typingByConversation[item.id] === true

      return (
        <MessageItem
          item={item}
          onPress={handleConversationPress}
          currentUser={user}
          otherProfile={otherProfile}
          isTyping={isTyping}
          pressDisabled={!!navigatingToId}
          onLongPress={handleMessageLongPress}
          onStartCall={handleStartCall}
          callDisabled={isStartingCall}
          isVerified={isConversationVerified(item)}
        />
      )
    },
    [
      handleConversationPress,
      handleMessageLongPress,
      handleStartCall,
      isConversationVerified,
      isStartingCall,
      navigatingToId,
      profileCache,
      typingByConversation,
      user,
    ],
  )

  // ----------------------------
  // Render
  // ----------------------------
  if (!isAuthReady) {
    return (
      <MessagingErrorBoundary>
        <ScreenWrapper>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
          </View>
        </ScreenWrapper>
      </MessagingErrorBoundary>
    )
  }

  const headerHeight = HEADER_HEIGHT

  return (
    <MessagingErrorBoundary>
      <ScreenWrapper>
        <StatusBar barStyle="light-content" backgroundColor="#0E0E0E" />
        <LinearGradient
          colors={[accent, accentDark, accentDeeper]}
          start={[0, 0]}
          end={[1, 1]}
          style={StyleSheet.absoluteFillObject}
        />

        <LinearGradient
          colors={[accentOrb, 'rgba(255,255,255,0)']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.bgOrbPrimary}
        />
        <LinearGradient
          colors={[accentOrbSecondary, 'rgba(255,255,255,0)']}
          start={{ x: 0.8, y: 0 }}
          end={{ x: 0.2, y: 1 }}
          style={styles.bgOrbSecondary}
        />

        <View style={styles.container}>
          <AmbientBackground intensity={0.7} />
          <SnowOverlay enabled={snowing} />
          <HeaderComponent />

          {filteredItems.length === 0 && searchQuery.trim() === '' && activeKind !== 'Calls' ? (
            <NoMessages
              suggestedPeople={following}
              onStartChat={handleStartChat}
              startingUserId={startingChatUserId}
              headerHeight={headerHeight}
            />
          ) : (
            <View style={styles.listContainer}>
              {activeKind === 'Calls' ? (
                <AnimatedFlashList
                  data={filteredItems as CallSession[]}
                  renderItem={({ item }: { item: any }) => {
                    const call = item as CallSession;
                    const isOutgoing = call.initiatorId === user?.uid;
                    const wasAnswered = call.participants && Object.keys(call.participants).length > 1;
                    const callTime = call.createdAt?.seconds ? new Date(call.createdAt.seconds * 1000) : new Date();
                    const timeString = callTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    return (
                      <TouchableOpacity style={styles.callItem}>
                        <View style={[styles.callIcon, callIconStyle]}>
                          <Ionicons
                            name={call.type === 'video' ? 'videocam' : 'call'}
                            size={20}
                            color="#fff"
                          />
                        </View>
                        <View style={styles.callInfo}>
                          <Text style={styles.callTitle}>
                            {call.conversationName || 'Call'}
                          </Text>
                          <Text style={styles.callSubtitle}>
                            {isOutgoing ? 'Outgoing' : 'Incoming'} • {timeString} • {wasAnswered ? 'Answered' : 'Missed'}
                          </Text>
                        </View>
                        <Ionicons
                          name={isOutgoing ? 'arrow-up' : 'arrow-down'}
                          size={16}
                          color={isOutgoing ? '#4CAF50' : wasAnswered ? '#2196F3' : '#F44336'}
                        />
                      </TouchableOpacity>
                    );
                  }}
                  keyExtractor={(item: any) => item.id}
                  estimatedItemSize={72}
                  onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                    { useNativeDriver: false }
                  )}
                  scrollEventThrottle={16}
                  ListHeaderComponent={
                    <View style={styles.listHeaderWrap}>
                      {isConversationsLoading && (
                        <View style={styles.fetchingBanner}>
                          <ActivityIndicator color="#fff" size="small" />
                          <Text style={styles.fetchingText}>Fetching messages…</Text>
                        </View>
                      )}
                      <View style={styles.pillsRow}>
                        {(['Chats', 'Groups', 'Calls'] as const).map((kind) => {
                          const isActive = activeKind === kind
                          return (
                            <TouchableOpacity
                              key={kind}
                              style={[styles.pill, isActive && activePillStyle]}
                              onPress={() => setActiveKind(kind)}
                            >
                              <Text style={[styles.pillText, isActive && styles.pillTextActive]}>{kind}</Text>
                            </TouchableOpacity>
                          )
                        })}
                      </View>
                    </View>
                  }
                  contentContainerStyle={{
                    paddingTop: headerHeight + 20,
                    paddingBottom: Platform.OS === 'ios' ? insets.bottom + 120 : insets.bottom + 100,
                  }}
                  showsVerticalScrollIndicator={false}
                />
              ) : (
                <AnimatedFlashList
                  data={filteredItems as ConversationListItem[]}
                  renderItem={renderConversationItem}
                  keyExtractor={keyExtractor}
                  estimatedItemSize={80}
                  onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                    { useNativeDriver: false }
                  )}
                  scrollEventThrottle={16}
                  onEndReached={handleLoadMoreConversations}
                  onEndReachedThreshold={0.5}
                  ListHeaderComponent={
                    <View style={styles.listHeaderWrap}>
                      {isConversationsLoading && (
                        <View style={styles.fetchingBanner}>
                          <ActivityIndicator color="#fff" size="small" />
                          <Text style={styles.fetchingText}>Fetching messages…</Text>
                        </View>
                      )}
                      <View style={styles.pillsRow}>
                        {(['Chats', 'Groups', 'Calls'] as const).map((kind) => {
                          const isActive = activeKind === kind
                          return (
                            <TouchableOpacity
                              key={kind}
                              style={[styles.pill, isActive && activePillStyle]}
                              onPress={() => setActiveKind(kind)}
                            >
                              <Text style={[styles.pillText, isActive && styles.pillTextActive]}>{kind}</Text>
                            </TouchableOpacity>
                          )
                        })}
                      </View>

                      <View style={styles.pillsRow}>
                        {(['All', 'Unread'] as const).map((label) => {
                          const isActive = activeFilter === label
                          return (
                            <TouchableOpacity
                              key={label}
                              style={[styles.pill, isActive && activePillStyle]}
                              onPress={() => setActiveFilter(label)}
                            >
                              <Text style={[styles.pillText, isActive && styles.pillTextActive]}>{label}</Text>
                            </TouchableOpacity>
                          )
                        })}
                      </View>

                      {broadcastConversation && (
                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() => handleConversationPress(broadcastConversation)}
                          disabled={!!navigatingToId}
                        >
                          <LiquidGlass
                            glowColor={accent}
                            tintOpacity={0.12}
                            tintColor="#000"
                            cornerRadius={18}
                            borderOpacity={0.15}
                            style={styles.broadcastCard}
                          >
                            <View style={styles.broadcastIconWrap}>
                              <Ionicons name="megaphone-outline" size={20} color="#fff" />
                            </View>
                            <View style={styles.broadcastCopy}>
                              <View style={styles.broadcastTitleRow}>
                                <Text style={styles.broadcastTitle} numberOfLines={1}>
                                  {broadcastConversation.name || 'Onboarding & Updates'}
                                </Text>
                                {isConversationVerified(broadcastConversation) && (
                                  <View style={styles.verifiedBadge}>
                                    <Ionicons name="checkmark" size={12} color="#fff" />
                                  </View>
                                )}
                                <View style={styles.broadcastBadge}>
                                  <Text style={broadcastConversation.isGroup ? styles.broadcastBadgeText : styles.broadcastBadgeText}>Admin only</Text>
                                </View>
                              </View>
                              <Text style={styles.broadcastSubtitle} numberOfLines={1}>
                                {broadcastConversation.lastMessage ||
                                  'Catch the latest announcements from MovieFlix.'}
                              </Text>
                              <Text style={styles.broadcastUpdated}>{broadcastUpdatedLabel}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.8)" />
                          </LiquidGlass>
                        </TouchableOpacity>
                      )}

                      {pendingRequestCount > 0 && (
                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() => setRequestSheetVisible(true)}
                        >
                          <LiquidGlass
                            glowColor="#fff"
                            tintOpacity={0.1}
                            tintColor="#000"
                            cornerRadius={20}
                            borderOpacity={0.15}
                            style={styles.requestsCard}
                          >
                            <View style={styles.requestsIconWrap}>
                              <Ionicons name="mail-unread-outline" size={20} color="#fff" />
                              <View style={styles.requestsCountBadge}>
                                <Text style={styles.requestsCountText}>{pendingRequestCount}</Text>
                              </View>
                            </View>
                            <View style={styles.requestsCopy}>
                              <Text style={styles.requestsTitle}>Message requests</Text>
                              <Text style={styles.requestsSubtitle} numberOfLines={2}>
                                Approve or decline new chats. They won’t know you saw it until you allow.
                              </Text>
                            </View>
                            <View style={styles.requestsCta}>
                              <Text style={styles.requestsCtaText}>Review</Text>
                              <Ionicons name="chevron-forward" size={16} color="#fff" />
                            </View>
                          </LiquidGlass>
                        </TouchableOpacity>
                      )}

                      <View style={styles.liveRailContainer}>
                        <View style={styles.liveRailHeaderRow}>
                          <Text style={styles.liveRailTitle}>Live now</Text>
                          <Text style={styles.liveRailHint}>Swipe to connect</Text>
                        </View>

                        <FlatList
                          data={liveStreams}
                          keyExtractor={(item: any) => String(item.id)}
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.liveRailListContent}
                          renderItem={({ item }: { item: any }) => (
                            <TouchableOpacity
                              activeOpacity={0.9}
                              onPress={() =>
                                router.push({
                                  pathname: '/social-feed/live/[id]',
                                  params: { id: String(item.id) },
                                } as any)
                              }
                            >
                              <LiquidGlass
                                glowColor={accent}
                                tintOpacity={0.15}
                                tintColor="#000"
                                cornerRadius={18}
                                borderOpacity={0.15}
                                style={styles.liveRailCard}
                              >
                                <View style={styles.liveRailBadge}>
                                  <View style={styles.liveRailDot} />
                                  <Text style={styles.liveRailBadgeText}>LIVE</Text>
                                </View>

                                <Text style={styles.liveRailCardTitle} numberOfLines={1}>
                                  {item.title || 'Live'}
                                </Text>
                                <Text style={styles.liveRailCardMeta} numberOfLines={1}>
                                  {item.hostName || 'Host'} · {item.viewersCount ?? 0} watching
                                </Text>
                              </LiquidGlass>
                            </TouchableOpacity>
                          )}
                        />
                      </View>

                      <View style={styles.storiesContainer}>
                        <View style={styles.storiesHeaderRow}>
                          <Text style={styles.storiesTitle}>Stories</Text>
                          <Text style={styles.storiesAction}>View all</Text>
                        </View>

                        <FlatList
                          data={storyRailData}
                          renderItem={({ item }: { item: any }) => <StoryItem item={item} onPress={handleStoryPress} />}
                          keyExtractor={(item: any, index: number) => `${item.id}-${index}`}
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.storiesListContent}
                        />
                      </View>
                    </View>
                  }
                  ListFooterComponent={
                    isLoadingMoreConvos ? (
                      <View style={styles.fetchingBanner}>
                        <ActivityIndicator color="#fff" size="small" />
                        <Text style={styles.fetchingText}>Loading older conversations…</Text>
                      </View>
                    ) : null
                  }
                  contentContainerStyle={{
                    paddingTop: headerHeight + 20,
                    paddingBottom: Platform.OS === 'ios' ? insets.bottom + 120 : insets.bottom + 100,
                  }}
                  showsVerticalScrollIndicator={false}
                />
              )}
            </View>
          )}

          {allConversations.length > 0 && <FAB onPress={openSheet} />}

          {spotlightConversation && spotlightRect && (
            <View style={styles.spotlightOverlay} pointerEvents="box-none">
              <TouchableOpacity style={styles.spotlightTouch} activeOpacity={1} onPress={handleCloseSpotlight}>
                <BlurView intensity={90} tint="dark" style={styles.spotlightBackdrop} />
              </TouchableOpacity>

              <View style={[styles.spotlightRowContainer, { top: spotlightRect.y }]}>
                <MessageItem
                  item={spotlightConversation}
                  currentUser={user}
                  otherProfile={(() => {
                    const uid = user?.uid
                    const members = Array.isArray(spotlightConversation.members)
                      ? spotlightConversation.members
                      : []
                    const otherId = uid ? members.find((m) => m && m !== uid) : null
                    return otherId ? profileCache[String(otherId)] ?? null : null
                  })()}
                  pressDisabled={!!navigatingToId}
                  onPress={(conv) => {
                    handleCloseSpotlight()
                    handleConversationPress(conv)
                  }}
                  onLongPress={() => { }}
                  onStartCall={handleStartCall}
                  callDisabled={isStartingCall}
                  isVerified={isConversationVerified(spotlightConversation)}
                />
              </View>

              <View style={[styles.spotlightContent, { top: spotlightRect.y + spotlightRect.height + 10 }]}>
                <View style={styles.spotlightActionsRow}>
                  <TouchableOpacity
                    style={styles.spotlightPill}
                    onPress={() => {
                      handleCloseSpotlight()
                      handleConversationPress(spotlightConversation)
                    }}
                  >
                    <Text style={styles.spotlightPillText}>Open</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.spotlightPill}
                    onPress={() => {
                      void setConversationPinned(spotlightConversation.id, !spotlightConversation.pinned)
                      handleCloseSpotlight()
                    }}
                  >
                    <Text style={styles.spotlightPillText}>
                      {spotlightConversation.pinned ? 'Unpin' : 'Pin'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.spotlightPill}
                    onPress={() => {
                      markLocalConversationRead(spotlightConversation.id)
                      void markConversationRead(spotlightConversation.id, settings.readReceipts)
                      handleCloseSpotlight()
                    }}
                  >
                    <Text style={styles.spotlightPillText}>Mark read</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.spotlightPill, styles.spotlightPillDanger]}
                    onPress={() => {
                      void deleteConversation(spotlightConversation.id)
                      handleCloseSpotlight()
                    }}
                  >
                    <Text style={styles.spotlightPillDangerText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          <NewChatSheet
            isVisible={isSheetVisible}
            onClose={() => setSheetVisible(false)}
            following={following}
            suggestedPeople={suggestedPeople}
            onStartChat={handleStartChat}
            onCreateGroup={handleCreateGroup}
            startingUserId={startingChatUserId}
          />

          <Modal
            visible={isRequestSheetVisible}
            animationType="slide"
            transparent
            onRequestClose={() => setRequestSheetVisible(false)}
          >
            <View style={styles.requestSheetOverlay}>
              <TouchableOpacity
                style={styles.requestSheetBackdrop}
                activeOpacity={1}
                onPress={() => setRequestSheetVisible(false)}
              />
              <View style={[styles.requestSheet, { paddingBottom: insets.bottom + 20 }]}>
                <View style={styles.requestSheetHandle} />
                <View style={styles.requestSheetHeader}>
                  <View>
                    <Text style={styles.requestSheetTitle}>Message requests</Text>
                    <Text style={styles.requestSheetSubtitle}>
                      {pendingRequestCount} pending
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setRequestSheetVisible(false)}>
                    <Ionicons name="close" size={22} color="#fff" />
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={requestInbox}
                  keyExtractor={(item: any) => item.id}
                  renderItem={({ item }: { item: any }) => {
                    const avatar = getRequestAvatar(item)
                    const name = getRequestDisplayName(item)
                    const preview = item.requestPreview || item.lastMessage || 'Tap to open chat'
                    const isBusy = requestActionId === item.id
                    return (
                      <View style={styles.requestRow}>
                        {avatar ? (
                          <Image source={{ uri: avatar }} style={styles.requestAvatar} />
                        ) : (
                          <View style={styles.requestAvatarPlaceholder}>
                            <Ionicons name="person" size={18} color="rgba(255,255,255,0.8)" />
                          </View>
                        )}
                        <TouchableOpacity
                          style={styles.requestCopy}
                          activeOpacity={0.9}
                          onPress={() => {
                            setRequestSheetVisible(false)
                            handleConversationPress(item)
                          }}
                          disabled={!!navigatingToId}
                        >
                          <Text style={styles.requestName} numberOfLines={1}>
                            {name}
                          </Text>
                          <Text style={styles.requestPreview} numberOfLines={2}>
                            {preview}
                          </Text>
                        </TouchableOpacity>
                        <View style={styles.requestActions}>
                          <TouchableOpacity
                            style={[styles.requestAcceptBtn, isBusy && styles.requestBtnDisabled]}
                            onPress={() => void handleQuickAccept(item.id)}
                            disabled={isBusy}
                          >
                            <Text style={styles.requestAcceptText}>Allow</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.requestDeclineBtn, isBusy && styles.requestBtnDisabled]}
                            onPress={() => handleQuickDecline(item.id)}
                            disabled={isBusy}
                          >
                            <Text style={styles.requestDeclineText}>Decline</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )
                  }}
                  ItemSeparatorComponent={() => <View style={styles.requestDivider} />}
                  ListEmptyComponent={() => (
                    <View style={styles.requestEmpty}>
                      <Text style={styles.requestEmptyTitle}>All caught up</Text>
                      <Text style={styles.requestEmptySubtitle}>
                        New chats from people you don’t follow will show up here.
                      </Text>
                    </View>
                  )}
                  contentContainerStyle={{ paddingBottom: 12 }}
                />
              </View>
            </View>
          </Modal>
        </View>
      </ScreenWrapper>
    </MessagingErrorBoundary>
  )
}

const styles = StyleSheet.create({
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  bgOrbPrimary: {
    position: 'absolute',
    width: 380,
    height: 380,
    borderRadius: 190,
    top: -60,
    left: -60,
    opacity: 0.6,
  },
  bgOrbSecondary: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    bottom: -90,
    right: -40,
    opacity: 0.55,
  },
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContainer: { flex: 1 },

  headerContainerIsland: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  islandWrap: {
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  islandContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  profileSectionIsland: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    flexShrink: 1,
  },
  avatarDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  eyebrowIsland: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 9,
    marginBottom: 1,
    letterSpacing: 1.2,
    fontWeight: '800',
  },
  headerTextIsland: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  actionSectionIsland: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 22,
    paddingHorizontal: 4,
    height: 44,
  },
  iconBtnIsland: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lastIconBtnIsland: {
    marginRight: 2,
  },
  // Header glass hero
  headerWrap: {
    marginHorizontal: 12,
    marginTop: Platform.OS === 'ios' ? 34 : 22,
    marginBottom: 4,
    borderRadius: 18,
    overflow: 'hidden',
  },
  searchSheet: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: 'rgba(7,9,15,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  searchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  searchBackBtn: {
    padding: 6,
    marginRight: 10,
  },
  searchHeading: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
  },
  searchClearBtn: {
    padding: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  searchHint: {
    marginTop: 12,
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
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
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    marginTop: 2,
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
    paddingVertical: 8,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
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

  quickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 4,
    gap: 10,
  },
  quickTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  quickTileText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },

  listHeaderWrap: {
    paddingTop: 0,
  },

  // Unified pill styling (tighter UI)
  pillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 4,
    gap: 6,
  },
  pill: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  pillText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    fontWeight: '700',
  },
  pillTextActive: { color: '#fff' },
  fetchingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  fetchingText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },

  broadcastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    padding: 14,
    marginHorizontal: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 12,
  },
  broadcastIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  broadcastCopy: {
    flex: 1,
  },
  broadcastTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  broadcastTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    flex: 1,
  },
  broadcastBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  broadcastBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  broadcastSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    marginBottom: 4,
  },
  broadcastUpdated: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
  },
  broadcastFootnote: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    marginTop: 4,
  },
  verifiedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#0d6efd',
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    gap: 12,
  },
  requestsIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.07)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  requestsCountBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    paddingHorizontal: 4,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#e50914',
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestsCountText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  requestsCopy: {
    flex: 1,
  },
  requestsTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  requestsSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 4,
  },
  requestsCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  requestsCtaText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },

  liveRailContainer: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: 'transparent',
    marginBottom: 8,
  },
  liveRailHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  liveRailTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    marginLeft: 2,
    letterSpacing: 0.2,
  },
  liveRailHint: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginRight: 6,
  },
  liveRailListContent: {
    paddingLeft: 4,
    paddingRight: 6,
  },
  liveRailCard: {
    width: 180,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  liveRailBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    marginBottom: 10,
  },
  liveRailDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#e50914',
  },
  liveRailBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  liveRailCardTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  liveRailCardMeta: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '700',
  },
  liveRailEmpty: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 10,
  },
  liveRailEmptyText: {
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '700',
  },

  storiesContainer: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: 'transparent',
    marginBottom: 8,
  },
  storiesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  storiesTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    marginLeft: 2,
    letterSpacing: 0.2,
  },
  storiesAction: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginRight: 6,
  },
  storiesListContent: {
    paddingLeft: 4,
    paddingRight: 6,
  },

  promoRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },

  spotlightOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  spotlightTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  spotlightBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  spotlightRowContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 6,
  },
  spotlightContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
  spotlightActionsRow: {
    marginTop: 10,
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 10,
  },
  spotlightPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  spotlightPillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  spotlightPillDanger: {
    backgroundColor: 'rgba(255,75,75,0.14)',
    borderColor: 'rgba(255,75,75,0.55)',
  },
  spotlightPillDangerText: {
    color: '#ff4b4b',
    fontSize: 12,
    fontWeight: '800',
  },

  // Call history item styles
  callItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  callIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  callInfo: {
    flex: 1,
  },
  callTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  callSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  requestSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(3,5,12,0.75)',
    justifyContent: 'flex-end',
  },
  requestSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  requestSheet: {
    backgroundColor: '#07090F',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 16,
    maxHeight: '75%',
  },
  requestSheetHandle: {
    width: 50,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  requestSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  requestSheetTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  requestSheetSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 2,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  requestAvatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    marginRight: 12,
  },
  requestAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 16,
    marginRight: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestCopy: {
    flex: 1,
  },
  requestName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  requestPreview: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    marginTop: 2,
  },
  requestActions: {
    marginLeft: 10,
    alignItems: 'flex-end',
    gap: 6,
  },
  requestAcceptBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#19c37d',
  },
  requestAcceptText: {
    color: '#02060f',
    fontWeight: '800',
    fontSize: 12,
  },
  requestDeclineBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  requestDeclineText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  requestBtnDisabled: {
    opacity: 0.5,
  },
  requestDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 6,
  },
  requestEmpty: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  requestEmptyTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  requestEmptySubtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
})

export default MessagingScreen
