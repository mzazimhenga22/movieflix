import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MEDIA_HEIGHT = Math.round(SCREEN_HEIGHT * 0.75);

const FeedCardPlaceholder = () => {
  return (
    <View style={styles.card}>
      <View style={styles.cardSheen} />

      {/* Image/Video Placeholder */}
      <View style={styles.imageWrap}>
        <View style={styles.imagePlaceholder} />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.6)']}
          style={styles.imageGradient}
        />
        <View style={styles.imageOverlay}>
          <View style={styles.avatarOverlay} />
          <View style={{ flex: 1, paddingLeft: 12 }}>
            <View style={styles.userOverlay} />
            <View style={styles.reviewOverlay} />
          </View>
          <View style={styles.heartCount} />
        </View>
      </View>

      {/* Content Placeholder */}
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.avatar} />
          <View>
            <View style={styles.user} />
            <View style={styles.date} />
            <View style={styles.genreBadgesRow}>
              <View style={styles.genreBadge} />
              <View style={styles.genreBadge} />
            </View>
          </View>
        </View>

        <View style={styles.review} />
        <View style={styles.movie} />

        <View style={styles.infoRow}>
          <View style={styles.infoPill} />
          <View style={styles.infoPillGhost} />
        </View>

        <View style={styles.actionsBar}>
          <View style={styles.actionPill} />
          <View style={styles.actionPill} />
          <View style={styles.actionPill} />
          <View style={styles.actionPill} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 18,
    marginVertical: 12,
    marginHorizontal: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    // Add shadow styles if necessary, similar to FeedCard
  },
  cardSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.16)',
    opacity: 0.3,
  },
  imageWrap: {
    height: MEDIA_HEIGHT * 0.75,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)', // Base for placeholder image
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  imageGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  imageOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarOverlay: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginRight: 10,
  },
  userOverlay: {
    width: 120,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 4,
  },
  reviewOverlay: {
    width: '80%',
    height: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 4,
    marginTop: 4,
  },
  heartCount: {
    width: 60,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  content: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginRight: 10,
  },
  user: {
    width: 100,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 4,
  },
  date: {
    width: 80,
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 4,
    marginTop: 4,
  },
  genreBadgesRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  genreBadge: {
    width: 60,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    marginRight: 8,
  },
  review: {
    width: '100%',
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 4,
    marginTop: 6,
  },
  movie: {
    width: '70%',
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 4,
    marginTop: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  infoPill: {
    width: 80,
    height: 24,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginRight: 8,
  },
  infoPillGhost: {
    width: 100,
    height: 24,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  actionsBar: {
    flexDirection: 'row',
    marginTop: 10,
    flexWrap: 'wrap',
  },
  actionPill: {
    width: 80,
    height: 32,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginRight: 8,
    marginBottom: 8,
  },
});

export default FeedCardPlaceholder;