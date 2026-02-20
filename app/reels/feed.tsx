import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Dimensions,
  FlatList,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native'

import { Feather } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import PagerView from 'react-native-pager-view'

import { usePromotedProducts } from '../../hooks/use-promoted-products'
import { injectAdsWithPattern } from '../../lib/ads/sequence'
import { onHeavyScreenFocus } from '../../lib/backgroundScheduler'
import { getNavPayload } from '../../lib/navPayloadCache'
import { getProfileScopedKey } from '../../lib/profileStorage'
import { useSubscription } from '../../providers/SubscriptionProvider'
import FlixyAssistant from '../components/FlixyAssistant'
import { GenreReelFeed } from './GenreReelFeed'
import { FeedReelItem, ReelItem } from './types'

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window')

export default function FeedReelsScreen() {
  const params = useLocalSearchParams()
  const router = useRouter()
  const { currentPlan } = useSubscription()
  const { products: promoted } = usePromotedProducts({ placement: 'feed', limit: 30 })

  /* -------------------------------------------------------------------------- */
  /*                                 Settings                                   */
  /* -------------------------------------------------------------------------- */
  const [autoPlayReels, setAutoPlayReels] = useState(true)
  useEffect(() => {
    let mounted = true
      ; (async () => {
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

  /* -------------------------------------------------------------------------- */
  /*                                 Audio                                      */
  /* -------------------------------------------------------------------------- */
  useEffect(() => {
    StatusBar.setHidden(true, 'fade')
    return () => StatusBar.setHidden(false, 'fade')
  }, [])

  useEffect(() => {
    // Ensure reels audio plays (including iOS silent mode).
    void (async () => {
      try {
        await Audio.setIsEnabledAsync(true)
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          interruptionModeIOS: InterruptionModeIOS.DuckOthers,
          interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        })
      } catch {
        // ignore
      }
    })()
  }, [])

  useFocusEffect(
    useCallback(() => {
      onHeavyScreenFocus('reels');
    }, [])
  );

  /* -------------------------------------------------------------------------- */
  /*                                 Queue Logic ("For You")                    */
  /* -------------------------------------------------------------------------- */
  const id = typeof params.id === 'string' ? params.id : undefined
  const list = typeof params.list === 'string' ? params.list : undefined
  const queueKey = typeof (params as any).queueKey === 'string' ? ((params as any).queueKey as string) : undefined
  const titleParam = typeof (params as any).title === 'string' ? (params as any).title : undefined
  const musicParam = typeof (params as any).music === 'string' ? (params as any).music : undefined

  const cachedQueueRef = useRef<FeedReelItem[] | null>(null)

  const queue: FeedReelItem[] = useMemo(() => {
    if (!cachedQueueRef.current && queueKey) {
      const cached = getNavPayload<unknown>(queueKey)
      if (Array.isArray(cached)) cachedQueueRef.current = cached as FeedReelItem[]
    }

    if (cachedQueueRef.current && cachedQueueRef.current.length > 0) {
      return cachedQueueRef.current.map((it: any, index: number) => ({
        id: String(it.id ?? it.docId ?? index),
        mediaType: it.mediaType || 'feed',
        title: it.title || 'Reel',
        videoUrl: it.videoUrl || null,
        coverUrl: it.coverUrl || null,
        liveStreamId: it.liveStreamId || null,
        avatar: it.avatar || null,
        userId: it.userId ? String(it.userId) : null,
        username: it.username ?? it.user ?? null,
        docId: it.docId ?? null,
        likes: it.likes ?? 0,
        comments: it.comments ?? [],
        commentsCount: it.commentsCount ?? (it.comments ? it.comments.length : 0),
        likerAvatars: it.likerAvatars ?? [],
        music: it.music ?? `Original Sound - ${it.username ?? it.user ?? 'Unknown'}`,
      }))
    }

    if (typeof list === 'string' && list.length > 0) {
      try {
        const parsed = JSON.parse(decodeURIComponent(list))
        if (Array.isArray(parsed)) {
          return parsed.map((it: any, index: number) => ({
            id: String(it.id ?? it.docId ?? index),
            mediaType: it.mediaType || 'feed',
            title: it.title || 'Reel',
            videoUrl: it.videoUrl || null,
            coverUrl: it.coverUrl || null,
            liveStreamId: it.liveStreamId || null,
            avatar: it.avatar || null,
            userId: it.userId ? String(it.userId) : null,
            username: it.username ?? it.user ?? null,
            user: it.user ?? null,
            docId: it.docId ?? null,
            likes: it.likes ?? 0,
            comments: it.comments ?? [],
            commentsCount: it.commentsCount ?? (it.comments ? it.comments.length : 0),
            likerAvatars: it.likerAvatars ?? [],
            music: it.music ?? `Original Sound - ${it.username ?? it.user ?? 'Unknown'}`,
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
  }, [queueKey, list, id, titleParam, musicParam])

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


  /* -------------------------------------------------------------------------- */
  /*                                 Genre Paging                               */
  /* -------------------------------------------------------------------------- */
  const GENRES = ['For You', 'Action', 'Comedy', 'Horror', 'Sci-Fi', 'Thriller', 'Drama', 'Romance', 'Animation', 'Adventure'];
  const [selectedPage, setSelectedPage] = useState(0);
  const pagerRef = useRef<PagerView>(null);
  const genresListRef = useRef<FlatList>(null);

  const handlePageSelected = useCallback((e: any) => {
    const idx = e.nativeEvent.position;
    setSelectedPage(idx);
    // Scroll tabs to center the active genre
    genresListRef.current?.scrollToIndex({
      index: idx,
      animated: true,
      viewPosition: 0.5
    });
  }, []);

  const handleTabPress = useCallback((index: number) => {
    pagerRef.current?.setPage(index);
    // State update will happen via onPageSelected
  }, []);

  return (
    <View style={styles.wrapper}>
      <PagerView
        style={styles.pager}
        initialPage={0}
        onPageSelected={handlePageSelected}
        ref={pagerRef}
        orientation="horizontal"
      >
        {GENRES.map((genre, index) => (
          <View key={genre} style={styles.page}>
            <GenreReelFeed
              genre={genre}
              isActive={selectedPage === index}
              initialItems={index === 0 ? queueWithAds : undefined}
              autoPlayReels={autoPlayReels}
            />
          </View>
        ))}
      </PagerView>

      <TouchableOpacity style={styles.back} onPress={() => router.back()}>
        <Feather name="chevron-left" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Genre Tabs Overlay */}
      <View style={styles.genreTabsContainer}>
        <FlatList
          ref={genresListRef}
          horizontal
          data={GENRES}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.genreList}
          renderItem={({ item, index }) => {
            const isActive = selectedPage === index;
            return (
              <TouchableOpacity
                onPress={() => handleTabPress(index)}
                style={[styles.genreChip, isActive && styles.genreChipActive]}
              >
                {isActive && (
                  <LinearGradient
                    colors={['#e50914', '#b81d24']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                )}
                <Text style={[styles.genreText, isActive && styles.genreTextActive]}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          }}
          onScrollToIndexFailed={() => {
            // Safe fail
          }}
        />
      </View>

      {/* Flixy Assistant */}
      <FlixyAssistant screen="socialFeed" position="bottom-right" />
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: 'black' },
  pager: { flex: 1 },
  page: { flex: 1 },
  back: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 12,
    zIndex: 25,
    padding: 8,
    borderRadius: 99,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  genreTabsContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 60, // Leave room for back button
    right: 0,
    height: 40,
    zIndex: 20,
  },
  genreList: {
    paddingHorizontal: 10,
    paddingRight: 40,
    alignItems: 'center'
  },
  genreChip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginRight: 8,
    overflow: 'hidden',
    justifyContent: 'center'
  },
  genreChipActive: {
    backgroundColor: '#e50914',
    borderColor: '#e50914',
    borderWidth: 0,
  },
  genreText: {
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    fontSize: 14,
  },
  genreTextActive: {
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 2,
  },
})
