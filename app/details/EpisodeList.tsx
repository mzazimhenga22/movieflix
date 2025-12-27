import { FontAwesome, MaterialIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Episode {
  id: number;
  episode_number: number;
  name: string;
  overview: string;
  runtime: number;
  still_path: string | null;
  season_number?: number;
}

interface Season {
  id: number;
  name: string;
  season_number?: number;
  episodes: Episode[];
}

interface EpisodeListProps {
  seasons: Season[];
  onPlayEpisode?: (episode: Episode, season: Season) => void;
  onDownloadEpisode?: (episode: Episode, season: Season) => void;
  disabled?: boolean;
  episodeDownloads?: Record<string, { state: 'idle' | 'preparing' | 'downloading' | 'completed' | 'error'; progress: number; error?: string }>;
}

const EpisodeList: React.FC<EpisodeListProps> = ({ seasons, onPlayEpisode, onDownloadEpisode, disabled, episodeDownloads }) => {
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(seasons.length > 0 ? seasons[0] : null);

  const handleSeasonChange = (season: Season) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedSeason(season);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Seasons & Episodes</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dropdownContainer}>
        {seasons.map((season) => (
          <TouchableOpacity
            key={season.id}
            style={[
              styles.dropdownButton,
              selectedSeason?.id === season.id && styles.dropdownButtonSelected,
            ]}
            onPress={() => handleSeasonChange(season)}
          >
            <Text style={styles.dropdownButtonText}>{season.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {selectedSeason && (
        <View style={styles.episodeListContainer}>
          {selectedSeason.episodes.map((episode, index) => (
            <Animated.View
              entering={FadeInUp.delay(index * 40)}
              exiting={FadeOutDown}
              key={episode.id}
              style={styles.episodeCard}
            >
              <EpisodeCard
                episode={episode}
                season={selectedSeason}
                disabled={disabled}
                downloads={episodeDownloads}
                onPlay={onPlayEpisode}
                onDownload={onDownloadEpisode}
              />
            </Animated.View>
          ))}
        </View>
      )}
    </View>
  );
};

const EpisodeCard = ({
  episode,
  season,
  disabled,
  downloads,
  onPlay,
  onDownload,
}: {
  episode: Episode;
  season: Season;
  disabled?: boolean;
  downloads?: EpisodeListProps['episodeDownloads'];
  onPlay?: EpisodeListProps['onPlayEpisode'];
  onDownload?: EpisodeListProps['onDownloadEpisode'];
}) => {
  const posterUrl = episode.still_path
    ? `https://image.tmdb.org/t/p/w500${episode.still_path}`
    : 'https://image.tmdb.org/t/p/w500_and_h281_bestv2/priQW1UXQwxz6Wn1Ks64h0cR3ej.jpg';

  const downloadState = downloads?.[String(episode.id)];
  const isDownloading = downloadState?.state === 'downloading' || downloadState?.state === 'preparing';
  const progress = Math.round((downloadState?.progress ?? 0) * 100);

  const cinematicNumber = useMemo(() => (episode.episode_number < 10 ? `0${episode.episode_number}` : episode.episode_number), [episode.episode_number]);

  return (
    <View style={styles.cardOuter}>
      <LinearGradient colors={['#ff512f', '#dd2476']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardGlow} />
      <BlurView intensity={40} tint="dark" style={styles.cardInner}>
        <View style={styles.posterWrap}>
          <Image source={{ uri: posterUrl }} style={styles.posterImage} />
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(5,5,18,0.85)']}
            style={styles.posterOverlay}
          />
          <View style={styles.episodeBadge}>
            <Text style={styles.badgeLabel}>EP</Text>
            <Text style={styles.badgeNumber}>{cinematicNumber}</Text>
          </View>
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {episode.name}
          </Text>
          <Text style={styles.cardOverview} numberOfLines={2}>
            {episode.overview || 'No synopsis yet—tap play to discover the story.'}
          </Text>
          <View style={styles.metadataRow}>
            <View style={styles.metaChip}>
              <Text style={styles.metaText}>{episode.runtime || 45} min</Text>
            </View>
            {season?.season_number != null && (
              <View style={styles.metaChipOutline}>
                <Text style={styles.metaTextSoft}>S{season.season_number}</Text>
              </View>
            )}
            <View style={styles.metaChipOutline}>
              <Text style={styles.metaTextSoft}>Dolby Vision</Text>
            </View>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              disabled={disabled}
              style={[styles.primaryBtn, disabled && styles.disabledBtn]}
              onPress={() => !disabled && onPlay?.(episode, season)}
            >
              <FontAwesome name="play" size={16} color="#05050E" />
              <Text style={styles.primaryBtnText}>Play</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={disabled || isDownloading}
              style={[styles.secondaryBtn, (disabled || isDownloading) && styles.disabledBtn]}
              onPress={() => !disabled && !isDownloading && onDownload?.(episode, season)}
            >
              {isDownloading ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.secondaryBtnText}>{progress}%</Text>
                </>
              ) : (
                <>
                  <MaterialIcons name="file-download" size={18} color="#fff" />
                  <Text style={styles.secondaryBtnText}>Download</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {isDownloading && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
          )}
        </View>
      </BlurView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  title: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  dropdownContainer: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  dropdownButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#333',
    marginRight: 10,
  },
  dropdownButtonSelected: {
    backgroundColor: 'red',
  },
  dropdownButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  episodeListContainer: {
    marginTop: 10,
    gap: 16,
  },
  episodeCard: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  cardOuter: {
    borderRadius: 24,
    padding: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cardGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.25,
    borderRadius: 24,
  },
  cardInner: {
    flexDirection: 'row',
    borderRadius: 24,
    overflow: 'hidden',
  },
  posterWrap: {
    width: 150,
    height: 160,
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  posterOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  episodeBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
  },
  badgeLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    letterSpacing: 1,
  },
  badgeNumber: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cardContent: {
    flex: 1,
    padding: 16,
    gap: 10,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  cardOverview: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
  },
  metadataRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  metaChip: {
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  metaChipOutline: {
    borderColor: 'rgba(255,255,255,0.3)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  metaText: {
    color: '#05050e',
    fontWeight: '700',
    fontSize: 12,
  },
  metaTextSoft: {
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderRadius: 999,
  },
  primaryBtnText: {
    color: '#05050E',
    fontWeight: '800',
    fontSize: 14,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  secondaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  disabledBtn: {
    opacity: 0.5,
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ff8a00',
  },
});

export default EpisodeList;
