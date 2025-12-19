import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

import useIncomingCall from '@/hooks/useIncomingCall'
import { createCallSession, declineCall, listenToCallHistory } from '@/lib/calls/callService'
import type { CallSession, CallType } from '@/lib/calls/types'
import { getProfileScopedKey } from '@/lib/profileStorage'
import { updateStreakForContext } from '@/lib/streaks/streakManager'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import type { User } from 'firebase/auth'

import MovieList from '../../components/MovieList'
import ScreenWrapper from '../../components/ScreenWrapper'
import { Media } from '../../types'
import { onStoriesUpdate } from '../components/social-feed/storiesController'
import { useMessagingSettings } from '@/hooks/useMessagingSettings'

import FAB from './components/FAB'
import Header from './components/Header'
import IncomingCallCard from './components/IncomingCallCard'
import MessageItem from './components/MessageItem'
import NewChatSheet from './components/NewChatSheet'
import NoMessages from './components/NoMessages'
import StoryItem from './components/StoryItem'
import {
  Conversation,
  createGroupConversation,
  deleteConversation,
  findOrCreateConversation,
  getFollowing,
  markConversationRead,
  onAuthChange,
  onConversationsUpdate,
  Profile,
  setConversationPinned,
} from './controller'

const HEADER_HEIGHT = 150
const STORY_WINDOW_MS = 24 * 60 * 60 * 1000

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

  const [searchQuery, setSearchQuery] = useState('')
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

  const incomingCall = useIncomingCall(user?.uid)

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

  // ----------------------------
  // Auth bootstrap
  // ----------------------------
  useEffect(() => {
    const unsub = onAuthChange((currentUser) => {
      setUser(currentUser)
      setAuthReady(true)
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
      if (alive) setConversations(list)
    })
    const unsubStories = onStoriesUpdate((list) => {
      if (alive) setStories(list as any)
    })
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
      const updatedAt = (c as any)?.updatedAt
      const updatedAtMs =
        updatedAt && typeof updatedAt?.toMillis === 'function' ? updatedAt.toMillis() : null

      const readCoversLatest =
        lastReadMs && updatedAtMs ? lastReadMs >= updatedAtMs - 500 /* small clock skew */ : false

      const unread =
        hasLastMessage && lastSenderIsNotMe && (lastReadMs ? !readCoversLatest : true) ? 1 : 0

      return { ...c, unread }
    })
  }, [conversations, user?.uid])

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
          await markConversationRead(id, settings.readReceipts)
        } catch {}
        router.push({ pathname: '/messaging/chat/[id]', params: { id } })
      })()
    },
    [router, settings.readReceipts],
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

      const targetId = story?.latestStoryId || story?.id
      router.push({
        pathname: '/story/[id]',
        params: { id: targetId, photoURL: story?.photoURL ?? story?.displayAvatar ?? '' },
      })
    },
    [router],
  )

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
      <ScreenWrapper>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      </ScreenWrapper>
    )
  }

  const accentColor = '#e50914'
  const headerHeight = HEADER_HEIGHT

  return (
    <ScreenWrapper>
      <LinearGradient
        colors={[accentColor, '#150a13', '#05060f']}
        start={[0, 0]}
        end={[1, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header stack */}
        <View style={{ height: headerHeight, marginHorizontal: 14 }}>
          <Animated.View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              opacity: headerOpacity,
            }}
          >
            <Header
              scrollY={scrollY}
              onSettingsPress={() => navigateTo('/messaging/settings')}
              onSearchChange={setSearchQuery}
              searchQuery={searchQuery}
              headerHeight={headerHeight}
            />
          </Animated.View>

          {showPromoRow && continueWatching.length > 0 && (
            <Animated.View
              style={[
                styles.promoRow,
                {
                  left: 0,
                  right: 0,
                  top: 0,
                  transform: [{ translateX: promoTranslateX }],
                },
              ]}
            >
              <MovieList title="Continue Watching" movies={continueWatching.slice(0, 20)} showProgress />
            </Animated.View>
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
                      <View style={styles.callIcon}>
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
                    <View style={styles.pillsRow}>
                      {(['Chats', 'Groups', 'Calls'] as const).map((kind) => {
                        const isActive = activeKind === kind
                        return (
                          <TouchableOpacity
                            key={kind}
                            style={[styles.pill, isActive && styles.pillActive]}
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
                  paddingTop: headerHeight + 8,
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
                  />
                )}
                keyExtractor={(item) => item.id}
                onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
                  useNativeDriver: false,
                })}
                ListHeaderComponent={
                  <View style={styles.listHeaderWrap}>
                    <View style={styles.pillsRow}>
                      {(['Chats', 'Groups', 'Calls'] as const).map((kind) => {
                        const isActive = activeKind === kind
                        return (
                          <TouchableOpacity
                            key={kind}
                            style={[styles.pill, isActive && styles.pillActive]}
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
                            style={[styles.pill, isActive && styles.pillActive]}
                            onPress={() => setActiveFilter(label)}
                          >
                            <Text style={[styles.pillText, isActive && styles.pillTextActive]}>{label}</Text>
                          </TouchableOpacity>
                        )
                      })}
                    </View>

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
                  paddingTop: headerHeight + 8,
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
      </SafeAreaView>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContainer: { flex: 1 },

  listHeaderWrap: {
    paddingTop: 4,
  },

  // Unified pill styling (tighter UI)
  pillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 6,
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  pillActive: {
    backgroundColor: '#e50914',
    borderColor: '#e50914',
  },
  pillText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    fontWeight: '700',
  },
  pillTextActive: { color: '#fff' },

  storiesContainer: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
    marginBottom: 8,
  },
  storiesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
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
    paddingLeft: 6,
    paddingRight: 8,
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
    paddingHorizontal: 8,
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  callIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(229,9,20,0.2)',
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
})

export default MessagingScreen