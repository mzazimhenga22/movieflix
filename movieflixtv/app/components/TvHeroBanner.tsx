import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';

import type { Media } from '@/types';
import { TvFocusable } from './TvSpatialNavigation';

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
  variant = 'full',
  onPressPrimary,
  onPressSecondary,
  onPressTertiary,
  primaryLabel = 'Play',
  secondaryLabel = 'More Info',
  tertiaryLabel = 'Search',
}: Props) {
  const isPanel = variant === 'panel';
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // Active when hovered (web) - we don't want the whole banner to scale on TV focus
  // to avoid the "whole banner is focused" confusion.
  const isActive = isHovered;

  // Parallax animation refs
  const parallaxX = useRef(new Animated.Value(0)).current;
  const parallaxY = useRef(new Animated.Value(0)).current;
  const imageScale = useRef(new Animated.Value(1.02)).current;

  // Parallax depth effect on focus
  useEffect(() => {
    if (isActive) {
      Animated.parallel([
        Animated.timing(parallaxX, {
          toValue: -8,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(parallaxY, {
          toValue: -4,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(imageScale, {
          toValue: 1.06,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(parallaxX, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(parallaxY, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(imageScale, {
          toValue: 1.02,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isActive, parallaxX, parallaxY, imageScale]);

  const title = item?.title || item?.name || 'MovieFlix';
  const overview = item?.overview || '';
  const image = item?.backdrop_path || item?.poster_path;
  const year = (item?.release_date || item?.first_air_date || '').slice(0, 4);
  const rating = typeof item?.vote_average === 'number' ? item.vote_average : 0;
  const score = typeof item?.vote_average === 'number' ? Math.round(item.vote_average * 10) : null;
  const typeLabel = (item?.media_type ?? 'movie') === 'tv' ? 'TV Series' : 'Movie';
  const isHighRated = rating >= 7.5;

  // Use smaller image size for better performance
  const imageUri = useMemo(() => {
    if (!image) return null;
    return `https://image.tmdb.org/t/p/w780${image}`;
  }, [image]);

  const content = (
    <View style={styles.inner}>
      {/* Gradient overlays */}
      <LinearGradient
        colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.3)', 'transparent']}
        locations={[0, 0.3, 0.6]}
        style={styles.topGradient}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.62)', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0)']}
        start={isPanel ? { x: 0, y: 0.5 } : { x: 1, y: 0.5 }}
        end={isPanel ? { x: 1, y: 0.5 } : { x: 0, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.75)', 'rgba(5,6,15,0.95)']}
        locations={[0, 0.5, 1]}
        style={styles.bottomFade}
      />

      {/* Top badges row */}
      <View style={styles.topBadgesRow}>
        {/* Rating badge */}
        <View style={[styles.ratingBadge, isHighRated && styles.ratingBadgeHigh]}>
          <Ionicons name="star" size={14} color={isHighRated ? '#ffd700' : '#fff'} />
          <Text style={[styles.ratingText, isHighRated && styles.ratingTextHigh]}>
            {rating.toFixed(1)}
          </Text>
        </View>

        {/* Quality badges */}
        <View style={styles.qualityBadgesRow}>
          <View style={styles.hdBadge}>
            <Text style={styles.hdText}>4K</Text>
          </View>
          <View style={styles.hdBadge}>
            <Text style={styles.hdText}>HDR</Text>
          </View>
          {isHighRated && (
            <View style={styles.topBadge}>
              <Ionicons name="trophy" size={12} color="#ffd700" />
              <Text style={styles.topBadgeText}>TOP RATED</Text>
            </View>
          )}
        </View>

        {/* My List button - focusable */}
        <TvFocusable
          onPress={onPressTertiary}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          isTVSelectable={true}
          accessibilityLabel="Add to My List"
          style={({ focused }: any) => [styles.myListBtn, focused && styles.myListBtnFocused]}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </TvFocusable>
      </View>

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
              <Text style={styles.metaText}>{score}% Match</Text>
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

        {/* Genre pills */}
        <View style={[styles.genrePills, isPanel ? styles.genrePillsPanel : null]}>
          <View style={styles.genrePill}>
            <Text style={styles.genrePillText}>{typeLabel}</Text>
          </View>
          {year && (
            <View style={styles.genrePill}>
              <Text style={styles.genrePillText}>{year}</Text>
            </View>
          )}
          <View style={styles.genrePill}>
            <Text style={styles.genrePillText}>2h 15m</Text>
          </View>
        </View>

        <View style={[styles.actions, isPanel ? styles.actionsPanel : null]}>
          <TvFocusable
            onPress={onPressPrimary}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            style={({ focused }: any) => [styles.primaryBtn, { backgroundColor: accent }, focused ? styles.btnFocused : null]}
            isTVSelectable={true}
            tvPreferredFocus={isPanel}
            accessibilityLabel={primaryLabel}
          >
            <Ionicons name="play" size={20} color="#fff" />
            <Text style={styles.primaryText}>{primaryLabel}</Text>
          </TvFocusable>

          <TvFocusable
            onPress={onPressSecondary}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            style={({ focused }: any) => [styles.secondaryBtn, focused ? styles.btnFocused : null]}
            isTVSelectable={true}
            accessibilityLabel={secondaryLabel}
          >
            <Ionicons name="information-circle-outline" size={20} color="#fff" />
            <Text style={styles.secondaryText}>{secondaryLabel}</Text>
          </TvFocusable>

          <TvFocusable
            onPress={onPressTertiary}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            style={({ focused }: any) => [styles.tertiaryBtn, focused ? styles.btnFocused : null]}
            isTVSelectable={true}
            accessibilityLabel={tertiaryLabel}
          >
            <Ionicons name="bookmark-outline" size={20} color="#fff" />
            <Text style={styles.secondaryText}>My List</Text>
          </TvFocusable>
        </View>
      </View>

      {/* Accent border at bottom */}
      <LinearGradient
        colors={['transparent', `${accent}50`, `${accent}25`]}
        style={styles.accentBorder}
      />
    </View>
  );

  // Web hover/focus styles - subtle lift and border highlight
  const webActiveStyle = Platform.select({
    web: {
      transition: 'transform 0.25s ease-out, border-color 0.25s ease-out',
      transform: isActive ? 'translateY(-4px)' : 'translateY(0)',
      borderColor: isActive ? `${accent}` : 'transparent',
    } as any,
    default: {},
  });

  return (
    <View
      style={[styles.wrap, isPanel ? styles.wrapPanel : null, webActiveStyle]}
      focusable={false} // Ensure the wrapper itself isn't focusable on TV
      // @ts-ignore - web only
      onMouseEnter={() => setIsHovered(true)}
      // @ts-ignore - web only
      onMouseLeave={() => setIsHovered(false)}
    >
      <View style={[styles.bg, { height }]}>
        {imageUri ? (
          <Animated.Image
            source={{ uri: imageUri }}
            style={[
              StyleSheet.absoluteFill,
              styles.bgImage,
              {
                transform: [
                  { translateX: parallaxX },
                  { translateY: parallaxY },
                  { scale: imageScale },
                ],
              },
            ]}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={[accent, 'rgba(7,8,21,1)', 'rgba(5,6,15,1)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        {content}
      </View>

      {/* Accent line indicator on focus */}
      <View
        style={[
          styles.focusIndicator,
          { backgroundColor: accent, opacity: isActive ? 1 : 0 }
        ]}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.24)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
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
  bgImageActive: {
    transform: [{ scale: 1.04 }],
  },
  focusIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 24,
    right: 24,
    height: 4,
    borderRadius: 2,
  },
  inner: { flex: 1 },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  bottomFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 280 },
  topBadgesRow: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  ratingBadgeHigh: {
    borderColor: 'rgba(255,215,0,0.5)',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  ratingText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  ratingTextHigh: {
    color: '#ffd700',
  },
  qualityBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hdBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  hdText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  topBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(255,215,0,0.15)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.4)',
  },
  topBadgeText: {
    color: '#ffd700',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  myListBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  myListBtnFocused: {
    transform: [{ scale: 1.15 }],
    borderColor: '#fff',
    borderWidth: 3,
    backgroundColor: 'rgba(229,9,20,0.7)',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 10,
  },
  accentBorder: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
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
  genrePills: {
    flexDirection: 'row-reverse',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 12,
    justifyContent: 'flex-end',
  },
  genrePillsPanel: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  genrePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  genrePillText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
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
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 14 },
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
  btnFocused: {
    transform: [{ scale: 1.1 }],
    borderColor: '#fff',
    borderWidth: 3,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 10,
  },
});
