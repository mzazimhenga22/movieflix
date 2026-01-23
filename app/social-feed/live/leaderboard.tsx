import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useAccent } from '../../components/AccentContext';
import { listenToLiveStream, listenToLiveViewers } from '@/lib/live/liveService';
import type { LiveStream, LiveStreamViewer } from '@/lib/live/types';

const scoreForId = (id: string): number => {
  let s = 0;
  for (let i = 0; i < id.length; i += 1) s = (s * 33 + id.charCodeAt(i)) % 10_000;
  return 100 + (s % 9900);
};

export default function LiveLeaderboardScreen() {
  const router = useRouter();
  const { accentColor } = useAccent();
  const { id } = useLocalSearchParams<{ id: string }>();

  const streamId = typeof id === 'string' ? id : '';
  const [loading, setLoading] = useState(true);
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [viewers, setViewers] = useState<LiveStreamViewer[]>([]);

  useEffect(() => {
    if (!streamId) return;
    const unsub = listenToLiveStream(streamId, (s) => setStream(s));
    return () => unsub();
  }, [streamId]);

  useEffect(() => {
    if (!streamId) return;
    let didFirst = false;
    const unsub = listenToLiveViewers(streamId, (v) => {
      setViewers(v);
      if (!didFirst) {
        didFirst = true;
        setLoading(false);
      }
    });
    return () => unsub();
  }, [streamId]);

  const ranked = useMemo(() => {
    return viewers
      .map((v) => ({ id: String(v.id), points: scoreForId(String(v.id)) }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 25);
  }, [viewers]);

  return (
    <LinearGradient colors={[accentColor, '#06060b']} style={StyleSheet.absoluteFill}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.85}>
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={1}>
              Top supporters
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {stream?.hostName ?? 'Host'} · {stream?.title ?? 'Live'}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.loadingText}>Loading leaderboard…</Text>
          </View>
        ) : ranked.length ? (
          <View style={{ gap: 10 }}>
            {ranked.map((r, idx) => (
              <View key={r.id} style={styles.row}>
                <View style={styles.rankPill}>
                  <Text style={styles.rankText}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.userId} numberOfLines={1}>
                    {r.id}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {r.points} coins
                  </Text>
                </View>
                <Ionicons
                  name={idx === 0 ? 'trophy' : idx < 3 ? 'medal' : 'sparkles'}
                  size={18}
                  color={idx === 0 ? '#ffd166' : 'rgba(255,255,255,0.85)'}
                />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.center}>
            <Ionicons name="people-outline" size={44} color="rgba(255,255,255,0.75)" />
            <Text style={styles.loadingText}>No viewers yet.</Text>
          </View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  rankPill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  rankText: {
    color: '#fff',
    fontWeight: '900',
  },
  userId: {
    color: '#fff',
    fontWeight: '900',
  },
  meta: {
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '700',
    marginTop: 3,
  },
});
