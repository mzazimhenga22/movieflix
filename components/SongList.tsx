import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, ImageBackground, TouchableOpacity, Dimensions } from 'react-native';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { IMAGE_BASE_URL } from '@/constants/api';
import { Media } from '@/types';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';

const { width } = Dimensions.get('window');

interface SongListProps {
  title: string;
  songs: Media[];
  onOpenAll?: () => void;
}

const SongList: React.FC<SongListProps> = ({ title, songs, onOpenAll }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const topSongs = songs.slice(0, 5); // Display a maximum of 5 cards
  const router = useRouter();

  const handleScroll = (event: any) => {
    const scrollPosition = event.nativeEvent.contentOffset.x;
    // Match the visible width (screen width minus horizontal padding in the parent)
    const cardWidth = width - 32;
    const index = Math.round(scrollPosition / cardWidth);
    setActiveIndex(index);
  };

  const handleWatchPress = (song: Media) => {
    const query = `${song.title || song.name} official music video`;
    const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    WebBrowser.openBrowserAsync(youtubeUrl);
  };

  const handleCardPress = (movieId: number) => {
    router.push(`/details/${movieId}`);
  };

  if (!topSongs || topSongs.length === 0) {
    return null;
  }

  const handleOpenAll = () => {
    if (onOpenAll) onOpenAll();
  };

  return (
    <View style={styles.sectionContainer}>
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.headerRow}
        onPress={handleOpenAll}
        disabled={!onOpenAll}
      >
        <Text style={styles.sectionTitle}>{title}</Text>
        {onOpenAll && (
          <View style={styles.headerCta}>
            <Ionicons name="musical-notes" size={16} color="#fff" />
            <Text style={styles.headerCtaText}>Open player</Text>
          </View>
        )}
      </TouchableOpacity>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        snapToInterval={width - 32}
        decelerationRate="fast"
        snapToAlignment="start"
        contentContainerStyle={styles.sliderContainer}
      >
        {topSongs.map((song) => (
          <TouchableOpacity key={song.id} style={[styles.card, styles.glassCard]} onPress={() => handleCardPress(song.id)}>
            <View style={styles.cardTopRow}>
              <View style={styles.thumbWrap}>
                <ImageBackground
                  source={{ uri: `${IMAGE_BASE_URL}${song.poster_path}` }}
                  style={styles.thumb}
                  resizeMode="cover"
                >
                  <LinearGradient
                    colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.55)']}
                    style={StyleSheet.absoluteFill}
                  />
                </ImageBackground>
                <View style={styles.playPill}>
                  <FontAwesome name="youtube-play" size={14} color="#fff" />
                  <Text style={styles.pillText}>Official</Text>
                </View>
              </View>

              <View style={styles.meta}>
                <Text style={styles.songTitle} numberOfLines={1}>{song.title || song.name}</Text>
                <Text style={styles.movieSubTitle}>Soundtrack highlight</Text>
                <View style={styles.badgesRow}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>HD</Text>
                  </View>
                  <View style={[styles.badge, styles.badgeSecondary]}>
                    <Text style={styles.badgeText}>Dolby</Text>
                  </View>
                </View>
              </View>
            </View>

            <LinearGradient
              colors={['rgba(229,9,20,0.18)', 'rgba(10,12,24,0.22)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.bottomStrip}
            >
              <TouchableOpacity style={styles.watchButton} onPress={() => handleWatchPress(song)}>
                <FontAwesome name="youtube-play" size={18} color="white" />
                <Text style={styles.watchButtonText}>Watch Now</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addButton} onPress={() => handleCardPress(song.id)}>
                <FontAwesome name="plus" size={16} color="#fff" />
              </TouchableOpacity>
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={styles.pagination}>
        {topSongs.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              { backgroundColor: index === activeIndex ? '#FF4500' : '#888' },
            ]}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  sectionContainer: {
    marginTop: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerCtaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  sliderContainer: {
    paddingHorizontal: 0,
  },
  card: {
    // Slightly narrower than the viewport footprint to create spacing between cards
    width: width - 48,
    height: 190,
    marginHorizontal: 8,
  },
  glassCard: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
  },
  cardTopRow: {
    flexDirection: 'row',
    padding: 14,
    gap: 12,
    alignItems: 'center',
  },
  thumbWrap: {
    width: 72,
    height: 72,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  playPill: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  pillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  meta: {
    flex: 1,
    gap: 6,
  },
  songTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.15,
  },
  movieSubTitle: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 13,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  badgeSecondary: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  bottomStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  watchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e50914',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: 'rgba(229,9,20,0.35)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  watchButtonText: {
    color: 'white',
    marginLeft: 8,
    fontWeight: 'bold',
    fontSize: 14,
  },
  addButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 15,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
});

export default SongList;
