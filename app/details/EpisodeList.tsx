import { FontAwesome, Ionicons, MaterialIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import ReanimatedView, { FadeInUp, FadeOutDown } from 'react-native-reanimated';
import {
  DownloadEvent,
  getActiveDownloads,
  subscribeToDownloadEvents,
} from '@/lib/downloadEvents';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface Episode {
  id: number;
  episode_number: number;
  name: string;
  overview: string;
  runtime: number;
  still_path: string | null;
  season_number?: number;
}

export interface Season {
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
  accentColor?: string;
  tmdbId?: number;
}

const EpisodeList: React.FC<EpisodeListProps> = ({ 
  seasons, 
  onPlayEpisode, 
  onDownloadEpisode, 
  disabled, 
  episodeDownloads,
  accentColor = '#e50914',
  tmdbId,
}) => {
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(seasons.length > 0 ? seasons[0] : null);
  const scrollViewRef = useRef<ScrollView>(null);
  const indicatorAnim = useRef(new Animated.Value(0)).current;
  const [seasonWidths, setSeasonWidths] = useState<number[]>([]);
  
  // Subscribe to global download events for real-time progress
  const [activeDownloads, setActiveDownloads] = useState<DownloadEvent[]>([]);
  
  useEffect(() => {
    setActiveDownloads(getActiveDownloads());
    const unsub = subscribeToDownloadEvents((event) => {
      setActiveDownloads((prev) => {
        const rest = prev.filter((e) => e.sessionId !== event.sessionId);
        if (event.status === 'completed' || event.status === 'error' || event.status === 'cancelled') {
          return rest;
        }
        return [...rest, event];
      });
    });
    return unsub;
  }, []);

  const handleSeasonChange = (season: Season, index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedSeason(season);
    
    // Animate indicator
    const offset = seasonWidths.slice(0, index).reduce((a, b) => a + b, 0) + index * 8;
    Animated.spring(indicatorAnim, {
      toValue: offset,
      friction: 8,
      tension: 80,
      useNativeDriver: true,
    }).start();
  };

  const selectedIndex = seasons.findIndex(s => s.id === selectedSeason?.id);
  const totalEpisodes = selectedSeason?.episodes.length || 0;
  const totalRuntime = selectedSeason?.episodes.reduce((acc, ep) => acc + (ep.runtime || 45), 0) || 0;

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={[styles.accentDot, { backgroundColor: accentColor }]} />
          <Text style={styles.title}>Episodes</Text>
        </View>
        <View style={styles.headerMeta}>
          <Text style={styles.metaText}>{totalEpisodes} eps</Text>
          <View style={styles.metaDot} />
          <Text style={styles.metaText}>{Math.floor(totalRuntime / 60)}h {totalRuntime % 60}m</Text>
        </View>
      </View>

      {/* Season Tabs */}
      <View style={styles.seasonTabsContainer}>
        <ScrollView 
          ref={scrollViewRef}
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.seasonTabs}
        >
          {seasons.map((season, index) => {
            const isSelected = selectedSeason?.id === season.id;
            return (
              <TouchableOpacity
                key={season.id}
                onLayout={(e) => {
                  const w = e.nativeEvent.layout.width;
                  setSeasonWidths(prev => {
                    const next = [...prev];
                    next[index] = w;
                    return next;
                  });
                }}
                style={[
                  styles.seasonTab,
                  isSelected && styles.seasonTabSelected,
                  isSelected && { borderColor: accentColor },
                ]}
                onPress={() => handleSeasonChange(season, index)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.seasonTabText,
                  isSelected && styles.seasonTabTextSelected,
                  isSelected && { color: accentColor },
                ]}>
                  {season.name}
                </Text>
                <Text style={styles.seasonEpCount}>{season.episodes.length} ep</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Episodes Grid */}
      {selectedSeason && (
        <View style={styles.episodesGrid}>
          {selectedSeason.episodes.map((episode, index) => (
            <ReanimatedView
              entering={FadeInUp.delay(index * 30).springify()}
              exiting={FadeOutDown}
              key={episode.id}
              style={styles.episodeCardWrap}
            >
              <EpisodeCard
                episode={episode}
                season={selectedSeason}
                disabled={disabled}
                downloads={episodeDownloads}
                activeDownloads={activeDownloads}
                onPlay={onPlayEpisode}
                onDownload={onDownloadEpisode}
                accentColor={accentColor}
                tmdbId={tmdbId}
              />
            </ReanimatedView>
          ))}
        </View>
      )}
    </View>
  );
};

export const EpisodeCard = ({
  episode,
  season,
  disabled,
  downloads,
  activeDownloads,
  onPlay,
  onDownload,
  accentColor = '#e50914',
  tmdbId,
}: {
  episode: Episode;
  season: Season;
  disabled?: boolean;
  downloads?: EpisodeListProps['episodeDownloads'];
  activeDownloads?: DownloadEvent[];
  onPlay?: EpisodeListProps['onPlayEpisode'];
  onDownload?: EpisodeListProps['onDownloadEpisode'];
  accentColor?: string;
  tmdbId?: number;
}) => {
  const posterUrl = episode.still_path
    ? `https://image.tmdb.org/t/p/w500${episode.still_path}`
    : null;

  // Get download state from props or active downloads
  const localDownloadState = downloads?.[String(episode.id)];
  
  // Check active downloads for real-time progress (match by episode info)
  const activeDownload = activeDownloads?.find(d => 
    d.episodeNumber === episode.episode_number && 
    d.seasonNumber === (episode.season_number ?? season.season_number)
  );
  
  // Merge states - active downloads take precedence
  const isDownloading = activeDownload?.status === 'downloading' || 
    activeDownload?.status === 'preparing' ||
    localDownloadState?.state === 'downloading' || 
    localDownloadState?.state === 'preparing';
  
  const isPaused = activeDownload?.status === 'paused';
  const isCompleted = localDownloadState?.state === 'completed';
  
  // Use active download progress if available (same calculation as downloads screen)
  const progress = activeDownload 
    ? Math.round((activeDownload.progress ?? 0) * 100)
    : Math.round((localDownloadState?.progress ?? 0) * 100);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  useEffect(() => {
    if (isDownloading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.02, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isDownloading]);

  const cinematicNumber = useMemo(
    () => (episode.episode_number < 10 ? `0${episode.episode_number}` : String(episode.episode_number)), 
    [episode.episode_number]
  );

  const formatRuntime = (mins: number) => {
    if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    return `${mins}m`;
  };

  return (
    <Animated.View style={[styles.cardOuter, { transform: [{ scale: pulseAnim }] }]}>
      {/* Accent glow */}
      <LinearGradient 
        colors={[`${accentColor}40`, `${accentColor}10`, 'transparent']} 
        start={{ x: 0, y: 0 }} 
        end={{ x: 1, y: 1 }} 
        style={styles.cardGlow} 
      />
      
      <View style={styles.cardInner}>
        {/* Thumbnail Section */}
        <View style={styles.thumbnailWrap}>
          {posterUrl ? (
            <ExpoImage
              source={{ uri: posterUrl }}
              style={styles.thumbnail}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <LinearGradient
              colors={['#1a1a2e', '#16213e']}
              style={styles.thumbnail}
            >
              <Ionicons name="film-outline" size={32} color="rgba(255,255,255,0.3)" />
            </LinearGradient>
          )}
          
          {/* Overlay gradient */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
            style={styles.thumbnailOverlay}
          />
          
          {/* Episode badge */}
          <View style={[styles.episodeBadge, { backgroundColor: `${accentColor}dd` }]}>
            <Text style={styles.badgeNumber}>{cinematicNumber}</Text>
          </View>
          
          {/* Play button overlay */}
          <TouchableOpacity
            style={styles.playOverlay}
            onPress={() => !disabled && onPlay?.(episode, season)}
            disabled={disabled}
            activeOpacity={0.8}
          >
            <View style={[styles.playBtn, { backgroundColor: accentColor }]}>
              <Ionicons name="play" size={18} color="#fff" style={{ marginLeft: 2 }} />
            </View>
          </TouchableOpacity>
          
          {/* Duration badge */}
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatRuntime(episode.runtime || 45)}</Text>
          </View>
        </View>

        {/* Content Section */}
        <View style={styles.contentSection}>
          <Text style={styles.episodeTitle} numberOfLines={1}>
            {episode.name}
          </Text>
          
          <Text style={styles.episodeOverview} numberOfLines={2}>
            {episode.overview || 'No description available for this episode.'}
          </Text>

          {/* Meta chips */}
          <View style={styles.metaChips}>
            {season?.season_number != null && (
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>S{season.season_number}</Text>
              </View>
            )}
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>HD</Text>
            </View>
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>5.1</Text>
            </View>
          </View>

          {/* Download Progress or Button */}
          {isDownloading || isPaused ? (
            <View style={styles.downloadProgressWrap}>
              <View style={styles.downloadProgressHeader}>
                <View style={styles.downloadStatusRow}>
                  {isDownloading && <ActivityIndicator size="small" color={accentColor} />}
                  {isPaused && <Ionicons name="pause-circle" size={16} color="#ffa500" />}
                  <Text style={styles.downloadStatusText}>
                    {isPaused ? 'Paused' : 'Downloading'}
                  </Text>
                </View>
                <Text style={[styles.downloadPercent, { color: accentColor }]}>{progress}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <Animated.View 
                  style={[
                    styles.progressFill, 
                    { 
                      backgroundColor: accentColor,
                      width: progressAnim.interpolate({
                        inputRange: [0, 100],
                        outputRange: ['0%', '100%'],
                      }),
                    }
                  ]} 
                />
              </View>
            </View>
          ) : isCompleted ? (
            <View style={styles.completedRow}>
              <Ionicons name="checkmark-circle" size={18} color="#4ade80" />
              <Text style={styles.completedText}>Downloaded</Text>
            </View>
          ) : (
            <TouchableOpacity
              disabled={disabled}
              style={[styles.downloadBtn, disabled && styles.disabledBtn]}
              onPress={() => !disabled && onDownload?.(episode, season)}
              activeOpacity={0.7}
            >
              <MaterialIcons name="file-download" size={18} color="#fff" />
              <Text style={styles.downloadBtnText}>Download</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accentDot: {
    width: 4,
    height: 20,
    borderRadius: 2,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  seasonTabsContainer: {
    marginBottom: 16,
  },
  seasonTabs: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 16,
  },
  seasonTab: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  seasonTabSelected: {
    backgroundColor: 'rgba(229,9,20,0.12)',
  },
  seasonTabText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
  },
  seasonTabTextSelected: {
    fontWeight: '700',
  },
  seasonEpCount: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginTop: 2,
  },
  episodesGrid: {
    gap: 12,
  },
  episodeCardWrap: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardOuter: {
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
  },
  cardGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.5,
  },
  cardInner: {
    flexDirection: 'row',
    padding: 10,
    gap: 12,
  },
  thumbnailWrap: {
    width: 130,
    height: 90,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  episodeBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeNumber: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  durationBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  contentSection: {
    flex: 1,
    justifyContent: 'center',
    gap: 6,
  },
  episodeTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  episodeOverview: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    lineHeight: 16,
  },
  metaChips: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
  },
  metaChip: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  metaChipText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '600',
  },
  downloadProgressWrap: {
    marginTop: 4,
    gap: 6,
  },
  downloadProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  downloadStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  downloadStatusText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
  },
  downloadPercent: {
    fontSize: 13,
    fontWeight: '800',
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  completedText: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: '600',
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  downloadBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  disabledBtn: {
    opacity: 0.5,
  },
});

export default EpisodeList;
