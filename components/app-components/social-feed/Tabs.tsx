import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import LiquidGlass from '../LiquidGlass';

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
  const activeIndex = tabConfig.findIndex((t) => t.key === active);

  useEffect(() => {
    Animated.spring(indicatorAnim, {
      toValue: activeIndex,
      tension: 100,
      friction: 12,
      useNativeDriver: true,
    }).start();
  }, [activeIndex]);

  const tabWidth = 85;
  const containerPadding = 4;

  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        <LiquidGlass 
            cornerRadius={22} 
            tintOpacity={0.12} 
            tintColor="#000" 
            style={StyleSheet.absoluteFill} 
        />
        
        <Animated.View
          style={[
            styles.indicatorWrap,
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
          <LiquidGlass 
            cornerRadius={18} 
            tintOpacity={0.2} 
            tintColor="#fff" 
            glowColor="#e50914" 
            glowIntensity={0.2}
            style={StyleSheet.absoluteFill} 
          />
        </Animated.View>

        <View style={styles.tabsRow}>
          {tabConfig.map((tab) => {
            const isActive = tab.key === active;
            return (
              <Pressable
                key={tab.key}
                onPress={() => onChangeTab(tab.key)}
                style={[styles.tabBtn, { width: tabWidth }]}
              >
                <Ionicons
                  name={tab.icon}
                  size={18}
                  color={isActive ? '#fff' : 'rgba(255,255,255,0.4)'}
                />
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { paddingHorizontal: 12, paddingVertical: 10 },
  container: { height: 54, borderRadius: 22, overflow: 'hidden', flexDirection: 'row', padding: 4 },
  indicatorWrap: { position: 'absolute', top: 4, bottom: 4, borderRadius: 18, overflow: 'hidden' },
  tabsRow: { flexDirection: 'row', flex: 1, zIndex: 1 },
  tabBtn: { height: '100%', alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabText: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  tabTextActive: { color: '#fff' },
});
