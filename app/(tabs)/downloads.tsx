import { FontAwesome, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Platform,
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
import { getProfileScopedKey } from '../../lib/profileStorage';
import { DownloadItem } from '../../types';


type GroupedDownloads = {
  type: 'movie' | 'show';
  title: string;
  items: DownloadItem[];
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
        if (event.status === 'completed' || event.status === 'error') {
          return rest;
        }
        return [...rest, event];
      });

      if (event.status === 'completed' || event.status === 'error') {
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
        groups.push({ type: 'movie', title: item.title, items: [item] });
      }
    });

    shows.forEach((items, title) => {
      groups.push({ type: 'show', title, items });
    });

    return groups;
  }, [downloads]);

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

      router.push({
        pathname: '/video-player',
        params: {
          title: item.title,
          videoUrl: item.localUri,
          mediaType: item.mediaType,
          tmdbId: item.mediaId?.toString(),
          releaseYear: item.releaseDate?.slice(0, 4),
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
            await FileSystem.deleteAsync(
              item.containerPath ?? item.localUri,
              { idempotent: true },
            );
          } catch {}
          setDownloads((prev) => prev.filter((d) => d.id !== item.id));
        },
      },
    ]);
  };

  const renderDownloadItem = (item: DownloadItem) => (
    <View style={styles.downloadCard}>
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
          {formatBytes(item.bytesWritten)}
        </Text>

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
                    <TouchableOpacity style={styles.controlButton}>
                      <Ionicons name="pause" size={16} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.controlButton, styles.cancelButton]}>
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
                <Text style={styles.activeDownloadPercent}>{pct}%</Text>
              </View>
            );
          })}
        </View>
      )}
    </>
  );

  return (
    <ScreenWrapper>
      <LinearGradient
        colors={[accentColor, '#150a13', '#05060f']}
        style={StyleSheet.absoluteFill}
      />

      <HeaderComponent />

      <FlatList
        data={groupedDownloads}
        keyExtractor={(item, i) => item.title + i}
        renderItem={({ item }) =>
          item.type === 'movie'
            ? renderDownloadItem(item.items[0])
            : (
              <View>
                <Text style={styles.sectionTitle}>{item.title}</Text>
                {item.items.map(renderDownloadItem)}
              </View>
            )
        }
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{
          paddingTop: 32,
          paddingHorizontal: 16,
          paddingBottom: 120 + insets.bottom,
        }}
        showsVerticalScrollIndicator={false}
      />
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: 'rgba(255,107,107,0.18)',
  },
});

export default DownloadsScreen;
