import { FontAwesome, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import LiquidGlass from '../../components/app-components/LiquidGlass';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IMAGE_BASE_URL } from '../../constants/api';
import {
  DownloadEvent,
  getActiveDownloads,
  subscribeToDownloadEvents,
} from '../../lib/downloadEvents';
import { cancelDownload, pauseDownload, resumeDownload } from '../../lib/downloadManager';
import { removeDownloadRecord } from '../../lib/fileUtils';
import { getProfileScopedKey } from '../../lib/profileStorage';
import { DownloadItem, Media } from '../../types/index';
import { useGlobalMusicPlayer } from '../../components/app-components/GlobalMusicPlayer';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type GroupedDownloads = {
  type: 'movie' | 'show' | 'music';
  title: string;
  posterPath?: string;
  items: DownloadItem[];
};

const AnimatedSection = memo(function AnimatedSection({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: any }) {
  const translateY = useRef(new Animated.Value(20)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
    ]).start();
  }, [delay]);

  return <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>;
});

const StorageStat = memo(function StorageStat({ icon, label, value, color, delay }: { icon: string; label: string; value: string; color: string; delay: number }) {
  return (
    <AnimatedSection delay={delay} style={styles.storageStat}>
      <LiquidGlass cornerRadius={24} tintOpacity={0.1} tintColor={color} style={StyleSheet.absoluteFill} />
      <View style={[styles.storageStatIcon, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <Text style={styles.storageStatValue}>{value}</Text>
      <Text style={styles.storageStatLabel}>{label}</Text>
    </AnimatedSection>
  );
});

const DownloadsScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { playTrack, playerActive } = useGlobalMusicPlayer();

  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [activeDownloads, setActiveDownloads] = useState<DownloadEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSeries, setSelectedSeries] = useState<GroupedDownloads | null>(null);

  // Scroll animations for Dynamic Island
  const scrollY = useRef(new Animated.Value(0)).current;

  const islandTranslateY = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [0, -10],
    extrapolate: 'clamp',
  });

  const islandOpacity = scrollY.interpolate({
    inputRange: [0, 60],
    outputRange: [1, 0.95],
    extrapolate: 'clamp',
  });

  const headerTextOpacity = scrollY.interpolate({
    inputRange: [0, 40],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const loadDownloads = useCallback(async () => {
    try {
      const key = await getProfileScopedKey('downloads');
      const stored = await AsyncStorage.getItem(key);
      setDownloads(stored ? JSON.parse(stored) : []);
    } catch {
      setDownloads([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadDownloads(); }, [loadDownloads]));

  useEffect(() => {
    setActiveDownloads(getActiveDownloads());
    return subscribeToDownloadEvents((event) => {
      setActiveDownloads((prev) => {
        const rest = prev.filter((e) => e.sessionId !== event.sessionId);
        if (['completed', 'error', 'cancelled'].includes(event.status)) return rest;
        return [...rest, event];
      });
      if (['completed', 'error', 'cancelled'].includes(event.status)) loadDownloads();
    });
  }, [loadDownloads]);

  const groupedDownloads = useMemo(() => {
    const groups: GroupedDownloads[] = [];
    const shows = new Map<string, DownloadItem[]>();
    downloads.forEach((item) => {
      if (item.mediaType === 'tv') {
        const key = item.title || 'Untitled Show';
        shows.set(key, [...(shows.get(key) || []), item]);
      } else if (item.mediaType === 'music') {
        groups.push({ type: 'music', title: item.title, posterPath: item.posterPath ?? undefined, items: [item] });
      } else {
        groups.push({ type: 'movie', title: item.title, posterPath: item.posterPath ?? undefined, items: [item] });
      }
    });
    shows.forEach((items, title) => groups.push({ type: 'show', title, posterPath: items[0]?.posterPath ?? undefined, items }));
    return groups;
  }, [downloads]);

  const stats = useMemo(() => ({
    total: downloads.reduce((acc, i) => acc + (i.bytesWritten || 0), 0),
    movies: groupedDownloads.filter(g => g.type === 'movie').length,
    series: groupedDownloads.filter(g => g.type === 'show').length,
  }), [downloads, groupedDownloads]);

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '0 MB';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes, i = 0;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(1)} ${units[i]}`;
  };

  const handlePlay = async (item: DownloadItem) => {
    // Show warning for partial downloads
    if (item.isPartial && item.partialProgress && item.partialProgress < 1) {
      const playableMins = Math.floor((item.playableDuration || 0) / 60);
      const progressPct = Math.round(item.partialProgress * 100);
      
      Alert.alert(
        'Partial Download',
        `This download is ${progressPct}% complete. You can watch approximately ${playableMins} minutes. Continue watching?`,
        [
          { text: 'Resume Download', onPress: () => resumeDownload(item.id), style: 'default' },
          { text: 'Watch Now', onPress: () => proceedToPlay(item), style: 'cancel' },
        ]
      );
      return;
    }
    proceedToPlay(item);
  };

  const proceedToPlay = async (item: DownloadItem) => {
    if (item.mediaType === 'music') {
      const musicMedia: Media = { id: Number(item.mediaId) || 0, videoId: item.videoId || item.id, title: item.title, artist: item.artist || item.subtitle || undefined, poster_path: item.posterPath || undefined, media_type: 'music', localUri: item.localUri };
      (musicMedia as any).thumbnail = item.posterPath;
      await playTrack(musicMedia);
      return;
    }
    router.push({
      pathname: '/video-player',
      params: { title: item.title, videoUrl: item.localUri, mediaType: item.mediaType, tmdbId: item.mediaId?.toString(), releaseYear: item.releaseDate?.slice(0, 4), posterPath: item.posterPath ?? undefined, backdropPath: item.backdropPath ?? undefined, overview: item.overview ?? undefined, releaseDate: item.releaseDate ?? undefined, seasonNumber: item.seasonNumber?.toString(), episodeNumber: item.episodeNumber?.toString(), isPartial: item.isPartial ? 'true' : undefined, playableDuration: item.playableDuration?.toString() }
    });
  };

  const confirmDelete = (item: DownloadItem) => {
    Alert.alert('Remove download?', item.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await cancelDownload(item.id); } catch {}
        try { await FileSystem.deleteAsync(item.containerPath ?? item.localUri, { idempotent: true }); } catch {}
        try { await removeDownloadRecord(item.id); } catch {}
        setDownloads(prev => prev.filter(d => d.id !== item.id));
      }}
    ]);
  };

  const SeriesGroupCard = ({ group, index }: { group: GroupedDownloads; index: number }) => (
    <TouchableOpacity onPress={() => setSelectedSeries(group)} activeOpacity={0.9} style={styles.cardMargin}>
      <LiquidGlass 
        cornerRadius={28} 
        tintOpacity={0.2} 
        tintColor="#111" 
        glowColor="#8b5cf6"
        glowIntensity={0.3}
        borderOpacity={0.25} 
        style={styles.groupCard}
      >
        <View style={styles.seriesPosterStack}>
          <View style={[styles.posterStackItem, styles.posterStackBack]} />
          <View style={[styles.posterStackItem, styles.posterStackMid]} />
          {group.posterPath ? <Image source={{ uri: `${IMAGE_BASE_URL}${group.posterPath}` }} style={styles.seriesPoster} /> : <View style={styles.seriesPosterPlaceholder}><Ionicons name="tv" size={24} color="#8b5cf6" /></View>}
          <View style={styles.epCountBadge}><Text style={styles.epCountText}>{group.items.length}</Text></View>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>{group.title}</Text>
          <Text style={styles.cardSubtitle}>{group.items.length} Episodes • {formatBytes(group.items.reduce((acc, i) => acc + (i.bytesWritten || 0), 0))}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
      </LiquidGlass>
    </TouchableOpacity>
  );

  const MediaCard = ({ item, color }: { item: DownloadItem; color: string }) => {
    const isPartial = item.isPartial && item.partialProgress && item.partialProgress < 1;
    const progressPct = Math.round((item.partialProgress || 0) * 100);
    
    return (
    <View style={styles.cardMargin}>
      <LiquidGlass 
        cornerRadius={28} 
        tintOpacity={0.18} 
        tintColor="#0a0a0a" 
        glowColor={isPartial ? '#f59e0b' : color}
        glowIntensity={isPartial ? 0.4 : 0.2}
        borderOpacity={isPartial ? 0.4 : 0.2} 
        style={styles.mediaCard}
      >
        <TouchableOpacity onPress={() => handlePlay(item)} activeOpacity={0.8} style={styles.posterContainer}>
          {item.posterPath ? <Image source={{ uri: item.posterPath.startsWith('http') ? item.posterPath : `${IMAGE_BASE_URL}${item.posterPath}` }} style={styles.cardPoster} /> : <View style={styles.posterPlaceholder}><Ionicons name={item.mediaType === 'music' ? "musical-notes" : "film"} size={24} color={isPartial ? '#f59e0b' : color} /></View>}
          <View style={[styles.cardPlayBtn, { backgroundColor: isPartial ? '#f59e0b' : color }]}><Ionicons name="play" size={16} color="#fff" style={{ marginLeft: 2 }} /></View>
          {isPartial && (
            <View style={styles.partialOverlay}>
              <View style={styles.partialProgressBar}>
                <View style={[styles.partialProgressFill, { width: `${progressPct}%` }]} />
              </View>
              <Text style={styles.partialLabel}>{progressPct}%</Text>
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.cardInfo}>
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
            {isPartial && <View style={styles.partialBadge}><Ionicons name="time" size={10} color="#f59e0b" /><Text style={styles.partialBadgeText}>PARTIAL</Text></View>}
          </View>
          <Text style={styles.cardSubtitle}>{item.artist || item.subtitle || formatBytes(item.bytesWritten)}</Text>
          {isPartial && item.playableDuration && (
            <Text style={styles.playableText}>~{Math.floor(item.playableDuration / 60)} min available</Text>
          )}
        </View>
        {isPartial && (
          <TouchableOpacity onPress={() => resumeDownload(item.id)} style={styles.resumeBtn}>
            <Ionicons name="refresh" size={18} color="#f59e0b" />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => confirmDelete(item)} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={18} color="#ff6b6b" />
        </TouchableOpacity>
      </LiquidGlass>
    </View>
  )};

  if (selectedSeries) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#0a0b1e', '#000']} style={StyleSheet.absoluteFill} />
        <View style={[styles.bgCircle, { top: -100, left: -100, backgroundColor: 'rgba(139, 92, 246, 0.15)' }]} />
        <View style={styles.subHeader}>
          <TouchableOpacity onPress={() => setSelectedSeries(null)} style={styles.backBtn}>
            <LiquidGlass cornerRadius={22} tintOpacity={0.15} style={styles.iconGlass}><Ionicons name="arrow-back" size={24} color="#fff" /></LiquidGlass>
          </TouchableOpacity>
          <View style={styles.subHeaderInfo}>
            <Text style={styles.subHeaderTitle} numberOfLines={1}>{selectedSeries.title}</Text>
            <Text style={styles.subHeaderSubtitle}>{selectedSeries.items.length} Episodes Downloaded</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 25, paddingBottom: 120 + insets.bottom }} showsVerticalScrollIndicator={false}>
          {selectedSeries.items.map((item, idx) => (
            <AnimatedSection key={item.id} delay={idx * 50} style={styles.episodeRow}>
              <LiquidGlass cornerRadius={24} tintOpacity={0.08} style={StyleSheet.absoluteFill} />
              <TouchableOpacity onPress={() => handlePlay(item)} activeOpacity={0.8} style={styles.epPosterWrap}>
                {item.posterPath ? <Image source={{ uri: `${IMAGE_BASE_URL}${item.posterPath}` }} style={styles.epPoster} /> : <View style={styles.epPosterPlaceholder}><Ionicons name="film" size={20} color="#8b5cf6" /></View>}
                <View style={[styles.epPlayIcon, { backgroundColor: '#8b5cf6' }]}><Ionicons name="play" size={12} color="#fff" /></View>
              </TouchableOpacity>
              <View style={styles.epInfo}>
                <Text style={styles.epLabel}>S{item.seasonNumber} E{item.episodeNumber}</Text>
                <Text style={styles.epTitle} numberOfLines={1}>{(item as any).episodeTitle || item.title}</Text>
                <Text style={styles.epSize}>{formatBytes(item.bytesWritten)}</Text>
              </View>
              <TouchableOpacity onPress={() => confirmDelete(item)} style={styles.epDelete}><Ionicons name="trash-outline" size={18} color="#ff6b6b" /></TouchableOpacity>
            </AnimatedSection>
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View style={StyleSheet.absoluteFill}>
        <LinearGradient colors={['#0a0b1e', '#000']} style={StyleSheet.absoluteFill} />
        <View style={[styles.bgCircle, { top: -100, right: -100, backgroundColor: 'rgba(229, 9, 20, 0.12)' }]} />
        <View style={[styles.bgCircle, { bottom: SCREEN_HEIGHT * 0.2, left: -150, width: 450, height: 450, backgroundColor: 'rgba(59, 130, 246, 0.08)' }]} />
      </View>

      <Animated.View style={[
        styles.dynamicIsland,
        {
          transform: [{ translateY: islandTranslateY }],
          opacity: islandOpacity,
        }
      ]}>
        <LiquidGlass
          tintOpacity={0.18}
          tintColor="#000000"
          cornerRadius={32}
          borderOpacity={0.25}
          glowIntensity={0.2}
          glowColor="#e50914"
          chromaticAberration={true}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.islandContent}>
          <View style={styles.islandLeft}>
            <View style={styles.accentDot} />
            <Animated.View style={{ opacity: headerTextOpacity, marginLeft: 8 }}>
              <Text style={styles.islandEyebrow}>OFFLINE LIBRARY</Text>
              <Text style={styles.islandTitle}>Downloads</Text>
            </Animated.View>
          </View>
          <View style={styles.islandActions}>
            <TouchableOpacity style={styles.islandIconBtn}>
              <Ionicons name="search-outline" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.islandIconBtn}>
              <Ionicons name="person-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      <Animated.ScrollView 
        contentContainerStyle={[styles.scrollContent, playerActive && { paddingBottom: 180 }]} 
        showsVerticalScrollIndicator={false} 
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadDownloads} tintColor="#e50914" />}
      >
        <LiquidGlass cornerRadius={24} tintOpacity={0.08} style={styles.statsPanel}>
          <View style={styles.statsContent}>
            <View style={styles.statItem}><Text style={styles.statVal}>{downloads.length}</Text><Text style={styles.statLab}>Files</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}><Text style={styles.statVal}>{activeDownloads.length}</Text><Text style={styles.statLab}>Active</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}><Text style={styles.statVal}>{formatBytes(stats.total)}</Text><Text style={styles.statLab}>Storage</Text></View>
          </View>
        </LiquidGlass>

        <View style={styles.storageRow}>
          <StorageStat icon="server" label="Storage" value={stats.total > 0 ? formatBytes(stats.total) : 'Empty'} color="#e50914" delay={100} />
          <StorageStat icon="film" label="Movies" value={stats.movies > 0 ? String(stats.movies) : 'Empty'} color="#3b82f6" delay={200} />
          <StorageStat icon="tv" label="Series" value={stats.series > 0 ? String(stats.series) : 'Empty'} color="#8b5cf6" delay={300} />
        </View>

        {activeDownloads.length > 0 && (
          <AnimatedSection delay={400} style={styles.activeCard}>
            <LiquidGlass cornerRadius={32} tintOpacity={0.15} tintColor="#e50914" style={StyleSheet.absoluteFill} />
            <View style={styles.sectionHeader}><View style={[styles.sectionIcon, { backgroundColor: 'rgba(229,9,20,0.2)' }]}><Ionicons name="cloud-download" size={18} color="#e50914" /></View><Text style={styles.sectionTitle}>Downloading Now</Text></View>
            {activeDownloads.map((item) => {
              const pct = Math.round((item.progress ?? 0) * 100);
              return (
                <View key={item.sessionId} style={styles.activeRow}>
                  <View style={styles.activeMeta}><Text style={styles.activeName} numberOfLines={1}>{item.title}</Text>
                    <View style={styles.activeCtrls}>
                      <TouchableOpacity onPress={() => item.status === 'paused' ? resumeDownload(item.sessionId) : pauseDownload(item.sessionId)} style={styles.ctrlBtn}><Ionicons name={item.status === 'paused' ? 'play' : 'pause'} size={14} color="#fff" /></TouchableOpacity>
                      <TouchableOpacity onPress={() => cancelDownload(item.sessionId)} style={[styles.ctrlBtn, styles.cancelBtn]}><Ionicons name="close" size={14} color="#ff6b6b" /></TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: '#e50914' }]} /></View>
                  <Text style={styles.activePercent}>{item.status === 'preparing' ? 'Connecting...' : `${pct}% Completed`}</Text>
                </View>
              );
            })}
          </AnimatedSection>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}><View style={[styles.sectionIcon, { backgroundColor: 'rgba(139,92,246,0.2)' }]}><Ionicons name="tv" size={18} color="#8b5cf6" /></View><Text style={styles.sectionTitle}>Series</Text></View>
          {stats.series > 0 ? (
            groupedDownloads.filter(g => g.type === 'show').map((group, idx) => <SeriesGroupCard key={group.title} group={group} index={idx} />)
          ) : (
            <TouchableOpacity onPress={() => router.push('/categories')} activeOpacity={0.8} style={styles.cardMargin}>
                <LiquidGlass cornerRadius={24} tintOpacity={0.05} borderOpacity={0.1} style={styles.discoverCard}>
                    <Ionicons name="add-circle-outline" size={24} color="rgba(255,255,255,0.3)" />
                    <Text style={styles.discoverText}>Discover TV Shows</Text>
                </LiquidGlass>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}><View style={[styles.sectionIcon, { backgroundColor: 'rgba(59,130,246,0.2)' }]}><Ionicons name="film" size={18} color="#3b82f6" /></View><Text style={styles.sectionTitle}>Movies</Text></View>
          {stats.movies > 0 ? (
            groupedDownloads.filter(g => g.type === 'movie').map((group, idx) => group.items[0] && <MediaCard key={group.items[0].id} item={group.items[0]} color="#3b82f6" />)
          ) : (
            <TouchableOpacity onPress={() => router.push('/movies')} activeOpacity={0.8} style={styles.cardMargin}>
                <LiquidGlass cornerRadius={24} tintOpacity={0.05} borderOpacity={0.1} style={styles.discoverCard}>
                    <Ionicons name="add-circle-outline" size={24} color="rgba(255,255,255,0.3)" />
                    <Text style={styles.discoverText}>Discover Movies</Text>
                </LiquidGlass>
            </TouchableOpacity>
          )}
        </View>

        {groupedDownloads.some(g => g.type === 'music') && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}><View style={[styles.sectionIcon, { backgroundColor: 'rgba(34,197,94,0.2)' }]}><Ionicons name="musical-notes" size={18} color="#22c55e" /></View><Text style={styles.sectionTitle}>Songs</Text></View>
            {groupedDownloads.filter(g => g.type === 'music').map((group, idx) => group.items[0] && <MediaCard key={group.items[0].id} item={group.items[0]} color="#22c55e" />)}
          </View>
        )}

        {downloads.length === 0 && !loading && (
          <AnimatedSection delay={200} style={styles.empty}>
            <LiquidGlass cornerRadius={60} tintOpacity={0.1} style={styles.emptyIcon}><Ionicons name="cloud-offline-outline" size={64} color="rgba(255,255,255,0.15)" /></LiquidGlass>
            <Text style={styles.emptyTitle}>Your library is empty</Text>
            <Text style={styles.emptySubtitle}>Download content to enjoy it offline anytime.</Text>
          </AnimatedSection>
        )}
      </Animated.ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  bgCircle: { position: 'absolute', width: 350, height: 350, borderRadius: 175, filter: 'blur(80px)' as any },
  dynamicIsland: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 16,
    right: 16,
    height: 56,
    zIndex: 100,
    borderRadius: 32,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  islandContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  islandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  accentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#e50914',
    shadowColor: '#e50914',
    shadowOpacity: 0.8,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  islandEyebrow: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  islandTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  islandActions: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    padding: 4,
  },
  islandIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsPanel: { height: 90, marginBottom: 10, marginTop: 20 },
  statsContent: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 25 },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { color: '#fff', fontSize: 18, fontWeight: '900' },
  statLab: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '800', marginTop: 4, textTransform: 'uppercase' },
  statDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.1)' },
  scrollContent: { paddingHorizontal: 25, paddingTop: 120, paddingBottom: 150 },
  storageRow: { flexDirection: 'row', gap: 12, marginBottom: 35 },
  storageStat: { flex: 1, height: 110, padding: 15, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  storageStatIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  storageStatValue: { color: '#fff', fontSize: 16, fontWeight: '900' },
  storageStatLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '700', marginTop: 2 },
  activeCard: { padding: 20, marginBottom: 35, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  sectionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  activeRow: { marginBottom: 20 },
  activeMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activeName: { color: '#fff', fontSize: 14, fontWeight: '700', flex: 1, marginRight: 15 },
  activeCtrls: { flexDirection: 'row', gap: 10 },
  ctrlBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { backgroundColor: 'rgba(255,107,107,0.1)' },
  progressTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, marginTop: 12, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  activePercent: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600', marginTop: 8 },
  section: { marginBottom: 30 },
  cardMargin: { marginBottom: 15 },
  groupCard: { flexDirection: 'row', alignItems: 'center', padding: 15, height: 110 },
  seriesPosterStack: { width: 70, height: 95 },
  posterStackItem: { position: 'absolute', width: 60, height: 85, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14 },
  posterStackBack: { top: 0, left: 0, opacity: 0.3 },
  posterStackMid: { top: 5, left: 5, opacity: 0.6 },
  seriesPoster: { position: 'absolute', top: 10, left: 10, width: 60, height: 85, borderRadius: 14 },
  seriesPosterPlaceholder: { position: 'absolute', top: 10, left: 10, width: 60, height: 85, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  epCountBadge: { position: 'absolute', bottom: -2, right: -5, width: 24, height: 24, borderRadius: 12, backgroundColor: '#8b5cf6', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#000' },
  epCountText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  cardInfo: { flex: 1, marginLeft: 20 },
  cardTitle: { color: '#fff', fontSize: 17, fontWeight: '800', marginBottom: 4 },
  cardSubtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600' },
  mediaCard: { flexDirection: 'row', alignItems: 'center', padding: 12, height: 110 },
  posterContainer: { width: 75, height: 85, borderRadius: 16, overflow: 'hidden' },
  cardPoster: { width: '100%', height: '100%' },
  posterPlaceholder: { width: '100%', height: '100%', backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  cardPlayBtn: { position: 'absolute', bottom: 6, right: 6, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4 },
  deleteBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  subHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 25, paddingTop: 65, paddingBottom: 25 },
  backBtn: { width: 44, height: 44, marginRight: 15 },
  subHeaderInfo: { flex: 1 },
  subHeaderTitle: { color: '#fff', fontSize: 24, fontWeight: '900' },
  subHeaderSubtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 4, fontWeight: '600' },
  episodeRow: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 12, height: 100 },
  epPosterWrap: { width: 65, height: 75, borderRadius: 12, overflow: 'hidden' },
  epPoster: { width: '100%', height: '100%' },
  epPosterPlaceholder: { width: '100%', height: '100%', backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  epPlayIcon: { position: 'absolute', bottom: 4, right: 4, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  epInfo: { flex: 1, marginLeft: 18 },
  epLabel: { fontSize: 11, fontWeight: '900', color: '#8b5cf6', marginBottom: 2 },
  epTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  epSize: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '700' },
  epDelete: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 100 },
  emptyIcon: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: 25 },
  emptyTitle: { color: '#fff', fontSize: 22, fontWeight: '900', marginBottom: 10 },
  emptySubtitle: { color: 'rgba(255,255,255,0.4)', fontSize: 15, textAlign: 'center', paddingHorizontal: 40, lineHeight: 22 },
  discoverCard: { height: 80, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  discoverText: { color: 'rgba(255,255,255,0.4)', fontSize: 15, fontWeight: '700' },
  // Partial download styles
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  partialBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  partialBadgeText: { color: '#f59e0b', fontSize: 9, fontWeight: '900' },
  playableText: { color: '#f59e0b', fontSize: 11, fontWeight: '600', marginTop: 2 },
  resumeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(245,158,11,0.15)', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  partialOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.7)', paddingVertical: 6, paddingHorizontal: 8 },
  partialProgressBar: { height: 3, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, overflow: 'hidden' },
  partialProgressFill: { height: '100%', backgroundColor: '#f59e0b', borderRadius: 2 },
  partialLabel: { color: '#f59e0b', fontSize: 10, fontWeight: '800', textAlign: 'center', marginTop: 2 },
});

export default DownloadsScreen;
