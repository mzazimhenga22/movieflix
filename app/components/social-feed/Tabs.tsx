import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Tab = 'Feed' | 'Recommended' | 'Live' | 'Movie Match';

interface Props {
  active: Tab;
  onChangeTab: (tab: Tab) => void;
}

const tabConfig: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'Feed', label: 'Feed', icon: 'home' },
  { key: 'Recommended', label: 'For You', icon: 'sparkles' },
  { key: 'Live', label: 'Live', icon: 'radio' },
  { key: 'Movie Match', label: 'Match', icon: 'heart' },
];

export default function FeedTabs({ active, onChangeTab }: Props) {
  const indicatorAnim = useRef(new Animated.Value(0)).current;
  const scaleAnims = useRef(tabConfig.map(() => new Animated.Value(1))).current;

  useEffect(() => {
    const activeIndex = tabConfig.findIndex((t) => t.key === active);
    Animated.spring(indicatorAnim, {
      toValue: activeIndex,
      tension: 80,
      friction: 12,
      useNativeDriver: true,
    }).start();

    // Scale animation for active tab
    scaleAnims.forEach((anim, i) => {
      Animated.spring(anim, {
        toValue: i === activeIndex ? 1.05 : 1,
        tension: 100,
        friction: 10,
        useNativeDriver: true,
      }).start();
    });
  }, [active]);

  const tabWidth = 80;
  const containerPadding = 6;

  return (
    <View style={styles.wrapper}>
      {/* Liquid glass container */}
      <View style={styles.glassContainer}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={25} tint="dark" style={styles.blurFill} />
        ) : (
          <View style={styles.androidGlass} />
        )}

        {/* Animated indicator */}
        <Animated.View
          style={[
            styles.indicator,
            {
              width: tabWidth,
              transform: [
                {
                  translateX: indicatorAnim.interpolate({
                    inputRange: tabConfig.map((_, i) => i),
                    outputRange: tabConfig.map((_, i) => containerPadding + i * tabWidth),
                  }),
                },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={['rgba(229,9,20,0.9)', 'rgba(255,107,53,0.8)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.indicatorGradient}
          />
          {/* Shine effect */}
          <View style={styles.indicatorShine} />
        </Animated.View>

        {/* Tab buttons */}
        <View style={styles.tabsRow}>
          {tabConfig.map((tab, index) => {
            const isActive = tab.key === active;

            return (
              <Pressable
                key={tab.key}
                onPress={() => onChangeTab(tab.key)}
                style={[styles.tabBtn, { width: tabWidth }]}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`${tab.label} tab`}
              >
                <Animated.View
                  style={[
                    styles.tabContent,
                    { transform: [{ scale: scaleAnims[index] }] },
                  ]}
                >
                  <Ionicons
                    name={tab.icon}
                    size={18}
                    color={isActive ? '#fff' : 'rgba(255,255,255,0.5)'}
                  />
                  <Text
                    style={[styles.tabText, isActive && styles.tabTextActive]}
                    numberOfLines={1}
                  >
                    {tab.label}
                  </Text>
                </Animated.View>
              </Pressable>
            );
          })}
        </View>

        {/* Glass border highlights */}
        <View style={styles.borderTop} />
        <View style={styles.borderBottom} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  glassContainer: {
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  blurFill: {
    ...StyleSheet.absoluteFillObject,
  },
  androidGlass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,20,30,0.85)',
  },
  borderTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  borderBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  indicator: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    borderRadius: 14,
    overflow: 'hidden',
    zIndex: 0,
  },
  indicatorGradient: {
    flex: 1,
  },
  indicatorShine: {
    position: 'absolute',
    top: 2,
    left: 8,
    width: 24,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  tabsRow: {
    flexDirection: 'row',
    padding: 6,
    zIndex: 1,
  },
  tabBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContent: {
    alignItems: 'center',
    gap: 2,
  },
  tabText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
});
