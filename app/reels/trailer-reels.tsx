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
import { Video, ResizeMode } from 'expo-av'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  addDoc,
  collection,
  doc,
  increment,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { firestore } from '../../constants/firebase'
import { useActiveProfilePhoto } from '../../hooks/use-active-profile-photo'
import { useUser } from '../../hooks/use-user'
import { getProfileScopedKey } from '../../lib/profileStorage'

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window')

type TrailerReelItem = {
  id: string
  mediaType?: string
  title: string
  videoUrl?: string | null
  avatar?: string | null
  user?: string | null
  likes?: number
  comments?: any[]
  commentsCount?: number
  likerAvatars?: string[]
  music?: string | null
  movieData?: any // Store movie data for navigation
}

export default function TrailerReelsScreen() {
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

  // Extract parameters
  const id = typeof params.id === 'string' ? params.id : undefined
  const list = typeof params.list === 'string' ? params.list : undefined
  const titleParam = typeof (params as any).title === 'string' ? (params as any).title : undefined
  const startIndex = typeof (params as any).startIndex === 'string' ? parseInt((params as any).startIndex, 10) : 0

  useEffect(() => {
    StatusBar.setHidden(true, 'fade')
    return () => StatusBar.setHidden(false, 'fade')
  }, [])

  const queue: TrailerReelItem[] = useMemo(() => {
    if (typeof list === 'string' && list.length > 0) {
      try {
        const parsed = JSON.parse(decodeURIComponent(list))
        if (Array.isArray(parsed)) {
          return parsed.map((item: any) => ({
            id: String(item.id ?? `trailer-${Date.now()}`),
            mediaType: item.mediaType || 'trailer',
            title: item.title || 'Movie Trailer',
            videoUrl: item.videoUrl || null,
            avatar: item.avatar || null,
            user: item.user || 'MovieFlix',
            likes: item.likes ?? 0,
            comments: item.comments ?? [],
            commentsCount: item.commentsCount ?? 0,
            likerAvatars: item.likerAvatars ?? [],
            music: item.music ?? 'Movie Soundtrack',
            movieData: item.movieData,
          }))
        }
      } catch (e) {
        console.warn('Failed to parse trailer queue', e)
      }
    }

    return []
  }, [list])

  const initialIndex = useMemo(() => {
    return Math.max(0, Math.min(startIndex, queue.length - 1))
  }, [queue, startIndex])

  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [items, setItems] = useState<TrailerReelItem[]>(queue)

  useEffect(() => {
    setItems(queue)
  }, [queue])

  useEffect(() => {
    setCurrentIndex(initialIndex)
  }, [initialIndex])

  const listRef = useRef<FlatList<TrailerReelItem>>(null)
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<ViewToken> }) => {
      const first = viewableItems?.[0]?.index
      if (typeof first === 'number') setCurrentIndex(first)
    }
  ).current

  return (
    <View style={styles.wrapper}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(it) => String(it.id)}
        renderItem={({ item, index }) => (
          <TrailerSlide
            item={item}
            active={index === currentIndex}
            autoPlayReels={autoPlayReels}
            onAutoPlayNext={() => {
              const next = index + 1
              if (index === currentIndex && next < items.length) {
                setCurrentIndex(next)
                listRef.current?.scrollToIndex({ index: next, animated: true })
              }
            }}
          />
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToAlignment="start"
        decelerationRate="fast"
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        getItemLayout={(_, idx) => ({
          length: SCREEN_HEIGHT,
          offset: SCREEN_HEIGHT * idx,
          index: idx,
        })}
        initialScrollIndex={initialIndex}
      />

      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Feather name="chevron-left" size={28} color="#fff" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {titleParam || 'Movie Trailers'}
          </Text>
        </View>

        <View style={styles.headerRight} />
      </View>

      {/* Progress indicators */}
      <View style={styles.progressContainer}>
        {items.map((_, index) => (
          <View
            key={index}
            style={[
              styles.progressBar,
              {
                backgroundColor: index === currentIndex ? '#e50914' : 'rgba(255,255,255,0.3)',
                flex: index === currentIndex ? 2 : 1,
              }
            ]}
          />
        ))}
      </View>
    </View>
  )
}

const TrailerSlide = React.memo(function TrailerSlide({
  item,
  active,
  autoPlayReels,
  onAutoPlayNext,
}: {
  item: TrailerReelItem
  active: boolean
  autoPlayReels: boolean
  onAutoPlayNext: () => void
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [muted, setMuted] = useState(true)
  const [liked, setLiked] = useState(false)

  const { user } = useUser()
  const activeProfilePhoto = useActiveProfilePhoto()

  // Memoize derived values
  const fallbackAvatar = React.useMemo(() =>
    item.avatar || 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&q=80&w=1780&ixlib=rb-4.0.3',
    [item.avatar]
  )

  const likesCount = React.useMemo(() => item.likes ?? 0, [item.likes])

  // Spinning disc animation
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
  }, [active])

  const spin = React.useMemo(() =>
    spinningAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg'],
    }),
    [spinningAnim]
  )

  // Memoize callbacks
  const handleLike = useCallback(async () => {
    setLiked(prev => !prev)
    // Removed likes count update to avoid re-renders
  }, [])

  // Double tap to like
  const lastTapRef = useRef(0)
  const tapTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heartAnim = useRef(new Animated.Value(0)).current
  const [heartPos, setHeartPos] = useState({ x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2 })

  const playHeartBurst = useCallback(() => {
    heartAnim.setValue(0)
    Animated.timing(heartAnim, {
      toValue: 1,
      duration: 650,
      useNativeDriver: true,
    }).start()
  }, [heartAnim])

  const heartScale = React.useMemo(() =>
    heartAnim.interpolate({
      inputRange: [0, 0.35, 1],
      outputRange: [0.2, 1.2, 1],
    }),
    [heartAnim]
  )

  const heartOpacity = React.useMemo(() =>
    heartAnim.interpolate({
      inputRange: [0, 0.15, 0.8, 1],
      outputRange: [0, 1, 1, 0],
    }),
    [heartAnim]
  )

  const handleTap = useCallback((e: GestureResponderEvent) => {
    const now = Date.now()

    if (now - lastTapRef.current < 280) {
      // Double tap
      if (tapTimeout.current) {
        clearTimeout(tapTimeout.current)
        tapTimeout.current = null
      }
      lastTapRef.current = 0

      const { locationX, locationY } = e.nativeEvent
      setHeartPos({ x: locationX, y: locationY })
      if (!liked) {
        setLiked(true)
        playHeartBurst()
      }
      return
    }

    // Single tap → toggle mute
    lastTapRef.current = now
    tapTimeout.current = setTimeout(() => {
      setMuted((m) => !m)
      tapTimeout.current = null
    }, 280)
  }, [liked, playHeartBurst])

  const goToMovieDetails = useCallback(() => {
    if (item.movieData?.id) {
      const mediaType = item.movieData.media_type || 'movie'
      router.push(`/details/${item.movieData.id}?mediaType=${mediaType}`)
    }
  }, [item.movieData, router])

  // Early return for missing video
  if (!item.videoUrl) {
    return (
      <View style={styles.slide}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Trailer not available</Text>
          <TouchableOpacity style={styles.retryButton} onPress={goToMovieDetails}>
            <Text style={styles.retryText}>View Movie Details</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.slide}>
      <Pressable style={StyleSheet.absoluteFill} onPress={handleTap} />

      <Video
        source={{ uri: item.videoUrl }}
        style={styles.video}
        resizeMode={ResizeMode.COVER}
        shouldPlay={active && autoPlayReels}
        isLooping
        isMuted={muted}
        onLoadStart={() => setLoading(true)}
        onLoad={() => setLoading(false)}
        onPlaybackStatusUpdate={(status: any) => {
          if (status?.didJustFinish) onAutoPlayNext()
        }}
      />

      {/* Heart burst animation */}
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
          <Text style={styles.loadingText}>Loading trailer...</Text>
        </View>
      )}

      <View style={styles.overlay} pointerEvents="box-none">
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.8)']}
          style={styles.bottomGradient}
        />

        <View style={styles.bottomContainer}>
          <View style={styles.bottomLeft}>
            <TouchableOpacity style={styles.movieButton} onPress={goToMovieDetails}>
              <View style={styles.movieInfo}>
                <Text style={styles.movieTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <View style={styles.movieMeta}>
                  <Ionicons name="play-circle" size={16} color="#e50914" />
                  <Text style={styles.movieMetaText}>Watch Full Movie</Text>
                </View>
              </View>
            </TouchableOpacity>

            <View style={styles.musicTicker}>
              <Ionicons name="musical-notes-outline" size={16} color="#fff" />
              <Text style={styles.musicText} numberOfLines={1}>
                {item.music}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.actionsColumn}>
          {/* Movie poster/avatar */}
          <TouchableOpacity style={styles.avatarAction} onPress={goToMovieDetails}>
            {fallbackAvatar ? (
              <Image source={{ uri: fallbackAvatar }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                <Ionicons name="film-outline" size={24} color="#fff" />
              </View>
            )}
          </TouchableOpacity>

          {/* Like button */}
          <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={32}
              color={liked ? '#ff2d55' : '#fff'}
            />
            <Text style={styles.actionCount}>{likesCount}</Text>
          </TouchableOpacity>

          {/* Share button */}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => Alert.alert('Share', 'Share trailer')}
          >
            <Ionicons name="arrow-redo-outline" size={32} color="#fff" />
            <Text style={styles.actionCount}>Share</Text>
          </TouchableOpacity>

          {/* Sound button */}
          <TouchableOpacity style={styles.actionBtn} onPress={() => setMuted(!muted)}>
            <Ionicons
              name={muted ? "volume-mute-outline" : "volume-high-outline"}
              size={32}
              color="#fff"
            />
          </TouchableOpacity>

          {/* Spinning music disc */}
          <Animated.View style={[styles.musicIconContainer, { transform: [{ rotate: spin }] }]}>
            <Image source={{ uri: fallbackAvatar }} style={styles.musicIcon} />
          </Animated.View>
        </View>
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: 'black' },
  header: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  headerRight: {
    width: 40,
  },
  progressContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 70,
    left: 16,
    right: 16,
    height: 2,
    flexDirection: 'row',
    gap: 2,
    zIndex: 20,
  },
  progressBar: {
    height: '100%',
    borderRadius: 1,
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
  errorText: { color: '#fff', fontSize: 16, marginBottom: 16 },
  retryButton: {
    backgroundColor: '#e50914',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: '#fff', fontWeight: '600' },
  loadingText: { color: '#fff', fontSize: 14, marginTop: 8 },

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
    paddingBottom: Platform.OS === 'ios' ? 120 : 100,
  },
  bottomLeft: { flex: 1, gap: 12 },
  movieButton: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  movieInfo: {
    gap: 4,
  },
  movieTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  movieMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  movieMetaText: {
    color: '#e50914',
    fontSize: 14,
    fontWeight: '600',
  },
  musicTicker: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  musicText: { color: '#fff', fontSize: 13 },

  actionsColumn: {
    position: 'absolute',
    right: 8,
    bottom: Platform.OS === 'ios' ? 120 : 100,
    width: 60,
    alignItems: 'center',
    gap: 20,
  },
  avatarAction: { alignItems: 'center', position: 'relative' },
  avatarImage: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: '#fff' },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#e50914',
    borderWidth: 2,
    borderColor: '#fff',
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
})
