import LiquidGlass from '@/components/app-components/LiquidGlass';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { memo, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated
} from 'react-native';

interface HomeDockProps {
  featuredAccent: string | null;
  snowing: boolean;
  onTrendingPress: () => void;
  onReelsPress: () => void;
  onDropsPress: () => void;
  onSnowToggle: () => void;
  scrollY: Animated.Value;
}

export const HomeDock = memo((props: HomeDockProps) => {
  const {
    featuredAccent,
    snowing,
    onTrendingPress,
    onReelsPress,
    onDropsPress,
    onSnowToggle,
    scrollY
  } = props;

  const handlePress = (callback: () => void) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    callback();
  };

  const dockOpacity = scrollY.interpolate({
    inputRange: [0, 60],
    outputRange: [1, 0.8],
    extrapolate: 'clamp',
  });

  const dockScale = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [1, 0.95],
    extrapolate: 'clamp',
  });

  const dockItems = useMemo(() => ([
    {
      key: 'trending',
      label: 'Trending',
      icon: <MaterialCommunityIcons name="fire" size={20} color="#FF9800" />,
      bg: 'rgba(255, 152, 0, 0.15)',
      onPress: onTrendingPress,
    },
    {
      key: 'reels',
      label: 'Reels',
      icon: <MaterialCommunityIcons name="movie-play" size={20} color="#2196F3" />,
      bg: 'rgba(33, 150, 243, 0.15)',
      onPress: onReelsPress,
    },
    {
      key: 'drops',
      label: 'Drops',
      icon: <MaterialCommunityIcons name="water-percent" size={20} color="#4CAF50" />,
      bg: 'rgba(76, 175, 80, 0.15)',
      onPress: onDropsPress,
    },
    {
      key: 'snow',
      label: snowing ? 'Snowing' : 'Snow',
      icon: <Ionicons name={snowing ? 'snow' : 'snow-outline'} size={18} color="#fff" />,
      bg: snowing ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)',
      onPress: onSnowToggle,
    },
  ]), [onDropsPress, onReelsPress, onSnowToggle, onTrendingPress, snowing]);

  return (
    <Animated.View style={[
      styles.container,
      {
        opacity: dockOpacity,
        transform: [{ scale: dockScale }]
      }
    ]}>
      <View style={styles.dockWrap}>
        <LiquidGlass
          tintOpacity={0.12}
          tintColor="#000000"
          cornerRadius={24}
          borderOpacity={0.15}
          glowIntensity={0.1}
          glowColor={featuredAccent || '#e50914'}
          style={StyleSheet.absoluteFill}
        />
        
        <View style={styles.dockContent}>
          {dockItems.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={styles.dockItem}
              onPress={() => handlePress(item.onPress)}
            >
              <View style={[styles.iconCircle, { backgroundColor: item.bg }]}> 
                {item.icon}
              </View>
              <Text style={styles.dockLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 12,
    zIndex: 30,
  },
  dockWrap: {
    height: 70,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  dockContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
  },
  dockItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  dockLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});