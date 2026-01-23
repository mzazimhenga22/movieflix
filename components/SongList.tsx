import { IMAGE_BASE_URL } from '@/constants/api';
import { useNavigationGuard } from '@/hooks/use-navigation-guard';
import { Media } from '@/types';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { memo, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 48;

interface SongListProps {
  title: string;
  songs: Media[];
  onOpenAll?: () => void;
  accentColor?: string;
}

const GradientText = memo(function GradientText({
  children,
  colors,
  style,
}: {
  children: string;
  colors: readonly [string, string, ...string[]];
  style?: any;
}) {
  return (
    <MaskedView maskElement={<Text style={[style, { backgroundColor: 'transparent' }]}>{children}</Text>}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <Text style={[style, { opacity: 0 }]}>{children}</Text>
      </LinearGradient>
    </MaskedView>
  );
});

const SongCard = memo(function SongCard({
  song,
  index,
  isActive,
  accentColor,
  onWatch,
  onPress,
}: {
  song: Media;
  index: number;
  isActive: boolean;
  accentColor: string;
  onWatch: () => void;
  onPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const vinylRotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: isActive ? 1 : 0.92,
        friction: 8,
        tension: 100,
        useNativeDriver: true,
      }),
      Animated.timing(glowAnim, {
        toValue: isActive ? 1 : 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  }, [isActive, scaleAnim, glowAnim]);

  useEffect(() => {
    if (isActive) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      );
      pulse.start();

      const rotate = Animated.loop(
        Animated.timing(vinylRotate, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true })
      );
      rotate.start();

      return () => {
        pulse.stop();
        rotate.stop();
      };
    } else {
      pulseAnim.setValue(0);
    }
  }, [isActive, pulseAnim, vinylRotate]);

  const animatedBorderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.25)'],
  });

  const vinylSpin = vinylRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const posterUri = song.poster_path ? `${IMAGE_BASE_URL}${song.poster_path}` : null;
  const backdropUri = song.backdrop_path ? `${IMAGE_BASE_URL}${song.backdrop_path}` : posterUri;
  const title = song.title || song.name || 'Unknown Track';
  const year = (song.release_date || song.first_air_date || '').slice(0, 4);

  return (
    <Animated.View style={[styles.cardOuter, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
        <Animated.View style={[styles.card, { borderColor: animatedBorderColor }]}>
          {/* Background image with blur */}
          {backdropUri && (
            <ImageBackground source={{ uri: backdropUri }} style={styles.cardBg} blurRadius={20}>
              <LinearGradient
                colors={['rgba(5,6,15,0.7)', 'rgba(5,6,15,0.95)']}
                style={StyleSheet.absoluteFill}
              />
            </ImageBackground>
          )}

          {/* Accent glow */}
          {isActive && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.accentGlow,
                { backgroundColor: accentColor, opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.25] }) },
              ]}
            />
          )}

          <View style={styles.cardContent}>
            {/* Album art with vinyl effect */}
            <View style={styles.albumSection}>
              <View style={styles.albumArtContainer}>
                {posterUri ? (
                  <ImageBackground source={{ uri: posterUri }} style={styles.albumArt}>
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.4)']}
                      style={StyleSheet.absoluteFill}
                    />
                  </ImageBackground>
                ) : (
                  <View style={[styles.albumArt, styles.albumPlaceholder]}>
                    <Ionicons name="musical-notes" size={32} color="rgba(255,255,255,0.3)" />
                  </View>
                )}

                {/* Play indicator */}
                {isActive && (
                  <View style={[styles.nowPlayingBadge, { backgroundColor: accentColor }]}>
                    <Animated.View style={{ opacity: pulseAnim }}>
                      <View style={styles.soundBars}>
                        <View style={[styles.soundBar, styles.soundBar1]} />
                        <View style={[styles.soundBar, styles.soundBar2]} />
                        <View style={[styles.soundBar, styles.soundBar3]} />
                      </View>
                    </Animated.View>
                  </View>
                )}
              </View>

              {/* Vinyl record peeking out */}
              <Animated.View style={[styles.vinylDisc, { transform: [{ rotate: vinylSpin }] }]}>
                <LinearGradient
                  colors={['#1a1a1a', '#0d0d0d', '#1a1a1a']}
                  style={styles.vinylGradient}
                >
                  <View style={styles.vinylCenter}>
                    <View style={[styles.vinylCenterDot, { backgroundColor: accentColor }]} />
                  </View>
                  <View style={styles.vinylGrooves} />
                </LinearGradient>
              </Animated.View>
            </View>

            {/* Track info */}
            <View style={styles.trackInfo}>
              <View style={styles.trackHeader}>
                <View style={styles.trackBadge}>
                  <FontAwesome name="youtube-play" size={10} color="#fff" />
                  <Text style={styles.trackBadgeText}>Official</Text>
                </View>
                {year ? (
                  <View style={styles.yearBadge}>
                    <Text style={styles.yearText}>{year}</Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.trackTitle} numberOfLines={2}>{title}</Text>
              <Text style={styles.trackSubtitle}>Movie Soundtrack</Text>

              {/* Waveform visualization */}
              <View style={styles.waveformContainer}>
                {Array.from({ length: 20 }).map((_, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.waveBar,
                      {
                        height: 8 + Math.random() * 16,
                        backgroundColor: isActive ? accentColor : 'rgba(255,255,255,0.2)',
                        opacity: isActive
                          ? pulseAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.5 + Math.random() * 0.5, 0.8 + Math.random() * 0.2],
                          })
                          : 0.3,
                      },
                    ]}
                  />
                ))}
              </View>

              {/* Action buttons */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.watchBtn, { backgroundColor: accentColor }]}
                  onPress={onWatch}
                  activeOpacity={0.8}
                >
                  <FontAwesome name="youtube-play" size={16} color="#fff" />
                  <Text style={styles.watchBtnText}>Watch Video</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.moreBtn} onPress={onPress}>
                  <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Bottom shine */}
          <LinearGradient
            pointerEvents="none"
            colors={['transparent', 'rgba(255,255,255,0.03)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.bottomShine}
          />
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
});

const SongList: React.FC<SongListProps> = ({ title, songs, onOpenAll, accentColor = '#e50914' }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollViewRef = useRef<any>(null);
  const topSongs = songs.slice(0, 5);
  const router = useRouter();
  const { deferNav } = useNavigationGuard({ cooldownMs: 900 });

  const handleScroll = (event: any) => {
    const scrollPosition = event.nativeEvent.contentOffset.x;
    const cardWidthWithGap = CARD_WIDTH + 16;
    const index = Math.round(scrollPosition / cardWidthWithGap);
    setActiveIndex(Math.max(0, Math.min(index, topSongs.length - 1)));
  };

  const handleWatchPress = (song: Media) => {
    // Navigate to our music player tab with the track
    deferNav(() => router.push({
      pathname: '/(tabs)/music',
      params: {
        trackId: String(song.id),
        title: song.title || song.name || 'Unknown Track',
        thumbnail: song.poster_path || song.backdrop_path || '',
      }
    }));
  };

  const handleCardPress = (movieId: number) => {
    deferNav(() => router.push(`/details/${movieId}`));
  };

  const handleOpenAll = () => {
    if (!onOpenAll) return;
    deferNav(onOpenAll);
  };

  if (!topSongs || topSongs.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.header}
        onPress={handleOpenAll}
        disabled={!onOpenAll}
      >
        <View style={styles.headerLeft}>
          <View style={[styles.headerIcon, { backgroundColor: `${accentColor}22` }]}>
            <Ionicons name="musical-notes" size={18} color={accentColor} />
          </View>
          <View>
            <Text style={styles.headerTitle}>{title}</Text>
            <Text style={styles.headerSubtitle}>{topSongs.length} tracks</Text>
          </View>
        </View>
        {onOpenAll && (
          <View style={styles.headerCta}>
            <Text style={styles.headerCtaText}>Open Player</Text>
            <Ionicons name="play-circle" size={18} color={accentColor} />
          </View>
        )}
      </TouchableOpacity>

      {/* Cards carousel */}
      <Animated.ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        snapToInterval={CARD_WIDTH + 16}
        decelerationRate="fast"
        snapToAlignment="start"
        contentContainerStyle={styles.scrollContent}
      >
        {topSongs.map((song, index) => (
          <SongCard
            key={song.id}
            song={song}
            index={index}
            isActive={index === activeIndex}
            accentColor={accentColor}
            onWatch={() => handleWatchPress(song)}
            onPress={() => handleCardPress(song.id)}
          />
        ))}
      </Animated.ScrollView>

      {/* Pagination dots */}
      <View style={styles.pagination}>
        {topSongs.map((_, index) => (
          <TouchableOpacity
            key={index}
            onPress={() => {
              scrollViewRef.current?.scrollTo({ x: index * (CARD_WIDTH + 16), animated: true });
            }}
          >
            <Animated.View
              style={[
                styles.dot,
                {
                  backgroundColor: index === activeIndex ? accentColor : 'rgba(255,255,255,0.25)',
                  width: index === activeIndex ? 24 : 8,
                },
              ]}
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  headerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  headerCtaText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  cardOuter: {
    width: CARD_WIDTH,
    marginRight: 16,
  },
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: 'rgba(15,18,30,0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 32,
    elevation: 12,
  },
  cardBg: {
    ...StyleSheet.absoluteFillObject,
  },
  accentGlow: {
    position: 'absolute',
    top: -50,
    left: -50,
    right: -50,
    height: 150,
    borderRadius: 100,
  },
  cardContent: {
    flexDirection: 'row',
    padding: 16,
    gap: 16,
  },
  albumSection: {
    position: 'relative',
    width: 110,
  },
  albumArtContainer: {
    width: 100,
    height: 100,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  albumArt: {
    width: '100%',
    height: '100%',
  },
  albumPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nowPlayingBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  soundBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 12,
  },
  soundBar: {
    width: 3,
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  soundBar1: { height: 6 },
  soundBar2: { height: 12 },
  soundBar3: { height: 8 },
  vinylDisc: {
    position: 'absolute',
    left: 50,
    top: 10,
    width: 80,
    height: 80,
    borderRadius: 40,
    zIndex: 1,
  },
  vinylGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  vinylCenter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vinylCenterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  vinylGrooves: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  trackInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  trackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  trackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,0,0,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,0,0,0.3)',
  },
  trackBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  yearBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  yearText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '700',
  },
  trackTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
  },
  trackSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 24,
    marginTop: 12,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  watchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    shadowColor: '#e50914',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  watchBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  moreBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  bottomShine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
});

export default memo(SongList);
