import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
    Dimensions,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import LiquidGlass from '../../components/app-components/LiquidGlass';
import { IMAGE_BASE_URL } from '../../constants/api';
import { Media } from '../../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  relatedMovies: Media[];
  isLoading: boolean;
  onSelectRelated: (id: number) => void;
}

const COLUMN_COUNT = 3;
const SPACING = 12;
const CONTAINER_PADDING = 18;
const CARD_WIDTH = (SCREEN_WIDTH - (CONTAINER_PADDING * 2) - (SPACING * (COLUMN_COUNT - 1))) / COLUMN_COUNT;
const CARD_HEIGHT = CARD_WIDTH * 1.5;

const RelatedMovies: React.FC<Props> = ({ relatedMovies, isLoading, onSelectRelated }) => {
  if (!isLoading && relatedMovies.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIndicator} />
        <Text style={styles.heading}>More Like This</Text>
      </View>

      <View style={styles.grid}>
        {isLoading ? (
          Array.from({ length: 6 }).map((_, idx) => (
            <View key={idx} style={styles.cardWrapper}>
              <LiquidGlass 
                cornerRadius={16} 
                tintOpacity={0.1} 
                borderOpacity={0.2} 
                style={styles.card}
              >
                <View style={styles.placeholderPulse} />
              </LiquidGlass>
            </View>
          ))
        ) : (
          relatedMovies.map((m) => {
            const rating = m.vote_average ? m.vote_average.toFixed(1) : 'N/A';
            const year = m.release_date ? m.release_date.split('-')[0] : (m.first_air_date ? m.first_air_date.split('-')[0] : '');
            
            return (
              <TouchableOpacity
                key={m.id}
                activeOpacity={0.8}
                onPress={() => onSelectRelated(m.id)}
                style={styles.cardWrapper}
              >
                <LiquidGlass 
                  cornerRadius={16} 
                  tintOpacity={0.05} 
                  borderOpacity={0.25} 
                  glowIntensity={0.1}
                  style={styles.card}
                >
                  <Image 
                    source={{ uri: `${IMAGE_BASE_URL}${m.poster_path}` }} 
                    style={styles.cardImage} 
                    resizeMode="cover"
                  />
                  
                  <LinearGradient 
                    colors={["transparent", "rgba(0,0,0,0.4)", "rgba(0,0,0,0.9)"]} 
                    style={styles.cardOverlay} 
                  />

                  <View style={styles.cardContent}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{m.title || m.name}</Text>
                    <View style={styles.cardMeta}>
                       {year ? <Text style={styles.cardYear}>{year}</Text> : null}
                       <View style={styles.ratingBadge}>
                          <Ionicons name="star" size={8} color="#FFD700" />
                          <Text style={styles.ratingText}>{rating}</Text>
                       </View>
                    </View>
                  </View>
                </LiquidGlass>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: CONTAINER_PADDING,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  headerIndicator: {
    width: 4,
    height: 20,
    backgroundColor: '#E50914',
    borderRadius: 2,
    marginRight: 10,
  },
  heading: {
    color: 'white',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING,
  },
  cardWrapper: {
    width: CARD_WIDTH,
    marginBottom: SPACING,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  placeholderPulse: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  cardOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
  },
  cardContent: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 14,
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardYear: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 9,
    fontWeight: '600',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 2,
  },
  ratingText: {
    color: '#FFD700',
    fontSize: 9,
    fontWeight: '900',
  },
});

export default RelatedMovies;
