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
  StatusBar,
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
import LiquidGlass from '../../components/app-components/LiquidGlass';
import { logInteraction } from '../../lib/algo';
import { useUser } from '../../hooks/use-user';

const { width, height } = Dimensions.get('window');
const SWIPE_THRESHOLD = width * 0.28;
const SWIPE_OUT_DURATION = 220;

const resolvePosterUri = (path?: string | null) => {
  if (!path) return undefined;
  return path.startsWith('http') ? path : `${IMAGE_BASE_URL}${path}`;
};

export default function MatchSwipeScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { matches, loading, errorCopy, refreshLocalHistory } = useMovieMatchData();
  const deck = matches.slice(0, 50);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lastSwipe, setLastSwipe] = useState<{ direction: 'left' | 'right'; match: ComputedMatch } | null>(null);
  const position = useRef(new Animated.ValueXY()).current;

  useEffect(() => {
    setActiveIndex(0);
    position.setValue({ x: 0, y: 0 });
  }, [deck.length]);

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
    if (swipedMatch && user?.uid) {
      void logInteraction({
        type: direction === 'right' ? 'match_swipe_right' : 'match_swipe_left',
        actorId: user.uid,
        targetId: swipedMatch.id,
        targetType: 'user',
        meta: { matchScore: swipedMatch.matchScore, profileName: swipedMatch.profileName }
      });
    }
    setActiveIndex((prev) => prev + 1);
    position.setValue({ x: 0, y: 0 });
    if (swipedMatch) setLastSwipe({ direction, match: swipedMatch });
  };

  const forceSwipe = (direction: 'left' | 'right') => {
    const x = direction === 'right' ? width * 1.3 : -width * 1.3;
    Animated.timing(position, {
      toValue: { x, y: 0 },
      duration: SWIPE_OUT_DURATION,
      useNativeDriver: false,
    }).start(() => onSwipeComplete(direction));
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => Boolean(current),
    onPanResponderMove: (_, gesture) => { position.setValue({ x: gesture.dx, y: gesture.dy }); },
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx > SWIPE_THRESHOLD) forceSwipe('right');
      else if (gesture.dx < -SWIPE_THRESHOLD) forceSwipe('left');
      else resetPosition();
    },
  }), [current]);

  const rotate = position.x.interpolate({
    inputRange: [-width, 0, width],
    outputRange: ['-16deg', '0deg', '16deg'],
    extrapolate: 'clamp',
  });

  const likeOpacity = position.x.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
  const skipOpacity = position.x.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  const renderCard = (match: ComputedMatch, index: number) => {
    if (index < activeIndex) return null;
    const isTop = index === activeIndex;
    const stackOffset = index - activeIndex;
    if (stackOffset > 2) return null;

    const style = isTop
      ? [styles.card, { transform: [...position.getTranslateTransform(), { rotate }], zIndex: 20 }]
      : [styles.card, { top: stackOffset * 12, transform: [{ scale: 1 - stackOffset * 0.05 }], opacity: 1 - stackOffset * 0.2, zIndex: 20 - stackOffset }];

    const posterUri = resolvePosterUri(match.bestPick?.posterPath ?? undefined);

    return (
      <Animated.View key={match.id} style={style} {...(isTop ? panResponder.panHandlers : {})}>
        <ImageBackground source={{ uri: posterUri }} style={styles.cardBg} imageStyle={{ borderRadius: 32 }}>
            <LinearGradient colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.95)']} style={StyleSheet.absoluteFill} />
            
            {isTop && (
                <>
                    <Animated.View style={[styles.badge, styles.badgeLike, { opacity: likeOpacity }]}>
                        <Ionicons name="sparkles" size={20} color="#fff" />
                        <Text style={styles.badgeText}>SYNC</Text>
                    </Animated.View>
                    <Animated.View style={[styles.badge, styles.badgeSkip, { opacity: skipOpacity }]}>
                        <Ionicons name="close" size={20} color="#fff" />
                        <Text style={styles.badgeText}>SKIP</Text>
                    </Animated.View>
                </>
            )}

            <View style={styles.cardInfo}>
                <View style={styles.nameRow}>
                    <Text style={styles.name}>{match.profileName}</Text>
                    <LiquidGlass cornerRadius={12} tintOpacity={0.2} tintColor="#ff4b4b" style={styles.scoreGlass}>
                        <Text style={styles.score}>{match.matchScore}%</Text>
                    </LiquidGlass>
                </View>
                <Text style={styles.vibe}>{vibeLabel[match.vibe]}</Text>
                <Text style={styles.sharedTitles} numberOfLines={1}>{formatSharedTitles(match.sharedTitles)}</Text>
                <View style={styles.genreRow}>
                    {match.sharedGenres.slice(0, 3).map(g => (
                        <View key={g} style={styles.genreChip}><Text style={styles.genreText}>{getGenreName(g)}</Text></View>
                    ))}
                </View>
            </View>
        </ImageBackground>
      </Animated.View>
    );
  };

  return (
    <View style={styles.root}>
      <ScreenWrapper>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#1a0f1f', '#050509']} style={StyleSheet.absoluteFill} />
        <View style={[styles.bgOrb, { top: -100, right: -50, backgroundColor: '#ff4b4b10' }]} />

        <View style={styles.header}>
          <Text style={styles.eyebrow}>DISCOVERY</Text>
          <Text style={styles.title}>Movie Match</Text>
        </View>

        {loading ? (
            <View style={styles.loader}><ActivityIndicator size="large" color="#ff4b4b" /></View>
        ) : (
            <View style={styles.deck}>
                {deck.length > 0 ? deck.map(renderCard) : (
                    <View style={styles.empty}>
                        <Ionicons name="people-outline" size={64} color="rgba(255,255,255,0.1)" />
                        <Text style={styles.emptyText}>No more matches nearby</Text>
                    </View>
                )}
            </View>
        )}

        {deck.length > activeIndex && (
            <View style={styles.controls}>
                <TouchableOpacity style={styles.btn} onPress={() => forceSwipe('left')}>
                    <LiquidGlass cornerRadius={35} tintOpacity={0.1} style={styles.btnGlass}>
                        <Ionicons name="close" size={32} color="#ff4b4b" />
                    </LiquidGlass>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnSmall} onPress={refreshLocalHistory}>
                    <LiquidGlass cornerRadius={25} tintOpacity={0.1} style={styles.btnGlass}>
                        <Ionicons name="refresh" size={24} color="#fff" />
                    </LiquidGlass>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btn} onPress={() => forceSwipe('right')}>
                    <LiquidGlass cornerRadius={35} tintOpacity={0.1} style={styles.btnGlass}>
                        <Ionicons name="heart" size={32} color="#0ecb7a" />
                    </LiquidGlass>
                </TouchableOpacity>
            </View>
        )}
      </ScreenWrapper>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  bgOrb: { position: 'absolute', width: 400, height: 400, borderRadius: 200, filter: 'blur(100px)' as any },
  header: { paddingHorizontal: 24, paddingTop: 20, marginBottom: 20 },
  eyebrow: { color: '#ff4b4b', fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  title: { fontSize: 34, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  deck: { flex: 1, marginHorizontal: 16, marginBottom: 40, position: 'relative' },
  card: { position: 'absolute', width: '100%', height: '100%' },
  cardBg: { flex: 1, padding: 24, justifyContent: 'flex-end' },
  badge: { position: 'absolute', top: 30, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 2 },
  badgeLike: { left: 24, borderColor: '#0ecb7a', backgroundColor: 'rgba(14,203,122,0.2)' },
  badgeSkip: { right: 24, borderColor: '#ff4b4b', backgroundColor: 'rgba(255,75,75,0.2)' },
  badgeText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  cardInfo: { gap: 8 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 32, fontWeight: '900', color: '#fff' },
  scoreGlass: { paddingHorizontal: 12, paddingVertical: 6 },
  score: { color: '#fff', fontWeight: '900', fontSize: 16 },
  vibe: { color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '600' },
  sharedTitles: { color: '#fff', fontSize: 14, opacity: 0.8 },
  genreRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  genreChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)' },
  genreText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 30, paddingBottom: 40 },
  btn: { width: 70, height: 70 },
  btnSmall: { width: 50, height: 50 },
  btnGlass: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', opacity: 0.5 },
  emptyText: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 20 },
});
