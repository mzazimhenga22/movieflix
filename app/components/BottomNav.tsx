// app/components/BottomNav.tsx
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
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import LiquidGlass from './LiquidGlass';
// import Svg, { Defs, Path, Stop, LinearGradient as SvgGradient } from 'react-native-svg'; // Removed for Native WaveView
import { useAccent } from './AccentContext';
import { WaveView } from './WaveView';

const AnimatedPath = Animated.createAnimatedComponent(View); // Placeholder if needed, but unused now

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
  interactive: { active: 'sparkles', inactive: 'sparkles-outline' },
};

const LABEL_MAP: Record<string, string> = {
  movies: 'Home',
  categories: 'Categories',
  search: 'Search',
  downloads: 'Downloads',
  marketplace: 'Market',
  music: 'Music',
  interactive: 'More',
};

const VISIBLE_TABS = ['movies', 'categories', 'search', 'music', 'downloads', 'marketplace', 'interactive'];
const VISIBLE_TABS_SET = new Set(VISIBLE_TABS);

// Memoized Water Wave Component - Native implementation
const WaterWaveNav = memo(function WaterWaveNav({ width, color }: { width: number; color: string }) {
  // Native WaveView handles the animation on the UI thread
  return (
    <View style={styles.waveContainer} pointerEvents="none">
      <WaveView style={StyleSheet.absoluteFill} color={color} />
    </View>
  );
});

// Memoized tab item for performance
const TabItem = memo(function TabItem({
  routeKey,
  routeName,
  focused,
  onPress,
  onLongPress,
  iconSize,
  labelFontSize,
  isCompact,
  itemInnerPaddingH,
  itemInnerPaddingV,
}: {
  routeKey: string;
  routeName: string;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  iconSize: number;
  labelFontSize: number;
  isCompact: boolean;
  itemInnerPaddingH: number;
  itemInnerPaddingV: number;
}) {
  const icons = ICON_MAP[routeName] || { active: 'ellipse', inactive: 'ellipse-outline' };
  const iconName = focused ? icons.active : icons.inactive;
  const label = LABEL_MAP[routeName] || routeName;

  return (
    <Pressable
      key={routeKey}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.item, isCompact && styles.itemCompact]}
      android_ripple={{ color: 'rgba(255,255,255,0.1)', borderless: true }}
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
    >
      <View
        style={[
          styles.itemInner,
          { paddingHorizontal: itemInnerPaddingH, paddingVertical: itemInnerPaddingV },
          focused && styles.itemInnerActive,
        ]}
      >
        {focused && (
          <LinearGradient
            colors={['#e50914', '#b20710']}
            start={{ x: 0.05, y: 0 }}
            end={{ x: 0.95, y: 1 }}
            style={styles.activePill}
          />
        )}
        <Ionicons name={iconName as any} size={iconSize} color={focused ? '#ffffff' : '#f5f5f5'} />
        <Text
          style={[styles.text, { fontSize: labelFontSize }, focused && styles.activeText]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.15}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
});

export default function BottomNav({ insetsBottom, isDark: _isDark, state, navigation }: Props): React.ReactElement {
  const { width: screenWidth } = useWindowDimensions();
  const fontScale = PixelRatio.getFontScale();
  const isCompact = screenWidth < 360 || fontScale > 1.15;
  const bottomOffset = Platform.OS === 'ios' ? (insetsBottom || 12) : (insetsBottom ? insetsBottom + 6 : 10);
  const { accentColor } = useAccent();
  const { deferNav } = useNavigationGuard({ cooldownMs: 400 });

  // Shimmer animation
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [shimmerAnim]);

  const iconSize = isCompact ? 20 : 22;
  const labelFontSize = isCompact ? 10 : 11;
  const navMinHeight = isCompact ? 64 : 72;
  const navPaddingV = isCompact ? 10 : 14;
  const navPaddingH = isCompact ? 6 : 10;
  const itemInnerPaddingH = isCompact ? 8 : 10;
  const itemInnerPaddingV = isCompact ? 7 : 8;

  // Memoize filtered routes
  const visibleRoutes = useMemo(() =>
    state.routes.filter((r: { name: string; key: string }) => VISIBLE_TABS.includes(r.name)),
    [state.routes]
  );

  // Create stable press handlers - navigate immediately, no InteractionManager delay
  const createPressHandler = useCallback((routeKey: string, routeName: string, focused: boolean) => () => {
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

  const createLongPressHandler = useCallback((routeKey: string) => () => {
    navigation.emit({
      type: 'tabLongPress',
      target: routeKey,
    } as any);
  }, [navigation]);

  // Swipe handling
  const handleSwipe = useCallback((direction: 'left' | 'right') => {
    const tabRoutes = state.routes.filter((r: { name: string; key: string }) => VISIBLE_TABS_SET.has(r.name));
    if (tabRoutes.length <= 1) return;
    const visibleIndex = tabRoutes.findIndex((r: { key: string }) => r.key === state.routes[state.index]?.key);
    if (visibleIndex < 0) return;
    const nextIndex = direction === 'left'
      ? Math.min(tabRoutes.length - 1, visibleIndex + 1)
      : Math.max(0, visibleIndex - 1);
    if (nextIndex === visibleIndex) return;
    const next = tabRoutes[nextIndex];
    if (next?.name) {
      deferNav(() => navigation.navigate(next.name as never));
    }
  }, [deferNav, navigation, state.index, state.routes]);

  const onPanStateChange = useCallback((evt: any) => {
    if (evt?.nativeEvent?.state !== State.END) return;
    const { translationX = 0, translationY = 0, velocityX = 0 } = evt.nativeEvent ?? {};
    if (Math.abs(translationY) > 40) return;
    if (Math.abs(translationX) < 70 && Math.abs(velocityX) < 600) return;
    handleSwipe(translationX < 0 ? 'left' : 'right');
  }, [handleSwipe]);

  return (
    <View pointerEvents="box-none" style={[styles.outer, { bottom: bottomOffset }]}>
      <PanGestureHandler activeOffsetX={[-18, 18]} failOffsetY={[-18, 18]} onHandlerStateChange={onPanStateChange}>
        <View style={[styles.liquidGlassOuter, { minHeight: navMinHeight }]}>
          <LiquidGlass
            glowColor={accentColor}
            tintColor="#0F0F19"
            tintOpacity={0.65}
            cornerRadius={22}
            glowIntensity={0.5}
            borderWidth={1.2}
            animated={true}
            style={[styles.liquidGlassWrap, { minHeight: navMinHeight }]}
          >
            {/* Water wave effect */}
            <WaterWaveNav width={screenWidth * 0.96} color={accentColor} />

            {/* Shimmer light reflection */}
            <Animated.View
              style={[
                styles.shimmerOverlay,
                {
                  opacity: shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.06] }),
                  transform: [{ translateX: shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [-screenWidth, screenWidth] }) }],
                },
              ]}
            />

            <View
              style={[
                styles.inner,
                { minHeight: navMinHeight, paddingVertical: navPaddingV, paddingHorizontal: navPaddingH },
              ]}
            >
              {visibleRoutes.map((route: { key: string; name: string }) => {
                const focused = state.routes[state.index]?.key === route.key;
                return (
                  <TabItem
                    key={route.key}
                    routeKey={route.key}
                    routeName={route.name}
                    focused={focused}
                    onPress={createPressHandler(route.key, route.name, focused)}
                    onLongPress={createLongPressHandler(route.key)}
                    iconSize={iconSize}
                    labelFontSize={labelFontSize}
                    isCompact={isCompact}
                    itemInnerPaddingH={itemInnerPaddingH}
                    itemInnerPaddingV={itemInnerPaddingV}
                  />
                );
              })}
            </View>
          </LiquidGlass>
        </View>
      </PanGestureHandler>
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
    width: '96%',
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#0b1736',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  liquidGlassWrap: {
    width: '100%',
    borderRadius: 22,
    overflow: 'hidden',
  },
  inner: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    minWidth: 0,
  },
  itemCompact: {
    paddingHorizontal: 2,
    minWidth: 0,
  },
  itemInner: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    minWidth: 0,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    gap: 2,
  },
  itemInnerActive: {
    shadowColor: '#9fd7ff',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: {
    color: '#f5f5f5',
    fontSize: 11,
    marginTop: 2,
  },
  activeText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 11,
  },
  activePill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    opacity: 0.98,
  },
  waveContainer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    overflow: 'hidden',
  },
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderRadius: 22,
  },
});
