import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  movieTitle: string;
  onPlay: () => void;
  onTrailer: () => void;
  onDownload: () => void;
  onShare: () => void;
  onList: () => void;
  isInList?: boolean;
  accentColor?: string;
}

export default function QuickActions({
  movieTitle,
  onPlay,
  onTrailer,
  onDownload,
  onShare,
  onList,
  isInList = false,
  accentColor = '#e50914',
}: Props) {
  const slideAnim = useRef(new Animated.Value(100)).current;
  const playPulse = useRef(new Animated.Value(1)).current;
  const [downloading, setDownloading] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Slide in
    Animated.spring(slideAnim, {
      toValue: 0,
      friction: 8,
      useNativeDriver: true,
    }).start();

    // Play button pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(playPulse, { toValue: 1.05, duration: 1000, useNativeDriver: true }),
        Animated.timing(playPulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const handleDownload = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (downloading) return;
    
    setDownloading(true);
    progressAnim.setValue(0);
    
    // Simulate download progress
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 3000,
      useNativeDriver: false,
    }).start(() => {
      setDownloading(false);
      onDownload();
    });
  };

  const ActionButton = ({ icon, label, onPress, small = false, active = false, gradient }: any) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const handlePress = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 0.9, duration: 50, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 3, useNativeDriver: true }),
      ]).start();
      onPress?.();
    };

    return (
      <TouchableOpacity activeOpacity={0.8} onPress={handlePress}>
        <Animated.View style={[small ? styles.smallAction : styles.action, { transform: [{ scale: scaleAnim }] }]}>
          {gradient ? (
            <LinearGradient colors={gradient} style={styles.actionGradient}>
              <Ionicons name={icon} size={small ? 22 : 24} color="#fff" />
              {!small && <Text style={styles.actionLabel}>{label}</Text>}
            </LinearGradient>
          ) : (
            <View style={[styles.actionInner, active && styles.actionActive]}>
              <Ionicons name={icon} size={small ? 22 : 24} color={active ? accentColor : '#fff'} />
              {!small && <Text style={[styles.actionLabel, active && { color: accentColor }]}>{label}</Text>}
            </View>
          )}
        </Animated.View>
      </TouchableOpacity>
    );
  };

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
      {/* Main play button */}
      <TouchableOpacity activeOpacity={0.9} onPress={onPlay}>
        <Animated.View style={[styles.playButton, { transform: [{ scale: playPulse }] }]}>
          <LinearGradient
            colors={[accentColor, '#ff6b35']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.playGradient}
          >
            <Ionicons name="play" size={32} color="#fff" />
            <View style={styles.playContent}>
              <Text style={styles.playLabel}>Play Now</Text>
              <Text style={styles.playSubtitle}>{movieTitle}</Text>
            </View>
          </LinearGradient>
          
          {/* Glow rings */}
          <View style={[styles.glowRing, styles.glowRing1, { borderColor: accentColor }]} />
          <View style={[styles.glowRing, styles.glowRing2, { borderColor: accentColor }]} />
        </Animated.View>
      </TouchableOpacity>

      {/* Secondary actions */}
      <View style={styles.secondaryRow}>
        <ActionButton icon="videocam-outline" label="Trailer" onPress={onTrailer} />
        
        {/* Download with progress */}
        <TouchableOpacity activeOpacity={0.8} onPress={handleDownload}>
          <View style={styles.action}>
            <View style={styles.actionInner}>
              <Ionicons name={downloading ? 'cloud-download' : 'cloud-download-outline'} size={24} color="#fff" />
              <Text style={styles.actionLabel}>{downloading ? 'Downloading' : 'Download'}</Text>
              {downloading && (
                <Animated.View
                  style={[
                    styles.downloadProgress,
                    {
                      width: progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
                    },
                  ]}
                />
              )}
            </View>
          </View>
        </TouchableOpacity>
        
        <ActionButton icon={isInList ? 'bookmark' : 'bookmark-outline'} label="My List" onPress={onList} active={isInList} />
        <ActionButton icon="share-outline" label="Share" onPress={onShare} />
      </View>

      {/* Quick access strip */}
      <View style={styles.quickStrip}>
        <ActionButton icon="chatbubble-ellipses-outline" small onPress={() => {}} />
        <ActionButton icon="heart-outline" small onPress={() => {}} />
        <ActionButton icon="star-outline" small onPress={() => {}} />
        <ActionButton icon="flag-outline" small onPress={() => {}} />
        <ActionButton icon="ellipsis-horizontal" small onPress={() => {}} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 16,
  },
  playButton: {
    borderRadius: 24,
    overflow: 'visible',
    marginBottom: 16,
  },
  playGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 24,
    gap: 16,
  },
  playContent: {
    flex: 1,
  },
  playLabel: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  playSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  glowRing: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 28,
    opacity: 0.3,
  },
  glowRing1: {
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
  },
  glowRing2: {
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
    opacity: 0.15,
  },
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  action: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 16,
    overflow: 'hidden',
  },
  smallAction: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  actionGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 6,
  },
  actionInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    position: 'relative',
    overflow: 'hidden',
  },
  actionActive: {
    backgroundColor: 'rgba(229,9,20,0.15)',
    borderColor: 'rgba(229,9,20,0.3)',
  },
  actionLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  downloadProgress: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 3,
    backgroundColor: '#4cd964',
    borderRadius: 2,
  },
  quickStrip: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
});
