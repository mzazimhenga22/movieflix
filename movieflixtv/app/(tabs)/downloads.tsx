import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { getAccentFromPosterPath } from '@/constants/theme';
import {
  type DownloadEvent,
  getActiveDownloads,
  subscribeToDownloadEvents,
} from '@/lib/downloadEvents';
import { cancelDownload, pauseDownload, resumeDownload } from '@/lib/downloadManager';
import { removeDownloadRecord } from '@/lib/fileUtils';
import { getProfileScopedKey } from '@/lib/profileStorage';
import type { DownloadItem } from '@/types';
import { useTvAccent } from '../components/TvAccentContext';
import TvGlassPanel from '../components/TvGlassPanel';
import TvPosterCard from '../components/TvPosterCard';

const formatBytes = (bytes?: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i += 1;
  }
  return `${size.toFixed(1)} ${units[i]}`;
};

export default function DownloadsTv() {
  const router = useRouter();
  const { setAccentColor } = useTvAccent();
  const accent = useMemo(() => getAccentFromPosterPath('/downloads/accent') ?? '#e50914', []);

  useEffect(() => {
    setAccentColor(accent);
  }, [accent, setAccentColor]);

  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [activeDownloads, setActiveDownloads] = useState<DownloadEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const totalBytes = useMemo(
    () => downloads.reduce((acc, item) => acc + (item.bytesWritten || 0), 0),
    [downloads],
  );

  const loadDownloads = useCallback(async () => {
    try {
      const key = await getProfileScopedKey('downloads');
      const stored = await AsyncStorage.getItem(key);
      const parsed = stored ? (JSON.parse(stored) as DownloadItem[]) : [];
      setDownloads(Array.isArray(parsed) ? parsed : []);
    } catch {
      setDownloads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadDownloads();
    }, [loadDownloads]),
  );

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
      if (event.status === 'completed' || event.status === 'error' || event.status === 'cancelled') {
        void loadDownloads();
      }
    });
    return unsub;
  }, [loadDownloads]);

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
          'Offline files are missing. Remove it and download again?',
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
    } catch {
      Alert.alert('Download unavailable', 'Unable to verify this download.');
      return false;
    }
  }, []);

  const play = useCallback(
    async (item: DownloadItem) => {
      const ok = await ensureDownloadAvailable(item);
      if (!ok) return;

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
          streamType: item.downloadType === 'hls' ? 'hls' : 'file',
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

  const confirmDelete = useCallback((item: DownloadItem) => {
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
            await FileSystem.deleteAsync(item.containerPath ?? item.localUri, { idempotent: true });
          } catch {}
          try {
            await removeDownloadRecord(item.id);
          } catch {}
          setDownloads((prev) => prev.filter((d) => d.id !== item.id));
        },
      },
    ]);
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[accent, '#070815', '#05060f']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.shell}>
        <TvGlassPanel accent={accent} style={styles.panel}>
          <View style={styles.panelInner}>
            <View style={styles.topBar}>
              <View style={styles.titleRow}>
                <Ionicons name="cloud-download" size={20} color="#fff" />
                <View style={styles.titleStack}>
                  <Text style={styles.title}>Downloads</Text>
                  <Text style={styles.subtitle} numberOfLines={1}>
                    Watch offline. Use Play on a card to start.
                  </Text>
                </View>
              </View>
              <View style={styles.metaRow}>
                <View style={styles.metaPill}>
                  <Text style={styles.metaText}>{downloads.length} items</Text>
                </View>
                <View style={styles.metaPill}>
                  <Text style={styles.metaText}>{activeDownloads.length} active</Text>
                </View>
                <View style={styles.metaPill}>
                  <Text style={styles.metaText}>{formatBytes(totalBytes)}</Text>
                </View>
              </View>
            </View>

            {activeDownloads.length ? (
              <View style={styles.activeCard}>
                <Text style={styles.activeTitle}>Active downloads</Text>
                {activeDownloads.map((item) => {
                  const pct = Math.round((item.progress ?? 0) * 100);
                  const paused = item.status === 'paused';
                  return (
                    <View key={item.sessionId} style={styles.activeRow}>
                      <View style={styles.activeTop}>
                        <Text style={styles.activeName} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <View style={styles.activeControls}>
                          <Pressable
                            onPress={() => {
                              if (paused) {
                                setActiveDownloads((prev) =>
                                  prev.map((e) => (e.sessionId === item.sessionId ? { ...e, status: 'queued' } : e)),
                                );
                                void resumeDownload(item.sessionId);
                              } else {
                                setActiveDownloads((prev) =>
                                  prev.map((e) => (e.sessionId === item.sessionId ? { ...e, status: 'paused' } : e)),
                                );
                                void pauseDownload(item.sessionId);
                              }
                            }}
                            style={({ focused }: any) => [styles.ctrlBtn, focused ? styles.ctrlBtnFocused : null]}
                          >
                            <Ionicons name={paused ? 'play' : 'pause'} size={16} color="#fff" />
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              setActiveDownloads((prev) => prev.filter((e) => e.sessionId !== item.sessionId));
                              void cancelDownload(item.sessionId);
                            }}
                            style={({ focused }: any) => [
                              styles.ctrlBtn,
                              styles.ctrlBtnDanger,
                              focused ? styles.ctrlBtnFocused : null,
                            ]}
                          >
                            <Ionicons name="close" size={16} color="#fff" />
                          </Pressable>
                        </View>
                      </View>

                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${pct}%` }]} />
                      </View>
                      <Text style={styles.progressText}>
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
            ) : null}

            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.centerText}>Loading…</Text>
              </View>
            ) : downloads.length === 0 ? (
              <View style={styles.center}>
                <Text style={styles.centerTitle}>No downloads yet</Text>
                <Text style={styles.centerText}>Open a title and choose Download.</Text>
              </View>
            ) : (
              <FlatList
                data={downloads}
                keyExtractor={(it) => it.id}
                numColumns={5}
                columnWrapperStyle={styles.gridRow}
                contentContainerStyle={styles.grid}
                renderItem={({ item }) => (
                  <View style={styles.itemCard}>
                    <TvPosterCard
                      item={{
                        id: item.mediaId ?? 0,
                        title: item.title,
                        name: item.title,
                        poster_path: item.posterPath ?? undefined,
                        media_type: item.mediaType,
                      }}
                      width={160}
                      onPress={() => void play(item)}
                    />
                    <View style={styles.itemFooter}>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.itemMeta}>{formatBytes(item.bytesWritten)}</Text>
                      <View style={styles.itemActions}>
                        <Pressable
                          onPress={() => void play(item)}
                          style={({ focused }: any) => [styles.actionBtn, focused ? styles.actionBtnFocused : null]}
                        >
                          <Ionicons name="play" size={16} color="#fff" />
                          <Text style={styles.actionText}>Play</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => confirmDelete(item)}
                          style={({ focused }: any) => [
                            styles.actionBtn,
                            styles.actionBtnDanger,
                            focused ? styles.actionBtnFocused : null,
                          ]}
                        >
                          <Ionicons name="trash" size={16} color="#fff" />
                          <Text style={styles.actionText}>Remove</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                )}
              />
            )}
          </View>
        </TvGlassPanel>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  shell: { flex: 1, paddingLeft: 0, paddingRight: 34, paddingTop: 22, paddingBottom: 22, alignItems: 'center' },
  panel: { flex: 1, width: '100%', maxWidth: 1520 },
  panelInner: { flex: 1, padding: 18 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18, paddingHorizontal: 6, paddingBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleStack: { minWidth: 0 },
  title: { color: '#fff', fontSize: 18, fontWeight: '900' },
  subtitle: { color: 'rgba(255,255,255,0.68)', fontSize: 13, fontWeight: '800', marginTop: 2 },
  metaRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  metaPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  metaText: { color: '#fff', fontSize: 12, fontWeight: '900' },

  activeCard: {
    marginHorizontal: 6,
    marginBottom: 12,
    borderRadius: 24,
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  activeTitle: { color: '#fff', fontSize: 16, fontWeight: '900', marginBottom: 10 },
  activeRow: { marginBottom: 12 },
  activeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  activeName: { color: '#fff', fontSize: 14, fontWeight: '900', flex: 1, minWidth: 0 },
  activeControls: { flexDirection: 'row', gap: 10 },
  ctrlBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  ctrlBtnDanger: { backgroundColor: 'rgba(229,9,20,0.22)', borderColor: 'rgba(229,9,20,0.50)' },
  ctrlBtnFocused: { transform: [{ scale: 1.05 }], borderColor: '#fff' },
  progressTrack: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressFill: { height: '100%', backgroundColor: '#e50914' },
  progressText: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '800', marginTop: 6 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerTitle: { color: '#fff', fontSize: 26, fontWeight: '900', marginBottom: 8 },
  centerText: { color: 'rgba(255,255,255,0.75)', fontSize: 16, fontWeight: '700' },

  grid: { paddingHorizontal: 6, paddingTop: 6, paddingBottom: 18 },
  gridRow: { gap: 14 },
  itemCard: {
    width: 180,
    borderRadius: 22,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  itemFooter: { marginTop: 10 },
  itemTitle: { color: '#fff', fontSize: 13, fontWeight: '900' },
  itemMeta: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '800', marginTop: 4 },
  itemActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  actionBtnDanger: { backgroundColor: 'rgba(229,9,20,0.22)', borderColor: 'rgba(229,9,20,0.50)' },
  actionBtnFocused: { transform: [{ scale: 1.04 }], borderColor: '#fff' },
  actionText: { color: '#fff', fontSize: 12, fontWeight: '900' },
});
