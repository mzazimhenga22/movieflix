import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface Props {
  currentRating: number;
  voteCount: number;
  userRating?: number;
  onRate?: (rating: number) => void;
  accentColor?: string;
}

export default function InteractiveRating({ currentRating, voteCount, userRating, onRate, accentColor = '#e50914' }: Props) {
  const [selectedRating, setSelectedRating] = useState(userRating || 0);
  const [isExpanded, setIsExpanded] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;
  const starAnims = useRef(Array.from({ length: 5 }, () => new Animated.Value(1))).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animate progress bar on mount
    Animated.timing(progressAnim, {
      toValue: currentRating / 10,
      duration: 1500,
      useNativeDriver: false,
    }).start();

    // Glow animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, [currentRating]);

  const toggleExpand = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsExpanded(!isExpanded);
    Animated.spring(expandAnim, {
      toValue: isExpanded ? 0 : 1,
      friction: 8,
      useNativeDriver: false,
    }).start();
  };

  const handleStarPress = (star: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedRating(star);
    
    // Bounce animation
    Animated.sequence([
      Animated.timing(starAnims[star - 1], { toValue: 1.4, duration: 100, useNativeDriver: true }),
      Animated.spring(starAnims[star - 1], { toValue: 1, friction: 3, useNativeDriver: true }),
    ]).start();

    onRate?.(star * 2); // Convert 5-star to 10-point scale
  };

  const formatVotes = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const expandedHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 120],
  });

  return (
    <View style={styles.container}>
      {/* Main rating display */}
      <TouchableOpacity onPress={toggleExpand} activeOpacity={0.9}>
        <View style={styles.mainCard}>
          <LinearGradient
            colors={['rgba(255,215,0,0.15)', 'rgba(255,215,0,0.05)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardGradient}
          />
          
          <Animated.View style={[styles.glow, { opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.6] }) }]}>
            <LinearGradient colors={['#ffd700', 'transparent']} style={styles.glowGradient} />
          </Animated.View>

          <View style={styles.scoreSection}>
            <View style={styles.scoreCircle}>
              <Text style={styles.scoreText}>{currentRating.toFixed(1)}</Text>
              <Text style={styles.scoreMax}>/10</Text>
            </View>
            <View style={styles.scoreDetails}>
              <View style={styles.starsPreview}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Ionicons
                    key={star}
                    name={star <= Math.round(currentRating / 2) ? 'star' : 'star-outline'}
                    size={14}
                    color="#ffd700"
                  />
                ))}
              </View>
              <Text style={styles.voteCount}>{formatVotes(voteCount)} votes</Text>
            </View>
          </View>

          <View style={styles.progressSection}>
            <View style={styles.progressBar}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              >
                <LinearGradient
                  colors={['#ffd700', '#ff9500', '#ff6b35']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.progressGradient}
                />
              </Animated.View>
            </View>
            <Text style={styles.progressLabel}>Audience Score</Text>
          </View>

          <View style={styles.expandIndicator}>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color="rgba(255,255,255,0.5)"
            />
          </View>
        </View>
      </TouchableOpacity>

      {/* Expandable rating section */}
      <Animated.View style={[styles.expandedSection, { height: expandedHeight, opacity: expandAnim }]}>
        <View style={styles.rateSection}>
          <Text style={styles.rateTitle}>Rate this movie</Text>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity key={star} onPress={() => handleStarPress(star)} activeOpacity={0.8}>
                <Animated.View style={{ transform: [{ scale: starAnims[star - 1] }] }}>
                  <Ionicons
                    name={star <= selectedRating ? 'star' : 'star-outline'}
                    size={36}
                    color={star <= selectedRating ? '#ffd700' : 'rgba(255,255,255,0.3)'}
                  />
                </Animated.View>
              </TouchableOpacity>
            ))}
          </View>
          {selectedRating > 0 && (
            <Text style={styles.ratingFeedback}>
              {selectedRating === 5 ? 'Masterpiece!' : selectedRating === 4 ? 'Great!' : selectedRating === 3 ? 'Good' : selectedRating === 2 ? 'Okay' : 'Not for me'}
            </Text>
          )}
        </View>
      </Animated.View>

      {/* Sentiment breakdown */}
      <View style={styles.sentimentRow}>
        <View style={styles.sentimentItem}>
          <View style={[styles.sentimentIcon, { backgroundColor: 'rgba(76,217,100,0.2)' }]}>
            <Ionicons name="happy-outline" size={18} color="#4cd964" />
          </View>
          <Text style={styles.sentimentPercent}>78%</Text>
          <Text style={styles.sentimentLabel}>Loved it</Text>
        </View>
        <View style={styles.sentimentItem}>
          <View style={[styles.sentimentIcon, { backgroundColor: 'rgba(255,204,0,0.2)' }]}>
            <Ionicons name="happy-outline" size={18} color="#ffcc00" />
          </View>
          <Text style={styles.sentimentPercent}>15%</Text>
          <Text style={styles.sentimentLabel}>Liked it</Text>
        </View>
        <View style={styles.sentimentItem}>
          <View style={[styles.sentimentIcon, { backgroundColor: 'rgba(255,59,48,0.2)' }]}>
            <Ionicons name="sad-outline" size={18} color="#ff3b30" />
          </View>
          <Text style={styles.sentimentPercent}>7%</Text>
          <Text style={styles.sentimentLabel}>Disliked</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 12,
  },
  mainCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.2)',
    overflow: 'hidden',
  },
  cardGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
  },
  glow: {
    position: 'absolute',
    top: -50,
    left: -50,
    width: 150,
    height: 150,
  },
  glowGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 75,
  },
  scoreSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  scoreCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,215,0,0.15)',
    borderWidth: 3,
    borderColor: '#ffd700',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    color: '#ffd700',
    fontSize: 24,
    fontWeight: '900',
  },
  scoreMax: {
    color: 'rgba(255,215,0,0.6)',
    fontSize: 10,
    fontWeight: '700',
    marginTop: -4,
  },
  scoreDetails: {
    flex: 1,
  },
  starsPreview: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: 4,
  },
  voteCount: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600',
  },
  progressSection: {
    marginTop: 14,
  },
  progressBar: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressGradient: {
    flex: 1,
  },
  progressLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
  },
  expandIndicator: {
    alignItems: 'center',
    marginTop: 8,
  },
  expandedSection: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    marginTop: -10,
    paddingTop: 10,
    overflow: 'hidden',
  },
  rateSection: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  rateTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  starRow: {
    flexDirection: 'row',
    gap: 8,
  },
  ratingFeedback: {
    color: '#ffd700',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 10,
  },
  sentimentRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  sentimentItem: {
    alignItems: 'center',
  },
  sentimentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  sentimentPercent: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  sentimentLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
  },
});
