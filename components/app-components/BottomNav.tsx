// components/app-components/BottomNav.tsx
import { useNavigationGuard } from '@/hooks/use-navigation-guard';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  PixelRatio,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import LiquidGlass from './LiquidGlass';
import { useAccent } from './AccentContext';

type Props = BottomTabBarProps & {
  insetsBottom: number;
  isDark: boolean;
};

const ICON_MAP: Record<string, { active: string; inactive: string }> = {
  movies: { active: 'home', inactive: 'home-outline' },
  categories: { active: 'grid', inactive: 'grid-outline' },
  search: { active: 'search', inactive: 'search-outline' },
  downloads: { active: 'download', inactive: 'download-outline' },
  marketplace: { active: 'bag', inactive: 'bag-outline' },
  music: { active: 'musical-notes', inactive: 'musical-notes-outline' },
  profile: { active: 'person', inactive: 'person-outline' },
  interactive: { active: 'sparkles', inactive: 'sparkles-outline' },
};

const LABEL_MAP: Record<string, string> = {
  movies: 'Home',
  categories: 'Browse',
  search: 'Search',
  downloads: 'Offline',
  marketplace: 'Market',
  music: 'Songs',
  profile: 'Me',
  interactive: 'Flixy',
};

const VISIBLE_TABS = ['movies', 'categories', 'music', 'downloads', 'interactive'];

const TabItem = memo(function TabItem({
  routeName,
  focused,
  onPress,
  onLongPress,
  iconSize,
  isCompact,
  accentColor,
}: {
  routeName: string;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  iconSize: number;
  isCompact: boolean;
  accentColor: string;
}) {
  const icons = ICON_MAP[routeName] || { active: 'ellipse', inactive: 'ellipse-outline' };
  const iconName = focused ? icons.active : icons.inactive;
  
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: focused ? 1.15 : 1,
        friction: 8,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: focused ? 1 : 0.4,
        duration: 200,
        useNativeDriver: true,
      })
    ]).start();
  }, [focused, scaleAnim, opacityAnim]);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.item, isCompact && styles.itemCompact]}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Animated.View style={[styles.itemInner, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
        <Ionicons name={iconName as any} size={iconSize} color="#ffffff" />
      </Animated.View>
    </Pressable>
  );
});

export default function BottomNav({ insetsBottom, state, navigation }: Props): React.ReactElement {
  const { width: screenWidth } = useWindowDimensions();
  const fontScale = PixelRatio.getFontScale();
  const isCompact = screenWidth < 360 || fontScale > 1.15;
  
  // Lift the navbar higher to emphasize the float
  const bottomOffset = Platform.OS === 'ios' ? Math.max(insetsBottom || 24, 24) : (insetsBottom ? insetsBottom + 16 : 24);
  const { accentColor } = useAccent();
  const { deferNav } = useNavigationGuard({ cooldownMs: 400 });

  const visibleRoutes = useMemo(() =>
    state.routes.filter((r: { name: string; key: string }) => VISIBLE_TABS.includes(r.name)),
    [state.routes]
  );

  const activeIndex = useMemo(() => {
    const activeRouteName = state.routes[state.index].name;
    return visibleRoutes.findIndex(r => r.name === activeRouteName);
  }, [state.index, state.routes, visibleRoutes]);

  const bubblePos = useRef(new Animated.Value(activeIndex)).current;
  const barTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(bubblePos, {
      toValue: activeIndex,
      friction: 7,
      tension: 60,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, bubblePos]);

  useEffect(() => {
    const breathing = Animated.loop(
      Animated.sequence([
        Animated.timing(barTranslateY, { toValue: -4, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(barTranslateY, { toValue: 0, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    breathing.start();
    return () => breathing.stop();
  }, [barTranslateY]);

  const handlePress = useCallback((routeKey: string, routeName: string, focused: boolean) => {
    if (focused) return;
    const event = navigation.emit({
      type: 'tabPress',
      target: routeKey,
      canPreventDefault: true,
    } as any);
    if (!(event as any).defaultPrevented) {
      deferNav(() => navigation.navigate(routeName as never));
    }
  }, [navigation, deferNav]);

  const pillWidth = Math.min(screenWidth * 0.88, 400); // Max width for tablets/large screens
  const tabWidth = (pillWidth - 12) / visibleRoutes.length;

  const bubbleTranslateX = bubblePos.interpolate({
    inputRange: visibleRoutes.map((_, i) => i),
    outputRange: visibleRoutes.map((_, i) => i * tabWidth),
  });

  return (
    <View pointerEvents="box-none" style={[styles.outer, { bottom: bottomOffset }]}>
      <Animated.View style={[styles.liquidGlassOuter, { width: pillWidth, transform: [{ translateY: barTranslateY }] }]}>
        <LiquidGlass
          glowColor={accentColor}
          tintColor="#030303"
          tintOpacity={0.45}
          cornerRadius={36}
          glowIntensity={0.25}
          borderWidth={1}
          borderOpacity={0.15}
          chromaticAberration={true}
          depthEffect={true}
          refractionAmount={0.3}
          style={styles.liquidGlassWrap}
        >
          <View style={styles.inner}>
            {/* The sliding active highlight bubble */}
            <Animated.View style={[styles.activeBubbleContainer, { width: tabWidth, transform: [{ translateX: bubbleTranslateX }] }]}>
              <LiquidGlass
                tintColor={accentColor}
                tintOpacity={0.15}
                cornerRadius={24}
                glowColor={accentColor}
                glowIntensity={0.4}
                borderOpacity={0.3}
                style={styles.activeBubble}
              >
                <LinearGradient
                  colors={[`${accentColor}40`, 'transparent']}
                  style={StyleSheet.absoluteFillObject}
                />
              </LiquidGlass>
            </Animated.View>

            {visibleRoutes.map((route: { key: string; name: string }, idx: number) => {
              const focused = activeIndex === idx;
              return (
                <TabItem
                  key={route.key}
                  routeName={route.name}
                  focused={focused}
                  onPress={() => handlePress(route.key, route.name, focused)}
                  onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key } as any)}
                  iconSize={24}
                  isCompact={isCompact}
                  accentColor={accentColor}
                />
              );
            })}
          </View>
        </LiquidGlass>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  liquidGlassOuter: {
    height: 72,
    borderRadius: 36,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 24,
  },
  liquidGlassWrap: {
    width: '100%',
    height: '100%',
    borderRadius: 36,
    overflow: 'hidden',
  },
  inner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  activeBubbleContainer: {
    position: 'absolute',
    height: '75%',
    top: '12.5%',
    left: 6,
    paddingHorizontal: 4,
    zIndex: 0,
  },
  activeBubble: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
  },
  item: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  itemCompact: {
    paddingHorizontal: 0,
  },
  itemInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
