import React, { useRef, useEffect } from 'react';
import { Animated, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface Props {
  onWatchParty?: () => void;
  onDownload?: () => void;
  onAddToList?: () => void;
  onShare?: () => void;
  accentColor?: string;
}

export default function WatchModes({ onWatchParty, onDownload, onAddToList, onShare, accentColor = '#e50914' }: Props) {
  const scaleAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  const floatAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    // Staggered entrance
    scaleAnims.forEach((anim, i) => {
      Animated.spring(anim, {
        toValue: 1,
        friction: 6,
        delay: i * 100,
        useNativeDriver: true,
      }).start();
    });

    // Floating animation
    floatAnims.forEach((anim, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: -5, duration: 2000 + i * 200, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 5, duration: 2000 + i * 200, useNativeDriver: true }),
        ])
      ).start();
    });
  }, []);

  const modes = [
    {
      icon: 'people',
      label: 'Watch Party',
      subtitle: 'Stream together',
      gradient: ['#9b59b6', '#8e44ad'],
      onPress: onWatchParty,
    },
    {
      icon: 'cloud-download',
      label: 'Download',
      subtitle: 'Watch offline',
      gradient: ['#3498db', '#2980b9'],
      onPress: onDownload,
    },
    {
      icon: 'bookmark',
      label: 'My List',
      subtitle: 'Save for later',
      gradient: ['#e74c3c', '#c0392b'],
      onPress: onAddToList,
    },
    {
      icon: 'share-social',
      label: 'Share',
      subtitle: 'Tell friends',
      gradient: ['#2ecc71', '#27ae60'],
      onPress: onShare,
    },
  ];

  const handlePress = (mode: typeof modes[0], index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Bounce animation
    Animated.sequence([
      Animated.timing(scaleAnims[index], { toValue: 0.9, duration: 100, useNativeDriver: true }),
      Animated.spring(scaleAnims[index], { toValue: 1, friction: 3, useNativeDriver: true }),
    ]).start();

    mode.onPress?.();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="options-outline" size={20} color={accentColor} />
        <Text style={styles.headerTitle}>Watch Modes</Text>
      </View>

      <View style={styles.modesGrid}>
        {modes.map((mode, index) => (
          <TouchableOpacity
            key={mode.label}
            activeOpacity={0.9}
            onPress={() => handlePress(mode, index)}
          >
            <Animated.View
              style={[
                styles.modeCard,
                {
                  transform: [
                    { scale: scaleAnims[index] },
                    { translateY: floatAnims[index] },
                  ],
                  opacity: scaleAnims[index],
                },
              ]}
            >
              <LinearGradient
                colors={mode.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cardGradient}
              />
              
              <View style={styles.iconContainer}>
                <Ionicons name={mode.icon as any} size={28} color="#fff" />
              </View>
              
              <Text style={styles.modeLabel}>{mode.label}</Text>
              <Text style={styles.modeSubtitle}>{mode.subtitle}</Text>

              {/* Glow effect */}
              <View style={[styles.glowOrb, { backgroundColor: mode.gradient[0] }]} />
            </Animated.View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Features row */}
      <View style={styles.featuresRow}>
        <View style={styles.featureItem}>
          <Ionicons name="checkmark-circle" size={16} color="#4cd964" />
          <Text style={styles.featureText}>4K Ultra HD</Text>
        </View>
        <View style={styles.featureItem}>
          <Ionicons name="checkmark-circle" size={16} color="#4cd964" />
          <Text style={styles.featureText}>Dolby Atmos</Text>
        </View>
        <View style={styles.featureItem}>
          <Ionicons name="checkmark-circle" size={16} color="#4cd964" />
          <Text style={styles.featureText}>HDR10+</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  modesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  modeCard: {
    width: (Dimensions.get('window').width - 56) / 2,
    height: 120,
    borderRadius: 20,
    padding: 16,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  cardGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  modeLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  modeSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  glowOrb: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 80,
    height: 80,
    borderRadius: 40,
    opacity: 0.3,
  },
  featuresRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  featureText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
});
