/**
 * Movie Clip Finder Screen (Clip.Cafe-style)
 * Search movie clips by quote/phrase
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ScreenWrapper from '@/components/ScreenWrapper';
import LiquidGlass from '@/components/app-components/LiquidGlass';
import { useAccent } from '@/components/app-components/AccentContext';
import { 
  MovieClip, 
  ClipSearchResult,
  searchAllClips, 
  getPopularQuotes,
  getRandomQuote,
} from '@/lib/drama';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Quote Card Component
const QuoteCard = ({ 
  clip, 
  onPress,
  index 
}: { 
  clip: MovieClip; 
  onPress: () => void;
  index: number;
}) => {
  const { accentColor } = useAccent();
  const accent = accentColor || '#e50914';
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        delay: index * 50,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        delay: index * 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View 
      style={[
        styles.quoteCard, 
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
      ]}
    >
      <TouchableOpacity 
        style={styles.quoteCardInner} 
        onPress={onPress}
        activeOpacity={0.9}
      >
        {/* Quote text */}
        <View style={styles.quoteTextContainer}>
          <Text style={styles.quoteMark}>"</Text>
          <Text style={styles.quoteText}>{clip.quote}</Text>
          <Text style={styles.quoteMark}> "</Text>
        </View>

        {/* Movie info */}
        <View style={styles.movieInfo}>
          {clip.thumbnail ? (
            <Image source={{ uri: clip.thumbnail }} style={styles.movieThumb} />
          ) : (
            <View style={styles.movieThumbPlaceholder}>
              <Ionicons name="film" size={20} color="rgba(255,255,255,0.5)" />
            </View>
          )}
          <View style={styles.movieDetails}>
            <Text style={styles.movieTitle}>{clip.movieTitle}</Text>
            <Text style={styles.movieYear}>{clip.movieYear || ''}</Text>
            {clip.character && (
              <Text style={styles.characterName}>
                — {clip.character}{clip.actor ? ` (${clip.actor})` : ''}
              </Text>
            )}
          </View>
        </View>

        {/* Source badge */}
        <View style={[styles.sourceBadge, { backgroundColor: getSourceColor(clip.source) }]}>
          <Text style={styles.sourceBadgeText}>{clip.source.toUpperCase()}</Text>
        </View>

        {/* Play button */}
        {(clip.videoUrl || clip.youtubeId) && (
          <View style={styles.playBadge}>
            <Ionicons name="play-circle" size={24} color={accent} />
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

// Get color for source
function getSourceColor(source: string): string {
  const colors: Record<string, string> = {
    playphrase: '#6B4EFF',
    yarn: '#00D9FF',
    tmdb: '#01B4E4',
    youtube: '#FF0000',
    user: '#e50914',
  };
  return colors[source] || '#666';
}

// Main Screen
export default function ClipFinderScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accentColor } = useAccent();
  const accent = accentColor || '#e50914';

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<ClipSearchResult | null>(null);
  const [popularQuotes, setPopularQuotes] = useState<MovieClip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [randomQuote, setRandomQuote] = useState<MovieClip | null>(null);

  const searchInputRef = useRef<TextInput>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Load popular quotes on mount
  useEffect(() => {
    loadPopularQuotes();
    loadRandomQuote();

    // Pulse animation for random quote
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.02, duration: 2000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
      ])
    );
    pulse.start();
  }, []);

  const loadPopularQuotes = async () => {
    try {
      const quotes = await getPopularQuotes();
      setPopularQuotes(quotes);
    } catch (e) {
      console.error('Failed to load popular quotes', e);
    }
  };

  const loadRandomQuote = async () => {
    try {
      const quote = await getRandomQuote();
      setRandomQuote(quote);
    } catch (e) {
      console.error('Failed to load random quote', e);
    }
  };

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResult(null);
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const result = await searchAllClips(query);
      setSearchResult(result);
    } catch (e) {
      setError('Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQuotePress = useCallback((clip: MovieClip) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    // If has YouTube ID, open in YouTube or video player
    if (clip.youtubeId) {
      const youtubeUrl = `https://www.youtube.com/watch?v=${clip.youtubeId}`;
      // Could open in-app browser or video player
      console.log('Open YouTube:', youtubeUrl);
    } else if (clip.videoUrl) {
      // Open video URL
      console.log('Open video:', clip.videoUrl);
    }
    
    // Could also navigate to a detail modal
  }, []);

  const handleRandomPress = useCallback(() => {
    loadRandomQuote();
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, []);

  // ============ RENDER ============

  const displayClips = searchResult?.clips || popularQuotes;

  return (
    <ScreenWrapper style={styles.container}>
      <LinearGradient 
        colors={['#0a0a12', '#1a1a2e', '#0a0a12']} 
        style={StyleSheet.absoluteFill} 
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Movie Clips</Text>
        <TouchableOpacity style={styles.randomBtn} onPress={handleRandomPress}>
          <Ionicons name="shuffle" size={22} color={accent} />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <LiquidGlass 
          cornerRadius={16} 
          tintOpacity={0.1} 
          glowColor={accent} 
          glowIntensity={0.2}
          style={styles.searchGlass}
        >
          <Ionicons name="search" size={20} color="rgba(255,255,255,0.6)" />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search by quote, movie, or character..."
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              handleSearch(text);
            }}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => {
              setSearchQuery('');
              setSearchResult(null);
              searchInputRef.current?.clear();
            }}>
              <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          )}
        </LiquidGlass>
      </View>

      {/* Random Quote Card */}
      {!searchResult && randomQuote && (
        <Animated.View style={[styles.randomCard, { transform: [{ scale: pulseAnim }] }]}>
          <TouchableOpacity 
            style={styles.randomCardInner}
            onPress={() => handleQuotePress(randomQuote)}
            activeOpacity={0.95}
          >
            <LinearGradient
              colors={[`${accent}40`, 'transparent']}
              style={styles.randomGradient}
            />
            <Text style={styles.randomLabel}>RANDOM QUOTE</Text>
            <Text style={styles.randomQuote}>"{randomQuote.quote}"</Text>
            <Text style={styles.randomMovie}>— {randomQuote.movieTitle} ({randomQuote.movieYear})</Text>
            {randomQuote.character && (
              <Text style={styles.randomCharacter}>{randomQuote.character}</Text>
            )}
            <View style={styles.shuffleHint}>
              <Ionicons name="shuffle" size={14} color="rgba(255,255,255,0.5)" />
              <Text style={styles.shuffleText}>Tap for another</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Section Title */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {searchResult ? `Results for "${searchQuery}"` : 'Popular Quotes'}
        </Text>
        {searchResult && (
          <Text style={styles.resultCount}>
            {searchResult.total} clips found
          </Text>
        )}
      </View>

      {/* Loading */}
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={accent} />
          <Text style={styles.loadingText}>Searching clips...</Text>
        </View>
      )}

      {/* Error */}
      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={32} color="#ff6b6b" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Clips List */}
      {!loading && !error && (
        <FlatList
          data={displayClips}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <QuoteCard
              clip={item}
              index={index}
              onPress={() => handleQuotePress(item)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="film-outline" size={48} color="rgba(255,255,255,0.3)" />
              <Text style={styles.emptyText}>No clips found</Text>
              <Text style={styles.emptyHint}>Try a different search term</Text>
            </View>
          }
        />
      )}

      {/* Category Chips */}
      <View style={styles.categoryContainer}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          {['I\'ll be back', 'May the Force', 'Bond', 'Show me the money', 'Why so serious'].map((term) => (
            <TouchableOpacity 
              key={term} 
              style={styles.categoryChip}
              onPress={() => {
                setSearchQuery(term);
                handleSearch(term);
              }}
            >
              <Text style={styles.categoryChipText}>{term}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a12',
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
    fontSize: 22,
    fontWeight: '800',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  randomBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  searchGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
  },
  randomCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
  },
  randomCardInner: {
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  randomGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  randomLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  randomQuote: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    fontStyle: 'italic',
    marginBottom: 12,
    lineHeight: 28,
  },
  randomMovie: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  randomCharacter: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  shuffleHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
  },
  shuffleText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  resultCount: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  quoteCard: {
    marginBottom: 12,
  },
  quoteCardInner: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  quoteTextContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  quoteMark: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 24,
    fontWeight: '300',
  },
  quoteText: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    fontStyle: 'italic',
    lineHeight: 22,
  },
  movieInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  movieThumb: {
    width: 48,
    height: 72,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  movieThumbPlaceholder: {
    width: 48,
    height: 72,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  movieDetails: {
    flex: 1,
  },
  movieTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  movieYear: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginBottom: 2,
  },
  characterName: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontStyle: 'italic',
  },
  sourceBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sourceBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  playBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  errorText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyHint: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
  },
  categoryContainer: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
  },
  categoryScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  categoryChipText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
