import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  ImageBackground,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import ScreenWrapper from '../../components/ScreenWrapper';
import {
  formatSharedTitles,
  getGenreName,
  useMovieMatchData,
  vibeLabel,
  type ComputedMatch,
} from '../../lib/movieMatch/hooks';
import { IMAGE_BASE_URL } from '../../constants/api';

const { width } = Dimensions.get('window');
const SWIPE_THRESHOLD = width * 0.28;
const SWIPE_OUT_DURATION = 220;

const resolvePosterUri = (path?: string | null) => {
  if (!path) return undefined;
  return path.startsWith('http') ? path : `${IMAGE_BASE_URL}${path}`;
};

export default function MatchSwipeScreen() {
  const router = useRouter();
  const { matches, loading, errorCopy, refreshLocalHistory } = useMovieMatchData();
  const deck = matches.slice(0, 50);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lastSwipe, setLastSwipe] = useState<{ direction: 'left' | 'right'; match: ComputedMatch } | null>(null);
  const position = useRef(new Animated.ValueXY()).current;

  useEffect(() => {
    setActiveIndex(0);
    position.setValue({ x: 0, y: 0 });
  }, [deck.length, position]);

  useEffect(() => {
    if (!lastSwipe) return;
    const timeout = setTimeout(() => setLastSwipe(null), 2200);
    return () => clearTimeout(timeout);
  }, [lastSwipe]);

  const current = deck[activeIndex];

  const resetPosition = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
      bounciness: 8,
    }).start();
  };

  const onSwipeComplete = (direction: 'left' | 'right') => {
    const swipedMatch = deck[activeIndex];
    setActiveIndex((prev) => prev + 1);
    position.setValue({ x: 0, y: 0 });
    if (swipedMatch) {
      setLastSwipe({ direction, match: swipedMatch });
    }
  };

  const forceSwipe = (direction: 'left' | 'right') => {
    const x = direction === 'right' ? width * 1.3 : -width * 1.3;
    Animated.timing(position, {
      toValue: { x, y: 0 },
      duration: SWIPE_OUT_DURATION,
      useNativeDriver: false,
    }).start(() => onSwipeComplete(direction));
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => Boolean(current),
        onPanResponderMove: (_, gesture) => {
          position.setValue({ x: gesture.dx, y: gesture.dy });
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > SWIPE_THRESHOLD) {
            forceSwipe('right');
          } else if (gesture.dx < -SWIPE_THRESHOLD) {
            forceSwipe('left');
          } else {
            resetPosition();
          }
        },
      }),
    [current],
  );

  const rotate = position.x.interpolate({
    inputRange: [-width, 0, width],
    outputRange: ['-16deg', '0deg', '16deg'],
    extrapolate: 'clamp',
  });

  const likeOpacity = position.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const skipOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const renderCard = (match: ComputedMatch, index: number) => {
    if (index < activeIndex) return null;
    const isTop = index === activeIndex;
    const stackOffset = index - activeIndex;
    const style = isTop
      ? [
          styles.card,
          {
            transform: [...position.getTranslateTransform(), { rotate }],
            elevation: 10,
            zIndex: 20,
          },
        ]
      : [
          styles.card,
          {
            top: stackOffset * 10,
            transform: [{ scale: 1 - stackOffset * 0.04 }],
            opacity: 1 - stackOffset * 0.15,
            zIndex: 20 - stackOffset,
          },
        ];

    const posterUri = resolvePosterUri(match.bestPick?.posterPath ?? undefined);

    const cardBody = (
      <>
        {isTop && (
          <>
            <Animated.View style={[styles.badgeLike, { opacity: likeOpacity }]}> 
              <Ionicons name="sparkles" size={18} color="#fff" />
              <Text style={styles.badgeText}>In sync</Text>
            </Animated.View>
            <Animated.View style={[styles.badgeNope, { opacity: skipOpacity }]}> 
              <Ionicons name="close" size={18} color="#fff" />
              <Text style={styles.badgeText}>Skip</Text>
            </Animated.View>
          </>
        )}

        <View style={styles.cardMeta}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{match.profileName}</Text>
            <View style={styles.scorePill}>
              <Ionicons name="flame" size={14} color="#fff" />
              <Text style={styles.score}>{match.matchScore}%</Text>
            </View>
          </View>
          <Text style={styles.vibe}>{vibeLabel[match.vibe]}</Text>
          <Text style={styles.shared}>{formatSharedTitles(match.sharedTitles)}</Text>
          <View style={styles.genreRow}>
            {match.sharedGenres.slice(0, 3).map((genre) => (
              <View key={`${match.id}-${genre}`} style={styles.genreChip}>
                <Text style={styles.genreChipText}>{getGenreName(genre)}</Text>
              </View>
            ))}
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/watchparty')}>
              <MaterialCommunityIcons name="movie-play-outline" size={20} color="#fff" />
              <Text style={styles.actionText}>Watch party</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/messaging')}>
              <Ionicons name="chatbubble-outline" size={18} color="#fff" />
              <Text style={styles.actionText}>Say hi</Text>
            </TouchableOpacity>
          </View>
        </View>
      </>
    );

    return (
      <Animated.View
        key={match.id}
        style={style}
        {...(isTop ? panResponder.panHandlers : {})}
      >
        {posterUri ? (
          <ImageBackground
            source={{ uri: posterUri }}
            style={styles.cardBackground}
            imageStyle={styles.cardBackgroundImage}
          >
            <LinearGradient
              colors={['rgba(5,6,15,0.1)', 'rgba(5,6,15,0.9)']}
              style={StyleSheet.absoluteFillObject}
            />
            {cardBody}
          </ImageBackground>
        ) : (
          <View style={[styles.cardBackground, styles.cardBackgroundFallback]}>
            <LinearGradient
              colors={['rgba(5,6,15,0.15)', 'rgba(5,6,15,0.95)']}
              style={StyleSheet.absoluteFillObject}
            />
            {cardBody}
          </View>
        )}
      </Animated.View>
    );
  };

  const remaining = deck.length - activeIndex;

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Movie Match</Text>
        <Text style={styles.title}>Swipe to connect</Text>
        <Text style={styles.subtitle}>
          Discover film friends even if you haven’t followed them yet.
        </Text>
      </View>

      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.loaderText}>Scanning profiles…</Text>
        </View>
      )}

      {!loading && errorCopy && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{errorCopy}</Text>
        </View>
      )}

      {!loading && !errorCopy && deck.length === 0 && (
        <View style={styles.emptyCard}>
          <Ionicons name="people-outline" size={48} color="rgba(255,255,255,0.6)" />
          <Text style={styles.emptyTitle}>No matches yet</Text>
          <Text style={styles.emptyCopy}>
            Watch a bit more or refresh the Movie Match tab to gather new recommendations.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push('/social-feed')}
          >
            <Text style={styles.primaryBtnText}>Back to social feed</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !errorCopy && deck.length > 0 && (
        <View style={styles.deckContainer}>
          {deck.map(renderCard)}
          {remaining <= 3 && remaining > 0 && (
            <View style={styles.remainingHint}>
              <Text style={styles.remainingText}>{remaining} left</Text>
            </View>
          )}
        </View>
      )}

      {!loading && deck.length > 0 && (
        <View style={styles.ctaRow}>
          <TouchableOpacity style={[styles.circleBtn, styles.skipBtn]} onPress={() => forceSwipe('left')}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.circleBtn, styles.superBtn]} onPress={refreshLocalHistory}>
            <Ionicons name="refresh" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.circleBtn, styles.likeBtn]} onPress={() => forceSwipe('right')}>
            <Ionicons name="heart" size={26} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {lastSwipe && (
        <View
          style={[
            styles.toast,
            lastSwipe.direction === 'right' ? styles.toastLike : styles.toastSkip,
          ]}
        >
          <Ionicons
            name={lastSwipe.direction === 'right' ? 'heart' : 'close'}
            size={16}
            color="#fff"
          />
          <Text style={styles.toastText}>
            {lastSwipe.direction === 'right' ? 'Connected with' : 'Skipped'} {lastSwipe.match.profileName}
          </Text>
        </View>
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.65)',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 12,
    marginBottom: 4,
  },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.75)',
    marginTop: 6,
    fontSize: 14,
  },
  deckContainer: {
    flex: 1,
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 30,
  },
  card: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#11131f',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardBackground: {
    flex: 1,
  },
  cardBackgroundImage: {
    resizeMode: 'cover',
  },
  cardBackgroundFallback: {
    backgroundColor: '#11131f',
  },
  badgeLike: {
    position: 'absolute',
    top: 24,
    left: 24,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(52, 199, 89, 0.85)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeNope: {
    position: 'absolute',
    top: 24,
    right: 24,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(229, 57, 53, 0.8)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  cardMeta: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 20,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
  },
  scorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  score: {
    color: '#fff',
    fontWeight: '700',
  },
  vibe: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    marginTop: 8,
  },
  shared: {
    color: '#fff',
    marginTop: 4,
    fontSize: 15,
    fontWeight: '600',
  },
  genreRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  genreChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  genreChipText: {
    color: '#fff',
    fontSize: 12,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  actionText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  loader: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  loaderText: {
    color: 'rgba(255,255,255,0.7)',
    marginTop: 10,
  },
  errorCard: {
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,75,75,0.3)',
    backgroundColor: 'rgba(255,75,75,0.08)',
  },
  errorText: {
    color: '#ff9b9b',
  },
  emptyCard: {
    marginHorizontal: 24,
    marginTop: 40,
    padding: 24,
    borderRadius: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    gap: 12,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  emptyCopy: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  primaryBtn: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: '#e50914',
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  ctaRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingBottom: 24,
  },
  circleBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  skipBtn: {
    backgroundColor: 'rgba(229, 57, 53, 0.8)',
  },
  likeBtn: {
    backgroundColor: '#0ecb7a',
  },
  superBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  remainingHint: {
    position: 'absolute',
    top: 16,
    right: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  remainingText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  toast: {
    position: 'absolute',
    bottom: 18,
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  toastLike: {
    backgroundColor: 'rgba(14,203,122,0.95)',
  },
  toastSkip: {
    backgroundColor: 'rgba(229,57,53,0.9)',
  },
  toastText: {
    color: '#fff',
    fontWeight: '600',
  },
});
