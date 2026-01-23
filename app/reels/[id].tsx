// app/reels/[...]/player.tsx (or wherever your ReelPlayerScreen lives)
// ✅ Fixes Maximum update depth issues (stable params + safe index sync)
// ✅ Adds double-tap like + heart burst
// ✅ Single tap toggles mute
// ✅ Adds right-side avatar + plus button that navigates to the poster profile screen
//    (expects posterUserId/posterAvatar/posterName in the list payload; falls back gracefully)

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Alert,
  FlatList,
  StatusBar,
  Pressable,
  Animated,
  Easing,
  Image,
  ViewToken,
  Platform,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import YoutubePlayer from 'react-native-youtube-iframe'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { API_BASE_URL, API_KEY } from '../../constants/api'
import { getAccentFromPosterPath } from '../../constants/theme'
import { useUser } from '../../hooks/use-user'
import { useActiveProfilePhoto } from '../../hooks/use-active-profile-photo'

type VideoResult = {
  key: string
  site: string
  type: string
  name: string
}

type ReelItem = {
  id: number
  mediaType: string
  title: string
  posterPath?: string | null

  // ✅ poster profile navigation (optional)
  posterUserId?: string | null
  posterAvatar?: string | null
  posterName?: string | null

  // (optional display stats; not persisted here)
  likes?: number
}

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window')

// We keep 16:9 but crop horizontally inside a 9:16 fullscreen container
const VIDEO_HEIGHT = SCREEN_HEIGHT
const VIDEO_WIDTH = (SCREEN_HEIGHT * 16) / 9

const FALLBACK_AVATAR =
  'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&q=80&w=1780&ixlib=rb-4.0.3'

const ReelPlayerScreen = () => {
  const router = useRouter()
  const params = useLocalSearchParams()

  // ✅ Extract stable primitives (prevents “queue changes every render” loops)
  const id = typeof params.id === 'string' ? params.id : undefined
  const mediaType = typeof params.mediaType === 'string' ? params.mediaType : undefined
  const title = typeof params.title === 'string' ? params.title : undefined
  const list = typeof params.list === 'string' ? params.list : undefined

  // Hide status bar for full immersive feel
  useEffect(() => {
    StatusBar.setHidden(true, 'fade')
    return () => StatusBar.setHidden(false, 'fade')
  }, [])

  const queue: ReelItem[] = useMemo(() => {
    if (typeof list === 'string' && list.length > 0) {
      try {
        const parsed = JSON.parse(decodeURIComponent(list))
        if (Array.isArray(parsed)) {
          return parsed.slice(0, 30).map((it: any) => ({
            id: Number(it.id),
            mediaType: String(it.mediaType || it.media_type || 'movie'),
            title: String(it.title || it.name || 'Reel'),
            posterPath: it.posterPath || it.poster_path || null,

            // ✅ optional poster fields from list
            posterUserId: typeof it.posterUserId === 'string' ? it.posterUserId : null,
            posterAvatar: typeof it.posterAvatar === 'string' ? it.posterAvatar : null,
            posterName: typeof it.posterName === 'string' ? it.posterName : null,

            likes: typeof it.likes === 'number' ? it.likes : 0,
          }))
        }
      } catch (e) {
        console.warn('Failed to parse reel queue', e)
      }
    }

    if (id && mediaType) {
      return [
        {
          id: Number(id),
          mediaType: String(mediaType),
          title: String(title || 'Reel'),
          posterPath: null,
          posterUserId: null,
          posterAvatar: null,
          posterName: null,
          likes: 0,
        },
      ]
    }

    return []
  }, [id, mediaType, title, list])

  const initialIndex = useMemo(() => {
    const idx = queue.findIndex((it) => String(it.id) === String(id))
    return idx >= 0 ? idx : 0
  }, [queue, id])

  const [currentIndex, setCurrentIndex] = useState(initialIndex)

  // ✅ Only update if it actually changed (prevents extra renders)
  useEffect(() => {
    setCurrentIndex((prev) => (prev === initialIndex ? prev : initialIndex))
  }, [initialIndex])

  const listRef = useRef<FlatList<ReelItem> | null>(null)
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<ViewToken> }) => {
    const first = viewableItems?.[0]?.index
    if (typeof first === 'number') setCurrentIndex(first)
  }).current

  const currentItem = queue[currentIndex]
  const accentColor = getAccentFromPosterPath(currentItem?.posterPath)

  const openDetails = useCallback(() => {
    if (!currentItem) return
    router.replace(`/details/${currentItem.id}?mediaType=${currentItem.mediaType}`)
  }, [currentItem, router])

  return (
    <View style={styles.wrapper}>
      <LinearGradient colors={[accentColor, 'rgba(5,6,15,0.6)']} style={StyleSheet.absoluteFillObject} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.title} numberOfLines={1}>
          {currentItem?.title || 'Reel'}
        </Text>

        <TouchableOpacity onPress={openDetails} style={styles.moreButton}>
          <Ionicons name="open-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        style={{ flex: 1 }}
        data={queue}
        keyExtractor={(item) => String(item.id)}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToAlignment="start"
        decelerationRate="fast"
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        getItemLayout={(_, index) => ({
          length: SCREEN_HEIGHT,
          offset: SCREEN_HEIGHT * index,
          index,
        })}
        initialScrollIndex={initialIndex}
        renderItem={({ item, index }) => (
          <ReelSlide
            item={item}
            active={index === currentIndex}
            onOpenDetails={openDetails}
            onAutoPlayNext={() => {
              const nextIndex = index + 1
              if (index === currentIndex && nextIndex < queue.length) {
                setCurrentIndex(nextIndex)
                listRef.current?.scrollToIndex({ index: nextIndex, animated: true })
              }
            }}
          />
        )}
      />
    </View>
  )
}

const ReelSlide = ({
  item,
  active,
  onOpenDetails,
  onAutoPlayNext,
}: {
  item: ReelItem
  active: boolean
  onOpenDetails: () => void
  onAutoPlayNext: () => void
}) => {
  const router = useRouter()
  const playerRef = useRef<any>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [videoKey, setVideoKey] = useState<string | null>(null)

  const [muted, setMuted] = useState(true)
  const [playing, setPlaying] = useState(false)

  // ✅ Double tap like
  const [liked, setLiked] = useState(false)
  const [likesCount, setLikesCount] = useState<number>(item.likes ?? 0)
  const likedRef = useRef(false)

  useEffect(() => {
    setLikesCount(item.likes ?? 0)
  }, [item.likes])

  useEffect(() => {
    likedRef.current = liked
  }, [liked])

  // ✅ heart burst animation
  const heartAnim = useRef(new Animated.Value(0)).current
  const [heartPos, setHeartPos] = useState({ x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2 })

  const heartScale = heartAnim.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0.2, 1.2, 1],
  })
  const heartOpacity = heartAnim.interpolate({
    inputRange: [0, 0.15, 0.85, 1],
    outputRange: [0, 1, 1, 0],
  })

  const playHeart = () => {
    heartAnim.stopAnimation()
    heartAnim.setValue(0)
    Animated.timing(heartAnim, {
      toValue: 1,
      duration: 650,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start()
  }

  const lastTapRef = useRef(0)
  const tapTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleTap = (e: any) => {
    const now = Date.now()

    if (now - lastTapRef.current < 280) {
      if (tapTimeout.current) clearTimeout(tapTimeout.current)
      tapTimeout.current = null
      lastTapRef.current = 0

      const { locationX, locationY } = e.nativeEvent
      setHeartPos({ x: locationX, y: locationY })

      if (!likedRef.current) {
        likedRef.current = true
        setLiked(true)
        setLikesCount((c) => c + 1)
      }
      playHeart()
      return
    }

    lastTapRef.current = now
    tapTimeout.current = setTimeout(() => {
      setMuted((m) => !m)
      tapTimeout.current = null
    }, 280)
  }

  // ✅ Avatar resolution like profile screen for own items
  const { user } = useUser()
  const activeProfilePhoto = useActiveProfilePhoto()
  const isOwnPoster = !!user?.uid && !!item.posterUserId && user.uid === item.posterUserId

  const avatarUri = (isOwnPoster ? activeProfilePhoto : null) || item.posterAvatar || FALLBACK_AVATAR

  const goToPosterProfile = () => {
    if (!item.posterUserId) return
    router.push(`/profile?from=social-feed&userId=${encodeURIComponent(String(item.posterUserId))}`)
  }

  useEffect(() => {
    let mounted = true

    const fetchVideos = async () => {
      setLoading(true)
      setError(null)
      setVideoKey(null)
      setPlaying(false)

      try {
        const res = await fetch(`${API_BASE_URL}/${item.mediaType}/${item.id}/videos?api_key=${API_KEY}`)
        const json = await res.json()
        const results: VideoResult[] = json?.results || []

        const trailer =
          results.find((v) => v.site === 'YouTube' && v.type === 'Trailer') ||
          results.find((v) => v.site === 'YouTube' && v.type === 'Teaser') ||
          results.find((v) => v.site === 'YouTube')

        if (!mounted) return

        if (!trailer?.key) {
          setError('No trailer available for this title.')
          setVideoKey(null)
        } else {
          setVideoKey(trailer.key)
        }
      } catch (e) {
        console.error('Failed to load reel video', e)
        if (mounted) setError('Unable to load trailer. Try again later.')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchVideos()
    return () => {
      mounted = false
    }
  }, [item.id, item.mediaType])

  useEffect(() => {
    if (active && videoKey && !loading && !error) {
      setMuted(true)
      setPlaying(true)
    } else {
      setPlaying(false)
    }
  }, [active, videoKey, loading, error])

  const onError = () => {
    Alert.alert('Playback issue', 'Trouble loading the trailer. Redirecting to details.', [
      { text: 'Go to details', onPress: onOpenDetails },
      { text: 'Close', style: 'cancel' },
    ])
  }

  return (
    <View style={styles.slide}>
      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#e50914" />
          <Text style={styles.metaText}>Loading trailer...</Text>
        </View>
      )}

      {!loading && error && (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={onOpenDetails} style={styles.fallbackBtn}>
            <Text style={styles.fallbackText}>Open details</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && videoKey && (
        <View style={styles.playerFrame}>
          {/* ✅ Single tap = mute/unmute, Double tap = like */}
          <Pressable style={StyleSheet.absoluteFill} onPress={handleTap} />

          <View style={styles.portraitVideoWrap}>
            <YoutubePlayer
              ref={playerRef}
              height={VIDEO_HEIGHT}
              width={VIDEO_WIDTH}
              play={playing}
              mute={muted}
              videoId={videoKey}
              forceAndroidAutoplay
              onReady={() => {
                try {
                  playerRef.current?.playVideo?.()
                } catch {}
              }}
              onError={onError}
              onChangeState={(state: string) => {
                if (state === 'ended') onAutoPlayNext()
              }}
              initialPlayerParams={{
                controls: 0,
                modestbranding: true,
                rel: false,
                showinfo: false,
                playsinline: true,
                loop: true,
                playlist: videoKey || undefined,
                // @ts-ignore
                autoplay: 1,
              }}
              webViewStyle={styles.portraitWebview}
              webViewProps={{
                allowsInlineMediaPlayback: true,
                mediaPlaybackRequiresUserAction: false,
                javaScriptEnabled: true,
                injectedJavaScript: `
                  (function() {
                    const style = document.createElement('style');
                    style.innerHTML = '
                      .ytp-cued-thumbnail-overlay-image,
                      .ytp-large-play-button,
                      .ytp-pause-overlay {
                        display: none !important;
                        opacity: 0 !important;
                      }
                    ';
                    document.head.appendChild(style);
                  })();
                  true;
                `,
              }}
            />
          </View>

          {/* ✅ Heart burst */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: heartPos.x - 48,
              top: heartPos.y - 48,
              opacity: heartOpacity,
              transform: [{ scale: heartScale }],
            }}
          >
            <Ionicons name="heart" size={96} color="#ff2d55" />
          </Animated.View>

          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)', 'rgba(5,6,15,0.85)']}
            locations={[0, 0.55, 1]}
            style={styles.bottomGradient}
            pointerEvents="none"
          />

          {/* ✅ Right-side actions (avatar + plus + like count) */}
          <View style={styles.rightColumn} pointerEvents="box-none">
            <TouchableOpacity style={styles.avatarAction} onPress={goToPosterProfile} activeOpacity={0.85}>
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              <TouchableOpacity
                style={styles.followPlus}
                onPress={goToPosterProfile}
                activeOpacity={0.85}
              >
                <Ionicons name="add" size={16} color="#fff" />
              </TouchableOpacity>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => {
                // single-tap heart button also likes
                if (!likedRef.current) {
                  likedRef.current = true
                  setLiked(true)
                  setLikesCount((c) => c + 1)
                } else {
                  // optional: allow unlike
                  likedRef.current = false
                  setLiked(false)
                  setLikesCount((c) => Math.max(0, c - 1))
                }
              }}
              activeOpacity={0.85}
            >
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={34} color={liked ? '#ff2d55' : '#fff'} />
              <Text style={styles.actionCount}>{likesCount}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={onOpenDetails} activeOpacity={0.85}>
              <Ionicons name="information-circle-outline" size={34} color="#fff" />
              <Text style={styles.actionCount}>Info</Text>
            </TouchableOpacity>
          </View>

          {/* ✅ Bottom meta */}
          <View style={styles.metaOverlay} pointerEvents="none">
            <Text style={styles.metaTitle} numberOfLines={2}>
              {item.title || 'Reel'}
            </Text>
            <View style={styles.metaRow}>
              <View style={styles.tag}>
                <Text style={styles.tagText}>{item.mediaType === 'tv' ? 'Series' : 'Movie'}</Text>
              </View>
              <View style={[styles.tag, styles.accentTag]}>
                <Text style={styles.tagText}>Trailer</Text>
              </View>
              {!muted ? (
                <View style={[styles.tag, styles.audioTag]}>
                  <Ionicons name="volume-high" size={14} color="#fff" />
                  <Text style={[styles.tagText, { marginLeft: 6 }]}>Sound</Text>
                </View>
              ) : (
                <View style={[styles.tag, styles.audioTag]}>
                  <Ionicons name="volume-mute" size={14} color="#fff" />
                  <Text style={[styles.tagText, { marginLeft: 6 }]}>Muted</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: 'black',
  },
  header: {
    position: 'absolute',
    top: 18,
    left: 12,
    right: 12,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  moreButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
    marginHorizontal: 10,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  slide: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  playerFrame: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    overflow: 'hidden',
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  portraitVideoWrap: {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portraitWebview: {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    alignSelf: 'center',
  },
  bottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 240,
  },
  metaOverlay: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 34,
    left: 18,
    right: 92,
    gap: 12,
  },
  metaTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  accentTag: {
    backgroundColor: 'rgba(229,9,20,0.25)',
    borderColor: 'rgba(229,9,20,0.45)',
  },
  audioTag: {
    backgroundColor: 'rgba(125,216,255,0.14)',
    borderColor: 'rgba(125,216,255,0.28)',
  },
  tagText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  metaText: {
    color: '#e6e6e6',
    marginTop: 12,
  },
  errorText: {
    color: '#ffb3b3',
    textAlign: 'center',
    fontSize: 15,
    marginBottom: 12,
  },
  fallbackBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#e50914',
    borderRadius: 12,
  },
  fallbackText: {
    color: '#fff',
    fontWeight: '700',
  },

  // ✅ Right column actions
  rightColumn: {
    position: 'absolute',
    right: 10,
    bottom: Platform.OS === 'ios' ? 92 : 80,
    width: 70,
    alignItems: 'center',
    gap: 20,
  },
  avatarAction: { alignItems: 'center', position: 'relative' },
  avatarImage: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#222',
  },
  followPlus: {
    position: 'absolute',
    bottom: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ff2d55',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  actionBtn: { alignItems: 'center' },
  actionCount: { color: '#fff', marginTop: 6, fontSize: 12, fontWeight: '700' },
})

export default ReelPlayerScreen
