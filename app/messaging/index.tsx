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

import useIncomingCall from '@/hooks/useIncomingCall'
import { createCallSession, declineCall, listenToCallHistory } from '@/lib/calls/callService'
import type { CallSession, CallType } from '@/lib/calls/types'
import { getProfileScopedKey } from '@/lib/profileStorage'
import { updateStreakForContext } from '@/lib/streaks/streakManager'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import type { User } from 'firebase/auth'

import { useMessagingSettings } from '@/hooks/useMessagingSettings'
import ScreenWrapper from '../../components/ScreenWrapper'
import { Media } from '../../types'
import { onStoriesUpdateForViewer } from '../components/social-feed/storiesController'
import { useActiveProfile } from '../../hooks/use-active-profile'
import { useAccent } from '../components/AccentContext'
import { accentGradient, darkenColor, withAlpha } from '../../lib/colorUtils'

import FAB from './components/FAB'
import IncomingCallCard from './components/IncomingCallCard'
import MessageItem from './components/MessageItem'
import NewChatSheet from './components/NewChatSheet'
import NoMessages from './components/NoMessages'
import StoryItem from './components/StoryItem'
import MessagingErrorBoundary from './components/ErrorBoundary'
import {
    Conversation,
    acceptMessageRequest,
    ensureGlobalBroadcastChannel,
    createGroupConversation,
    deleteConversation,
    findOrCreateConversation,
    getFollowing,
    getProfileById,
    GLOBAL_BROADCAST_CHANNEL_ID,
    markConversationRead,
    onAuthChange,
    onConversationsUpdate,
    onConversationUpdate,
    Profile,
    setConversationPinned,
} from './controller'

const HEADER_HEIGHT = 120
const STORY_WINDOW_MS = 24 * 60 * 60 * 1000
const VERIFIED_CHANNEL_IDS = new Set([GLOBAL_BROADCAST_CHANNEL_ID])

type ConversationListItem = Conversation & { unread: number }

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

  const scrollY = useRef(new Animated.Value(0)).current
  const headerOpacity = useRef(new Animated.Value(1)).current
  const promoTranslateX = useRef(new Animated.Value(40)).current

  const [user, setUser] = useState<User | null>(null)
  const [isAuthReady, setAuthReady] = useState(false)

  const [stories, setStories] = useState<Story[]>([])
  const [following, setFollowing] = useState<Profile[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [callHistory, setCallHistory] = useState<CallSession[]>([])
  const [broadcastConversation, setBroadcastConversation] = useState<Conversation | null>(null)
  const [profileCache, setProfileCache] = useState<Record<string, Profile>>({})
  const [isRequestSheetVisible, setRequestSheetVisible] = useState(false)
  const [requestActionId, setRequestActionId] = useState<string | null>(null)
  const [isConversationsLoading, setConversationsLoading] = useState(true)

  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchMode, setSearchMode] = useState(false)
  const [isSheetVisible, setSheetVisible] = useState(false)

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
  const activeProfile = useActiveProfile()
  const profileGreetingName = activeProfile?.name ?? 'streamer'

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

  const markLocalConversationRead = useCallback(
    (conversationId: string) => {
      if (!localReadStorageKey) return
      const now = Date.now()

      setLocalReadAtByConversation((prev) => {
        const next = { ...prev, [conversationId]: now }
        void AsyncStorage.setItem(localReadStorageKey, JSON.stringify(next)).catch(() => {})
        return next
      })
    },
    [localReadStorageKey],
  )

  const incomingCall = useIncomingCall(user?.uid)
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

  // ----------------------------
  // Stories rail normalization
  // ----------------------------
  const groupedStories = useMemo<StoryRailEntry[]>(() => {
    const map = new Map<string, StoryRailEntry>()

    for (const story of stories) {
      if (!story?.userId) continue

      const createdAtMs =
        story.createdAt && typeof story.createdAt?.toMillis === 'function'
          ? story.createdAt.toMillis()
          : null

      if (createdAtMs && Date.now() - createdAtMs > STORY_WINDOW_MS) continue

      const existing = map.get(story.userId)
      if (!existing || (createdAtMs ?? 0) > (existing.latestCreatedAt ?? 0)) {
        map.set(story.userId, {
          ...story,
          latestStoryId: story.id,
          latestCreatedAt: createdAtMs,
          hasStory: true,
          displayAvatar: story.userAvatar || story.avatar || story.photoURL || null,
        })
      }
    }

    return Array.from(map.values()).sort((a, b) => (b.latestCreatedAt ?? 0) - (a.latestCreatedAt ?? 0))
  }, [stories])

  const storyRailData = useMemo<StoryRailEntry[]>(() => {
    const entries: StoryRailEntry[] = []

    const myEntry = (user?.uid ? groupedStories.find((e) => e.userId === user.uid) : null) ?? null
    const selfAvatar = user?.photoURL ?? myEntry?.displayAvatar ?? myEntry?.photoURL ?? null

    entries.push({
      id: user?.uid ?? 'self-story',
      userId: user?.uid ?? 'self-story',
      username: user?.displayName ?? 'My Story',
      photoURL: myEntry?.photoURL ?? selfAvatar ?? undefined,
      userAvatar: selfAvatar,
      latestStoryId: myEntry?.latestStoryId ?? null,
      latestCreatedAt: myEntry?.latestCreatedAt ?? null,
      hasStory: !!myEntry,
      isSelf: true,
      timestampLabel: myEntry?.latestCreatedAt ? formatStoryTime(myEntry.latestCreatedAt) : 'Tap to add',
      displayAvatar: selfAvatar,
    })

    for (const entry of groupedStories.filter((e) => e.userId !== user?.uid)) {
      entries.push({
        ...entry,
        id: entry.latestStoryId ?? entry.id,
        hasStory: true,
        timestampLabel: formatStoryTime(entry.latestCreatedAt),
        displayAvatar: entry.displayAvatar ?? entry.photoURL ?? entry.avatar ?? null,
      })
    }

    return entries
  }, [groupedStories, user?.uid, user?.displayName, user?.photoURL])

  const storyViewerStories = useMemo(() => {
    const byUser = new Map<string, Story[]>()

    for (const s of stories) {
      const userId = s?.userId ? String(s.userId) : ''
      if (!userId) continue

      const createdAtMs =
        s.createdAt && typeof (s.createdAt as any)?.toMillis === 'function'
          ? (s.createdAt as any).toMillis()
          : null

      if (createdAtMs && Date.now() - createdAtMs > STORY_WINDOW_MS) continue

      const list = byUser.get(userId) ?? []
      list.push(s)
      byUser.set(userId, list)
    }

    const groups = Array.from(byUser.entries()).map(([userId, list]) => {
      const sorted = [...list].sort((a, b) => {
        const ta = a.createdAt && typeof (a.createdAt as any)?.toMillis === 'function' ? (a.createdAt as any).toMillis() : 0
        const tb = b.createdAt && typeof (b.createdAt as any)?.toMillis === 'function' ? (b.createdAt as any).toMillis() : 0
        return ta - tb
      })

      const first = sorted[0]
      const last = sorted[sorted.length - 1]

      const avatar = (last as any)?.userAvatar || last?.avatar || last?.photoURL || null
      const title = first?.username || 'Story'

      const media = sorted
        .map((st) => {
          const uri = String(st.photoURL || (st as any).mediaUrl || '')
          if (!uri) return null
          const explicitType = (st as any)?.mediaType
          const lower = uri.toLowerCase()
          const type =
            explicitType === 'video'
              ? ('video' as const)
              : explicitType === 'image'
                ? ('image' as const)
                : lower.includes('.mp4') || lower.includes('.m3u8')
                  ? ('video' as const)
                  : ('image' as const)

          const createdAtMs =
            st.createdAt && typeof (st.createdAt as any)?.toMillis === 'function'
              ? (st.createdAt as any).toMillis()
              : null
          return {
            type,
            uri,
            storyId: String(st.id),
            caption: typeof st.caption === 'string' ? st.caption : undefined,
            overlayText: typeof (st as any).overlayText === 'string' ? (st as any).overlayText : undefined,
            createdAtMs,
          }
        })
        .filter(Boolean)

      const latestCreatedAt =
        last?.createdAt && typeof (last.createdAt as any)?.toMillis === 'function' ? (last.createdAt as any).toMillis() : 0

      return {
        id: userId,
        userId,
        username: first?.username ?? undefined,
        title,
        avatar,
        image: avatar,
        media,
        __latestCreatedAt: latestCreatedAt,
      }
    })

    return groups
      .filter((g: any) => Array.isArray(g.media) && g.media.length > 0)
      .sort((a: any, b: any) => (b.__latestCreatedAt ?? 0) - (a.__latestCreatedAt ?? 0))
      .map(({ __latestCreatedAt, ...rest }: any) => rest)
  }, [stories])

  const requestInbox = useMemo(() => {
    if (!user?.uid) return []
    return conversations.filter(
      (conv) =>
        conv.status === 'pending' &&
        !conv.isGroup &&
        (conv.requestInitiatorId ?? null) !== user.uid,
    )
  }, [conversations, user?.uid])

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
    if (!requestInbox.length) return
    const missingIds = requestInbox
      .map((conv) => conv.requestInitiatorId)
      .filter((id): id is string => !!id && !profileCache[id])
    if (!missingIds.length) return

    let isMounted = true
    const load = async () => {
      try {
        const next = await Promise.all(missingIds.slice(0, 8).map((id) => getProfileById(id)))
        if (!isMounted) return
        setProfileCache((prev) => {
          const clone = { ...prev }
          next.forEach((profile) => {
            if (profile && !clone[profile.id]) {
              clone[profile.id] = profile
            }
          })
          return clone
        })
      } catch (err) {
        console.warn('[messaging] failed loading request profiles', err)
      }
    }

    void load()
    return () => {
      isMounted = false
    }
  }, [requestInbox, profileCache])

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
        setConversations([])
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
    const unsubConversations = onConversationsUpdate((list) => {
      if (!alive) return
      setConversations(list)
      setConversationsLoading(false)
    })
    const unsubStories = onStoriesUpdateForViewer(
      (list) => {
        if (alive) setStories(list as any)
      },
      { viewerId: user.uid },
    )
    const unsubCallHistory = listenToCallHistory(user.uid, (calls) => {
      if (alive) setCallHistory(calls)
    })

    ;(async () => {
      try {
        const list = await getFollowing()
        if (alive) setFollowing(list)
      } catch (e) {
        if (alive) setFollowing([])
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
        setDidNavigateFromStreak(true)

        router.push({
          pathname: '/messaging/chat/[id]',
          params: { id: conversationId, fromStreak: '1' },
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
            const conversationId = await findOrCreateConversation(person)
            await updateStreakForContext({
              kind: 'chat',
              conversationId,
              partnerId: person.id,
              partnerName: person.displayName ?? null,
            })
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
          const stored = await AsyncStorage.getItem(key)
          if (!alive) return
          setContinueWatching(stored ? (JSON.parse(stored) as Media[]) : [])
        } catch (err) {
          if (alive) setContinueWatching([])
        }
      }

      if (isAuthReady) void load()
      else setContinueWatching([])

      return () => {
        alive = false
      }
    }, [isAuthReady]),
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
        } catch {}
      }
    }
  }, [])

  // ----------------------------
  // Unread computation aligned with controller.ts (lastReadAtBy)
  // ----------------------------
  const enhancedConversations: ConversationListItem[] = useMemo(() => {
    const uid = user?.uid
    return conversations.map((c) => {
      if (!uid) return { ...c, unread: 0 }

      const hasLastMessage = Boolean(c.lastMessage)
      const lastSenderIsNotMe = Boolean(c.lastMessageSenderId) && c.lastMessageSenderId !== uid

      // If we have lastReadAtBy, prefer it:
      const lastRead = (c as any)?.lastReadAtBy?.[uid]
      const lastReadMs =
        lastRead && typeof lastRead?.toMillis === 'function' ? lastRead.toMillis() : null

      const localReadMs = localReadAtByConversation[c.id] ?? null
      const effectiveLastReadMs = Math.max(lastReadMs ?? 0, localReadMs ?? 0) || null
      const updatedAt = (c as any)?.updatedAt
      const updatedAtMs =
        updatedAt && typeof updatedAt?.toMillis === 'function' ? updatedAt.toMillis() : null

      const readCoversLatest =
        effectiveLastReadMs && updatedAtMs
          ? effectiveLastReadMs >= updatedAtMs - 500 /* small clock skew */
          : false

      const unread =
        hasLastMessage && lastSenderIsNotMe && (effectiveLastReadMs ? !readCoversLatest : true)
          ? 1
          : 0

      return { ...c, unread }
    })
  }, [conversations, localReadAtByConversation, user?.uid])

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()

    if (activeKind === 'Calls') {
      // Handle call history
      let base = callHistory
      if (activeFilter === 'Unread') {
        // For calls, "unread" could mean missed calls or unanswered calls
        base = base.filter((call) => call.status === 'ended' && call.initiatorId !== user?.uid)
      }
      if (q) {
        base = base.filter(
          (call) =>
            (call.conversationName && String(call.conversationName).toLowerCase().includes(q)) ||
            (call.initiatorName && String(call.initiatorName).toLowerCase().includes(q)),
        )
      }
      return base
    } else {
      // Handle conversations
      let base: ConversationListItem[] =
        activeKind === 'Groups'
          ? enhancedConversations.filter((m) => m.isGroup)
          : enhancedConversations.filter((m) => !m.isGroup)

      base = base.filter((m) => {
        if (!user?.uid) return true
        if (m.status !== 'pending') return true
        if (!m.requestInitiatorId) return true
        return m.requestInitiatorId === user.uid
      })

      if (activeFilter === 'Unread') base = base.filter((m) => m.unread > 0)

      if (q) {
        base = base.filter(
          (m) =>
            (m.name && String(m.name).toLowerCase().includes(q)) ||
            (m.lastMessage && String(m.lastMessage).toLowerCase().includes(q)),
        )
      }

      // pin first
      const pinned = base.filter((m) => m.pinned)
      const others = base.filter((m) => !m.pinned)
      return [...pinned, ...others]
    }
  }, [enhancedConversations, callHistory, searchQuery, activeFilter, activeKind, user?.uid])

  // ----------------------------
  // Handlers
  // ----------------------------
  const handleMessagePress = useCallback(
    (id: string) => {
      void (async () => {
        try {
          markLocalConversationRead(id)
          await markConversationRead(id, settings.readReceipts)
        } catch {}
        router.push({ pathname: '/messaging/chat/[id]', params: { id } })
      })()
    },
    [markLocalConversationRead, router, settings.readReceipts],
  )

  const handleMessageLongPress = useCallback(
    (conversation: Conversation, rect: { x: number; y: number; width: number; height: number }) => {
      const enriched =
        enhancedConversations.find((c) => c.id === conversation.id) ??
        ({ ...conversation, unread: 0 } as ConversationListItem)
      setSpotlightConversation(enriched)
      setSpotlightRect(rect)
    },
    [enhancedConversations],
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
      try {
        const conversationId = await findOrCreateConversation(person)
        setSheetVisible(false)
        router.push({ pathname: '/messaging/chat/[id]', params: { id: conversationId } })
      } catch (error) {
        console.error('Error starting chat: ', error)
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
        router.push({ pathname: '/messaging/chat/[id]', params: { id: conversationId } })
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

  const handleAcceptIncomingCall = useCallback(() => {
    if (!incomingCall?.id) return
    router.push({ pathname: '/calls/[id]', params: { id: incomingCall.id } })
  }, [incomingCall?.id, router])

  const handleDeclineIncomingCall = useCallback(async () => {
    if (!incomingCall?.id || !user?.uid) return
    try {
      await declineCall(incomingCall.id, user.uid, user.displayName ?? null)
    } catch (err) {
      console.warn('Failed to decline call', err)
    }
  }, [incomingCall?.id, user?.uid, user?.displayName])

  const openSheet = useCallback(() => setSheetVisible(true), [])
  const navigateTo = useCallback((path: any) => router.push(path), [router])

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
        {/* Header (glassy hero) */}
        <View style={styles.headerWrap}>
          {isSearchMode ? (
            <BlurView intensity={80} tint="dark" style={styles.searchSheet}>
              <View style={styles.searchHeaderRow}>
                <TouchableOpacity onPress={handleCloseSearch} style={styles.searchBackBtn}>
                  <Ionicons name="arrow-back" size={22} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.searchHeading}>Search</Text>
              </View>
              <View style={styles.searchInputRow}>
                <Ionicons name="search" size={18} color="#fff" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search chats, groups & channels"
                  placeholderTextColor="rgba(255,255,255,0.6)"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoFocus
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClearBtn}>
                    <Ionicons name="close" size={16} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.searchHint}>Filtering {enhancedConversations.length} chats in real time.</Text>
            </BlurView>
          ) : (
            <>
              <LinearGradient
                colors={[accentGlow, 'rgba(10,12,24,0.4)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.headerGlow}
              />
              <View style={styles.headerBar}>
                <TouchableOpacity style={styles.titleRow} activeOpacity={0.85} onPress={handleOpenSearch}>
                  <View style={[styles.accentDot, accentDotStyle]} />
                  <View>
                    <Text style={styles.headerEyebrow} numberOfLines={1} ellipsizeMode="tail">
                      Messages & Stories
                    </Text>
                    <Text style={styles.headerText} numberOfLines={1} ellipsizeMode="tail">
                      Hey, {profileGreetingName}
                    </Text>
                    <Text style={styles.headerSubtitle} numberOfLines={1} ellipsizeMode="tail">
                      Connect & Share
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
                      <Ionicons name="search-outline" size={22} color="#ffffff" style={styles.iconMargin} />
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.iconBtn, iconShadowStyle]}
                    onPress={() => navigateTo('/messaging/settings')}
                  >
                    <LinearGradient
                      colors={iconGradientColors}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.iconBg}
                    >
                      <Ionicons name="settings-outline" size={22} color="#ffffff" style={styles.iconMargin} />
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.headerMetaRow}>
                <View style={styles.metaPill}>
                  <Ionicons name="chatbubbles" size={14} color="#fff" />
                  <Text style={styles.metaText}>{enhancedConversations.length} chats</Text>
                </View>
                <View style={[styles.metaPill, styles.metaPillSoft]}>
                  <Ionicons name="people" size={14} color="#fff" />
                  <Text style={styles.metaText}>{following.length} following</Text>
                </View>
                <View style={[styles.metaPill, styles.metaPillOutline]}>
                  <Ionicons name="call" size={14} color="#fff" />
                  <Text style={styles.metaText}>Voice & Video</Text>
                </View>
              </View>

              <View style={styles.quickRow}>
                <TouchableOpacity style={styles.quickTile} onPress={() => navigateTo('/messaging/new')}>
                  <Ionicons name="create-outline" size={18} color="#fff" />
                  <Text style={styles.quickTileText}>New chat</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickTile} onPress={() => setActiveKind('Groups')}>
                  <Ionicons name="people-outline" size={18} color="#fff" />
                  <Text style={styles.quickTileText}>Groups</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickTile} onPress={() => setActiveKind('Calls')}>
                  <Ionicons name="call-outline" size={18} color="#fff" />
                  <Text style={styles.quickTileText}>Calls</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {incomingCall && (
          <IncomingCallCard
            call={incomingCall}
            onAccept={handleAcceptIncomingCall}
            onDecline={handleDeclineIncomingCall}
          />
        )}

        {filteredItems.length === 0 && searchQuery.trim() === '' && activeKind !== 'Calls' ? (
          <NoMessages suggestedPeople={following} onStartChat={handleStartChat} headerHeight={headerHeight} />
        ) : (
          <View style={styles.listContainer}>
            {activeKind === 'Calls' ? (
              <FlatList
                data={filteredItems as CallSession[]}
                renderItem={({ item }) => {
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
                keyExtractor={(item) => item.id}
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
                  paddingTop: headerHeight,
                  paddingBottom: Platform.OS === 'ios' ? insets.bottom + 120 : insets.bottom + 100,
                }}
                showsVerticalScrollIndicator={false}
              />
            ) : (
              <Animated.FlatList
                data={filteredItems as ConversationListItem[]}
                renderItem={({ item }) => (
                  <MessageItem
                    item={item}
                    onPress={() => handleMessagePress(item.id)}
                    currentUser={user}
                    onLongPress={handleMessageLongPress}
                    onStartCall={handleStartCall}
                    callDisabled={isStartingCall}
                    isVerified={isConversationVerified(item)}
                  />
                )}
                keyExtractor={(item) => item.id}
                onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
                  useNativeDriver: false,
                })}
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
                        onPress={() => handleMessagePress(GLOBAL_BROADCAST_CHANNEL_ID)}
                      >
                        <LinearGradient
                          colors={[withAlpha(accent, 0.2), withAlpha(accent, 0.06)]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
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
                                <Text style={styles.broadcastBadgeText}>Admin only</Text>
                              </View>
                            </View>
                            <Text style={styles.broadcastSubtitle} numberOfLines={1}>
                              {broadcastConversation.lastMessage ||
                                'Catch the latest announcements from MovieFlix.'}
                            </Text>
                            <Text style={styles.broadcastUpdated}>{broadcastUpdatedLabel}</Text>
                            <Text style={styles.broadcastFootnote} numberOfLines={2}>
                              Auto-followed for every profile. Tap to see MovieFlix onboarding tips—no request needed.
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.8)" />
                        </LinearGradient>
                      </TouchableOpacity>
                    )}

                    {pendingRequestCount > 0 && (
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => setRequestSheetVisible(true)}
                      >
                        <LinearGradient
                          colors={[withAlpha('#1f1f1f', 0.7), withAlpha('#050505', 0.9)]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
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
                        </LinearGradient>
                      </TouchableOpacity>
                    )}

                    <View style={styles.storiesContainer}>
                      <View style={styles.storiesHeaderRow}>
                        <Text style={styles.storiesTitle}>Stories</Text>
                        <Text style={styles.storiesAction}>View all</Text>
                      </View>

                      <FlatList
                        data={storyRailData}
                        renderItem={({ item }) => <StoryItem item={item} onPress={handleStoryPress} />}
                        keyExtractor={(item, index) => `${item.id}-${index}`}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.storiesListContent}
                      />
                    </View>
                  </View>
                }
                contentContainerStyle={{
                  paddingTop: headerHeight,
                  paddingBottom: Platform.OS === 'ios' ? insets.bottom + 120 : insets.bottom + 100,
                }}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        )}

        {conversations.length > 0 && <FAB onPress={openSheet} />}

        {spotlightConversation && spotlightRect && (
          <View style={styles.spotlightOverlay} pointerEvents="box-none">
            <TouchableOpacity style={styles.spotlightTouch} activeOpacity={1} onPress={handleCloseSpotlight}>
              <BlurView intensity={90} tint="dark" style={styles.spotlightBackdrop} />
            </TouchableOpacity>

            <View style={[styles.spotlightRowContainer, { top: spotlightRect.y }]}>
              <MessageItem
                item={spotlightConversation}
                currentUser={user}
                onPress={() => {
                  handleCloseSpotlight()
                  handleMessagePress(spotlightConversation.id)
                }}
                onLongPress={() => {}}
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
                    handleMessagePress(spotlightConversation.id)
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
          onStartChat={handleStartChat}
          onCreateGroup={handleCreateGroup}
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
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
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
                          handleMessagePress(item.id)
                        }}
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
