import { FontAwesome, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState, useRef, memo } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenWrapper from '../../components/ScreenWrapper';
import { IMAGE_BASE_URL } from '../../constants/api';
import { getAccentFromPosterPath } from '../../constants/theme';
import {
  DownloadEvent,
  getActiveDownloads,
  subscribeToDownloadEvents,
} from '../../lib/downloadEvents';
import { cancelDownload, pauseDownload, resumeDownload } from '../../lib/downloadManager';
import { removeDownloadRecord } from '../../lib/fileUtils';
import { getProfileScopedKey } from '../../lib/profileStorage';
import { DownloadItem } from '../../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type GroupedDownloads = {
  type: 'movie' | 'show';
  title: string;
  posterPath?: string;
  items: DownloadItem[];
};

// Animated section component
interface AnimatedSectionProps {
  children: React.ReactNode;
  delay?: number;
  style?: any;
}

const AnimatedSection = memo(function AnimatedSection({ children, delay = 0, style }: AnimatedSectionProps) {
  const translateY = useRef(new Animated.Value(30)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          friction: 10,
          tension: 50,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [delay, translateY, opacity]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
});

// Storage stat card component
interface StorageStatProps {
  icon: string;
  label: string;
  value: string;
  color: string;
  delay: number;
}

const StorageStat = memo(function StorageStat({ icon, label, value, color, delay }: StorageStatProps) {
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 60, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
    ]).start();
  }, [delay, scaleAnim, opacityAnim]);

  return (
    <Animated.View
      style={[
        styles.storageStat,
        { opacity: opacityAnim, transform: [{ scale: scaleAnim }], borderColor: `${color}30` },
      ]}
    >
      <View style={[styles.storageStatIcon, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <Text style={styles.storageStatValue}>{value}</Text>
      <Text style={styles.storageStatLabel}>{label}</Text>
    </Animated.View>
  );
});

// Series group card component
interface SeriesGroupCardProps {
  group: GroupedDownloads;
  onPress: () => void;
  accentColor: string;
  index: number;
}

const SeriesGroupCard = memo(function SeriesGroupCard({ group, onPress, accentColor, index }: SeriesGroupCardProps) {
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(index * 100 + 200),
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 60, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
    ]).start();
  }, [index, scaleAnim, opacityAnim]);

  const episodeCount = group.items.length;
  const totalSize = group.items.reduce((acc, item) => acc + (item.bytesWritten || 0), 0);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <Animated.View
        style={[
          styles.seriesGroupCard,
          { opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        <LinearGradient
          colors={[`${accentColor}15`, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        
        {/* Poster stack effect */}
        <View style={styles.seriesPosterStack}>
          {group.posterPath ? (
            <>
              <View style={[styles.posterStackItem, styles.posterStackBack]} />
              <View style={[styles.posterStackItem, styles.posterStackMid]} />
              <Image
                source={{ uri: `${IMAGE_BASE_URL}${group.posterPath}` }}
                style={styles.seriesPoster}
              />
            </>
          ) : (
            <View style={styles.seriesPosterPlaceholder}>
              <Ionicons name="tv" size={28} color={accentColor} />
            </View>
          )}
          <View style={[styles.episodeCountBadge, { backgroundColor: accentColor }]}>
            <Text style={styles.episodeCountText}>{episodeCount}</Text>
          </View>
        </View>

        <View style={styles.seriesInfo}>
          <Text style={styles.seriesTitle} numberOfLines={2}>{group.title}</Text>
          <Text style={styles.seriesSubtitle}>
            {episodeCount} episode{episodeCount !== 1 ? 's' : ''} downloaded
          </Text>
          <View style={styles.seriesMeta}>
            <View style={styles.seriesMetaItem}>
              <Ionicons name="server-outline" size={12} color="rgba(255,255,255,0.5)" />
              <Text style={styles.seriesMetaText}>{formatBytesStatic(totalSize)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.seriesArrow}>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.4)" />
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
});

// Movie card component
interface MovieCardProps {
  item: DownloadItem;
  onPlay: () => void;
  onDelete: () => void;
  accentColor: string;
  index: number;
}

const MovieCard = memo(function MovieCard({ item, onPlay, onDelete, accentColor, index }: MovieCardProps) {
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(index * 100 + 200),
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 60, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
    ]).start();
  }, [index, scaleAnim, opacityAnim]);

  return (
    <Animated.View
      style={[
        styles.movieCard,
        { opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
      ]}
    >
      <TouchableOpacity onPress={onPlay} style={styles.moviePosterWrap} activeOpacity={0.9}>
        {item.posterPath ? (
          <Image
            source={{ uri: `${IMAGE_BASE_URL}${item.posterPath}` }}
            style={styles.moviePoster}
          />
        ) : (
          <View style={styles.moviePosterPlaceholder}>
            <Ionicons name="film" size={28} color={accentColor} />
          </View>
        )}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.8)']}
          style={styles.moviePosterGradient}
        />
        <View style={styles.playOverlay}>
          <View style={[styles.playButton, { backgroundColor: accentColor }]}>
            <Ionicons name="play" size={20} color="#fff" />
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.movieInfo}>
        <Text style={styles.movieTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.movieSize}>{formatBytesStatic(item.bytesWritten)}</Text>
      </View>

      <TouchableOpacity onPress={onDelete} style={styles.movieDeleteBtn}>
        <Ionicons name="trash-outline" size={16} color="#ff6b6b" />
      </TouchableOpacity>
    </Animated.View>
  );
});

// Helper function (static)
const formatBytesStatic = (bytes?: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
};

const DownloadsScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const accentColor = getAccentFromPosterPath('/downloads/accent') || '#150a13';

  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [activeDownloads, setActiveDownloads] = useState<DownloadEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const HeaderComponent = () => (
    <View style={styles.headerWrap}>
      <LinearGradient
        colors={['rgba(229,9,20,0.22)', 'rgba(10,12,24,0.4)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGlow}
      />
      <View style={styles.headerBar}>
        <View style={styles.titleRow}>
          <View style={styles.accentDot} />
          <View>
            <Text style={styles.headerEyebrow}>Your downloads</Text>
            <Text style={styles.headerText}>Offline Library</Text>
          </View>
        </View>

        <View style={styles.headerIcons}>
          <Link href="/messaging" asChild>
            <TouchableOpacity style={styles.iconBtn}>
              <LinearGradient
                colors={['#e50914', '#b20710']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconBg}
              >
                <Ionicons name="chatbubble-outline" size={22} color="#ffffff" style={styles.iconMargin} />
              </LinearGradient>
            </TouchableOpacity>
          </Link>
          <Link href="/marketplace" asChild>
            <TouchableOpacity style={styles.iconBtn}>
              <LinearGradient
                colors={['#e50914', '#b20710']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconBg}
              >
                <Ionicons name="bag-outline" size={22} color="#ffffff" style={styles.iconMargin} />
              </LinearGradient>
            </TouchableOpacity>
          </Link>
          <Link href="/social-feed" asChild>
            <TouchableOpacity style={styles.iconBtn}>
              <LinearGradient
                colors={['#e50914', '#b20710']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconBg}
              >
                <Ionicons name="people-outline" size={22} color="#ffffff" style={styles.iconMargin} />
              </LinearGradient>
            </TouchableOpacity>
          </Link>

          <Link href="/profile" asChild>
            <TouchableOpacity style={styles.iconBtn}>
              <LinearGradient
                colors={['#e50914', '#b20710']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconBg}
              >
                <FontAwesome name="user-circle" size={24} color="#ffffff" />
              </LinearGradient>
            </TouchableOpacity>
          </Link>
        </View>
      </View>

      <View style={styles.headerMetaRow}>
        <View style={styles.metaPill}>
          <Ionicons name="cloud-download" size={14} color="#fff" />
          <Text style={styles.metaText}>{downloads.length} downloads</Text>
        </View>
        <View style={[styles.metaPill, styles.metaPillSoft]}>
          <Ionicons name="time" size={14} color="#fff" />
          <Text style={styles.metaText}>{activeDownloads.length} active</Text>
        </View>
        <View style={[styles.metaPill, styles.metaPillOutline]}>
          <Ionicons name="server" size={14} color="#fff" />
          <Text style={styles.metaText}>{formatBytes(downloads.reduce((acc, item) => acc + (item.bytesWritten || 0), 0))}</Text>
        </View>
      </View>
    </View>
  );



  const loadDownloads = useCallback(async () => {
    try {
      const key = await getProfileScopedKey('downloads');
      const stored = await AsyncStorage.getItem(key);
      setDownloads(stored ? JSON.parse(stored) : []);
    } catch {
      setDownloads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadDownloads();
    }, [loadDownloads]),
  );

  const handleDownloadEvent = useCallback(
    (event: DownloadEvent) => {
      setActiveDownloads((prev) => {
        const rest = prev.filter((e) => e.sessionId !== event.sessionId);
        if (event.status === 'completed' || event.status === 'error' || event.status === 'cancelled') {
          return rest;
        }
        return [...rest, event];
      });

      if (event.status === 'completed' || event.status === 'error' || event.status === 'cancelled') {
        loadDownloads();
      }
    },
    [loadDownloads],
  );

  useEffect(() => {
    setActiveDownloads(getActiveDownloads());
    const unsub = subscribeToDownloadEvents(handleDownloadEvent);
    return unsub;
  }, [handleDownloadEvent]);

  const groupedDownloads = useMemo(() => {
    const groups: GroupedDownloads[] = [];
    const shows = new Map<string, DownloadItem[]>();

    downloads.forEach((item) => {
      if (item.mediaType === 'tv') {
        const key = item.title || 'Untitled Show';
        shows.set(key, [...(shows.get(key) || []), item]);
      } else {
        groups.push({ type: 'movie', title: item.title, posterPath: item.posterPath, items: [item] });
      }
    });

    shows.forEach((items, title) => {
      groups.push({ type: 'show', title, posterPath: items[0]?.posterPath, items });
    });

    return groups;
  }, [downloads]);

  const [selectedSeries, setSelectedSeries] = useState<GroupedDownloads | null>(null);

  const totalStorage = useMemo(() => {
    return downloads.reduce((acc, item) => acc + (item.bytesWritten || 0), 0);
  }, [downloads]);

  const seriesCount = useMemo(() => {
    return groupedDownloads.filter((g) => g.type === 'show').length;
  }, [groupedDownloads]);

  const movieCount = useMemo(() => {
    return groupedDownloads.filter((g) => g.type === 'movie').length;
  }, [groupedDownloads]);

  const formatBytes = (bytes?: number) => {
    if (!bytes) return null;
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let i = 0;
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024;
      i++;
    }
    return `${size.toFixed(1)} ${units[i]}`;
  };

  const ensureDownloadAvailable = useCallback(async (item: DownloadItem) => {
    try {
      const primaryPath = item.localUri;
      const containerPath = item.containerPath;

      const [primaryInfo, containerInfo] = await Promise.all([
        primaryPath ? FileSystem.getInfoAsync(primaryPath) : Promise.resolve({ exists: false }),
        containerPath ? FileSystem.getInfoAsync(containerPath) : Promise.resolve({ exists: true }),
      ]);

      if (!primaryInfo.exists || (item.downloadType === 'hls' && containerPath && !containerInfo.exists)) {
        Alert.alert(
          'Download missing',
          'We could not find the offline files for this title. Remove it and download again?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Remove',
              style: 'destructive',
              onPress: () => setDownloads((prev) => prev.filter((d) => d.id !== item.id)),
            },
          ],
        );
        return false;
      }

      return true;
    } catch (err) {
      console.warn('[downloads] availability check failed', err);
      Alert.alert('Download unavailable', 'Unable to verify this download. Please try downloading again.');
      return false;
    }
  }, []);

  const handlePlay = useCallback(
    async (item: DownloadItem) => {
      const available = await ensureDownloadAvailable(item);
      if (!available) return;

      const seasonNumber = typeof item.seasonNumber === 'number' ? item.seasonNumber : undefined;
      const episodeNumber = typeof item.episodeNumber === 'number' ? item.episodeNumber : undefined;

      const maybeEpisodeParams =
        item.mediaType === 'tv'
          ? {
              ...(seasonNumber ? { seasonNumber: String(seasonNumber) } : {}),
              ...(episodeNumber ? { episodeNumber: String(episodeNumber) } : {}),
              ...(seasonNumber ? { seasonTitle: `Season ${seasonNumber}` } : {}),
            }
          : {};

      router.push({
        pathname: '/video-player',
        params: {
          title: item.title,
          videoUrl: item.localUri,
          mediaType: item.mediaType,
          tmdbId: item.mediaId?.toString(),
          releaseYear: item.releaseDate?.slice(0, 4),
          ...(item.posterPath ? { posterPath: item.posterPath } : {}),
          ...(item.backdropPath ? { backdropPath: item.backdropPath } : {}),
          ...(item.overview ? { overview: item.overview } : {}),
          ...(item.releaseDate ? { releaseDate: item.releaseDate } : {}),
          ...maybeEpisodeParams,
        },
      });
    },
    [ensureDownloadAvailable, router],
  );

  const confirmDelete = (item: DownloadItem) => {
    Alert.alert('Remove download?', item.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelDownload(item.id);
          } catch {}
          try {
            await FileSystem.deleteAsync(
              item.containerPath ?? item.localUri,
              { idempotent: true },
            );
          } catch {}
          try {
            await removeDownloadRecord(item.id);
          } catch {}
          setDownloads((prev) => prev.filter((d) => d.id !== item.id));
        },
      },
    ]);
  };

  const renderDownloadItem = (item: DownloadItem) => (
    (() => {
      const seasonNumber = typeof item.seasonNumber === 'number' ? item.seasonNumber : undefined;
      const episodeNumber = typeof item.episodeNumber === 'number' ? item.episodeNumber : undefined;
      const episodeLabel =
        item.mediaType === 'tv' && seasonNumber && episodeNumber
          ? `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`
          : null;

      return (
    <View key={item.id} style={styles.downloadCard}>
      <TouchableOpacity onPress={() => handlePlay(item)} style={styles.posterWrap}>
        {item.posterPath ? (
          <Image
            source={{ uri: `${IMAGE_BASE_URL}${item.posterPath}` }}
            style={styles.poster}
          />
        ) : (
          <View style={styles.posterPlaceholder}>
            <Ionicons name="download" size={22} color="#fff" />
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.downloadMeta}>
        <Text style={styles.downloadTitle} numberOfLines={1}>
          {item.title}
        </Text>

        <Text style={styles.downloadSubtitle}>
          {episodeLabel ? `Episode • ${episodeLabel}` : null}
          {episodeLabel && item.bytesWritten ? ' • ' : null}
          {formatBytes(item.bytesWritten)}
        </Text>

        {!!item.overview && (
          <Text style={styles.downloadSubtitle} numberOfLines={2}>
            {item.overview}
          </Text>
        )}

        <View style={styles.downloadActions}>
          <TouchableOpacity
            style={styles.downloadAction}
            onPress={() => handlePlay(item)}
          >
            <Ionicons name="play" size={14} color="#fff" />
            <Text style={styles.downloadActionText}>Watch</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.downloadAction, styles.deleteButton]}
            onPress={() => confirmDelete(item)}
          >
            <Ionicons name="trash" size={14} color="#ffb0b0" />
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
      );
    })()
  );

  const ListHeader = () => (
    <>
      {activeDownloads.length > 0 && (
        <View style={styles.activeDownloadsCard}>
          <Text style={styles.activeDownloadsTitle}>Active downloads</Text>

          {activeDownloads.map((item) => {
            const pct = Math.round((item.progress ?? 0) * 100);
            return (
              <View key={item.sessionId} style={{ marginBottom: 12 }}>
                <View style={styles.activeDownloadMeta}>
                  <Text style={styles.activeDownloadName} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <View style={styles.activeDownloadControls}>
                    <TouchableOpacity
                      style={styles.controlButton}
                      onPress={() => {
                        if (item.status === 'paused') {
                          setActiveDownloads((prev) =>
                            prev.map((e) =>
                              e.sessionId === item.sessionId ? { ...e, status: 'queued' } : e,
                            ),
                          );
                          void resumeDownload(item.sessionId);
                        } else if (item.status === 'downloading' || item.status === 'preparing' || item.status === 'queued') {
                          setActiveDownloads((prev) =>
                            prev.map((e) =>
                              e.sessionId === item.sessionId ? { ...e, status: 'paused' } : e,
                            ),
                          );
                          void pauseDownload(item.sessionId);
                        }
                      }}
                    >
                      <Ionicons
                        name={item.status === 'paused' ? 'play' : 'pause'}
                        size={16}
                        color="#fff"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.controlButton, styles.cancelButton]}
                      onPress={() => {
                        setActiveDownloads((prev) => prev.filter((e) => e.sessionId !== item.sessionId));
                        void cancelDownload(item.sessionId);
                      }}
                    >
                      <Ionicons name="close" size={16} color="#ffb0b0" />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.activeDownloadProgress}>
                  <View
                    style={[
                      styles.activeDownloadProgressFill,
                      { width: `${pct}%` },
                    ]}
                  />
                </View>
                <Text style={styles.activeDownloadPercent}>
                  {item.status === 'queued'
                    ? 'Queued'
                    : item.status === 'preparing'
                    ? 'Preparing'
                    : item.status === 'paused'
                    ? `Paused • ${pct}%`
                    : `${pct}%`}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </>
  );

  // Series detail subscreen
  if (selectedSeries) {
    return (
      <ScreenWrapper>
        <LinearGradient
          colors={[accentColor, '#150a13', '#05060f']}
          style={StyleSheet.absoluteFill}
        />

        {/* Series detail header */}
        <View style={styles.seriesDetailHeader}>
          <TouchableOpacity
            onPress={() => setSelectedSeries(null)}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.seriesDetailInfo}>
            <Text style={styles.seriesDetailTitle} numberOfLines={1}>{selectedSeries.title}</Text>
            <Text style={styles.seriesDetailSubtitle}>
              {selectedSeries.items.length} episode{selectedSeries.items.length !== 1 ? 's' : ''} • {formatBytesStatic(selectedSeries.items.reduce((acc, i) => acc + (i.bytesWritten || 0), 0))}
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 + insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          {selectedSeries.items.map((item, idx) => {
            const seasonNumber = typeof item.seasonNumber === 'number' ? item.seasonNumber : undefined;
            const episodeNumber = typeof item.episodeNumber === 'number' ? item.episodeNumber : undefined;
            const episodeLabel =
              seasonNumber && episodeNumber
                ? `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`
                : null;

            return (
              <AnimatedSection key={item.id} delay={idx * 80} style={styles.episodeCard}>
                <TouchableOpacity onPress={() => handlePlay(item)} style={styles.episodePosterWrap}>
                  {item.posterPath ? (
                    <Image
                      source={{ uri: `${IMAGE_BASE_URL}${item.posterPath}` }}
                      style={styles.episodePoster}
                    />
                  ) : (
                    <View style={styles.episodePosterPlaceholder}>
                      <Ionicons name="film" size={20} color={accentColor} />
                    </View>
                  )}
                  <View style={[styles.episodePlayIcon, { backgroundColor: accentColor }]}>
                    <Ionicons name="play" size={12} color="#fff" />
                  </View>
                </TouchableOpacity>

                <View style={styles.episodeInfo}>
                  {episodeLabel && <Text style={[styles.episodeLabel, { color: accentColor }]}>{episodeLabel}</Text>}
                  <Text style={styles.episodeTitle} numberOfLines={1}>{item.episodeTitle || item.title}</Text>
                  <Text style={styles.episodeSize}>{formatBytesStatic(item.bytesWritten)}</Text>
                </View>

                <TouchableOpacity onPress={() => confirmDelete(item)} style={styles.episodeDeleteBtn}>
                  <Ionicons name="trash-outline" size={16} color="#ff6b6b" />
                </TouchableOpacity>
              </AnimatedSection>
            );
          })}
        </ScrollView>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <LinearGradient
        colors={[accentColor, '#150a13', '#05060f']}
        style={StyleSheet.absoluteFill}
      />

      <HeaderComponent />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* Storage Stats */}
        <AnimatedSection delay={0} style={styles.storageStatsRow}>
          <StorageStat
            icon="server"
            label="Total"
            value={formatBytesStatic(totalStorage)}
            color="#e50914"
            delay={50}
          />
          <StorageStat
            icon="film"
            label="Movies"
            value={String(movieCount)}
            color="#3b82f6"
            delay={100}
          />
          <StorageStat
            icon="tv"
            label="Series"
            value={String(seriesCount)}
            color="#8b5cf6"
            delay={150}
          />
        </AnimatedSection>

        {/* Active Downloads */}
        {activeDownloads.length > 0 && (
          <AnimatedSection delay={100} style={styles.activeDownloadsCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconWrap, { backgroundColor: 'rgba(229,9,20,0.2)' }]}>
                <Ionicons name="cloud-download" size={18} color="#e50914" />
              </View>
              <Text style={styles.sectionHeaderTitle}>Active Downloads</Text>
            </View>

            {activeDownloads.map((item) => {
              const pct = Math.round((item.progress ?? 0) * 100);
              return (
                <View key={item.sessionId} style={styles.activeDownloadRow}>
                  <View style={styles.activeDownloadMeta}>
                    <Text style={styles.activeDownloadName} numberOfLines={1}>{item.title}</Text>
                    <View style={styles.activeDownloadControls}>
                      <TouchableOpacity
                        style={styles.controlButton}
                        onPress={() => {
                          if (item.status === 'paused') {
                            setActiveDownloads((prev) =>
                              prev.map((e) =>
                                e.sessionId === item.sessionId ? { ...e, status: 'queued' } : e,
                              ),
                            );
                            void resumeDownload(item.sessionId);
                          } else if (item.status === 'downloading' || item.status === 'preparing' || item.status === 'queued') {
                            setActiveDownloads((prev) =>
                              prev.map((e) =>
                                e.sessionId === item.sessionId ? { ...e, status: 'paused' } : e,
                              ),
                            );
                            void pauseDownload(item.sessionId);
                          }
                        }}
                      >
                        <Ionicons
                          name={item.status === 'paused' ? 'play' : 'pause'}
                          size={14}
                          color="#fff"
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.controlButton, styles.cancelButton]}
                        onPress={() => {
                          setActiveDownloads((prev) => prev.filter((e) => e.sessionId !== item.sessionId));
                          void cancelDownload(item.sessionId);
                        }}
                      >
                        <Ionicons name="close" size={14} color="#ff6b6b" />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.activeDownloadProgress}>
                    <View style={[styles.activeDownloadProgressFill, { width: `${pct}%`, backgroundColor: accentColor }]} />
                  </View>
                  <Text style={styles.activeDownloadPercent}>
                    {item.status === 'queued' ? 'Queued' : item.status === 'preparing' ? 'Preparing' : item.status === 'paused' ? `Paused • ${pct}%` : `${pct}%`}
                  </Text>
                </View>
              );
            })}
          </AnimatedSection>
        )}

        {/* Series Section */}
        {seriesCount > 0 && (
          <AnimatedSection delay={200} style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconWrap, { backgroundColor: 'rgba(139,92,246,0.2)' }]}>
                <Ionicons name="tv" size={18} color="#8b5cf6" />
              </View>
              <Text style={styles.sectionHeaderTitle}>TV Series</Text>
            </View>

            {groupedDownloads.filter(g => g.type === 'show').map((group, idx) => (
              <SeriesGroupCard
                key={group.title}
                group={group}
                onPress={() => setSelectedSeries(group)}
                accentColor={accentColor}
                index={idx}
              />
            ))}
          </AnimatedSection>
        )}

        {/* Movies Section */}
        {movieCount > 0 && (
          <AnimatedSection delay={300} style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconWrap, { backgroundColor: 'rgba(59,130,246,0.2)' }]}>
                <Ionicons name="film" size={18} color="#3b82f6" />
              </View>
              <Text style={styles.sectionHeaderTitle}>Movies</Text>
            </View>

            {groupedDownloads.filter(g => g.type === 'movie').map((group, idx) => (
              group.items[0] && (
                <MovieCard
                  key={group.items[0].id}
                  item={group.items[0]}
                  onPlay={() => handlePlay(group.items[0])}
                  onDelete={() => confirmDelete(group.items[0])}
                  accentColor={accentColor}
                  index={idx}
                />
              )
            ))}
          </AnimatedSection>
        )}

        {/* Empty state */}
        {downloads.length === 0 && !loading && (
          <AnimatedSection delay={100} style={styles.emptyState}>
            <View style={[styles.emptyStateIcon, { backgroundColor: `${accentColor}20` }]}>
              <Ionicons name="cloud-download-outline" size={48} color={accentColor} />
            </View>
            <Text style={styles.emptyStateTitle}>No downloads yet</Text>
            <Text style={styles.emptyStateSubtitle}>
              Download movies and shows to watch offline
            </Text>
          </AnimatedSection>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  // Header glass hero
  headerWrap: {
    marginHorizontal: 12,
    marginTop: Platform.OS === 'ios' ? 80 : 50,
    marginBottom: 6,
    borderRadius: 18,
    overflow: 'hidden',
  },
  headerGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.7,
  },
  headerBar: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accentDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#e50914',
    shadowColor: '#e50914',
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    letterSpacing: 0.6,
  },
  headerText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    marginLeft: 8,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    shadowColor: '#e50914',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  iconBg: {
    padding: 10,
    borderRadius: 12,
  },
  iconMargin: {
    marginRight: 4,
  },
  headerMetaRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  metaPillSoft: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  metaPillOutline: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  metaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  activeDownloadsCard: {
    borderRadius: 18,
    backgroundColor: 'rgba(5,6,15,0.85)',
    padding: 16,
    marginBottom: 16,
  },
  activeDownloadsTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  activeDownloadMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  activeDownloadName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    marginRight: 10,
  },
  activeDownloadPercent: {
    color: '#fff',
    fontSize: 12,
  },
  activeDownloadProgress: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 999,
    marginTop: 6,
    overflow: 'hidden',
  },
  activeDownloadProgressFill: {
    height: '100%',
    backgroundColor: '#e50914',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginVertical: 10,
  },
  downloadCard: {
    flexDirection: 'row',
    borderRadius: 18,
    backgroundColor: 'rgba(5,6,15,0.85)',
    marginBottom: 16,
    overflow: 'hidden',
  },
  posterWrap: { width: 110 },
  poster: { width: 110, height: 165 },
  posterPlaceholder: {
    width: 110,
    height: 165,
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadMeta: { flex: 1, padding: 14 },
  downloadTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  downloadSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  downloadActions: { flexDirection: 'row', marginTop: 8, gap: 10 },
  downloadAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  downloadActionText: { color: '#fff', fontSize: 12 },
  deleteButton: {
    backgroundColor: 'rgba(255,107,107,0.18)',
  },
  deleteButtonText: {
    color: '#ffb0b0',
    fontSize: 12,
  },
  activeDownloadControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: 'rgba(255,107,107,0.18)',
  },

  // Storage stats
  storageStatsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    marginBottom: 20,
  },
  storageStat: {
    flex: 1,
    backgroundColor: 'rgba(15,18,35,0.8)',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  storageStatIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  storageStatValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  storageStatLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginTop: 2,
  },

  // Section styling
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  sectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },

  // Series group card
  seriesGroupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15,18,35,0.8)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  seriesPosterStack: {
    width: 70,
    height: 100,
    position: 'relative',
  },
  posterStackItem: {
    position: 'absolute',
    width: 60,
    height: 90,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
  },
  posterStackBack: {
    top: 0,
    left: 0,
    opacity: 0.4,
  },
  posterStackMid: {
    top: 4,
    left: 4,
    opacity: 0.7,
  },
  seriesPoster: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 60,
    height: 90,
    borderRadius: 8,
  },
  seriesPosterPlaceholder: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 60,
    height: 90,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodeCountBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodeCountText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  seriesInfo: {
    flex: 1,
    marginLeft: 12,
  },
  seriesTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  seriesSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginBottom: 6,
  },
  seriesMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  seriesMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  seriesMetaText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
  },
  seriesArrow: {
    padding: 8,
  },

  // Movie card
  movieCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15,18,35,0.8)',
    borderRadius: 16,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  moviePosterWrap: {
    width: 70,
    height: 100,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  moviePoster: {
    width: '100%',
    height: '100%',
  },
  moviePosterPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moviePosterGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
  },
  playOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  movieInfo: {
    flex: 1,
    marginLeft: 12,
  },
  movieTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  movieSize: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  movieDeleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,107,107,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Series detail view
  seriesDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  seriesDetailInfo: {
    flex: 1,
  },
  seriesDetailTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  seriesDetailSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 2,
  },

  // Episode card
  episodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15,18,35,0.8)',
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  episodePosterWrap: {
    width: 60,
    height: 85,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  episodePoster: {
    width: '100%',
    height: '100%',
  },
  episodePosterPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodePlayIcon: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  episodeLabel: {
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 2,
  },
  episodeTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  episodeSize: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
  },
  episodeDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,107,107,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Active download row
  activeDownloadRow: {
    marginBottom: 14,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyStateTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    textAlign: 'center',
  },
});

export default DownloadsScreen;
