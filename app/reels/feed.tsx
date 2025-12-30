import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  GestureResponderEvent,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewToken,
} from 'react-native'

import { Feather, Ionicons } from '@expo/vector-icons'
import { Video } from 'expo-av'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  addDoc,
  collection,
  deleteField,
  doc,
  limit,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { firestore } from '../../constants/firebase'
import { useActiveProfilePhoto } from '../../hooks/use-active-profile-photo'
import { useUser } from '../../hooks/use-user'
import { logInteraction } from '../../lib/algo'
import { getProfileScopedKey } from '../../lib/profileStorage'
import { useSubscription } from '../../providers/SubscriptionProvider'
import { injectAdsWithPattern } from '../../lib/ads/sequence'
import ReelAdSlide from '../../components/ads/ReelAdSlide'
import { usePromotedProducts } from '../../hooks/use-promoted-products'
import { trackPromotionClick, trackPromotionImpression } from '../marketplace/api'

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window')

type FeedReelItem = {
  id: string
  mediaType?: string
  title: string
  docId?: string | null
  videoUrl?: string | null
  avatar?: string | null
  user?: string | null // (you compare this to user.uid, so treat it as uid)
  likes?: number
  comments?: any[]
  commentsCount?: number
  likerAvatars?: string[]
  music?: string | null
}

type ReelItem = FeedReelItem | { type: 'ad'; id: string; productId: string }

export default function FeedReelsScreen() {
  const params = useLocalSearchParams()

  const [autoPlayReels, setAutoPlayReels] = useState(true)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const key = await getProfileScopedKey('socialSettings:autoPlayReels')
        const raw = await AsyncStorage.getItem(key)
        if (!mounted) return
        if (raw == null) return
        try {
          const parsed = JSON.parse(raw)
          if (typeof parsed === 'boolean') setAutoPlayReels(parsed)
        } catch {
          if (raw === 'true') setAutoPlayReels(true)
          if (raw === 'false') setAutoPlayReels(false)
        }
      } catch {
        // ignore
      }
    })()
    return () => {
      mounted = false
    }
  }, [])
  const router = useRouter()
  const { currentPlan } = useSubscription()
  const { products: promoted } = usePromotedProducts({ placement: 'feed', limit: 30 })

  // ✅ extract ONLY primitives so memo deps are stable (fixes max update depth)
  const id = typeof params.id === 'string' ? params.id : undefined
  const list = typeof params.list === 'string' ? params.list : undefined
  const titleParam = typeof (params as any).title === 'string' ? (params as any).title : undefined
  const musicParam = typeof (params as any).music === 'string' ? (params as any).music : undefined

  useEffect(() => {
    StatusBar.setHidden(true, 'fade')
    return () => StatusBar.setHidden(false, 'fade')
  }, [])

  const queue: FeedReelItem[] = useMemo(() => {
    if (typeof list === 'string' && list.length > 0) {
      try {
        const parsed = JSON.parse(decodeURIComponent(list))
        if (Array.isArray(parsed)) {
          return parsed.map((it: any, index: number) => ({
            id: String(it.id ?? it.docId ?? index),
            mediaType: it.mediaType || 'feed',
            title: it.title || 'Reel',
            videoUrl: it.videoUrl || null,
            avatar: it.avatar || null,
            user: it.user || null,
            docId: it.docId ?? null,
            likes: it.likes ?? 0,
            comments: it.comments ?? [],
            commentsCount: it.commentsCount ?? (it.comments ? it.comments.length : 0),
            likerAvatars: it.likerAvatars ?? [],
            music: it.music ?? `Original Sound - ${it.user || 'Unknown'}`,
          }))
        }
      } catch (e) {
        console.warn('Failed to parse feed queue', e)
      }
    }

    if (id) {
      return [
        {
          id: String(id),
          mediaType: 'feed',
          title: String(titleParam || 'Reel'),
          videoUrl: null,
          docId: null,
          likes: 0,
          comments: [],
          commentsCount: 0,
          likerAvatars: [],
          music: musicParam ?? 'Original Sound',
        },
      ]
    }

    return []
  }, [list, id, titleParam, musicParam])

  const adPatternStartRef = useRef(Math.floor(Math.random() * 3))

  const queueWithAds: ReelItem[] = useMemo(() => {
    if (currentPlan !== 'free') return queue
    if (!promoted.length) return queue
    return injectAdsWithPattern(queue, {
      pattern: [3, 2, 4],
      startPatternIndex: adPatternStartRef.current,
      isCountedItem: () => true,
      createAdItem: (seq) => ({ type: 'ad', id: `ad-${seq}`, productId: String(promoted[seq % promoted.length].id || '') }),
    })
  }, [queue, currentPlan, promoted])

  const initialIndex = useMemo(() => {
    const idx = queueWithAds.findIndex((q: any) => String(q.id) === String(id))
    return idx >= 0 ? idx : 0
  }, [queueWithAds, id])

  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const currentIndexRef = useRef(initialIndex)
  useEffect(() => {
    currentIndexRef.current = currentIndex
  }, [currentIndex])
  const [items, setItems] = useState<ReelItem[]>(queueWithAds)

  const adImpressionsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const cur: any = items[currentIndex]
    if (!cur || cur.type !== 'ad') return
    const productId = String(cur.productId || '')
    if (!productId) return
    if (adImpressionsRef.current.has(productId)) return
    adImpressionsRef.current.add(productId)
    void trackPromotionImpression({ productId, placement: 'feed' }).catch(() => {})
  }, [currentIndex, items])

  // ✅ only update state when queue actually changes (prevents render loops)
  useEffect(() => {
    setItems(queueWithAds)
  }, [queueWithAds])

  useEffect(() => {
    setCurrentIndex(initialIndex)
  }, [initialIndex])

  const listRef = useRef<FlatList<ReelItem>>(null)
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current

  const rafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null)
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<ViewToken> }) => {
      const first = viewableItems?.[0]?.index
      if (typeof first !== 'number') return
      if (first === currentIndexRef.current) return
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        currentIndexRef.current = first
        setCurrentIndex(first)
      })
    },
  ).current

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [])

  const renderItem = useCallback(
    ({ item, index }: { item: ReelItem; index: number }) => {
      if ((item as any)?.type === 'ad') {
        const ad = item as any
        const product = promoted.find((p) => String(p.id) === String(ad.productId))
        if (!product) return null
        return (
          <ReelAdSlide
            product={product as any}
            onPress={() => {
              if (product?.id) {
                void trackPromotionClick({ productId: String(product.id), placement: 'feed' }).catch(() => {})
              }
              router.push((`/marketplace/${product.id}`) as any)
            }}
          />
        )
      }

      const distance = Math.abs(index - currentIndex)
      const mounted = distance <= 1
      return (
        <FeedSlide
          item={item as FeedReelItem}
          active={index === currentIndex}
          mounted={mounted}
          autoPlayReels={autoPlayReels}
          onAutoPlayNext={() => {
            const next = index + 1
            if (index === currentIndex && next < items.length) {
              setCurrentIndex(next)
              listRef.current?.scrollToIndex({ index: next, animated: true })
            }
          }}
        />
      )
    },
    [autoPlayReels, currentIndex, items.length, promoted, router],
  )

  return (
    <View style={styles.wrapper}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(it) => String(it.id)}
        renderItem={renderItem}
        pagingEnabled
        snapToInterval={SCREEN_HEIGHT}
        showsVerticalScrollIndicator={false}
        snapToAlignment="start"
        decelerationRate="fast"
        overScrollMode={Platform.OS === 'android' ? 'never' : undefined}
        removeClippedSubviews
        windowSize={3}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        updateCellsBatchingPeriod={50}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        getItemLayout={(_, idx) => ({
          length: SCREEN_HEIGHT,
          offset: SCREEN_HEIGHT * idx,
          index: idx,
        })}
        initialScrollIndex={initialIndex}
      />

      <TouchableOpacity style={styles.back} onPress={() => router.back()}>
        <Feather name="chevron-left" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  )
}

const FeedSlide = React.memo(function FeedSlide({
  item,
  active,
  mounted,
  autoPlayReels,
  onAutoPlayNext,
}: {
  item: FeedReelItem
  active: boolean
  mounted: boolean
  autoPlayReels: boolean
  onAutoPlayNext: () => void
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [muted, setMuted] = useState(true)
  const mutedKeyRef = useRef<string | null>(null)

  const [liked, setLiked] = useState(false)
  const [likesCount, setLikesCount] = useState<number>(item.likes ?? 0)

  const { user } = useUser()
  const activeProfilePhoto = useActiveProfilePhoto()

  const isOwnItem = user?.uid === item.user
  const fallbackAvatar =
    'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&q=80&w=1780&ixlib=rb-4.0.3'
  const avatarUri = (isOwnItem ? activeProfilePhoto : null) || item.avatar || fallbackAvatar

  const [commentsVisible, setCommentsVisible] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [comments, setComments] = useState<any[]>([])
  const [replyTo, setReplyTo] = useState<{ id: string; userDisplayName?: string } | null>(null)

  // ✅ spinning disc
  const spinningAnim = useRef(new Animated.Value(0)).current
  const spinLoopRef = useRef<Animated.CompositeAnimation | null>(null)

  useEffect(() => {
    if (active) {
      spinLoopRef.current?.stop()
      spinLoopRef.current = Animated.loop(
        Animated.timing(spinningAnim, {
          toValue: 1,
          duration: 4000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      )
      spinLoopRef.current.start()
    } else {
      spinLoopRef.current?.stop()
      spinningAnim.setValue(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  const spin = spinningAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  useEffect(() => setLikesCount(item.likes ?? 0), [item.likes])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const key = await getProfileScopedKey('socialSettings:reelsMuted')
        if (!alive) return
        mutedKeyRef.current = key
        const raw = await AsyncStorage.getItem(key)
        if (!alive) return
        if (raw == null) return
        if (raw === 'true') setMuted(true)
        else if (raw === 'false') setMuted(false)
        else {
          try {
            const parsed = JSON.parse(raw)
            if (typeof parsed === 'boolean') setMuted(parsed)
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const key = mutedKeyRef.current
    if (!key) return
    try {
      void AsyncStorage.setItem(key, JSON.stringify(muted))
    } catch {
      // ignore
    }
  }, [muted])

  const handleLike = useCallback(async () => {
    const next = !liked
    setLiked(next)
    setLikesCount((c) => (next ? c + 1 : Math.max(0, c - 1)))

    if (item.docId) {
      try {
        const reviewRef = doc(firestore, 'reviews', String(item.docId))
        const delta = next ? 1 : -1
        await updateDoc(reviewRef, {
          likes: increment(delta),
          updatedAt: serverTimestamp(),
        })
      } catch (err) {
        console.warn('Failed to persist like', err)
      }
    }

    try {
      void logInteraction({
        type: 'like',
        actorId: (user as any)?.uid ?? null,
        targetId: item.id,
        targetUserId: item.user ?? null,
      })
    } catch {}
  }, [item.docId, item.id, item.user, liked, user])

  const submitComment = async () => {
    const trimmed = commentText.trim()
    if (!trimmed) return

    setCommentText('')

    if (item.docId) {
      try {
        const reviewRef = doc(firestore, 'reviews', String(item.docId))
        const commentsRef = collection(reviewRef, 'comments')
        await addDoc(commentsRef, {
          userDisplayName: (user as any)?.displayName || 'You',
          avatar: (user as any)?.photoURL ?? activeProfilePhoto ?? null,
          text: trimmed,
          spoiler: false,
          parentId: replyTo?.id ?? null,
          likesCount: 0,
          likedBy: {},
          createdAt: serverTimestamp(),
        })
        await updateDoc(reviewRef, {
          commentsCount: increment(1),
          updatedAt: serverTimestamp(),
        })
        setReplyTo(null)
      } catch (err) {
        console.warn('Failed to persist comment', err)
      }
    }

    try {
      void logInteraction({
        type: 'comment',
        actorId: (user as any)?.uid ?? null,
        targetId: item.id,
        targetUserId: item.user ?? null,
      })
    } catch {}
  }

  useEffect(() => {
    if (!commentsVisible) return
    if (!item.docId) return

    setCommentsLoading(true)
    const reviewRef = doc(firestore, 'reviews', String(item.docId))
    const commentsRef = collection(reviewRef, 'comments')
    const q = query(commentsRef, orderBy('createdAt', 'asc'), limit(250))

    const unsub = onSnapshot(
      q,
      (snap) => {
        const uid = (user as any)?.uid ? String((user as any).uid) : null
        const next = snap.docs.map((d) => {
          const data = d.data() as any
          const likedBy = data?.likedBy && typeof data.likedBy === 'object' ? data.likedBy : {}
          return {
            id: d.id,
            ...data,
            liked: uid ? !!likedBy?.[uid] : false,
            likesCount: typeof data?.likesCount === 'number' ? data.likesCount : 0,
            parentId: data?.parentId ?? null,
          }
        })
        setComments(next)
        setCommentsLoading(false)
      },
      () => {
        setComments([])
        setCommentsLoading(false)
      },
    )

    return () => {
      unsub()
    }
  }, [commentsVisible, item.docId, user])

  const threadedComments = useMemo(() => {
    const byParent = new Map<string, any[]>()
    const roots: any[] = []
    comments.forEach((c) => {
      const parent = c?.parentId ? String(c.parentId) : null
      if (!parent) roots.push(c)
      else {
        const list = byParent.get(parent) ?? []
        list.push(c)
        byParent.set(parent, list)
      }
    })
    const flattened: any[] = []
    roots.forEach((root) => {
      flattened.push({ ...root, __depth: 0 })
      const replies = byParent.get(String(root.id)) ?? []
      replies.forEach((r) => flattened.push({ ...r, __depth: 1, __parent: root.id }))
    })
    return flattened
  }, [comments])

  const toggleCommentLike = useCallback(
    async (comment: any) => {
      if (!item.docId) return
      const uid = (user as any)?.uid ? String((user as any).uid) : null
      if (!uid) return

      const nextLiked = !comment?.liked
      try {
        const reviewRef = doc(firestore, 'reviews', String(item.docId))
        const commentRef = doc(collection(reviewRef, 'comments'), String(comment.id))
        await updateDoc(commentRef, {
          likesCount: increment(nextLiked ? 1 : -1),
          [`likedBy.${uid}`]: nextLiked ? true : deleteField(),
        } as any)
      } catch (err) {
        console.warn('Failed to like comment', err)
      }
    },
    [item.docId, user],
  )

  useEffect(() => {
    if (!active) return
    try {
      void logInteraction({
        type: 'reel_play',
        actorId: (user as any)?.uid ?? null,
        targetId: item.id,
        meta: { source: 'feed_reels' },
      })
    } catch {}
  }, [active, item.id, user])

  const renderDescription = (text: string) => {
    const parts = text.split(/([#@]\w+)/g)
    return (
      <Text style={styles.descriptionText} numberOfLines={2}>
        {parts.map((part, index) => {
          if (part.startsWith('#')) return <Text key={index} style={styles.hashtagText}>{part}</Text>
          if (part.startsWith('@')) return <Text key={index} style={styles.mentionText}>{part}</Text>
          return part
        })}
      </Text>
    )
  }

  // ✅ Double-tap like + heart burst
  const lastTapRef = useRef(0)
  const tapTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heartAnim = useRef(new Animated.Value(0)).current
  const [heartPos, setHeartPos] = useState({ x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2 })

  const playHeartBurst = () => {
    heartAnim.setValue(0)
    Animated.timing(heartAnim, {
      toValue: 1,
      duration: 650,
      useNativeDriver: true,
    }).start()
  }

  const heartScale = heartAnim.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0.2, 1.2, 1],
  })

  const heartOpacity = heartAnim.interpolate({
    inputRange: [0, 0.15, 0.8, 1],
    outputRange: [0, 1, 1, 0],
  })

  const handleTap = (e: GestureResponderEvent) => {
    const now = Date.now()

    if (now - lastTapRef.current < 280) {
      // double tap
      if (tapTimeout.current) {
        clearTimeout(tapTimeout.current)
        tapTimeout.current = null
      }
      lastTapRef.current = 0

      const { locationX, locationY } = e.nativeEvent
      setHeartPos({ x: locationX, y: locationY })
      if (!liked) void handleLike()
      playHeartBurst()
      return
    }

    // single tap → toggle mute after a short delay
    lastTapRef.current = now
    tapTimeout.current = setTimeout(() => {
      setMuted((m) => !m)
      tapTimeout.current = null
    }, 280)
  }

  const goToPosterProfile = () => {
    // item.user is treated as uid in your codebase
    if (!item.user) return
    router.push(`/profile?from=social-feed&userId=${encodeURIComponent(String(item.user))}`)
  }

  const hasVideo = Boolean(item.videoUrl)
  const canRenderVideo = mounted && hasVideo

  useEffect(() => {
    // Reset loading state when we unmount the heavy video surface
    if (!canRenderVideo) {
      setLoading(true)
    }
  }, [canRenderVideo])

  const handleStatusUpdate = useCallback(
    (status: any) => {
      if (!active) return
      if (status?.didJustFinish) onAutoPlayNext()
    },
    [active, onAutoPlayNext],
  )

  const handleLoadStart = useCallback(() => setLoading(true), [])
  const handleLoad = useCallback(() => setLoading(false), [])

  if (!hasVideo) {
    return (
      <View style={styles.slide}>
        <View style={styles.center}>
          <Text style={styles.errorText}>No video available</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.slide}>
      <Pressable style={StyleSheet.absoluteFill} onPress={handleTap} />

      {canRenderVideo ? (
        <Video
          source={{ uri: item.videoUrl }}
          style={styles.video}
          resizeMode="cover"
          shouldPlay={active && autoPlayReels}
          isLooping
          isMuted={muted}
          volume={muted ? 0 : 1}
          progressUpdateIntervalMillis={active ? 250 : 1000}
          onLoadStart={handleLoadStart}
          onLoad={handleLoad}
          onPlaybackStatusUpdate={handleStatusUpdate}
        />
      ) : (
        <View style={styles.videoPlaceholder} />
      )}

      {/* ❤️ heart burst */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.heartBurst,
          {
            left: heartPos.x - 48,
            top: heartPos.y - 48,
            opacity: heartOpacity,
            transform: [{ scale: heartScale }],
          },
        ]}
      >
        <Ionicons name="heart" size={96} color="#ff2d55" />
      </Animated.View>

      {loading && (
        <View style={[styles.center, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      <View style={styles.overlay} pointerEvents="box-none">
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.8)']}
          style={styles.bottomGradient}
        />

        <View style={styles.bottomContainer}>
          <View style={styles.bottomLeft}>
            <Text style={styles.usernameText}>@{item.user ?? 'unknown'}</Text>
            {renderDescription(item.title)}
            <View style={styles.musicTicker}>
              <Ionicons name="musical-notes-outline" size={16} color="#fff" />
              <Text style={styles.musicText} numberOfLines={1}>
                {item.music}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.actionsColumn}>
          {/* ✅ avatar/plus takes you to poster profile */}
          <TouchableOpacity style={styles.avatarAction} onPress={goToPosterProfile}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback} />
            )}
            <View style={styles.followPlus}>
              <Feather name="plus" size={14} color="#fff" />
            </View>
          </TouchableOpacity>

          {/* ✅ like button still works too */}
          <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={32}
              color={liked ? '#ff2d55' : '#fff'}
            />
            <Text style={styles.actionCount}>{likesCount}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={() => setCommentsVisible(true)}>
            <Ionicons name="chatbubble-outline" size={32} color="#fff" />
            <Text style={styles.actionCount}>
              {item.commentsCount ?? (item.comments?.length ?? 0)}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => Alert.alert('Share', 'Share action')}
          >
            <Ionicons name="arrow-redo-outline" size={32} color="#fff" />
            <Text style={styles.actionCount}>Share</Text>
          </TouchableOpacity>

          <Animated.View style={[styles.musicIconContainer, { transform: [{ rotate: spin }] }]}>
            <Image source={{ uri: item.avatar || undefined }} style={styles.musicIcon} />
          </Animated.View>
        </View>
      </View>

      <Modal
        visible={commentsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setCommentsVisible(false)
          setReplyTo(null)
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            onPress={() => {
              setCommentsVisible(false)
              setReplyTo(null)
            }}
          />
          <View style={styles.commentSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{item.commentsCount} Comments</Text>
              <TouchableOpacity onPress={() => setCommentsVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={threadedComments}
              keyExtractor={(c) => String(c.id)}
              renderItem={({ item: comment }) => (
                <View style={[styles.commentRow, comment.__depth ? styles.commentRowReply : undefined]}>
                  <Image source={{ uri: comment.avatar || undefined }} style={styles.commentAvatar} />
                  <View style={styles.commentTextContainer}>
                    <View style={styles.commentTopRow}>
                      <Text style={styles.commentUser}>{comment.userDisplayName}</Text>
                      <View style={styles.commentActionsInline}>
                        <TouchableOpacity
                          onPress={() => toggleCommentLike(comment)}
                          style={styles.commentLikeBtn}
                          activeOpacity={0.85}
                        >
                          <Ionicons
                            name={comment.liked ? 'heart' : 'heart-outline'}
                            size={16}
                            color={comment.liked ? '#ff2d55' : 'rgba(255,255,255,0.9)'}
                          />
                          <Text style={styles.commentLikeCount}>{comment.likesCount || 0}</Text>
                        </TouchableOpacity>
                        {comment.__depth ? null : (
                          <TouchableOpacity
                            onPress={() => setReplyTo({ id: String(comment.id), userDisplayName: comment.userDisplayName })}
                            style={styles.commentReplyBtn}
                            activeOpacity={0.85}
                          >
                            <Text style={styles.commentReplyText}>Reply</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    <Text style={styles.commentText}>{comment.text}</Text>
                  </View>
                </View>
              )}
              style={styles.commentList}
              ListEmptyComponent={
                commentsLoading ? (
                  <View style={{ paddingVertical: 24 }}>
                    <ActivityIndicator color="#fff" />
                  </View>
                ) : (
                  <Text style={{ color: 'rgba(255,255,255,0.7)', paddingVertical: 24, textAlign: 'center' }}>
                    No comments yet.
                  </Text>
                )
              }
            />

            <View style={styles.commentInputContainer}>
              <TextInput
                style={styles.commentInput}
                value={commentText}
                onChangeText={setCommentText}
                placeholder={replyTo ? `Reply to ${replyTo.userDisplayName ?? 'comment'}...` : 'Add a comment...'}
                placeholderTextColor="#888"
              />
              {replyTo ? (
                <TouchableOpacity
                  style={styles.emojiButton}
                  onPress={() => setReplyTo(null)}
                  activeOpacity={0.85}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>×</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.emojiButton}>
                  <Text>😊</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={submitComment} style={styles.sendButton}>
                <Ionicons name="arrow-up-circle" size={32} color="#7dd8ff" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}, (prev, next) => {
  if (prev.active !== next.active) return false
  if (prev.mounted !== next.mounted) return false
  if (prev.autoPlayReels !== next.autoPlayReels) return false
  const a = prev.item
  const b = next.item
  return (
    a.id === b.id &&
    a.videoUrl === b.videoUrl &&
    a.title === b.title &&
    a.user === b.user &&
    a.avatar === b.avatar &&
    a.likes === b.likes &&
    a.commentsCount === b.commentsCount &&
    a.music === b.music
  )
})

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: 'black' },
  back: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 12,
    zIndex: 20,
    padding: 8,
    borderRadius: 99,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  slide: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor: '#000' },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: { width: '100%', height: '100%' },
  videoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },

  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  bottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SCREEN_HEIGHT * 0.4,
  },
  bottomContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingBottom: Platform.OS === 'ios' ? 90 : 70,
  },
  bottomLeft: { flex: 1, gap: 12 },
  usernameText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  descriptionText: { color: '#fff', fontSize: 14 },
  hashtagText: { color: '#8ef', fontWeight: '600' },
  mentionText: { color: '#ffbde6', fontWeight: '600' },
  musicTicker: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  musicText: { color: '#fff', fontSize: 13 },

  actionsColumn: {
    position: 'absolute',
    right: 8,
    bottom: Platform.OS === 'ios' ? 90 : 70,
    width: 60,
    alignItems: 'center',
    gap: 20,
  },
  avatarAction: { alignItems: 'center', position: 'relative' },
  avatarImage: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: '#fff' },
  avatarFallback: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#e50914', borderWidth: 2, borderColor: '#fff' },
  followPlus: {
    position: 'absolute',
    bottom: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ff2d55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtn: { alignItems: 'center' },
  actionCount: { color: '#fff', marginTop: 4, fontSize: 12, fontWeight: '600' },

  musicIconContainer: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
  musicIcon: { width: 30, height: 30, borderRadius: 15 },

  heartBurst: {
    position: 'absolute',
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalBackdrop: { flex: 1, backgroundColor: 'transparent' },
  commentSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SCREEN_HEIGHT * 0.6,
    backgroundColor: '#181818',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  sheetTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  commentList: { marginTop: 10 },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10 },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#333',
    marginRight: 10,
  },
  commentTextContainer: { flex: 1, gap: 4 },
  commentTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  commentActionsInline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  commentLikeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  commentLikeCount: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700' },
  commentReplyBtn: { paddingVertical: 2, paddingHorizontal: 6 },
  commentReplyText: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '700' },
  commentUser: { color: '#aaa', fontWeight: '600', fontSize: 12 },
  commentText: { color: '#fff', fontSize: 14 },
  commentRowReply: { paddingLeft: 18, opacity: 0.98 },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#2c2c2c',
    color: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  emojiButton: { paddingHorizontal: 8 },
  sendButton: { paddingLeft: 8 },
  errorText: { color: '#fff' },
})
