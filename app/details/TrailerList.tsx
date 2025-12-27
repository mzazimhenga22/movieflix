import { FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
    Dimensions,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import PulsePlaceholder from './PulsePlaceholder';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Video {
  key: string;
  name: string;
}

interface Props {
  trailers: Video[];
  isLoading: boolean;
  onWatchTrailer: (key: string) => void;
}

const FEATURED_HEIGHT = Math.round(SCREEN_WIDTH * 0.52);

const TrailerList: React.FC<Props> = ({ trailers, isLoading, onWatchTrailer }) => {
  const featured = Array.isArray(trailers) && trailers.length > 0 ? trailers[0] : null;
  const others = Array.isArray(trailers) && trailers.length > 1 ? trailers.slice(1) : [];

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Trailers</Text>

      <View style={styles.featuredWrap}>
        {isLoading ? (
          <PulsePlaceholder style={[styles.featured, { borderRadius: 14 }]} />
        ) : featured ? (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => onWatchTrailer(featured.key)}
            style={styles.featured}
          >
            <Image
              source={{ uri: `https://img.youtube.com/vi/${featured.key}/maxresdefault.jpg` }}
              style={styles.featuredImage}
            />
            <LinearGradient colors={["transparent","rgba(0,0,0,0.6)"]} style={styles.featuredGradient} />
            <View style={styles.featuredMeta} pointerEvents="none">
              <FontAwesome name="play-circle" size={48} color="rgba(255,255,255,0.95)" />
              <Text style={styles.featuredTitle} numberOfLines={2}>{featured.name}</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={[styles.featuredEmpty, styles.featured]}> 
            <Text style={styles.emptyText}>No trailers available</Text>
          </View>
        )}
      </View>

      <View style={styles.carouselWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
          {isLoading ? (
            Array.from({ length: 4 }).map((_, idx) => (
              <View key={idx} style={styles.thumbCard}>
                <PulsePlaceholder style={styles.thumbPlaceholder} />
              </View>
            ))
          ) : (
            others.map((video) => (
              <TouchableOpacity key={video.key} style={styles.thumbCard} onPress={() => onWatchTrailer(video.key)} activeOpacity={0.9}>
                <Image source={{ uri: `https://img.youtube.com/vi/${video.key}/hqdefault.jpg` }} style={styles.thumbImage} />
                <LinearGradient colors={["transparent","rgba(0,0,0,0.6)"]} style={styles.thumbGradient} />
                <FontAwesome name="play-circle" size={28} color="rgba(255,255,255,0.95)" style={styles.thumbPlay} />
                <Text style={styles.thumbTitle} numberOfLines={1}>{video.name}</Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
    paddingHorizontal: 18,
  },
  heading: {
    color: 'white',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12,
  },
  featuredWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: 'rgba(6,6,10,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  featured: {
    width: '100%',
    height: FEATURED_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  featuredGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  featuredMeta: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 18,
    alignItems: 'center',
    gap: 10,
  },
  featuredTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 8,
    textAlign: 'center',
  },
  featuredEmpty: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  carouselWrap: {
    paddingVertical: 6,
  },
  carousel: {
    paddingLeft: 2,
    paddingRight: 12,
    alignItems: 'center'
  },
  thumbCard: {
    width: 170,
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 12,
    backgroundColor: '#000'
  },
  thumbImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%'
  },
  thumbPlaceholder: {
    width: '100%',
    height: '100%',
  },
  thumbGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%'
  },
  thumbPlay: {
    position: 'absolute',
    left: 10,
    top: '30%'
  },
  thumbTitle: {
    position: 'absolute',
    bottom: 8,
    left: 12,
    right: 12,
    color: '#fff',
    fontSize: 12,
    fontWeight: '700'
  }
});

export default TrailerList;
