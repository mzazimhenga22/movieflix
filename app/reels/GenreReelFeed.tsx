import { useRouter } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
    ActivityIndicator,
    Dimensions,
    FlatList,
    Platform,
    StyleSheet,
    View,
    ViewToken
} from 'react-native'

import ReelAdSlide from '../../components/ads/ReelAdSlide'
import { usePromotedProducts } from '../../hooks/use-promoted-products'
import { trackPromotionClick, trackPromotionImpression } from '../marketplace/api'
import { FeedSlide } from './FeedSlide'
import { FeedReelItem, ReelItem } from './types'

import { fetchMoreInBackground, getCachedClips, prefetchGenre, type CachedClip } from '../../lib/reelsPrefetchCache'
import { browseClipCafeGenreMoviesLazy, searchClipCafe } from '../../src/providers/shortclips'

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window')

interface GenreReelFeedProps {
    genre: string
    isActive: boolean
    autoPlayReels: boolean
    initialItems?: ReelItem[]
}

export const GenreReelFeed = React.memo(function GenreReelFeed({
    genre,
    isActive,
    autoPlayReels,
    initialItems
}: GenreReelFeedProps) {
    const router = useRouter()
    const { products: promoted } = usePromotedProducts({ placement: 'feed', limit: 30 })

    const [items, setItems] = useState<ReelItem[]>(initialItems || [])
    const [loading, setLoading] = useState(!initialItems?.length)
    const [currentIndex, setCurrentIndex] = useState(0)
    const currentIndexRef = useRef(0)
    const listRef = useRef<FlatList<ReelItem>>(null)

    // Track if we have already fetched for this genre to avoid duplicate fetches on re-mount if kept in memory
    const hasFetchedRef = useRef(!!initialItems?.length)

    // Type guard for FeedReelItem
    const isFeedItem = (item: ReelItem): item is FeedReelItem => {
        return (item as any).type !== 'ad';
    }

    const mapClipsToFeedItems = useCallback((clips: (CachedClip | any)[], genreSlug: string): FeedReelItem[] => {
        return clips.map((clip, idx) => ({
            id: clip.id || `genre-${genreSlug}-${idx}-${Date.now()}`,
            mediaType: 'clip',
            title: clip.title || `${genreSlug} Clip`,
            videoUrl: clip.url,
            coverUrl: null,
            liveStreamId: null,
            avatar: null,
            userId: 'clip.cafe',
            username: 'MovieFlix',
            user: 'MovieFlix',
            likes: Math.floor(Math.random() * 200) + 10,
            comments: [],
            commentsCount: 0,
            likerAvatars: [],
            music: 'Movie Sound',
            headers: clip.headers
        }));
    }, []);

    const resolvedIndicesRef = useRef<Set<string>>(new Set())

    // Reset resolved set when genre changes
    useEffect(() => {
        resolvedIndicesRef.current.clear()
    }, [genre])

    useEffect(() => {
        // If we have initial items (e.g. For You), we don't need to fetch by genre
        if (initialItems && initialItems.length > 0) {
            setItems(initialItems)
            setLoading(false)
            return
        }

        if (hasFetchedRef.current) return;

        const genreSlug = genre.toLowerCase()

        const fetchGenre = async () => {
            try {
                setLoading(true)

                // 1. Check cache
                const cachedClips = getCachedClips(genreSlug)
                if (cachedClips.length > 0) {
                    const mapped = mapClipsToFeedItems(cachedClips, genreSlug)
                    setItems(mapped)
                    setLoading(false)
                    fetchMoreInBackground(genreSlug)
                    return
                }

                // 2. Prefetch/Fetch
                const prefetchedClips = await prefetchGenre(genreSlug)
                if (prefetchedClips.length > 0) {
                    const mapped = mapClipsToFeedItems(prefetchedClips, genreSlug)
                    setItems(mapped)
                    fetchMoreInBackground(genreSlug)
                } else {
                    // 3. Fallback: Fast Lazy Fetch
                    // Instead of waiting for streams, just get titles/posters
                    const clips = await browseClipCafeGenreMoviesLazy(genreSlug, 10);
                    if (clips.length > 0) {
                        const mapped: FeedReelItem[] = clips.map((clip, idx) => ({
                            id: `genre-${genreSlug}-${clip.slug}-${idx}-${Date.now()}`,
                            mediaType: 'clip',
                            title: clip.title, // Just title
                            videoUrl: null, // Will resolve lazily
                            meta: { title: clip.title, year: clip.year }, // Store for resolution
                            coverUrl: null,
                            liveStreamId: null,
                            avatar: null,
                            userId: 'clip.cafe',
                            username: 'MovieFlix',
                            user: 'MovieFlix',
                            likes: Math.floor(Math.random() * 200) + 10,
                            comments: [],
                            commentsCount: 0,
                            likerAvatars: [],
                            music: 'Movie Sound',
                        }));
                        setItems(mapped);
                    }
                }
            } catch (e) {
                console.warn('Failed to fetch genre', genre, e)
            } finally {
                setLoading(false)
            }
        }

        fetchGenre()
    }, [genre, initialItems, mapClipsToFeedItems])

    // Lazy Resolution Logic
    useEffect(() => {
        const resolveUrl = async (index: number) => {
            if (index < 0 || index >= items.length) return;
            const item = items[index];

            // Skip ads or items that aren't feed items
            if (!isFeedItem(item)) return;

            // Skip if already has URL or not a clip that needs resolution
            if (item.videoUrl && !item.videoUrl.includes('placeholder')) return;
            if (item.mediaType !== 'clip') return;

            const itemKey = String(item.id);
            if (resolvedIndicesRef.current.has(itemKey)) return;

            // Mark as processing
            resolvedIndicesRef.current.add(itemKey);

            const meta = item.meta;
            if (!meta || !meta.title) return;

            console.log(`[GenreReelFeed] JIT Resolving: ${meta.title} (${index})`);

            try {
                // Determine year if available
                const result = await searchClipCafe(meta.title, meta.year);

                if (result && result.url) {
                    setItems(prevItems => {
                        const newItems = [...prevItems];
                        // Find item by ID to be safe, though index helps
                        const idx = newItems.findIndex(it => String(it.id) === itemKey);
                        if (idx !== -1) {
                            const found = newItems[idx];
                            if (isFeedItem(found)) {
                                newItems[idx] = {
                                    ...found,
                                    videoUrl: result.url,
                                    headers: (result as any).headers
                                };
                            }
                        }
                        return newItems;
                    });
                }
            } catch (e) {
                console.warn(`[GenreReelFeed] Failed to resolve ${meta.title}`, e);
            }
        };

        // Resolve current and next 2 items
        resolveUrl(currentIndex);
        resolveUrl(currentIndex + 1);
        resolveUrl(currentIndex + 2);

    }, [currentIndex, items]);

    const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current
    const onViewableItemsChanged = useRef(
        ({ viewableItems }: { viewableItems: Array<ViewToken> }) => {
            const first = viewableItems?.[0]?.index
            if (typeof first !== 'number') return
            currentIndexRef.current = first
            setCurrentIndex(first)
        },
    ).current

    const autoOpenedLivesRef = useRef<Set<string>>(new Set())
    const adImpressionsRef = useRef<Set<string>>(new Set())

    // Side effects for tracking (ads/lives) - only if active
    useEffect(() => {
        if (!isActive) return
        const cur: any = items[currentIndex]
        if (!cur) return

        // Live logic
        if (autoPlayReels && cur.mediaType === 'live' && cur.liveStreamId) {
            if (!autoOpenedLivesRef.current.has(String(cur.liveStreamId))) {
                const t = setTimeout(() => {
                    autoOpenedLivesRef.current.add(String(cur.liveStreamId))
                    router.push({ pathname: '/social-feed/live/[id]', params: { id: String(cur.liveStreamId) } } as any)
                }, 1200)
                return () => clearTimeout(t)
            }
        }

        // Ad logic
        if (cur.type === 'ad' && cur.productId) {
            if (!adImpressionsRef.current.has(String(cur.productId))) {
                adImpressionsRef.current.add(String(cur.productId))
                void trackPromotionImpression({ productId: String(cur.productId), placement: 'feed' }).catch(() => { })
            }
        }
    }, [isActive, currentIndex, items, autoPlayReels, router])


    const renderItem = useCallback(
        ({ item, index }: { item: ReelItem; index: number }) => {
            // Ad Render
            if ((item as any)?.type === 'ad') {
                const ad = item as any
                const product = promoted.find((p) => String(p.id) === String(ad.productId))
                if (!product) return null
                return (
                    <ReelAdSlide
                        product={product as any}
                        onPress={() => {
                            if (product?.id) {
                                void trackPromotionClick({ productId: String(product.id), placement: 'feed' }).catch(() => { })
                            }
                            router.push((`/marketplace/${product.id}`) as any)
                        }}
                    />
                )
            }

            // Feed Slide Render
            // Only mount/play if this Feed is ACTIVE and this Slide is ACTIVE
            const isSlideActive = isActive && index === currentIndex
            const distance = Math.abs(index - currentIndex)
            const mounted = distance <= 1

            return (
                <FeedSlide
                    item={item as FeedReelItem}
                    active={isSlideActive}
                    mounted={mounted}
                    autoPlayReels={autoPlayReels}
                    onAutoPlayNext={() => {
                        const next = index + 1
                        if (isSlideActive && next < items.length) {
                            setCurrentIndex(next)
                            listRef.current?.scrollToIndex({ index: next, animated: true })
                        }
                    }}
                />
            )
        },
        [isActive, currentIndex, autoPlayReels, items.length, promoted, router],
    )

    if (loading) {
        return (
            <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color="#e50914" />
            </View>
        )
    }

    return (
        <View style={styles.wrapper}>
            <FlatList
                ref={listRef}
                data={items}
                keyExtractor={(it) => String(it.id)}
                renderItem={renderItem}
                pagingEnabled
                showsVerticalScrollIndicator={false}
                decelerationRate="fast"
                overScrollMode={Platform.OS === 'android' ? 'never' : undefined}
                removeClippedSubviews
                windowSize={5}
                initialNumToRender={1}
                maxToRenderPerBatch={2}
                updateCellsBatchingPeriod={50}
                viewabilityConfig={viewabilityConfig}
                onViewableItemsChanged={onViewableItemsChanged}
                getItemLayout={(_, idx) => ({
                    length: SCREEN_HEIGHT,
                    offset: SCREEN_HEIGHT * idx,
                    index: idx,
                })}
            />
        </View>
    )
})

const styles = StyleSheet.create({
    wrapper: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor: 'black' },
    centerLoading: {
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'black',
    },
})
