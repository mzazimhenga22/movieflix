/**
 * Short Drama Player Screen
 * Vertical drama player like ReelShort/DramaBox
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import ScreenWrapper from '@/components/ScreenWrapper';
import LiquidGlass from '@/components/app-components/LiquidGlass';
import { useAccent } from '@/components/app-components/AccentContext';
import { 
  ShortDrama, 
  DramaEpisode, 
  getTrendingDramas, 
  searchAllDramas, 
  getEpisodeVideoUrl 
} from '@/lib/drama';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const AnyVideoView = VideoView as any;

// Episode Item Component
const EpisodeItem = ({ 
  episode, 
  index, 
  isActive, 
  onPress 
}: { 
  episode: DramaEpisode; 
  index: number; 
  isActive: boolean;
  onPress: () => void;
}) => {
  const { accentColor } = useAccent();
  const accent = accentColor || '#e50914';

  return (
    <TouchableOpacity 
      style={[styles.episodeItem, isActive && { borderColor: accent }]} 
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Image source={{ uri: episode.thumbnail }} style={styles.episodeThumb} />
      <View style={styles.episodeInfo}>
        <Text style={styles.episodeNumber}>Episode {episode.episodeNumber}</Text>
        <Text style={styles.episodeTitle} numberOfLines={1}>
          {episode.title || `Episode ${episode.episodeNumber}`}
        </Text>
      </View>
      {episode.isLocked ? (
        <View style={styles.lockedBadge}>
          <Ionicons name="lock-closed" size={14} color="#FFD700" />
          <Text style={styles.lockedText}>{episode.coinsRequired || 30}</Text>
        </View>
      ) : (
        <Ionicons 
          name={isActive ? "play-circle" : "play-circle-outline"} 
          size={24} 
          color={isActive ? accent : 'rgba(255,255,255,0.6)'} 
        />
      )}
    </TouchableOpacity>
  );
};

// Drama Card Component
const DramaCard = ({ 
  drama, 
  onPress 
}: { 
  drama: ShortDrama; 
  onPress: () => void;
}) => {
  const { accentColor } = useAccent();
  const accent = accentColor || '#e50914';
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 50,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <TouchableOpacity 
      style={styles.dramaCard} 
      onPress={onPress}
      activeOpacity={0.9}
    >
      <Animated.View style={[styles.dramaCardInner, { transform: [{ scale: scaleAnim }] }]}>
        <Image source={{ uri: drama.thumbnail }} style={styles.dramaThumb} />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.9)']}
          style={styles.dramaGradient}
        />
        <View style={styles.dramaInfo}>
          <Text style={styles.dramaTitle} numberOfLines={2}>{drama.title}</Text>
          <View style={styles.dramaMeta}>
            {drama.rating && (
              <View style={styles.ratingBadge}>
                <Ionicons name="star" size={12} color="#FFD700" />
                <Text style={styles.ratingText}>{drama.rating.toFixed(1)}</Text>
              </View>
            )}
            <Text style={styles.episodeCount}>{drama.episodes.length || 50} episodes</Text>
          </View>
          <View style={styles.genreRow}>
            {drama.genre.slice(0, 2).map((g, i) => (
              <View key={i} style={[styles.genreTag, { borderColor: accent }]}>
                <Text style={styles.genreText}>{g}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={[styles.sourceBadge, { backgroundColor: accent }]}>
          <Text style={styles.sourceText}>{drama.source.toUpperCase()}</Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
};

// Main Screen
export default function ShortDramaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accentColor } = useAccent();
  const accent = accentColor || '#e50914';

  const [dramas, setDramas] = useState<ShortDrama[]>([]);
  const [selectedDrama, setSelectedDrama] = useState<ShortDrama | null>(null);
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const likedAnim = useRef(new Animated.Value(1)).current;
  const [isLiked, setIsLiked] = useState(false);

  // Load trending dramas
  useEffect(() => {
    loadDramas();
  }, []);

  const loadDramas = async () => {
    setLoading(true);
    setError(null);
    try {
      const trending = await getTrendingDramas();
      setDramas(trending);
    } catch (e) {
      setError('Failed to load dramas');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      loadDramas();
      return;
    }
    setLoading(true);
    try {
      const result = await searchAllDramas(query);
      setDramas(result.dramas);
    } catch (e) {
      setError('Search failed');
    } finally {
      setLoading(false);
    }
  };

  // Get current episode
  const currentEpisode = selectedDrama?.episodes[currentEpisodeIndex];
  const videoUri = currentEpisode?.videoUrl;

  const player = useVideoPlayer(videoUri || null, (p) => {
    p.loop = false;
    p.muted = false;
  });

  // Play video when episode changes
  useEffect(() => {
    if (videoUri) {
      player.play();
      progressAnim.setValue(0);
    }
  }, [videoUri, player]);

  // Like animation
  const handleLike = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setIsLiked(!isLiked);
    Animated.sequence([
      Animated.spring(likedAnim, { toValue: 1.3, useNativeDriver: true }),
      Animated.spring(likedAnim, { toValue: 1, useNativeDriver: true }),
    ]).start();
  }, [isLiked, likedAnim]);

  // Navigate episodes
  const goToNextEpisode = useCallback(() => {
    if (!selectedDrama) return;
    const nextIndex = currentEpisodeIndex + 1;
    if (nextIndex < selectedDrama.episodes.length) {
      setCurrentEpisodeIndex(nextIndex);
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  }, [selectedDrama, currentEpisodeIndex]);

  const goToPrevEpisode = useCallback(() => {
    if (currentEpisodeIndex > 0) {
      setCurrentEpisodeIndex(currentEpisodeIndex - 1);
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  }, [currentEpisodeIndex]);

  // Back to list
  const handleBack = useCallback(() => {
    setSelectedDrama(null);
    setCurrentEpisodeIndex(0);
  }, []);

  // Search input
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef<any>(null);

  // ============ RENDER ============

  // Loading state
  if (loading && dramas.length === 0) {
    return (
      <ScreenWrapper style={styles.container}>
        <LinearGradient colors={['#0a0a12', '#151520']} style={StyleSheet.absoluteFill} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={accent} />
          <Text style={styles.loadingText}>Loading dramas...</Text>
        </View>
      </ScreenWrapper>
    );
  }

  // Drama Player View
  if (selectedDrama && currentEpisode) {
    return (
      <ScreenWrapper style={styles.container}>
        <View style={styles.playerContainer}>
          {/* Video */}
          <AnyVideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            showsPlaybackControls={false}
          />

          {/* Gradient overlays */}
          <LinearGradient
            colors={['rgba(0,0,0,0.6)', 'transparent', 'transparent']}
            style={styles.topGradient}
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.9)']}
            style={styles.bottomGradient}
          />

          {/* Top bar */}
          <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
            <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
              <Ionicons name="chevron-back" size={28} color="#fff" />
            </TouchableOpacity>
            <View style={styles.topInfo}>
              <Text style={styles.dramaTitleSmall} numberOfLines={1}>{selectedDrama.title}</Text>
              <Text style={styles.episodeIndicator}>
                Episode {currentEpisodeIndex + 1} of {selectedDrama.episodes.length}
              </Text>
            </View>
            <TouchableOpacity style={styles.shareBtn}>
              <Ionicons name="share-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Progress bar */}
          <View style={[styles.progressBar, { top: insets.top + 50 }]}>
            {selectedDrama.episodes.map((_, i) => (
              <View key={i} style={styles.progressSegment}>
                <View 
                  style={[
                    styles.progressFill,
                    i < currentEpisodeIndex && styles.progressComplete,
                    i === currentEpisodeIndex && { backgroundColor: accent },
                  ]} 
                />
              </View>
            ))}
          </View>

          {/* Side actions */}
          <View style={[styles.sideActions, { bottom: 140 + insets.bottom }]}>
            <TouchableOpacity style={styles.sideBtn} onPress={handleLike}>
              <Animated.View style={{ transform: [{ scale: likedAnim }] }}>
                <Ionicons 
                  name={isLiked ? "heart" : "heart-outline"} 
                  size={32} 
                  color={isLiked ? "#ff2d55" : "#fff"} 
                />
              </Animated.View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sideBtn}>
              <Ionicons name="chatbubble-outline" size={28} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.sideBtn}>
              <Ionicons name="bookmark-outline" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Bottom info */}
          <View style={[styles.bottomInfo, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={styles.episodeTitleLarge} numberOfLines={2}>
              {currentEpisode.title || `Episode ${currentEpisode.episodeNumber}`}
            </Text>
            <Text style={styles.episodeDesc} numberOfLines={3}>
              {selectedDrama.description}
            </Text>

            {/* Episode navigation */}
            <View style={styles.episodeNav}>
              <TouchableOpacity 
                style={[styles.navBtn, currentEpisodeIndex === 0 && { opacity: 0.3 }]} 
                onPress={goToPrevEpisode}
                disabled={currentEpisodeIndex === 0}
              >
                <Ionicons name="chevron-back" size={20} color="#fff" />
                <Text style={styles.navText}>Previous</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.navBtn, { backgroundColor: accent }]} 
                onPress={goToNextEpisode}
              >
                <Text style={styles.navText}>Next Episode</Text>
                <Ionicons name="chevron-forward" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Episode list modal */}
          <View style={[styles.episodeSheet, { paddingBottom: insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Episodes</Text>
            <FlatList
              data={selectedDrama.episodes}
              keyExtractor={(item) => item.id}
              renderItem={({ item, index }) => (
                <EpisodeItem
                  episode={item}
                  index={index}
                  isActive={index === currentEpisodeIndex}
                  onPress={() => {
                    if (!item.isLocked) {
                      setCurrentEpisodeIndex(index);
                    }
                  }}
                />
              )}
              style={styles.episodeList}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </ScreenWrapper>
    );
  }

  // Drama List View
  return (
    <ScreenWrapper style={styles.container}>
      <LinearGradient colors={['#0a0a12', '#151520', '#0a0a12']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.headerTitle}>Short Dramas</Text>
        <TouchableOpacity 
          style={styles.searchBtn} 
          onPress={() => setShowSearch(!showSearch)}
        >
          <Ionicons name={showSearch ? "close" : "search"} size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      {showSearch && (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="rgba(255,255,255,0.6)" />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search dramas..."
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              handleSearch(text);
            }}
            returnKeyType="search"
          />
        </View>
      )}

      {/* Content */}
      {error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#ff6b6b" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadDramas}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={dramas}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <DramaCard
              drama={item}
              onPress={() => {
                setSelectedDrama(item);
                setCurrentEpisodeIndex(0);
              }}
            />
          )}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onRefresh={loadDramas}
          refreshing={loading}
        />
      )}
    </ScreenWrapper>
  );
}

// Add missing import
import { TextInput } from 'react-native';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a12',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
  },
  searchBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
  },
  listContent: {
    padding: 8,
    paddingBottom: 100,
  },
  gridRow: {
    justifyContent: 'space-between',
  },
  dramaCard: {
    width: (SCREEN_WIDTH - 24) / 2,
    marginBottom: 12,
  },
  dramaCardInner: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  dramaThumb: {
    width: '100%',
    aspectRatio: 2 / 3,
  },
  dramaGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  dramaInfo: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
  },
  dramaTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  dramaMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  ratingText: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: '600',
  },
  episodeCount: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
  },
  genreRow: {
    flexDirection: 'row',
    gap: 4,
  },
  genreTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  genreText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 10,
    fontWeight: '500',
  },
  sourceBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sourceText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#e50914',
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Player styles
  playerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topInfo: {
    flex: 1,
  },
  dramaTitleSmall: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  episodeIndicator: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  shareBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    gap: 4,
  },
  progressSegment: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  progressComplete: {
    backgroundColor: '#fff',
  },
  sideActions: {
    position: 'absolute',
    right: 16,
    alignItems: 'center',
    gap: 20,
  },
  sideBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 80,
    padding: 16,
  },
  episodeTitleLarge: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  episodeDesc: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  episodeNav: {
    flexDirection: 'row',
    gap: 12,
  },
  navBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  navText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },

  // Episode sheet
  episodeSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#121212',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '50%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginTop: 12,
  },
  sheetTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    padding: 16,
  },
  episodeList: {
    paddingHorizontal: 16,
  },
  episodeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 12,
  },
  episodeThumb: {
    width: 80,
    height: 45,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  episodeInfo: {
    flex: 1,
  },
  episodeNumber: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
  },
  episodeTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,215,0,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  lockedText: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: '600',
  },
});
