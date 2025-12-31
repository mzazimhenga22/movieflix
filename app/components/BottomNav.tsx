// app/components/BottomNav.tsx
import React from 'react';
import {
  PixelRatio,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
  Text,
  TouchableOpacity,
  InteractionManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { useAccent } from './AccentContext';

type Props = BottomTabBarProps & {
  insetsBottom: number;
  isDark: boolean;
};

export default function BottomNav({ insetsBottom, isDark, state, navigation }: Props): React.ReactElement {
  const { width: screenWidth } = useWindowDimensions();
  const fontScale = PixelRatio.getFontScale();
  const isCompact = screenWidth < 360 || fontScale > 1.15;

  const bottomOffset = Platform.OS === 'ios' ? (insetsBottom || 12) : (insetsBottom ? insetsBottom + 6 : 10);
  const { accentColor } = useAccent();
  const navInFlightRef = React.useRef(false);

  const iconSize = isCompact ? 20 : 22;
  const labelFontSize = isCompact ? 10 : 11;
  const labelMaxFontMultiplier = 1.15;
  const navMinHeight = isCompact ? 64 : 72;
  const navPaddingV = isCompact ? 10 : 14;
  const navPaddingH = isCompact ? 6 : 8;
  const itemMinWidth = isCompact ? 0 : 56;
  const itemInnerMinWidth = isCompact ? 0 : 72;
  const itemInnerPaddingH = isCompact ? 10 : 12;
  const itemInnerPaddingV = isCompact ? 7 : 8;

  const visibleTabs = new Set(['movies', 'categories', 'search', 'downloads', 'interactive']);

  const iconForRoute = (routeName: string, focused: boolean) => {
    switch (routeName) {
      case 'movies':
        return focused ? 'home' : 'home-outline';
      case 'categories':
        return focused ? 'grid' : 'grid-outline';
      case 'search':
        return focused ? 'search' : 'search-outline';
      case 'downloads':
        return focused ? 'cloud-download' : 'cloud-download-outline';
      case 'interactive':
        return focused ? 'sparkles' : 'sparkles-outline';
      default:
        return focused ? 'ellipse' : 'ellipse-outline';
    }
  };

  const labelForRoute = (routeName: string) => {
    switch (routeName) {
      case 'movies':
        return 'Home';
      case 'categories':
        return 'Categories';
      case 'search':
        return 'Search';
      case 'downloads':
        return 'Downloads';
      default:
        return routeName;
    }
  };

  const handleSwipe = React.useCallback(
    (direction: 'left' | 'right') => {
      const tabRoutes = state.routes.filter((r) => visibleTabs.has(r.name));
      if (tabRoutes.length <= 1) return;

      const visibleIndex = tabRoutes.findIndex((r) => r.key === state.routes[state.index]?.key);
      if (visibleIndex < 0) return;

      const nextIndex =
        direction === 'left'
          ? Math.min(tabRoutes.length - 1, visibleIndex + 1)
          : Math.max(0, visibleIndex - 1);

      if (nextIndex === visibleIndex) return;

      const next = tabRoutes[nextIndex];
      if (!next?.name) return;
      if (navInFlightRef.current) return;
      navInFlightRef.current = true;

      requestAnimationFrame(() => {
        InteractionManager.runAfterInteractions(() => {
          try {
            navigation.navigate(next.name as never);
          } finally {
            navInFlightRef.current = false;
          }
        });
      });
    },
    [navigation, state.index, state.routes],
  );

  const onPanStateChange = React.useCallback(
    (evt: any) => {
      if (evt?.nativeEvent?.state !== State.END) return;
      const { translationX = 0, translationY = 0, velocityX = 0 } = evt.nativeEvent ?? {};

      // Only treat strong horizontal swipes as navigation.
      if (Math.abs(translationY) > 40) return;
      if (Math.abs(translationX) < 70 && Math.abs(velocityX) < 600) return;

      if (translationX < 0) handleSwipe('left');
      else handleSwipe('right');
    },
    [handleSwipe],
  );

  return (
    <View pointerEvents="box-none" style={[styles.outer, { bottom: bottomOffset }]}>
      <PanGestureHandler activeOffsetX={[-18, 18]} failOffsetY={[-18, 18]} onHandlerStateChange={onPanStateChange}>
        <View>
          <BlurView
            intensity={95}
            tint="dark"
            style={[styles.blurWrap, { borderColor: `${accentColor}55`, minHeight: navMinHeight }]}
          >
            <View
              style={[
                styles.overlay,
                { backgroundColor: 'rgba(15,15,25,0.55)' },
              ]}
            />
            <LinearGradient
              colors={[`${accentColor}33`, 'rgba(255,255,255,0.02)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.glassSheen}
            />
            <View
              style={[
                styles.inner,
                {
                  minHeight: navMinHeight,
                  paddingVertical: navPaddingV,
                  paddingHorizontal: navPaddingH,
                },
              ]}
            >
              {state.routes.map((route, idx) => {
                const focused = state.index === idx;
                const routeName = route.name;

                if (routeName === 'marketplace' || !visibleTabs.has(routeName)) {
                  return null;
                }

                const onPress = () => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  } as any);

                  if (focused || (event as any).defaultPrevented) return;
                  if (navInFlightRef.current) return;
                  navInFlightRef.current = true;

                  requestAnimationFrame(() => {
                    InteractionManager.runAfterInteractions(() => {
                      try {
                        navigation.navigate(routeName as never);
                      } finally {
                        navInFlightRef.current = false;
                      }
                    });
                  });
                };

                const onLongPress = () => {
                  navigation.emit({
                    type: 'tabLongPress',
                    target: route.key,
                  } as any);
                };

                const iconName = iconForRoute(routeName, focused);
                const label = labelForRoute(routeName);

                return (
                  <TouchableOpacity
                    key={route.key}
                    onPress={onPress}
                    onLongPress={onLongPress}
                    style={[styles.item, { minWidth: itemMinWidth }, isCompact && styles.itemCompact]}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityState={{ selected: focused }}
                  >
                    <View
                      style={[
                        styles.itemInner,
                        {
                          minWidth: itemInnerMinWidth,
                          paddingHorizontal: itemInnerPaddingH,
                          paddingVertical: itemInnerPaddingV,
                        },
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
                        style={[styles.text, { fontSize: labelFontSize }, focused ? styles.activeText : undefined]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        maxFontSizeMultiplier={labelMaxFontMultiplier}
                      >
                        {label}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </BlurView>
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
  blurWrap: {
    width: '92%',
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#0b1736',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 10,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  glassSheen: {
    ...StyleSheet.absoluteFillObject,
  },
  inner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    minWidth: 56,
  },
  itemCompact: {
    paddingHorizontal: 2,
    minWidth: 0,
  },
  itemInner: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    minWidth: 72,
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
});
