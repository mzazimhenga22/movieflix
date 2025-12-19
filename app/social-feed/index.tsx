import { Ionicons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MovieList from '../../components/MovieList';
import ScreenWrapper from '../../components/ScreenWrapper';
import { API_BASE_URL, API_KEY } from '../../constants/api';
import { useSubscription } from '../../providers/SubscriptionProvider';
import { Media } from '../../types';
import { useAccent } from '../components/AccentContext';
import BottomNav from '../components/social-feed/BottomNav';
import FeedCard from '../components/social-feed/FeedCard';
import FeedCardPlaceholder from '../components/social-feed/FeedCardPlaceholder';
import SocialHeader from '../components/social-feed/Header';
import { ReviewItem, useSocialReactions } from '../components/social-feed/hooks';
import LiveView from '../components/social-feed/LiveView';
import MovieMatchView from '../components/social-feed/MovieMatchView';
import PostMovieReview from '../components/social-feed/PostMovieReview';
import RecommendedView from '../components/social-feed/RecommendedView';
import StoriesRow from '../components/social-feed/StoriesRow';
import FeedTabs from '../components/social-feed/Tabs';

// TikTok-style Full-Screen Video Feed Component
const TikTokVideoFeed = ({ videos, onVideoEnd, onVideoStart }: {
  videos: FeedItem[],
  onVideoEnd: () => void,
  onVideoStart: () => void
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const videoItems = videos.filter(item =>
    'videoUrl' in item && item.videoUrl
  ) as ReviewItem[];

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const newIndex = viewableItems[0].index;
      if (newIndex !== currentIndex) {
        setCurrentIndex(newIndex);
        onVideoEnd();
        setTimeout(() => onVideoStart(), 100);
      }
    }
  }).current;

  const renderVideoItem = ({ item, index }: { item: ReviewItem; index: number }) => (
    <View style={styles.tiktokVideoContainer}>
      <Video
        source={{ uri: item.videoUrl || '' }}
        style={styles.tiktokVideo}
        resizeMode={ResizeMode.COVER}
        isLooping
        shouldPlay={index === currentIndex}
        isMuted={false}
        volume={1.0}
      />

      {/* Video Overlay */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.7)']}
        style={styles.tiktokVideoOverlay}
      >
        <View style={styles.tiktokVideoInfo}>
          <Text style={styles.tiktokVideoUser}>@{item.user}</Text>
          <Text style={styles.tiktokVideoCaption} numberOfLines={2}>
            {item.review}
          </Text>

          {/* Action Buttons */}
          <View style={styles.tiktokActions}>
            <TouchableOpacity style={styles.tiktokActionBtn}>
              <Ionicons name="heart" size={28} color="#fff" />
              <Text style={styles.tiktokActionText}>{item.likes}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.tiktokActionBtn}>
              <Ionicons name="chatbubble" size={28} color="#fff" />
              <Text style={styles.tiktokActionText}>{item.commentsCount}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.tiktokActionBtn}>
              <Ionicons name="share-social" size={28} color="#fff" />
              <Text style={styles.tiktokActionText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>
    </View>
  );

  if (videoItems.length === 0) {
    return (
      <View style={styles.tiktokEmpty}>
        <Ionicons name="videocam-off" size={48} color="#666" />
        <Text style={styles.tiktokEmptyText}>No videos available</Text>
      </View>
    );
  }

  return (
    <FlatList
      ref={flatListRef}
      data={videoItems}
      renderItem={renderVideoItem}
      keyExtractor={(item, index) => `tiktok-${item.id}-${index}`}
      pagingEnabled
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={{
        itemVisiblePercentThreshold: 50,
      }}
      style={styles.tiktokContainer}
    />
  );
};

type FeedItem = ReviewItem | { type: 'movie-list'; id: string; title: string; movies: Media[]; onItemPress: (item: Media) => void; onReelPress?: (item: Media) => void };

const SocialFeed = () => {
  const router = useRouter();
  const { currentPlan } = useSubscription();
  const { reviews, refreshReviews, handleLike, handleBookmark, handleComment, handleWatch, handleShare } =
    useSocialReactions();

  // Advanced algorithm state
  const [userPreferences, setUserPreferences] = useState({
    favoriteGenres: ['action', 'sci-fi', 'drama'],
    watchTime: 'evening',
    mood: 'excited',
    contentTypes: ['reviews', 'videos', 'images']
  });
  const [algorithmWeights, setAlgorithmWeights] = useState({
    recency: 0.3,
    engagement: 0.4,
    relevance: 0.2,
    personalization: 0.1
  });
  const [feedMode, setFeedMode] = useState<'classic' | 'tiktok' | 'instagram'>('classic');

  const openReelsFromFeed = (startId: string | number) => {
    try {
      const queue = reviews
        .filter((r) => !!r.videoUrl)
        .map((r) => ({
          id: r.id,
          mediaType: 'feed',
          title: r.movie || r.review || r.user || 'Reel',
          posterPath: null,
          videoUrl: r.videoUrl,
          avatar: r.avatar,
          user: r.user,
          docId: (r as any).docId ?? undefined,
          likes: r.likes ?? 0,
          comments: r.comments ?? [],
          commentsCount: r.commentsCount ?? 0,
          likerAvatars: (r as any).likerAvatars ?? [],
        }));

      const list = encodeURIComponent(JSON.stringify(queue));
      // navigate to the new feed-specific reels screen
      router.push(`/reels/feed?id=${startId}&list=${list}&title=${encodeURIComponent(String(queue.find(q => String(q.id) === String(startId))?.title || 'Reel'))}`);
    } catch (e) {
      console.warn('Failed to open reels', e);
    }
  };

  // Crazy Algorithm Implementation
  const calculateContentScore = (item: ReviewItem, userData: any) => {
    let score = 0;

    // Recency score (newer content gets higher score)
    const hoursSincePost = (Date.now() - new Date(item.date || '').getTime()) / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 1 - (hoursSincePost / 24)); // Decay over 24 hours
    score += recencyScore * algorithmWeights.recency;

    // Engagement score (likes, comments, shares)
    const engagementScore = Math.min(1, (item.likes + item.commentsCount * 2) / 100);
    score += engagementScore * algorithmWeights.engagement;

    // Relevance score (genre matching, content type)
    let relevanceScore = 0;
    if (item.movie && userData?.favoriteGenres) {
      // Simple genre matching (would need actual movie data in real implementation)
      const hasMatchingGenre = userData.favoriteGenres.some((genre: string) =>
        item.movie?.toLowerCase().includes(genre.toLowerCase())
      );
      relevanceScore = hasMatchingGenre ? 0.8 : 0.2;
    }
    score += relevanceScore * algorithmWeights.relevance;

    // Personalization score (time of day, mood, etc.)
    let personalizationScore = 0.5; // Base score
    const currentHour = new Date().getHours();

    // Time-based personalization
    if (userData?.watchTime === 'evening' && currentHour >= 18 && currentHour <= 23) {
      personalizationScore += 0.2;
    }

    // Mood-based personalization
    if (userData?.mood === 'excited' && (item.videoUrl || item.likes > 50)) {
      personalizationScore += 0.1;
    }

    score += personalizationScore * algorithmWeights.personalization;

    return score;
  };

  const getPersonalizedFeed = useCallback((items: FeedItem[]) => {
    return items
      .filter(item => 'id' in item && typeof item.id === 'string')
      .map(item => ({
        ...item,
        algorithmScore: calculateContentScore(item as ReviewItem, userPreferences)
      }))
      .sort((a, b) => (b.algorithmScore || 0) - (a.algorithmScore || 0));
  }, [userPreferences, calculateContentScore]);
  const [activeTab, setActiveTab] = useState<'Feed' | 'Recommended' | 'Live' | 'Movie Match'>('Feed');
  const { accentColor } = useAccent();
  const scrollY = useRef(new Animated.Value(0)).current;
  const [headerHeight, setHeaderHeight] = useState(0);

  const topSectionTranslateY = scrollY.interpolate({
    inputRange: [0, 160],
    outputRange: [0, -180],
    extrapolate: 'clamp',
  });

  const topSectionOpacity = scrollY.interpolate({
    inputRange: [0, 80, 160],
    outputRange: [1, 0.7, 0],
    extrapolate: 'clamp',
  });

  const ashTranslateY = scrollY.interpolate({
    inputRange: [0, 200, 400],
    outputRange: [40, 0, -40],
    extrapolate: 'clamp',
  });

  const ashOpacity = scrollY.interpolate({
    inputRange: [0, 100, 250],
    outputRange: [0.2, 0.6, 0],
    extrapolate: 'clamp',
  });

  const [refreshing, setRefreshing] = useState(false);
  const [headerPointerEvents, setHeaderPointerEvents] = useState<'box-none' | 'none'>('box-none');
  const [trending, setTrending] = useState<Media[]>([]);
  const [movieReels, setMovieReels] = useState<Media[]>([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(true);
  const [swipedCards, setSwipedCards] = useState<Set<string>>(new Set());
  const [doubleTapLikes, setDoubleTapLikes] = useState<Record<string, boolean>>({});

  const handleOpenDetails = useCallback(
    (item: Media) => {
      const mediaType = (item.media_type || 'movie') as string;
      router.push(`/details/${item.id}?mediaType=${mediaType}`);
    },
    [router]
  );

  useEffect(() => {
    const fetchTrending = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/trending/all/day?api_key=${API_KEY}`);
        const data = await response.json();
        setTrending(data.results || []);
      } catch (error) {
        console.warn('Failed to fetch trending movies', error);
      }
    };
    const fetchMovieReels = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/movie/upcoming?api_key=${API_KEY}`);
        const data = await response.json();
        setMovieReels(data.results || []);
      } catch (error) {
        console.warn('Failed to fetch movie reels', error);
      }
    };
    fetchTrending();
    fetchMovieReels();
  }, []);

  useEffect(() => {
    if (reviews.length > 0) {
      setIsLoadingReviews(false);
    } else {
      setIsLoadingReviews(true);
    }
  }, [reviews]);

  useEffect(() => {
    const listenerId = scrollY.addListener(({ value }) => {
      setHeaderPointerEvents(value > 160 ? 'none' : 'box-none');
    });
    return () => {
      scrollY.removeListener(listenerId);
    };
  }, [scrollY]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setIsLoadingReviews(true);
    try {
      await refreshReviews();
    } finally {
      setRefreshing(false);
      setIsLoadingReviews(false);
    }
  }, [refreshReviews]);

  const feedItems: FeedItem[] = useMemo(() => {
    let items: FeedItem[] = [...reviews];

    // Apply crazy algorithm for personalization
    if (activeTab === 'Feed') {
      items = getPersonalizedFeed(items);
    }

    // Insert trending safely
    if (trending.length > 0) {
      items.splice(Math.min(2, items.length), 0, {
        type: 'movie-list',
        id: 'trending',
        title: 'Trending on MovieFlix',
        movies: trending,
        onItemPress: handleOpenDetails,
      });
    }
    // Insert movie reels safely
    if (movieReels.length > 0) {
      items.splice(Math.min(5, items.length), 0, {
        type: 'movie-list',
        id: 'movie-reels',
        title: 'Movie Reels',
        movies: movieReels,
        onItemPress: (item: Media) => {
          const queue = movieReels.slice(0, 20).map((m) => ({
            id: m.id,
            mediaType: m.media_type || 'movie',
            title: m.title || m.name || 'Reel',
            posterPath: m.poster_path || null,
          }));
          const listParam = encodeURIComponent(JSON.stringify(queue));
          router.push(
            `/reels/${item.id}?mediaType=${item.media_type || 'movie'}&title=${encodeURIComponent(
              item.title || item.name || 'Reel'
            )}&list=${listParam}`
          );
        },
      });
    }
    return items;
  }, [reviews, trending, movieReels, handleOpenDetails, router, getPersonalizedFeed, activeTab]);

  return (
    <View style={styles.rootContainer}>
      <ScreenWrapper>
        <LinearGradient
          colors={[accentColor, '#150a13', '#05060f']}
          start={[0, 0]}
          end={[1, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        {/* decorative orbs like movies.tsx for depth */}
        <LinearGradient
          colors={['rgba(95,132,255,0.12)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 320,
            borderRadius: 160,
            zIndex: 0,
          }}
        />
        <LinearGradient
          colors={['rgba(229,9,20,0.12)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            position: 'absolute',
            top: 120,
            right: 0,
            width: 220,
            height: 220,
            borderRadius: 110,
            zIndex: 0,
          }}
        />

        <View style={styles.container}>
          {activeTab === 'Feed' && feedMode === 'tiktok' ? (
            <View style={styles.tiktokFullscreenContainer}>
              <TikTokVideoFeed
                videos={feedItems}
                onVideoEnd={() => {/* Handle video end */}}
                onVideoStart={() => {/* Handle video start */}}
              />
            </View>
          ) : (
            <View style={styles.feedContainer}>
              {activeTab === 'Feed' && feedMode !== 'tiktok' && (
                <Animated.View style={{ flex: 1 }}>
                  <Animated.FlatList
                    data={isLoadingReviews ? Array.from({ length: 3 }) : feedItems}
                    keyExtractor={(item, i) => {
                      if (typeof item === 'object' && item !== null && 'type' in item && (item as any).id) {
                        return ((item as unknown) as { id: string }).id;
                      }
                      if (typeof item === 'object' && item !== null && 'id' in item) {
                        return ((item as unknown) as { id: string }).id;
                      }
                      return i.toString();
                    }}
                    renderItem={({ item, index }) => {
                      if (isLoadingReviews) return <FeedCardPlaceholder key={index} />;
                      if (typeof item === 'object' && item !== null && 'type' in item && (item as any).type === 'movie-list') {
                        const movieList = item as Extract<FeedItem, { type: 'movie-list' }>;
                        return (
                          <View style={{ marginBottom: 20 }} key={movieList.id}>
                            <MovieList
                              title={movieList.title}
                              movies={movieList.movies}
                              onItemPress={movieList.onItemPress}
                            />
                          </View>
                        );
                      }
                      const review = item as ReviewItem;
                      const formattedReview = {
                        ...review,
                        commentsCount:
                          typeof review.comments === 'number'
                            ? review.comments
                            : review.comments?.length || 0,
                        comments: Array.isArray(review.comments) ? review.comments : undefined,
                      };
                      return (
                        <FeedCard
                          key={review.id}
                          item={formattedReview}
                          onLike={handleLike}
                          onComment={handleComment}
                          onWatch={(id) => {
                            handleWatch(id);
                            openReelsFromFeed(id);
                          }}
                          onShare={handleShare}
                          onBookmark={handleBookmark}
                          enableStreaks
                          currentPlan={currentPlan}
                        />
                      );
                    }}
                    contentContainerStyle={{ paddingTop: headerHeight + 12, paddingHorizontal: 12, paddingBottom: 160 }}
                    showsVerticalScrollIndicator={false}
                    scrollEventThrottle={16}
                    onScroll={Animated.event(
                      [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                      { useNativeDriver: true }
                    )}
                    refreshControl={
                      <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#ffffff"
                        colors={['#ffffff']}
                      />
                    }
                    ListEmptyComponent={<Text style={{ color: '#fff', textAlign: 'center', marginTop: 40 }}>No feed items yet.</Text>}
                  />
                </Animated.View>
              )}

              {activeTab === 'Recommended' && (
                <Animated.ScrollView
                  style={styles.feed}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingTop: headerHeight + 12, paddingHorizontal: 12, paddingBottom: 160 }}
                  scrollEventThrottle={16}
                  onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                    { useNativeDriver: true }
                  )}
                >
                  <RecommendedView />
                </Animated.ScrollView>
              )}

              {activeTab === 'Live' && (
                <Animated.ScrollView
                  style={styles.feed}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingTop: headerHeight + 12, paddingHorizontal: 12, paddingBottom: 160 }}
                  scrollEventThrottle={16}
                  onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                    { useNativeDriver: true }
                  )}
                >
                  <LiveView />
                </Animated.ScrollView>
              )}

              {activeTab === 'Movie Match' && (
                <Animated.ScrollView
                  style={styles.feed}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingTop: headerHeight + 12, paddingHorizontal: 12, paddingBottom: 160 }}
                  scrollEventThrottle={16}
                  onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                    { useNativeDriver: true }
                  )}
                >
                  <MovieMatchView />
                </Animated.ScrollView>
              )}
            </View>
          )}

            <Animated.View
              pointerEvents={headerPointerEvents}
              style={[
              { paddingTop: 8, paddingBottom: 14, gap: 12 },
              {
                transform: [{ translateY: topSectionTranslateY }],
                opacity: topSectionOpacity,
              },
            ]}
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              if (h && h !== headerHeight) {
                setHeaderHeight(h);
              }
            }}
          >
              <View style={styles.topInner}>
                <View style={styles.headerWithIcon}>
                  <SocialHeader title="Social Feed" />
                  <TouchableOpacity style={styles.marketplaceIcon} onPress={() => router.push('/marketplace')}>
                    <Ionicons name="storefront" size={24} color="#fff" />
                  </TouchableOpacity>
                {/* Feed Mode Switcher */}
                <View style={styles.modeSwitcher}>
                  <TouchableOpacity
                    style={[styles.modeButton, feedMode === 'classic' && styles.modeButtonActive]}
                    onPress={() => setFeedMode('classic')}
                  >
                    <Ionicons name="grid" size={16} color={feedMode === 'classic' ? '#fff' : '#999'} />
                    <Text style={[styles.modeButtonText, feedMode === 'classic' && styles.modeButtonTextActive]}>Classic</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modeButton, feedMode === 'tiktok' && styles.modeButtonActive]}
                    onPress={() => setFeedMode('tiktok')}
                  >
                    <Ionicons name="videocam" size={16} color={feedMode === 'tiktok' ? '#fff' : '#999'} />
                    <Text style={[styles.modeButtonText, feedMode === 'tiktok' && styles.modeButtonTextActive]}>videoreels</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modeButton, feedMode === 'instagram' && styles.modeButtonActive]}
                    onPress={() => setFeedMode('instagram')}
                  >
                    <Ionicons name="images" size={16} color={feedMode === 'instagram' ? '#fff' : '#999'} />
                    <Text style={[styles.modeButtonText, feedMode === 'instagram' && styles.modeButtonTextActive]}>Stories</Text>
                  </TouchableOpacity>
                </View>
                <StoriesRow />
                {currentPlan !== 'free' && <PostMovieReview />}
                <FeedTabs active={activeTab} onChangeTab={(tab) => {
                  // Free users can't access Live and Movie Match tabs
                  if (currentPlan === 'free' && (tab === 'Live' || tab === 'Movie Match')) {
                    // Show upgrade prompt
                    router.push('/premium?source=social');
                    return;
                  }
                  setActiveTab(tab);
                }} />

              </View>
            </Animated.View>

            {/* lightweight floating ash effect */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ashLayer,
                {
                  opacity: ashOpacity,
                  transform: [{ translateY: ashTranslateY }],
                },
              ]}
            >
              <View style={[styles.ashParticle, { left: '15%' }]} />
              <View style={[styles.ashParticle, { left: '45%', width: 5, height: 5, opacity: 0.8 }]} />
              <View style={[styles.ashParticle, { left: '75%', width: 7, height: 7, opacity: 0.5 }]} />
            </Animated.View>
          {currentPlan !== 'free' && (
            <TouchableOpacity
              style={[styles.fab, { backgroundColor: accentColor }]}
              onPress={() => router.push('/social-feed/go-live')}
              accessibilityLabel="Go live"
              accessibilityRole="button"
            >
              <Ionicons name="add" size={28} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </ScreenWrapper>
      <BottomNav />
    </View>
  );
};

// Hide the default native/header provided by the router so we only show our custom header
export const options = {
  headerShown: false,
};

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#05060f',
  },
  container: { 
    flex: 1,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  topInner: {
    padding: 12,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 12,
  },
  headerWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  marketplaceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(229,9,20,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedContainer: {
    flex: 1,
  },
  feed: {
    flex: 1,
    marginBottom: 16, // Reduced margin since nav is outside
  },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 120, // Raised above external bottom nav
    backgroundColor: '#ff4b4b',
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  ashLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 80,
    zIndex: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    pointerEvents: 'none',
  },
  ashParticle: {
    position: 'absolute',
    bottom: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    opacity: 0.6,
  },
  modeSwitcher: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
    marginRight: 8,
  },
  modeButtonActive: {
    backgroundColor: 'rgba(229,9,20,0.8)',
  },
  modeButtonText: {
    color: '#999',
    fontSize: 12,
    fontWeight: '600',
  },
  modeButtonTextActive: {
    color: '#fff',
  },
  tiktokFullscreenContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 20,
  },
  tiktokContainer: {
    flex: 1,
  },
  tiktokVideoContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  tiktokVideo: {
    width: '100%',
    height: '100%',
  },
  tiktokVideoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  tiktokVideoInfo: {
    paddingHorizontal: 16,
    paddingBottom: 120,
    paddingTop: 60,
  },
  tiktokVideoUser: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  tiktokVideoCaption: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  tiktokActions: {
    position: 'absolute',
    right: 16,
    bottom: 120,
    alignItems: 'center',
    gap: 20,
  },
  tiktokActionBtn: {
    alignItems: 'center',
    gap: 4,
  },
  tiktokActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  tiktokEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  tiktokEmptyText: {
    color: '#666',
    fontSize: 16,
    marginTop: 16,
  },

});

export default SocialFeed;
