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
import { IMAGE_BASE_URL } from '../../constants/api';
import { Media } from '../../types';
import PulsePlaceholder from './PulsePlaceholder';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  relatedMovies: Media[];
  isLoading: boolean;
  onSelectRelated: (id: number) => void;
}

const CARD_WIDTH = Math.round(SCREEN_WIDTH * 0.36);
const CARD_HEIGHT = Math.round(CARD_WIDTH * 1.45);

const RelatedMovies: React.FC<Props> = ({ relatedMovies, isLoading, onSelectRelated }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>More Like This</Text>

      <View style={styles.carouselContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
          {isLoading ? (
            Array.from({ length: 4 }).map((_, idx) => (
              <View key={idx} style={[styles.card, styles.placeholderCard]}>
                <PulsePlaceholder style={styles.placeholderImage} />
              </View>
            ))
          ) : (
            relatedMovies.map((m, idx) => (
              <TouchableOpacity
                key={m.id}
                activeOpacity={0.9}
                onPress={() => onSelectRelated(m.id)}
                style={[styles.card, { marginLeft: idx === 0 ? 0 : -28 }]}
              >
                <Image source={{ uri: `${IMAGE_BASE_URL}${m.poster_path}` }} style={styles.cardImage} />
                <LinearGradient colors={["transparent","rgba(0,0,0,0.85)"]} style={styles.cardOverlay} />
                <Text style={styles.cardTitle} numberOfLines={2}>{m.title || m.name}</Text>
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
  carouselContainer: {
    height: CARD_HEIGHT + 12,
  },
  carousel: {
    alignItems: 'flex-end',
    paddingRight: 18,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 14,
    marginRight: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(10,10,12,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  placeholderCard: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  cardOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 72,
    pointerEvents: 'none'
  },
  cardTitle: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
});

export default RelatedMovies;
