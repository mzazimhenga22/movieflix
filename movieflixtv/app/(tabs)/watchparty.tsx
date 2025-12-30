import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { Media } from '@/types';
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

  const handleCreate = useCallback(async () => {
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
    if (!selected) {
      setNotice({ kind: 'error', title: 'Pick a title', message: 'Select a movie from your list first.' });
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
  }, [isSubscribed, router, scrape, selected, user?.uid]);

  const handleJoin = useCallback(async () => {
    const code = joinCode.trim();
    setNotice({ kind: 'info', title: 'Checking code…' });
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
  }, [joinCode, router]);

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
            <Text style={styles.cardTitle}>Pick from My List</Text>
            <Text style={styles.cardHint}>Add to “My List” on phone, then come back.</Text>

            {myList.length === 0 ? (
              <Pressable
                onPress={() => router.push('/continue-on-phone?feature=profiles')}
                focusable
                style={({ focused }: any) => [styles.ghostBtn, focused ? styles.btnFocused : null]}
              >
                <Ionicons name="phone-portrait-outline" size={18} color="#fff" />
                <Text style={styles.btnText}>Continue on phone</Text>
              </Pressable>
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

            <Pressable
              onPress={() => void handleCreate()}
              disabled={disabled}
              focusable
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
            </Pressable>
                </View>
              </View>

              <View style={styles.right}>
                <View style={styles.card}>
            <Text style={styles.cardTitle}>Join with code</Text>
            <Text style={styles.cardHint}>Enter the 6-digit code from your friend.</Text>
            <View style={styles.codeRow}>
              <Text style={styles.codeValue}>{(joinCode + '______').slice(0, 6)}</Text>
              <Pressable
                onPress={() => setJoinCode('')}
                focusable
                style={({ focused }: any) => [styles.clearSmall, focused ? styles.btnFocused : null]}
              >
                <Text style={styles.btnText}>Clear</Text>
              </Pressable>
            </View>

            <View style={styles.pad}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'DEL', '0', 'CLEAR'].map((k) => (
                <Pressable
                  key={k}
                  onPress={() => handleJoinKey(k)}
                  focusable
                  style={({ focused }: any) => [
                    styles.padKey,
                    k === 'DEL' || k === 'CLEAR' ? styles.padKeyAlt : null,
                    focused ? styles.btnFocused : null,
                  ]}
                >
                  <Text style={styles.padText}>{k}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={() => void handleJoin()}
              disabled={disabled}
              focusable
              style={({ focused }: any) => [
                styles.secondaryBtn,
                disabled ? styles.btnDisabled : null,
                focused ? styles.btnFocused : null,
              ]}
            >
              <Ionicons name="log-in-outline" size={18} color="#fff" />
              <Text style={styles.btnText}>Join Party</Text>
            </Pressable>

            {!isSubscribed ? (
              <View style={styles.upsell}>
                <Text style={styles.upsellTitle}>Subscriptions on phone</Text>
                <Text style={styles.upsellText}>Upgrade in the phone app to host larger rooms.</Text>
                <Pressable
                  onPress={() => router.push('/premium')}
                  focusable
                  style={({ focused }: any) => [styles.ghostBtn, focused ? styles.btnFocused : null]}
                >
                  <Text style={styles.btnText}>Open subscription info</Text>
                </Pressable>
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
  container: { flex: 1 },
  shell: { flex: 1, paddingLeft: 0, paddingRight: 34, paddingTop: 22, paddingBottom: 22, alignItems: 'center' },
  panel: { flex: 1, width: '100%', maxWidth: 1520 },
  panelInner: { flex: 1, padding: 18 },
  topBar: { paddingHorizontal: 6, paddingBottom: 14 },
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
  btnFocused: { transform: [{ scale: 1.04 }], borderColor: '#fff' },
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
});
