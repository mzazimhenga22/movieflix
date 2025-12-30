import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Media } from '@/types';

type Props = {
  profileName?: string | null;
  accent?: string;
  item: Media | null;
  height?: number;
  trailerUrl?: string | null;
  isActive?: boolean;
  autoPlayDelayMs?: number;
  variant?: 'full' | 'panel';
  onPressPrimary?: () => void;
  onPressSecondary?: () => void;
  onPressTertiary?: () => void;
  primaryLabel?: string;
  secondaryLabel?: string;
  tertiaryLabel?: string;
};

export default function TvHeroBanner({
  profileName,
  accent = '#e50914',
  item,
  height = 520,
  trailerUrl,
  isActive = true,
  autoPlayDelayMs = 2600,
  variant = 'full',
  onPressPrimary,
  onPressSecondary,
  onPressTertiary,
  primaryLabel = 'Play',
  secondaryLabel = 'More Info',
  tertiaryLabel = 'Search',
}: Props) {
  const isPanel = variant === 'panel';
  const slideAnim = useRef(new Animated.Value(220)).current;
  const parallax = useRef(new Animated.Value(0)).current;
  const videoOpacity = useRef(new Animated.Value(0)).current;
  const videoRef = useRef<Video | null>(null);
  const [playEnabled, setPlayEnabled] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  const title = item?.title || item?.name || 'MovieFlix';
  const overview = item?.overview || '';
  const image = item?.backdrop_path || item?.poster_path;
  const year = (item?.release_date || item?.first_air_date || '').slice(0, 4);
  const score = typeof item?.vote_average === 'number' ? Math.round(item.vote_average * 10) : null;
  const typeLabel = (item?.media_type ?? 'movie') === 'tv' ? 'TV' : 'Movie';

  const imageUri = useMemo(() => {
    if (!image) return null;
    // Use TMDB original size for the hero backdrop (highest quality).
    return `https://image.tmdb.org/t/p/original${image}`;
  }, [image]);

  useEffect(() => {
    slideAnim.setValue(220);
    parallax.setValue(0);
    videoOpacity.setValue(0);
    setPlayEnabled(false);
    setVideoReady(false);
    setVideoFailed(false);

    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    Animated.timing(parallax, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [item?.id, parallax, slideAnim, videoOpacity]);

  useEffect(() => {
    if (!trailerUrl || videoFailed) return;
    if (!videoReady) return;
    if (!playEnabled) return;
    Animated.timing(videoOpacity, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [playEnabled, trailerUrl, videoFailed, videoOpacity, videoReady]);

  useEffect(() => {
    if (!trailerUrl) return;
    if (isActive) return;
    void videoRef.current?.pauseAsync().catch(() => {});
  }, [isActive, trailerUrl]);

  useEffect(() => {
    if (!trailerUrl || videoFailed) return;
    if (!isActive) return;
    if (playEnabled) return;
    const t = setTimeout(() => setPlayEnabled(true), autoPlayDelayMs);
    return () => clearTimeout(t);
  }, [autoPlayDelayMs, isActive, playEnabled, trailerUrl, videoFailed]);

  const content = (
    <View style={styles.inner}>
      <LinearGradient
        colors={['rgba(0,0,0,0.62)', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0)']}
        start={isPanel ? { x: 0, y: 0.5 } : { x: 1, y: 0.5 }}
        end={isPanel ? { x: 1, y: 0.5 } : { x: 0, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.0)', 'rgba(5,6,15,0.90)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.bottomFade}
      />

      <View style={[styles.content, isPanel ? styles.contentPanel : null]}>
        <View style={[styles.kickerRow, isPanel ? styles.kickerRowPanel : null]}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
          <Text style={styles.kicker} numberOfLines={1}>
            {profileName ? `Featured for ${profileName}` : 'Featured'}
          </Text>
        </View>

        <View style={[styles.metaRow, isPanel ? styles.metaRowPanel : null]}>
          <View style={styles.metaPill}>
            <Text style={styles.metaText}>{typeLabel}</Text>
          </View>
          {year ? (
            <View style={styles.metaPill}>
              <Text style={styles.metaText}>{year}</Text>
            </View>
          ) : null}
          {typeof score === 'number' ? (
            <View style={[styles.metaPill, styles.metaPillStrong, { borderColor: `${accent}AA` }]}>
              <Ionicons name="star" size={14} color="#ffd700" />
              <Text style={styles.metaText}>{score}%</Text>
            </View>
          ) : null}
          {trailerUrl ? (
            <View style={[styles.metaPill, styles.metaPillSecondary]}>
              <Ionicons name="film-outline" size={14} color="#fff" />
              <Text style={styles.metaText}>Trailer</Text>
            </View>
          ) : null}
        </View>

        <Text style={[styles.title, isPanel ? styles.titlePanel : null]} numberOfLines={2}>
          {title}
        </Text>

        {overview ? (
          <Text style={[styles.overview, isPanel ? styles.overviewPanel : null]} numberOfLines={3}>
            {overview}
          </Text>
        ) : (
          <Text style={[styles.overview, isPanel ? styles.overviewPanel : null]} numberOfLines={2}>
            Pick something to watch — explore trending, recommended, and more.
          </Text>
        )}

        <View style={[styles.actions, isPanel ? styles.actionsPanel : null]}>
          <Pressable
            onPress={onPressPrimary}
            style={({ focused }: any) => [styles.primaryBtn, focused ? styles.btnFocused : null]}
          >
            <Ionicons name="play" size={18} color="#000" />
            <Text style={styles.primaryText}>{primaryLabel}</Text>
          </Pressable>

          <Pressable
            onPress={onPressSecondary}
            style={({ focused }: any) => [styles.secondaryBtn, focused ? styles.btnFocused : null]}
          >
            <Ionicons name="information-circle-outline" size={18} color="#fff" />
            <Text style={styles.secondaryText}>{secondaryLabel}</Text>
          </Pressable>

          <Pressable
            onPress={onPressTertiary}
            style={({ focused }: any) => [styles.tertiaryBtn, focused ? styles.btnFocused : null]}
          >
            <Ionicons name="search" size={18} color="#fff" />
            <Text style={styles.secondaryText}>{tertiaryLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <Animated.View
      style={[
        styles.wrap,
        isPanel ? styles.wrapPanel : null,
        {
          borderColor: 'rgba(255,255,255,0.10)',
          transform: [
            { translateY: slideAnim },
            {
              translateY: parallax.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={[styles.bg, { height }]}>
        {imageUri ? (
          <ImageBackground source={{ uri: imageUri }} style={StyleSheet.absoluteFill} imageStyle={styles.bgImage} />
        ) : (
          <LinearGradient
            colors={[`${accent}`, 'rgba(7,8,21,1)', 'rgba(5,6,15,1)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}

        {trailerUrl && !videoFailed ? (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: videoOpacity }]}>
            <Video
              // Remount per hero item so previous playback doesn't leak
              key={`${item?.id ?? 'none'}:${trailerUrl}`}
              ref={(v) => {
                videoRef.current = v;
              }}
              source={{ uri: trailerUrl }}
              style={StyleSheet.absoluteFill}
              resizeMode={ResizeMode.COVER}
              shouldPlay={Boolean(isActive && playEnabled)}
              isLooping
              isMuted
              useNativeControls={false}
              onReadyForDisplay={() => {
                setVideoReady(true);
              }}
              onError={() => {
                setVideoFailed(true);
                setVideoReady(false);
                videoOpacity.setValue(0);
              }}
            />
          </Animated.View>
        ) : null}

        {content}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.24)',
  },
  wrapPanel: {
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.18)',
    shadowOpacity: 0,
    elevation: 0,
  },
  bg: {
    width: '100%',
  },
  bgImage: {
    resizeMode: 'cover',
    transform: [{ scale: 1.02 }],
  },
  inner: { flex: 1 },
  bottomFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 200 },
  content: {
    flex: 1,
    paddingHorizontal: 26,
    paddingTop: 26,
    paddingBottom: 24,
    maxWidth: 820,
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  contentPanel: {
    maxWidth: 740,
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  kickerRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
  kickerRowPanel: { flexDirection: 'row', justifyContent: 'flex-start' },
  dot: { width: 10, height: 10, borderRadius: 99 },
  kicker: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  metaRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
  },
  metaRowPanel: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  metaPillSecondary: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderColor: 'rgba(255,255,255,0.16)',
  },
  metaPillStrong: {
    backgroundColor: 'rgba(229,9,20,0.12)',
  },
  metaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  title: { color: '#fff', fontSize: 54, fontWeight: '900', marginTop: 10, lineHeight: 60, textAlign: 'right' },
  titlePanel: { fontSize: 46, lineHeight: 52, textAlign: 'left' },
  overview: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
    lineHeight: 22,
    textAlign: 'right',
  },
  overviewPanel: { textAlign: 'left' },
  actions: { flexDirection: 'row-reverse', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 12, marginTop: 18 },
  actionsPanel: { flexDirection: 'row', justifyContent: 'flex-start' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.14)',
  },
  primaryText: { color: '#000', fontWeight: '900', fontSize: 14 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  tertiaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  secondaryText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  btnFocused: { transform: [{ scale: 1.05 }], borderColor: '#fff' },
});
