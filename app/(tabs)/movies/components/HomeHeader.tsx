import LiquidGlass from '@/components/app-components/LiquidGlass';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { memo } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

interface HomeHeaderProps {
  activeProfileName: string | null;
  accountName: string;
  featuredAccent: string | null;
  unreadMessageCount: number;
  metaRowAnim: any;
  trendingPillScale: any;
  reelsPillScale: any;
  dropsPillScale: any;
  showPulseCards: boolean;
  snowing: boolean;
  scrollY: any;
  onProfilePress: () => void;
  onMessagingPress: () => void;
  onMarketplacePress: () => void;
  onSocialFeedPress: () => void;
  onTrendingPress: () => void;
  onReelsPress: () => void;
  onDropsPress: () => void;
  onPulseToggle: () => void;
  onSnowToggle: () => void;
}

export const HomeHeader = memo((props: HomeHeaderProps) => {
  const {
    activeProfileName,
    accountName,
    featuredAccent,
    unreadMessageCount,
    scrollY,
    onProfilePress,
    onMarketplacePress,
    onSocialFeedPress,
  } = props;

  const handlePress = (callback: () => void, impact = Haptics.ImpactFeedbackStyle.Light) => {
    void Haptics.impactAsync(impact);
    callback();
  };



  const islandTranslateY = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, -5],
    extrapolate: 'clamp',
  });

  const textOpacity = scrollY.interpolate({
    inputRange: [0, 40],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });



  return (
    <View style={styles.container}>
      <Animated.View style={[
        styles.islandWrap,
        {
          width: '100%',
          transform: [
            { translateY: islandTranslateY },
          ]
        }
      ]}>
        <LiquidGlass
          tintOpacity={0.18}
          tintColor="#000000"
          cornerRadius={32}
          borderOpacity={0.25}
          glowIntensity={0.2}
          glowColor={featuredAccent || '#e50914'}
          chromaticAberration={true}
          style={StyleSheet.absoluteFill}
        />
        
        <Animated.View style={styles.islandContent}>
          {/* Left: Profile & Welcome */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => handlePress(onProfilePress)}
            style={styles.profileSection}
          >
            <View style={[styles.avatarDot, { backgroundColor: featuredAccent || '#e50914', shadowColor: featuredAccent || '#e50914' }]} />
            <Animated.View style={{ opacity: textOpacity, marginLeft: 8, overflow: 'hidden' }}>
              <Text style={styles.eyebrow}>MOVIEFLIX</Text>
              <Text style={styles.welcomeText} numberOfLines={1}>
                {activeProfileName ?? accountName}
              </Text>
            </Animated.View>
          </TouchableOpacity>

          <View style={styles.actionSection}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => handlePress(onMarketplacePress)}>
              <Ionicons name="bag-outline" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.iconBtn, styles.lastIconBtn]} onPress={() => handlePress(onSocialFeedPress)}>
              <Ionicons name="earth-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    alignItems: 'center',
    width: '100%',
  },
  islandWrap: {
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  islandContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    flexShrink: 1,
  },
  avatarDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 9,
    marginBottom: 1,
    letterSpacing: 1.2,
    fontWeight: '800',
  },
  welcomeText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  actionSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 22,
    paddingHorizontal: 4,
    height: 44,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lastIconBtn: {
    marginRight: 2,
  },
});