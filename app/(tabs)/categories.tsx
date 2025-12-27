import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import ScreenWrapper from '../../components/ScreenWrapper';
import CategoryCard from '../components/categories/CategoryCard';
import GenreSelector from '../components/categories/GenreSelector';
import MovieList from '../../components/MovieList';
import { API_KEY, API_BASE_URL } from '../../constants/api';
import { Genre, Media } from '../../types';
import { LinearGradient } from 'expo-linear-gradient';
import { getAccentFromPosterPath } from '../../constants/theme';
import { useAccent } from '../components/AccentContext';
import { getFavoriteGenre, setFavoriteGenre, type FavoriteGenre } from '../../lib/favoriteGenreStorage';

const mainCategories = [
  {
    id: 'featured',
    title: 'Featured',
    image: 'https://images.unsplash.com/photo-1574267432553-4b4628081c31?w=800&q=80',
  },
  {
    id: 'new',
    title: 'New Releases',
    image: 'https://images.unsplash.com/photo-1608170825933-2824ad7c4a2c?w=800&q=80',
  },
  {
    id: 'trending',
    title: 'Trending',
    image: 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=800&q=80',
  },
];

const moodFilters = [
  {
    key: 'comfort',
    label: 'Comfort Classics',
    icon: 'moon',
    colors: ['#ff9a9e', '#fad0c4'] as const,
    genreId: 35,
  },
  {
    key: 'adrenaline',
    label: 'Adrenaline Rush',
    icon: 'flash',
    colors: ['#f83600', '#f9d423'] as const,
    genreId: 28,
  },
  {
    key: 'mystic',
    label: 'Mystic Nights',
    icon: 'planet',
    colors: ['#7F00FF', '#E100FF'] as const,
    genreId: 14,
  },
  {
    key: 'romance',
    label: 'Love Stories',
    icon: 'heart',
    colors: ['#ff758c', '#ff7eb3'] as const,
    genreId: 10749,
  },
  {
    key: 'future',
    label: 'Future Worlds',
    icon: 'rocket',
    colors: ['#43cea2', '#185a9d'] as const,
    genreId: 878,
  },
];

const GlassSkeleton = () => (
  <View style={styles.skeletonWrap}>
    <View style={[styles.glassCard, styles.skelHeader]}>
      <View style={styles.skelTitle} />
    </View>

    <View style={[styles.glassCard, styles.skelCategories]}>
      <View style={styles.skelRow} />
      <View style={[styles.skelRow, { width: '70%', marginTop: 12 }]} />
    </View>

    <View style={[styles.glassCard, styles.skelList]}>
      <View style={styles.skelLine} />
      <View style={styles.skelLine} />
      <View style={styles.skelLineShort} />
    </View>
  </View>
);

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
  const [favoriteGenre, setFavoriteGenreState] = useState<FavoriteGenre | null>(null);
  const [savingFavorite, setSavingFavorite] = useState(false);

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

  useEffect(() => {
    const fetchGenres = async () => {
      setGenresLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/genre/movie/list?api_key=${API_KEY}`);
        const data = await response.json();
        setGenres(data.genres || []);
      } catch (error) {
        console.error('Error fetching genres:', error);
      } finally {
        setGenresLoading(false);
      }
    };

    fetchGenres();
  }, []);

  useEffect(() => {
    if (selectedGenre === null) {
      setMoviesByGenre([]);
      return;
    }

    const fetchMoviesByGenre = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/discover/movie?api_key=${API_KEY}&with_genres=${selectedGenre}`
        );
        const data = await response.json();
        setMoviesByGenre(data.results || []);
      } catch (error) {
        console.error('Error fetching movies by genre:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMoviesByGenre();
  }, [selectedGenre]);

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
    [genres],
  );

  const handleSelectGenre = useCallback(
    async (genreId: number) => {
      if (pickFavoriteMode) {
        setSelectedGenre(genreId);
        await saveAsFavorite(genreId);
        try {
          router.back();
        } catch {
          // ignore
        }
        return;
      }
      setSelectedGenre((prev) => (prev === genreId ? null : genreId));
    },
    [pickFavoriteMode, router, saveAsFavorite],
  );

  const handleCategoryPress = (categoryId: string) => {
    console.log(`Category pressed: ${categoryId}`);
    // Add navigation or filtering logic here if desired
  };

  const selectedGenreName = selectedGenre
    ? genres.find((g) => g.id === selectedGenre)?.name ?? 'Genre'
    : null;

  const accentColor = getAccentFromPosterPath(
    moviesByGenre[0]?.poster_path || mainCategories[0]?.image || undefined
  );
  const accentBase = accentColor || '#e50914';

    useEffect(() => {
      if (accentColor) {
        setAccentColor(accentColor);
      }
    }, [accentColor, setAccentColor]);

  const heroStats = useMemo(
    () => [
      { label: 'Genres', value: genres.length ? `${genres.length}+` : '—' },
      { label: 'Spotlights', value: `${mainCategories.length}` },
      {
        label: selectedGenreName ? selectedGenreName : 'Curations',
        value: moviesByGenre.length ? `${moviesByGenre.length}` : '—',
      },
    ],
    [genres.length, moviesByGenre.length, selectedGenreName]
  );

  const handleShuffleGenre = useCallback(() => {
    if (!genres.length) return;
    const random = genres[Math.floor(Math.random() * genres.length)]?.id;
    if (random) {
      setSelectedGenre(random);
    }
  }, [genres]);

  const handleQuickGenre = useCallback(
    (genreId: number | null) => {
      if (genreId == null) return;
      void handleSelectGenre(genreId);
    },
    [handleSelectGenre]
  );

  return (
    <ScreenWrapper>
      <LinearGradient
        colors={[accentBase, '#150a13', '#05060f']}
        start={[0, 0]}
        end={[1, 1]}
        style={styles.gradient}
      >
        <LinearGradient
          colors={['rgba(125,216,255,0.2)', 'rgba(255,255,255,0)']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.bgOrbPrimary}
        />
        <LinearGradient
          colors={['rgba(113,0,255,0.18)', 'rgba(255,255,255,0)']}
          start={{ x: 0.8, y: 0 }}
          end={{ x: 0.2, y: 1 }}
          style={styles.bgOrbSecondary}
        />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.heroCard}>
            <LinearGradient
              colors={[accentBase, 'rgba(5,6,15,0.92)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroGradient}
            >
              <View style={styles.heroTopRow}>
                <View>
                  <Text style={styles.heroEyebrow}>Your cinema atlas</Text>
                  <Text style={styles.heroTitle}>{pickFavoriteMode ? 'Pick a Favorite' : 'Categories'}</Text>
                  <Text style={styles.heroSubtitle}>
                    {pickFavoriteMode
                      ? 'Tap a genre to save it to your profile'
                      : 'Dive into curated realms & vibes'}
                  </Text>
                </View>
                <TouchableOpacity style={styles.shuffleBtn} onPress={handleShuffleGenre}>
                  <Ionicons name="shuffle" size={18} color="#fff" />
                  <Text style={styles.shuffleText}>Shuffle</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.heroStatsRow}>
                {heroStats.map((stat) => (
                  <View key={stat.label} style={styles.heroStatCard}>
                    <Text style={styles.heroStatValue}>{stat.value}</Text>
                    <Text style={styles.heroStatLabel}>{stat.label}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.heroActions}>
                <TouchableOpacity
                  style={styles.heroPrimaryAction}
                  onPress={() => handleCategoryPress('featured')}
                >
                  <Text style={styles.heroPrimaryText}>View spotlight</Text>
                  <Ionicons name="arrow-forward" size={18} color="#000" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.heroGhostAction}
                  onPress={() => setSelectedGenre(null)}
                >
                  <Ionicons name="sparkles-outline" size={18} color="#fff" />
                  <Text style={styles.heroGhostText}>Reset filter</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>

          {genresLoading ? (
            <GlassSkeleton />
          ) : (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.moodRow}
              >
                {moodFilters.map((filter) => {
                  const isActive = selectedGenre === filter.genreId;
                  return (
                    <TouchableOpacity
                      key={filter.key}
                      activeOpacity={0.9}
                      onPress={() => handleQuickGenre(filter.genreId)}
                    >
                      <LinearGradient
                        colors={filter.colors}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.moodChip, isActive && styles.moodChipActive]}
                      >
                        <Ionicons name={filter.icon as any} size={16} color="#fff" />
                        <Text style={styles.moodChipText}>{filter.label}</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Spotlight Collections</Text>
                  <TouchableOpacity onPress={() => handleCategoryPress('featured')}>
                    <Text style={styles.sectionAction}>See all</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.spotlightRow}
                >
                  {mainCategories.map((category) => (
                    <View key={category.id} style={styles.spotlightCard}>
                      <CategoryCard
                        title={category.title}
                        image={category.image}
                        onPress={() => handleCategoryPress(category.id)}
                      />
                    </View>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Genre Universe</Text>
                  <Text style={styles.sectionSubtitle}>Tap to filter</Text>
                </View>
                <View style={styles.genreSelectorWrap}>
                  <GenreSelector
                    genres={genres}
                    selectedGenre={selectedGenre}
                    onSelectGenre={handleSelectGenre}
                  />
                </View>
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
                        if (selectedGenre) void saveAsFavorite(selectedGenre);
                      }}
                    >
                      <Ionicons name="star" size={16} color="#fff" />
                      <Text style={styles.favoriteBtnText}>
                        {savingFavorite
                          ? 'Saving…'
                          : selectedGenre && favoriteGenre?.id === selectedGenre
                            ? 'Favorited'
                            : 'Set favorite'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={[styles.sectionCard, styles.resultsCard]}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Curated Picks</Text>
                  {selectedGenreName ? (
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>{selectedGenreName}</Text>
                    </View>
                  ) : (
                    <Text style={styles.sectionSubtitle}>Select a genre to preview</Text>
                  )}
                </View>
                {isLoading ? (
                  <View style={styles.loaderWrap}>
                    <ActivityIndicator size="large" color="#E50914" />
                  </View>
                ) : selectedGenre !== null && moviesByGenre.length ? (
                  <MovieList title="" movies={moviesByGenre} carousel />
                ) : (
                  <Text style={styles.emptyState}>Choose a genre to see curated titles.</Text>
                )}
              </View>
            </>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>
      </LinearGradient>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  bgOrbPrimary: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 180,
    top: -60,
    left: -50,
    opacity: 0.65,
    transform: [{ rotate: '14deg' }],
  },
  bgOrbSecondary: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    bottom: -90,
    right: -20,
    opacity: 0.5,
    transform: [{ rotate: '-12deg' }],
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 28,
    paddingBottom: 80,
  },
  heroCard: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  heroGradient: {
    padding: 20,
    borderRadius: 24,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    letterSpacing: 0.6,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  shuffleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  shuffleText: {
    color: '#fff',
    fontWeight: '700',
  },
  heroStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  heroStatCard: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  heroStatValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  heroStatLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  heroActions: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  heroPrimaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#fff',
  },
  heroPrimaryText: {
    color: '#000',
    fontWeight: '800',
  },
  heroGhostAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  heroGhostText: {
    color: '#fff',
    fontWeight: '700',
  },
  moodRow: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 12,
    paddingTop: 4,
  },
  moodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    opacity: 0.9,
  },
  moodChipActive: {
    borderColor: '#fff',
    transform: [{ scale: 1.02 }],
  },
  moodChipText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  sectionCard: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    backgroundColor: 'rgba(5,5,15,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  sectionAction: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  spotlightRow: {
    gap: 12,
    paddingRight: 8,
  },
  spotlightCard: {
    width: 220,
  },
  genreSelectorWrap: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  favoriteRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  favoriteInfo: {
    flex: 1,
    minWidth: 0,
  },
  favoriteLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  favoriteValue: {
    marginTop: 4,
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  favoriteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  favoriteBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  resultsCard: {
    paddingBottom: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  chipText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  loaderWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  emptyState: {
    color: 'rgba(255,255,255,0.7)',
    paddingVertical: 16,
    textAlign: 'center',
  },
  skeletonWrap: {
    paddingVertical: 6,
    gap: 12,
  },
  glassCard: {
    borderRadius: 16,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    marginBottom: 12,
  },
  skelHeader: {
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skelCategories: {
    minHeight: 140,
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  skelList: {
    minHeight: 150,
    padding: 12,
  },
  skelTitle: {
    height: 14,
    width: '60%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
  },
  skelRow: {
    height: 40,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
  },
  skelLine: {
    height: 12,
    width: '85%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    marginBottom: 8,
  },
  skelLineShort: {
    height: 12,
    width: '40%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
  },
});

export default CategoriesScreen;
