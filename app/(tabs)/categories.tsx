import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  Layout,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from 'react-native-reanimated';

import MovieList from '../../components/MovieList';
import ScreenWrapper from '../../components/ScreenWrapper';
import { API_BASE_URL, API_KEY } from '../../constants/api';
import { getAccentFromPosterPath } from '../../constants/theme';
import { useActiveProfile } from '../../hooks/use-active-profile';
import { getFavoriteGenre, setFavoriteGenre, type FavoriteGenre } from '../../lib/favoriteGenreStorage';
import { KIDS_GENRE_IDS, buildKidsTmdbUrl, filterForKidsMedia } from '../../lib/kidsContent';
import { Genre, Media } from '../../types';
import { useAccent } from '../components/AccentContext';
import GenreOrb from '../components/categories/GenreOrb';
import SpotlightCard3D from '../components/categories/SpotlightCard3D';
import ParticleSystem from '../components/effects/ParticleSystem';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** DATA & CONFIG */
const mainCategories = [
  {
    id: 'featured',
    title: 'Featured',
    subtitle: "Editor's picks",
    image: 'https://images.unsplash.com/photo-1574267432553-4b4628081c31?w=800&q=80',
  },
  {
    id: 'new',
    title: 'New Releases',
    subtitle: 'Fresh arrivals',
    image: 'https://images.unsplash.com/photo-1608170825933-2824ad7c4a2c?w=800&q=80',
  },
  {
    id: 'trending',
    title: 'Trending',
    subtitle: "What's hot",
    image: 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=800&q=80',
  },
];

const moodFilters = [
  { key: 'comfort', label: 'Comfort', icon: 'moon', colors: ['#ff9a9e', '#fad0c4'] as const, genreId: 35 },
  { key: 'adrenaline', label: 'Adrenaline', icon: 'flash', colors: ['#f83600', '#f9d423'] as const, genreId: 28 },
  { key: 'mystic', label: 'Mystic', icon: 'planet', colors: ['#7F00FF', '#E100FF'] as const, genreId: 14 },
  { key: 'romance', label: 'Romance', icon: 'heart', colors: ['#ff758c', '#ff7eb3'] as const, genreId: 10749 },
  { key: 'future', label: 'Sci-Fi', icon: 'rocket', colors: ['#43cea2', '#185a9d'] as const, genreId: 878 },
  { key: 'thriller', label: 'Thriller', icon: 'skull', colors: ['#232526', '#414345'] as const, genreId: 53 },
];

const kidsMoodFilters = [
  { key: 'family', label: 'Family', icon: 'happy', colors: ['#34d399', '#06b6d4'] as const, genreId: 10751 },
  { key: 'animation', label: 'Cartoons', icon: 'color-palette', colors: ['#8b5cf6', '#ec4899'] as const, genreId: 16 },
  { key: 'kids', label: 'Kids', icon: 'sparkles', colors: ['#f59e0b', '#ef4444'] as const, genreId: 10762 },
];

/** SUB-COMPONENTS */

const GlassSkeleton = memo(() => {
  const list = [1, 2, 3];
  return (
    <View style={styles.skeletonWrap}>
      {list.map((i) => (
        <SkeletonItem key={i} />
      ))}
    </View>
  );
});

const SkeletonItem = memo(() => {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 1000 }),
        withTiming(0.3, { duration: 1000 })
      ),
      -1,
      true
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value
  }));

  return (
    <Animated.View style={[styles.skeletonCard, style]}>
      <LinearGradient
        colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.1)']}
        style={StyleSheet.absoluteFillObject}
      />
    </Animated.View>
  );
});

const HeroSection = memo(({
  pickFavoriteMode,
  accentBase,
  heroStats,
  onShuffle,
  onViewSpotlight,
  onReset
}: {
  pickFavoriteMode: boolean;
  accentBase: string;
  heroStats: any[];
  onShuffle: () => void;
  onViewSpotlight: () => void;
  onReset: () => void;
}) => {
  const pulseAnim = useSharedValue(1);

  useEffect(() => {
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1500 }),
        withTiming(1, { duration: 1500 })
      ),
      -1,
      true
    );
  }, []);

  const shuffleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }]
  }));

  return (
    <Animated.View
      entering={FadeInDown.duration(600).springify()}
      style={styles.heroCard}
    >
      <BlurView intensity={40} tint="dark" style={styles.heroBlur}>
        <LinearGradient
          colors={[accentBase + '30', 'rgba(5,6,15,0.9)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroGradient}
        >
          {/* Header */}
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.heroEyebrow}>🌌 Your cinema atlas</Text>
              <Text style={styles.heroTitle}>
                {pickFavoriteMode ? 'Pick a Favorite' : 'Categories'}
              </Text>
              <Text style={styles.heroSubtitle}>
                {pickFavoriteMode
                  ? 'Tap a genre to save it to your profile'
                  : 'Dive into curated realms & vibes'}
              </Text>
            </View>
            <Animated.View style={shuffleStyle}>
              <TouchableOpacity
                style={styles.shuffleBtn}
                onPress={onShuffle}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={[accentBase, '#7C3AED']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.shuffleGradient}
                >
                  <Ionicons name="shuffle" size={16} color="#fff" />
                  <Text style={styles.shuffleText}>Shuffle</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Stats Row */}
          <View style={styles.heroStatsRow}>
            {heroStats.map((stat) => (
              <View key={stat.label} style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: accentBase + '30' }]}>
                  <Ionicons name={stat.icon} size={14} color={accentBase} />
                </View>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          {/* Action Buttons */}
          <View style={styles.heroActions}>
            <TouchableOpacity
              style={styles.primaryAction}
              onPress={onViewSpotlight}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#fff', '#f0f0f0']}
                style={styles.primaryGradient}
              >
                <Text style={styles.primaryText}>View spotlight</Text>
                <Ionicons name="arrow-forward" size={16} color="#000" />
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ghostAction}
              onPress={onReset}
              activeOpacity={0.85}
            >
              <Ionicons name="refresh" size={16} color="#fff" />
              <Text style={styles.ghostText}>Reset</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </BlurView>
    </Animated.View>
  );
});

const MoodSection = memo(({
  filters,
  selectedGenre,
  accentBase,
  onPress
}: {
  filters: { key: string; label: string; icon: string; colors: readonly string[]; genreId: number }[];
  selectedGenre: number | null;
  accentBase: string;
  onPress: (id: number) => void;
}) => (
  <Animated.View entering={FadeIn.delay(200).duration(400)}>
    <View style={styles.sectionHeader}>
      <Ionicons name="color-palette" size={16} color={accentBase} />
      <Text style={styles.sectionTitle}>Mood Filters</Text>
    </View>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.moodRow}
    >
      {filters.map((filter) => {
        const isActive = selectedGenre === filter.genreId;
        return (
          <TouchableOpacity
            key={filter.key}
            activeOpacity={0.9}
            onPress={() => onPress(filter.genreId)}
          >
            <Animated.View
              layout={Layout.springify()}
              style={[
                styles.moodChip,
                isActive && { transform: [{ scale: 1.05 }], borderWidth: 1, borderColor: '#fff' },
              ]}
            >
              <LinearGradient
                colors={filter.colors as any}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.moodGradient,
                  isActive && styles.moodGradientActive,
                ]}
              >
                <View style={styles.moodIconWrap}>
                  <Ionicons name={filter.icon as any} size={18} color="#fff" />
                </View>
                <Text style={styles.moodChipText}>{filter.label}</Text>
              </LinearGradient>
            </Animated.View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  </Animated.View>
));

const SpotlightSection = memo(({
  accentBase,
  onPress,
}: {
  accentBase: string;
  onPress: (id: string) => void;
}) => (
  <Animated.View entering={FadeIn.delay(300).duration(400)}>
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderLeft}>
          <Ionicons name="sparkles" size={16} color={accentBase} />
          <Text style={styles.sectionTitle}>Spotlight Collections</Text>
        </View>
        <TouchableOpacity onPress={() => onPress('featured')}>
          <Text style={[styles.sectionAction, { color: accentBase }]}>See all</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.spotlightRow}
      >
        {mainCategories.map((category, index) => (
          <SpotlightCard3D
            key={category.id}
            id={category.id}
            title={category.title}
            subtitle={category.subtitle}
            image={category.image}
            onPress={() => onPress(category.id)}
            index={index}
            accentColor={accentBase}
          />
        ))}
      </ScrollView>
    </View>
  </Animated.View>
));

const GenreSection = memo(({
  genres,
  selectedGenre,
  favoriteGenre,
  pickFavoriteMode,
  savingFavorite,
  accentBase,
  onSelect,
  onSaveFavorite
}: {
  genres: Genre[];
  selectedGenre: number | null;
  favoriteGenre: FavoriteGenre | null;
  pickFavoriteMode: boolean;
  savingFavorite: boolean;
  accentBase: string;
  onSelect: (id: number) => void;
  onSaveFavorite: (id: number) => void;
}) => (
  <Animated.View entering={FadeIn.delay(400).duration(400)}>
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderLeft}>
          <Ionicons name="planet" size={16} color={accentBase} />
          <Text style={styles.sectionTitle}>Genre Universe</Text>
        </View>
        <Text style={styles.sectionSubtitle}>Tap to filter</Text>
      </View>

      {/* Genre Orbs Grid */}
      <View style={styles.genreGrid}>
        {genres.map((genre, index) => (
          <GenreOrb
            key={genre.id}
            id={genre.id}
            name={genre.name}
            isSelected={selectedGenre === genre.id}
            onPress={() => onSelect(genre.id)}
            index={index}
            isFavorite={favoriteGenre?.id === genre.id}
          />
        ))}
      </View>

      {/* Favorite Row */}
      {!pickFavoriteMode && (
        <View style={styles.favoriteRow}>
          <View style={styles.favoriteInfo}>
            <Text style={styles.favoriteLabel}>Favorite genre</Text>
            <Text style={styles.favoriteValue} numberOfLines={1}>
              {favoriteGenre?.name ?? 'Not set'}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.favoriteBtn,
              (!selectedGenre || savingFavorite) && { opacity: 0.55 },
            ]}
            disabled={!selectedGenre || savingFavorite}
            onPress={() => {
              if (selectedGenre) onSaveFavorite(selectedGenre);
            }}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[accentBase, '#7C3AED']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.favoriteBtnGradient}
            >
              <Ionicons
                name={
                  selectedGenre && favoriteGenre?.id === selectedGenre
                    ? 'checkmark'
                    : 'star'
                }
                size={14}
                color="#fff"
              />
              <Text style={styles.favoriteBtnText}>
                {savingFavorite
                  ? 'Saving…'
                  : selectedGenre && favoriteGenre?.id === selectedGenre
                    ? 'Saved'
                    : 'Set favorite'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </View>
  </Animated.View>
));

/** MAIN COMPONENT */
const CategoriesScreen: React.FC = () => {
  const router = useRouter();
  const params = useLocalSearchParams<{ pickFavorite?: string }>();
  const pickFavoriteMode = params?.pickFavorite === '1' || params?.pickFavorite === 'true';

  const [genres, setGenres] = useState<Genre[]>([]);
  const [genresLoading, setGenresLoading] = useState<boolean>(true);
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [moviesByGenre, setMoviesByGenre] = useState<Media[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { setAccentColor } = useAccent();
  const activeProfile = useActiveProfile();
  const isKidsProfile = Boolean(activeProfile?.isKids);
  const [favoriteGenre, setFavoriteGenreState] = useState<FavoriteGenre | null>(null);
  const [savingFavorite, setSavingFavorite] = useState(false);

  // Load favorite genre
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const stored = await getFavoriteGenre();
        if (!alive) return;
        setFavoriteGenreState(stored);
        if (pickFavoriteMode && stored?.id && selectedGenre == null) {
          setSelectedGenre(stored.id);
        }
      })();
      return () => {
        alive = false;
      };
    }, [pickFavoriteMode, selectedGenre])
  );

  // Load Genres
  useEffect(() => {
    const fetchGenres = async () => {
      setGenresLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/genre/movie/list?api_key=${API_KEY}`);
        const data = await response.json();
        const incoming = (data.genres || []) as Genre[];
        const filtered = isKidsProfile
          ? incoming.filter((g) => (KIDS_GENRE_IDS as readonly number[]).includes(g.id))
          : incoming;
        setGenres(filtered);
      } catch (error) {
        console.error('Error fetching genres:', error);
      } finally {
        setGenresLoading(false);
      }
    };

    fetchGenres();
  }, [isKidsProfile]);

  // Kids mode validation
  useEffect(() => {
    if (!isKidsProfile) return;
    if (selectedGenre == null) {
      setSelectedGenre(10751);
      return;
    }
    if (!(KIDS_GENRE_IDS as readonly number[]).includes(selectedGenre)) {
      setSelectedGenre(10751);
    }
  }, [isKidsProfile, selectedGenre]);

  // Load Movies
  useEffect(() => {
    if (selectedGenre === null) {
      setMoviesByGenre([]);
      return;
    }

    const fetchMoviesByGenre = async () => {
      setIsLoading(true);
      try {
        const baseUrl = `${API_BASE_URL}/discover/movie?api_key=${API_KEY}&with_genres=${selectedGenre}`;
        const url = buildKidsTmdbUrl(baseUrl, { isKidsProfile, type: 'discover' });
        const response = await fetch(url);
        const data = await response.json();
        const raw = (data.results || []) as Media[];
        const filtered = filterForKidsMedia(raw, isKidsProfile);
        setMoviesByGenre(filtered);
      } catch (error) {
        console.error('Error fetching movies by genre:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMoviesByGenre();
  }, [isKidsProfile, selectedGenre]);

  // Save Favorite
  const saveAsFavorite = useCallback(
    async (genreId: number) => {
      const match = genres.find((g) => g.id === genreId);
      if (!match) return;
      const payload: FavoriteGenre = { id: match.id, name: match.name };
      setSavingFavorite(true);
      try {
        await setFavoriteGenre(payload);
        setFavoriteGenreState(payload);
      } finally {
        setSavingFavorite(false);
      }
    },
    [genres]
  );

  // Handlers
  const handleSelectGenre = useCallback(
    async (genreId: number) => {
      if (pickFavoriteMode) {
        setSelectedGenre(genreId);
        await saveAsFavorite(genreId);
        try {
          router.back();
        } catch { } // ignore
        return;
      }
      setSelectedGenre((prev) => (prev === genreId ? null : genreId));
    },
    [pickFavoriteMode, router, saveAsFavorite]
  );

  const handleCategoryPress = useCallback((categoryId: string) => {
    console.log(`Category pressed: ${categoryId}`);
  }, []);

  const handleShuffleGenre = useCallback(() => {
    if (!genres.length) return;
    const random = genres[Math.floor(Math.random() * genres.length)]?.id;
    if (random) setSelectedGenre(random);
  }, [genres]);

  const handleQuickGenre = useCallback(
    (genreId: number | null) => {
      if (genreId == null) return;
      void handleSelectGenre(genreId);
    },
    [handleSelectGenre]
  );

  // Derived State
  const selectedGenreName = selectedGenre
    ? genres.find((g) => g.id === selectedGenre)?.name ?? 'Genre'
    : null;

  const accentColor = getAccentFromPosterPath(
    moviesByGenre[0]?.poster_path || mainCategories[0]?.image || undefined
  );
  const accentBase = accentColor || '#e50914';

  useEffect(() => {
    if (accentColor) setAccentColor(accentColor);
  }, [accentColor, setAccentColor]);

  const heroStats = useMemo(
    () => [
      { label: 'Genres', value: genres.length ? `${genres.length}+` : '—', icon: 'grid' },
      { label: 'Spotlights', value: `${mainCategories.length}`, icon: 'star' },
      {
        label: selectedGenreName ? selectedGenreName : 'Picks',
        value: moviesByGenre.length ? `${moviesByGenre.length}` : '—',
        icon: 'film',
      },
    ],
    [genres.length, moviesByGenre.length, selectedGenreName]
  );

  return (
    <ScreenWrapper>
      {/* Background */}
      <LinearGradient
        colors={[accentBase + '50', '#0a0a1a', '#05060f']}
        start={[0, 0]}
        end={[1, 1]}
        style={styles.gradient}
      />

      {/* Floating Particles */}
      <ParticleSystem
        particleCount={12}
        colors={[accentBase, '#fff', '#7B68EE', '#00CED1']}
        type="float"
        speed={0.4}
      />

      {/* Mesh gradient orbs */}
      <View style={styles.orbContainer} pointerEvents="none">
        <LinearGradient
          colors={[accentBase + '40', 'transparent']}
          style={[styles.meshOrb, styles.orbTopRight]}
        />
        <LinearGradient
          colors={['#7B68EE40', 'transparent']}
          style={[styles.meshOrb, styles.orbBottomLeft]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <HeroSection
          pickFavoriteMode={pickFavoriteMode}
          accentBase={accentBase}
          heroStats={heroStats}
          onShuffle={handleShuffleGenre}
          onViewSpotlight={() => handleCategoryPress('featured')}
          onReset={() => setSelectedGenre(null)}
        />

        {genresLoading ? (
          <GlassSkeleton />
        ) : (
          <>
            <MoodSection
              filters={isKidsProfile ? kidsMoodFilters : moodFilters}
              selectedGenre={selectedGenre}
              accentBase={accentBase}
              onPress={handleQuickGenre}
            />

            <SpotlightSection
              accentBase={accentBase}
              onPress={handleCategoryPress}
            />

            <GenreSection
              genres={genres}
              selectedGenre={selectedGenre}
              favoriteGenre={favoriteGenre}
              pickFavoriteMode={pickFavoriteMode}
              savingFavorite={savingFavorite}
              accentBase={accentBase}
              onSelect={handleSelectGenre}
              onSaveFavorite={saveAsFavorite}
            />

            {/* Curated Picks */}
            <Animated.View entering={FadeIn.delay(500).duration(400)}>
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionHeaderLeft}>
                    <Ionicons name="film" size={16} color={accentBase} />
                    <Text style={styles.sectionTitle}>Curated Picks</Text>
                  </View>
                  {selectedGenreName ? (
                    <View style={[styles.chip, { borderColor: accentBase }]}>
                      <Text style={[styles.chipText, { color: accentBase }]}>
                        {selectedGenreName}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.sectionSubtitle}>Select a genre</Text>
                  )}
                </View>

                {isLoading ? (
                  <View style={styles.loadingWrap}>
                    <View style={[styles.loadingOrb, { borderColor: accentBase + '40' }]}>
                      <ActivityIndicator size="large" color={accentBase} />
                    </View>
                    <Text style={styles.loadingText}>Finding great movies...</Text>
                  </View>
                ) : selectedGenre !== null && moviesByGenre.length ? (
                  <MovieList title="" movies={moviesByGenre} carousel />
                ) : (
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIconWrap}>
                      <LinearGradient
                        colors={[accentBase + '30', 'transparent']}
                        style={styles.emptyOrb}
                      />
                      <Ionicons name="film-outline" size={40} color="rgba(255,255,255,0.3)" />
                    </View>
                    <Text style={styles.emptyTitle}>Choose a genre</Text>
                    <Text style={styles.emptySubtitle}>
                      Tap any genre orb above to see curated titles
                    </Text>
                  </View>
                )}
              </View>
            </Animated.View>
          </>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  orbContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  meshOrb: {
    position: 'absolute',
    width: 350,
    height: 350,
    borderRadius: 175,
  },
  orbTopRight: {
    top: -100,
    right: -100,
  },
  orbBottomLeft: {
    bottom: 100,
    left: -150,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 28,
    paddingBottom: 80,
  },

  // Hero Section
  heroCard: {
    borderRadius: 28,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 15 },
    elevation: 15,
  },
  heroBlur: {
    borderRadius: 28,
    overflow: 'hidden',
  },
  heroGradient: {
    padding: 20,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginTop: 4,
    maxWidth: '85%',
  },
  shuffleBtn: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  shuffleGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  shuffleText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  heroStatsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 16,
    padding: 12,
    justifyContent: 'space-between',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  statCard: {
    alignItems: 'center',
    flex: 1,
  },
  statIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  statValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  primaryAction: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    overflow: 'hidden',
  },
  primaryGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
  ghostAction: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4, // for text if expanding
  },
  ghostText: {
    display: 'none', // Icon only for now
  },

  // Sections
  sectionCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sectionSubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
  sectionAction: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Moods
  moodRow: {
    paddingBottom: 20,
    gap: 12,
  },
  moodChip: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  moodGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  moodGradientActive: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  moodIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodChipText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // Spotlight
  spotlightRow: {
    gap: 16,
  },

  // Genre Grid
  genreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },

  // Favorite Row
  favoriteRow: {
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  favoriteInfo: {
    flex: 1,
  },
  favoriteLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginBottom: 4,
  },
  favoriteValue: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  favoriteBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  favoriteBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  favoriteBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  // Empty / Loading
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  loadingWrap: {
    alignItems: 'center',
    padding: 40,
  },
  loadingOrb: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyOrb: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textAlign: 'center',
  },

  // Skeleton
  skeletonWrap: {
    gap: 16,
  },
  skeletonCard: {
    height: 120,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.02)',
    overflow: 'hidden',
  },
});

export default CategoriesScreen;
