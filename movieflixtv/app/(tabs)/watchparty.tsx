import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { Media } from '@/types';
import { API_BASE_URL, API_KEY } from '../../constants/api';
import { getProfileScopedKey } from '@/lib/profileStorage';
import { createWatchParty, tryJoinWatchParty } from '@/lib/watchparty/controller';
import { useUser } from '@/hooks/use-user';
import { usePStream } from '@/src/pstream/usePStream';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { getAccentFromPosterPath } from '@/constants/theme';
import { authPromise } from '@/constants/firebase';
import { useTvAccent } from '../components/TvAccentContext';
import TvGlassPanel from '../components/TvGlassPanel';
import TvPosterCard from '../components/TvPosterCard';
import { TvFocusable } from '../components/TvSpatialNavigation';

export default function WatchPartyTv() {
  const router = useRouter();
  const { setAccentColor } = useTvAccent();
  const { user } = useUser();
  const { isSubscribed } = useSubscription();
  const { scrape, loading: scraping } = usePStream();

  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [myList, setMyList] = useState<Media[]>([]);
  const [selected, setSelected] = useState<Media | null>(null);
  const [partyCode, setPartyCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    title: string;
    message?: string;
    kind: 'info' | 'error' | 'success';
  } | null>(null);

  const mountedRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true;
      let alive = true;
      void (async () => {
        try {
          const key = await getProfileScopedKey('myList');
          const stored = await AsyncStorage.getItem(key);
          if (!alive) return;
          const parsed: Media[] = stored ? JSON.parse(stored) : [];
          setMyList(Array.isArray(parsed) ? parsed : []);
          setSelected((prev) => prev ?? (Array.isArray(parsed) ? parsed[0] ?? null : null));
        } catch {
          if (!alive) return;
          setMyList([]);
          setSelected(null);
        }
      })();
      return () => {
        alive = false;
        mountedRef.current = false;
      };
    }, []),
  );

  const accent = useMemo(
    () => getAccentFromPosterPath(selected?.poster_path ?? myList[0]?.poster_path) ?? '#e50914',
    [myList, selected?.poster_path],
  );

  useEffect(() => {
    setAccentColor(accent);
  }, [accent, setAccentColor]);

  const [seasons, setSeasons] = useState<any[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<any | null>(null);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [selectedEpisode, setSelectedEpisode] = useState<any | null>(null);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [showEpisodePicker, setShowEpisodePicker] = useState(false);

  const fetchSeasons = async (tmdbId: number) => {
    setLoadingSeasons(true);
    try {
      const response = await fetch(`${API_BASE_URL}/tv/${tmdbId}?api_key=${API_KEY}`);
      const data = await response.json();
      const filteredSeasons = (data.seasons || []).filter((s: any) => s.season_number > 0);
      setSeasons(filteredSeasons);
      if (filteredSeasons.length > 0) {
        setSelectedSeason(filteredSeasons[0]);
        await fetchEpisodes(tmdbId, filteredSeasons[0].season_number);
      }
    } catch (err) {
      console.warn('Failed to fetch seasons', err);
      setSeasons([]);
    } finally {
      setLoadingSeasons(false);
    }
  };

  const fetchEpisodes = async (tmdbId: number, seasonNumber: number) => {
    setLoadingEpisodes(true);
    try {
      const response = await fetch(`${API_BASE_URL}/tv/${tmdbId}/season/${seasonNumber}?api_key=${API_KEY}`);
      const data = await response.json();
      setEpisodes(data.episodes || []);
      setSelectedEpisode(data.episodes?.[0] ?? null);
    } catch (err) {
      console.warn('Failed to fetch episodes', err);
      setEpisodes([]);
    } finally {
      setLoadingEpisodes(false);
    }
  };

  const handleSeasonChange = async (season: any) => {
    setSelectedSeason(season);
    if (selected?.id) {
      await fetchEpisodes(selected.id, season.season_number);
    }
  };

  const startMovieParty = useCallback(async () => {
    if (!selected) return;
    setNotice({ kind: 'info', title: 'Creating party…' });
    const uid =
      user?.uid ??
      (await authPromise
        .then((auth) => auth.currentUser?.uid ?? null)
        .catch(() => null));
    
    if (!uid) {
      setNotice({ kind: 'error', title: 'Sign in required', message: 'Please sign in to start a watch party.' });
      router.push('/(auth)/login');
      return;
    }

    try {
      setBusy(true);
      const payload = {
        type: 'movie' as const,
        title: selected.title || selected.name || 'Movie',
        tmdbId: selected.id ? String(selected.id) : '',
        imdbId: (selected as any).imdb_id ?? undefined,
        releaseYear: selected.release_date ? parseInt(selected.release_date) : new Date().getFullYear(),
      };
      const playback = await scrape(payload);
      if (!playback?.uri) throw new Error('No stream found');
      const videoHeaders = playback.headers ? encodeURIComponent(JSON.stringify(playback.headers)) : undefined;

      const party = await createWatchParty(
        uid,
        playback.uri,
        selected.title || selected.name || null,
        (selected.media_type as any) || null,
        playback.headers ?? null,
        (playback as any)?.stream?.type ?? null,
      );

      setPartyCode(party.code);
      setNotice({ kind: 'success', title: 'Watch Party created', message: `Share this code: ${party.code}` });

      router.push({
        pathname: '/video-player',
        params: {
          roomCode: party.code,
          videoUrl: party.videoUrl,
          videoHeaders,
          title: party.title || selected.title || selected.name || 'Watch Party',
          mediaType: party.mediaType || selected.media_type || 'movie',
          tmdbId: selected.id ? String(selected.id) : undefined,
          posterPath: selected.poster_path ?? undefined,
          backdropPath: selected.backdrop_path ?? undefined,
          overview: selected.overview ?? undefined,
          releaseDate: (selected.release_date || (selected as any).first_air_date) ?? undefined,
          genreIds: Array.isArray(selected.genre_ids) ? selected.genre_ids.join(',') : undefined,
          voteAverage:
            typeof (selected as any).vote_average === 'number' ? String((selected as any).vote_average) : undefined,
        },
      });
    } catch (err: any) {
      setNotice({
        kind: 'error',
        title: 'Create failed',
        message: err?.message ? String(err.message) : 'Unable to create watch party.',
      });
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [router, scrape, selected, user?.uid]);

  const startTvShowParty = useCallback(async () => {
    if (!selected || !selectedSeason || !selectedEpisode) return;
    setNotice({ kind: 'info', title: 'Creating party…' });
    const uid =
      user?.uid ??
      (await authPromise
        .then((auth) => auth.currentUser?.uid ?? null)
        .catch(() => null));
    
    if (!uid) {
      setNotice({ kind: 'error', title: 'Sign in required', message: 'Please sign in to start a watch party.' });
      router.push('/(auth)/login');
      return;
    }

    try {
      setBusy(true);
      const payload = {
        type: 'show' as const,
        title: selected.title || selected.name || 'TV Show',
        tmdbId: selected.id ? String(selected.id) : '',
        imdbId: (selected as any).imdb_id ?? undefined,
        releaseYear: selected.first_air_date ? parseInt(selected.first_air_date) : new Date().getFullYear(),
        season: {
          number: selectedSeason.season_number,
          tmdbId: selectedSeason.id?.toString() ?? '',
          title: selectedSeason.name,
          episodeCount: selectedSeason.episode_count,
        },
        episode: {
          number: selectedEpisode.episode_number,
          tmdbId: selectedEpisode.id?.toString() ?? '',
        },
      };

      const playback = await scrape(payload);
      if (!playback?.uri) throw new Error('No stream found');
      const videoHeaders = playback.headers ? encodeURIComponent(JSON.stringify(playback.headers)) : undefined;

      const episodeTitle = `S${selectedSeason.season_number}:E${selectedEpisode.episode_number} - ${selectedEpisode.name}`;
      const party = await createWatchParty(
        uid,
        playback.uri,
        `${selected.title || selected.name} - ${episodeTitle}`,
        'tv',
        playback.headers ?? null,
        (playback as any)?.stream?.type ?? null,
      );

      setPartyCode(party.code);
      setNotice({ kind: 'success', title: 'Watch Party created', message: `Share this code: ${party.code}` });

      router.push({
        pathname: '/video-player',
        params: {
          roomCode: party.code,
          videoUrl: party.videoUrl,
          videoHeaders,
          title: selected.title || selected.name || 'Watch Party',
          mediaType: 'tv',
          tmdbId: selected.id ? String(selected.id) : undefined,
          posterPath: selected.poster_path ?? undefined,
          backdropPath: selected.backdrop_path ?? undefined,
          overview: selected.overview ?? undefined,
          releaseDate: selected.first_air_date || undefined,
          genreIds: Array.isArray(selected.genre_ids) ? selected.genre_ids.join(',') : undefined,
          voteAverage: typeof (selected as any).vote_average === 'number' ? String((selected as any).vote_average) : undefined,
          seasonNumber: selectedSeason.season_number.toString(),
          episodeNumber: selectedEpisode.episode_number.toString(),
          seasonTmdbId: selectedSeason.id?.toString(),
          episodeTmdbId: selectedEpisode.id?.toString(),
          seasonTitle: selectedSeason.name,
          seasonEpisodeCount: selectedSeason.episode_count?.toString(),
        },
      });
    } catch (err: any) {
      setNotice({
        kind: 'error',
        title: 'Create failed',
        message: err?.message ? String(err.message) : 'Unable to create watch party.',
      });
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [router, scrape, selected, selectedSeason, selectedEpisode, user?.uid]);

  const handleCreate = useCallback(async () => {
    if (!selected) {
      setNotice({ kind: 'error', title: 'Pick a title', message: 'Select a movie or show from your list first.' });
      return;
    }

    if (!isSubscribed) {
      setNotice({
        kind: 'error',
        title: 'Upgrade required',
        message: 'Free watch parties support up to 4 viewers. Upgrade to Premium for larger rooms.',
      });
      return;
    }

    if (selected.media_type === 'tv') {
      await fetchSeasons(selected.id);
      setShowEpisodePicker(true);
      return;
    }

    await startMovieParty();
  }, [isSubscribed, selected, startMovieParty]);

  const handleJoin = useCallback(async () => {
    const code = joinCode.trim();
    setNotice({ kind: 'info', title: 'Checking code…' });
    const uid =
      user?.uid ??
      (await authPromise
        .then((auth) => auth.currentUser?.uid ?? null)
        .catch(() => null));
    if (!uid) {
      setNotice({ kind: 'error', title: 'Sign in required', message: 'Please sign in to join a watch party.' });
      router.push('/(auth)/login');
      return;
    }
    if (code.length !== 6) {
      setNotice({ kind: 'error', title: 'Invalid code', message: 'Enter the 6-digit party code.' });
      return;
    }
    try {
      setBusy(true);
      const { party, status } = await tryJoinWatchParty(code);

      if (status === 'not_found') {
        setNotice({ kind: 'error', title: 'Invalid code', message: 'We couldn’t find a watch party with that code.' });
        return;
      }
      if (status === 'expired') {
        setNotice({ kind: 'error', title: 'Party expired', message: 'Ask your friend to create a new one.' });
        return;
      }
      if (status === 'full') {
        setNotice({ kind: 'error', title: 'Party is full', message: 'This room has reached its limit.' });
        return;
      }
      if (!party) {
        setNotice({ kind: 'error', title: 'Error', message: 'Unable to join this watch party.' });
        return;
      }

      if (status === 'closed') {
        setNotice({ kind: 'info', title: 'Waiting for host…', message: 'We’ll start when the host opens the room.' });
      } else {
        setNotice({ kind: 'success', title: 'Joined', message: `Party #${party.code}` });
      }

      router.push({
        pathname: '/video-player',
        params: {
          roomCode: party.code,
          videoUrl: party.videoUrl,
          title: party.title || 'Watch Party',
          mediaType: party.mediaType || 'movie',
          videoHeaders: party.videoHeaders
            ? encodeURIComponent(JSON.stringify(party.videoHeaders))
            : undefined,
          streamType: party.streamType || undefined,
        },
      });
    } catch (err: any) {
      setNotice({
        kind: 'error',
        title: 'Join failed',
        message: err?.message ? String(err.message) : 'Unable to join this watch party.',
      });
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [joinCode, router, user?.uid]);

  const handleJoinKey = useCallback((value: string) => {
    if (value === 'DEL') {
      setJoinCode((prev) => prev.slice(0, -1));
      return;
    }
    if (value === 'CLEAR') {
      setJoinCode('');
      return;
    }
    if (!/^[0-9]$/.test(value)) return;
    setJoinCode((prev) => {
      if (prev.length >= 6) return prev;
      return `${prev}${value}`;
    });
  }, []);

  const disabled = busy || scraping;

  const authLabel = user?.email
    ? `Signed in as ${user.email}`
    : user?.uid
      ? `Signed in (${user.uid.slice(0, 6)}…)`
      : 'Not signed in';

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
                <Ionicons name="people" size={20} color="#fff" />
                <View style={styles.titleStack}>
                  <Text style={styles.title}>Watch Party</Text>
                  <Text style={styles.subtitle} numberOfLines={1}>
                    Start or join a room to watch together.
                  </Text>
                  <Text style={styles.authHint} numberOfLines={1}>
                    {authLabel}
                  </Text>
                </View>
              </View>
            </View>

            {notice ? (
              <View
                style={[
                  styles.notice,
                  notice.kind === 'error'
                    ? styles.noticeError
                    : notice.kind === 'success'
                      ? styles.noticeSuccess
                      : styles.noticeInfo,
                ]}
              >
                <Text style={styles.noticeTitle}>{notice.title}</Text>
                {notice.message ? <Text style={styles.noticeMessage}>{notice.message}</Text> : null}
              </View>
            ) : null}

            <View style={styles.columns}>
              <View style={styles.left}>
                <View style={styles.card}>
            {showEpisodePicker ? (
              <View style={styles.episodePicker}>
                <View style={styles.pickerHeader}>
                  <Text style={styles.cardTitle}>Select Episode</Text>
                  <TvFocusable
                    onPress={() => setShowEpisodePicker(false)}
                    isTVSelectable={true}
                    style={({ focused }: any) => [styles.closeBtn, focused ? styles.btnFocused : null]}
                  >
                    <Ionicons name="close" size={20} color="#fff" />
                  </TvFocusable>
                </View>

                <Text style={styles.pickerSubtitle}>{selected?.title || selected?.name}</Text>

                {loadingSeasons ? (
                  <ActivityIndicator color={accent} style={{ marginVertical: 20 }} />
                ) : (
                  <FlatList
                    horizontal
                    data={seasons}
                    keyExtractor={(it) => String(it.id)}
                    contentContainerStyle={styles.seasonList}
                    renderItem={({ item }) => (
                      <TvFocusable
                        onPress={() => handleSeasonChange(item)}
                        isTVSelectable={true}
                        style={({ focused }: any) => [
                          styles.seasonPill,
                          selectedSeason?.id === item.id ? { backgroundColor: accent } : null,
                          focused ? styles.btnFocused : null,
                        ]}
                      >
                        <Text style={styles.seasonText}>{item.name}</Text>
                      </TvFocusable>
                    )}
                  />
                )}

                {loadingEpisodes ? (
                  <ActivityIndicator color={accent} style={{ flex: 1 }} />
                ) : (
                  <FlatList
                    data={episodes}
                    keyExtractor={(it) => String(it.id)}
                    contentContainerStyle={styles.episodeList}
                    renderItem={({ item }) => (
                      <TvFocusable
                        onPress={() => setSelectedEpisode(item)}
                        isTVSelectable={true}
                        style={({ focused }: any) => [
                          styles.episodeItem,
                          selectedEpisode?.id === item.id ? { borderColor: accent, borderWidth: 2 } : null,
                          focused ? styles.btnFocused : null,
                        ]}
                      >
                        <Text style={styles.episodeText}>
                          Ep {item.episode_number}: {item.name}
                        </Text>
                      </TvFocusable>
                    )}
                  />
                )}

                <TvFocusable
                  onPress={() => void startTvShowParty()}
                  disabled={busy || !selectedEpisode}
                  isTVSelectable={true}
                  style={({ focused }: any) => [
                    styles.primaryBtn,
                    (busy || !selectedEpisode) ? styles.btnDisabled : null,
                    focused ? styles.btnFocused : null,
                  ]}
                >
                  <Text style={styles.btnText}>Start Watch Party</Text>
                </TvFocusable>
              </View>
            ) : (
              <>
                <Text style={styles.cardTitle}>Pick from My List</Text>
                <Text style={styles.cardHint}>Add to “My List” on phone, then come back.</Text>

                {myList.length === 0 ? (
                  <TvFocusable
                    onPress={() => router.push('/continue-on-phone?feature=profiles')}
                    isTVSelectable={true}
                    accessibilityLabel="Continue on phone"
                    style={({ focused }: any) => [styles.ghostBtn, focused ? styles.btnFocused : null]}
                  >
                    <Ionicons name="phone-portrait-outline" size={18} color="#fff" />
                    <Text style={styles.btnText}>Continue on phone</Text>
                  </TvFocusable>
                ) : (
                  <FlatList
                    data={myList}
                    keyExtractor={(it, idx) => String(it.id ?? idx)}
                    numColumns={3}
                    columnWrapperStyle={styles.gridRow}
                    contentContainerStyle={styles.grid}
                    renderItem={({ item }) => (
                      <TvPosterCard
                        item={item}
                        width={160}
                        showTitle={false}
                        onPress={() => setSelected(item)}
                      />
                    )}
                  />
                )}

                {selected ? (
                  <View style={styles.selectedRow}>
                    <Text style={styles.selectedTitle} numberOfLines={1}>
                      Selected: {selected.title || selected.name}
                    </Text>
                    {partyCode ? <Text style={styles.codeText}>Code: {partyCode}</Text> : null}
                  </View>
                ) : null}

                <TvFocusable
                  onPress={() => void handleCreate()}
                  disabled={disabled}
                  isTVSelectable={true}
                  accessibilityLabel="Create Party"
                  style={({ focused }: any) => [
                    styles.primaryBtn,
                    disabled ? styles.btnDisabled : null,
                    focused ? styles.btnFocused : null,
                  ]}
                >
                  {disabled ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Ionicons name="play" size={18} color="#fff" />
                  )}
                  <Text style={styles.btnText}>{disabled ? 'Working…' : 'Create Party'}</Text>
                </TvFocusable>
              </>
            )}
                </View>
              </View>

              <View style={styles.right}>
                <View style={styles.card}>
            <Text style={styles.cardTitle}>Join with code</Text>
            <Text style={styles.cardHint}>Enter the 6-digit code from your friend.</Text>
            <View style={styles.codeRow}>
              <Text style={styles.codeValue}>{(joinCode + '______').slice(0, 6)}</Text>
              <TvFocusable
                onPress={() => setJoinCode('')}
                isTVSelectable={true}
                accessibilityLabel="Clear code"
                style={({ focused }: any) => [styles.clearSmall, focused ? styles.btnFocused : null]}
              >
                <Text style={styles.btnText}>Clear</Text>
              </TvFocusable>
            </View>

            <View style={styles.pad}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'DEL', '0', 'CLEAR'].map((k) => (
                <TvFocusable
                  key={k}
                  onPress={() => handleJoinKey(k)}
                  isTVSelectable={true}
                  accessibilityLabel={k}
                  style={({ focused }: any) => [
                    styles.padKey,
                    k === 'DEL' || k === 'CLEAR' ? styles.padKeyAlt : null,
                    focused ? styles.btnFocused : null,
                  ]}
                >
                  <Text style={styles.padText}>{k}</Text>
                </TvFocusable>
              ))}
            </View>
            <TvFocusable
              onPress={() => void handleJoin()}
              disabled={disabled}
              isTVSelectable={true}
              accessibilityLabel="Join Party"
              style={({ focused }: any) => [
                styles.secondaryBtn,
                disabled ? styles.btnDisabled : null,
                focused ? styles.btnFocused : null,
              ]}
            >
              <Ionicons name="log-in-outline" size={18} color="#fff" />
              <Text style={styles.btnText}>Join Party</Text>
            </TvFocusable>

            {!isSubscribed ? (
              <View style={styles.upsell}>
                <Text style={styles.upsellTitle}>Subscriptions on phone</Text>
                <Text style={styles.upsellText}>Upgrade in the phone app to host larger rooms.</Text>
                <TvFocusable
                  onPress={() => router.push('/premium')}
                  isTVSelectable={true}
                  accessibilityLabel="Open subscription info"
                  style={({ focused }: any) => [styles.ghostBtn, focused ? styles.btnFocused : null]}
                >
                  <Text style={styles.btnText}>Open subscription info</Text>
                </TvFocusable>
              </View>
            ) : null}
                </View>
              </View>
            </View>
          </View>
        </TvGlassPanel>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030408' },
  shell: { flex: 1, paddingLeft: 108, paddingRight: 40, paddingTop: 28, paddingBottom: 28, alignItems: 'center' },
  panel: { flex: 1, width: '100%', maxWidth: 1560 },
  panelInner: { flex: 1, padding: 22 },
  topBar: { paddingHorizontal: 8, paddingBottom: 18 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleStack: { flex: 1, minWidth: 0 },
  title: { color: '#fff', fontSize: 18, fontWeight: '900' },
  subtitle: { color: 'rgba(255,255,255,0.68)', fontSize: 13, fontWeight: '800', marginTop: 2 },
  authHint: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '700', marginTop: 4 },
  columns: { flex: 1, flexDirection: 'row', gap: 18, paddingHorizontal: 6 },
  left: { flex: 1.2 },
  right: { flex: 0.8 },
  card: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(0,0,0,0.16)',
    padding: 18,
  },
  cardTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginBottom: 8 },
  cardHint: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '700', marginBottom: 12 },
  grid: { paddingTop: 8, paddingBottom: 10 },
  gridRow: { gap: 12 },
  selectedRow: { marginTop: 12 },
  selectedTitle: { color: '#fff', fontSize: 14, fontWeight: '900' },
  codeText: { marginTop: 6, color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.30)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 8,
  },
  codeValue: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: 8 },
  clearSmall: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  pad: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  padKey: {
    width: '31.5%',
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  padKeyAlt: { backgroundColor: 'rgba(229,9,20,0.20)', borderColor: 'rgba(229,9,20,0.40)' },
  padText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1.2 },
  primaryBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(229,9,20,0.70)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.95)',
  },
  secondaryBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  ghostBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  btnFocused: { 
    transform: [{ scale: 1.08 }], 
    borderColor: '#fff',
    borderWidth: 2,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 10,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  notice: {
    marginHorizontal: 6,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
  },
  noticeInfo: { backgroundColor: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.16)' },
  noticeSuccess: { backgroundColor: 'rgba(80,200,120,0.12)', borderColor: 'rgba(80,200,120,0.34)' },
  noticeError: { backgroundColor: 'rgba(229,9,20,0.14)', borderColor: 'rgba(229,9,20,0.45)' },
  noticeTitle: { color: '#fff', fontSize: 14, fontWeight: '900' },
  noticeMessage: { marginTop: 4, color: 'rgba(255,255,255,0.82)', fontSize: 13, fontWeight: '700' },
  upsell: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
  },
  upsellTitle: { color: '#fff', fontSize: 16, fontWeight: '900', marginBottom: 6 },
  upsellText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '700' },
  episodePicker: { flex: 1 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  closeBtn: { padding: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)' },
  pickerSubtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '700', marginBottom: 12 },
  seasonList: { paddingVertical: 8, marginBottom: 8 },
  seasonPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', marginRight: 10 },
  seasonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  episodeList: { flex: 1, paddingBottom: 10 },
  episodeItem: { padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 8, borderWidth: 1, borderColor: 'transparent' },
  episodeText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
