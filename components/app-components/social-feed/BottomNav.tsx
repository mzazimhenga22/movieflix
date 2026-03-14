import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, InteractionManager, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAccent } from '../AccentContext';
import { useUser } from '../../../hooks/use-user';
import { NOTIFICATION_BADGE_STORAGE_PREFIX } from '../../../constants/notifications';
import LiquidGlass from '../LiquidGlass';
import { WaveView } from '../WaveView';

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { accentColor } = useAccent();
  const accent = accentColor || '#e50914';
  const accentLight = lightenColor(accent, 0.25);
  const accentGradient: [string, string] = ['#e50914', '#b20710'];
  const [notificationBadge, setNotificationBadge] = React.useState(0);
  const badgeStorageKey = React.useMemo(
    () => `${NOTIFICATION_BADGE_STORAGE_PREFIX}${user?.uid ?? 'guest'}`,
    [user?.uid],
  );

  const navInFlightRef = React.useRef(false);
  const deferNav = React.useCallback((action: () => void) => {
    if (navInFlightRef.current) return;
    navInFlightRef.current = true;
    requestAnimationFrame(() => {
      InteractionManager.runAfterInteractions(() => {
        try {
          action();
        } finally {
          navInFlightRef.current = false;
        }
      });
    });
  }, []);

  const syncBadge = React.useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(badgeStorageKey);
      if (!stored) {
        setNotificationBadge(0);
        return;
      }

      let parsed: any = stored;
      if (stored.startsWith('{') || stored.startsWith('[')) {
        try {
          parsed = JSON.parse(stored);
        } catch {
          parsed = stored;
        }
      }

      let next = 0;
      if (typeof parsed === 'number') {
        next = parsed;
      } else if (parsed && typeof parsed === 'object') {
        const raw = parsed.all ?? parsed.total ?? parsed.count ?? 0;
        next = Number(raw) || 0;
      } else {
        next = Number(parsed) || 0;
      }

      if (!Number.isFinite(next) || next < 0) {
        next = 0;
      }
      setNotificationBadge(next);
    } catch (err) {
      console.warn('Failed to read notification badge count', err);
      setNotificationBadge(0);
    }
  }, [badgeStorageKey]);

  React.useEffect(() => {
    syncBadge();
    const interval = setInterval(syncBadge, 10000);
    return () => {
      clearInterval(interval);
    };
  }, [syncBadge]);

  React.useEffect(() => {
    syncBadge();
  }, [pathname, syncBadge]);

  const isSocialRoute = pathname?.startsWith('/social-feed');
  const hideOnLive = Boolean(pathname && pathname.startsWith('/social-feed/live'));
  const hideOnGoLive = Boolean(pathname && pathname.startsWith('/social-feed/go-live'));
  const isActive = (route: string) => {
    const currentRoute = pathname?.split('/').pop();
    return currentRoute === route || (route === 'index' && currentRoute === 'social-feed');
  };

  const routeOrder = React.useMemo(
    () => ['/social-feed', '/social-feed/stories', '/social-feed/notifications', '/social-feed/streaks'] as const,
    [],
  );

  const handleSwipe = React.useCallback(
    (direction: 'left' | 'right') => {
      const current = pathname || '';
      const currentIndex = routeOrder.findIndex((p) => p === current);
      if (currentIndex < 0) return;

      const nextIndex =
        direction === 'left'
          ? Math.min(routeOrder.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex - 1);
      if (nextIndex === currentIndex) return;

      const next = routeOrder[nextIndex];
      if (!next) return;
      deferNav(() => router.replace(next));
    },
    [deferNav, pathname, routeOrder, router],
  );

  const onPanStateChange = React.useCallback(
    (evt: any) => {
      if (evt?.nativeEvent?.state !== State.END) return;
      const { translationX = 0, translationY = 0, velocityX = 0 } = evt.nativeEvent ?? {};
      if (Math.abs(translationY) > 40) return;
      if (Math.abs(translationX) < 70 && Math.abs(velocityX) < 600) return;

      if (translationX < 0) handleSwipe('left');
      else handleSwipe('right');
    },
    [handleSwipe],
  );

  const { width: screenWidth } = useWindowDimensions();
  const barTranslateY = useRef(new Animated.Value(0)).current;

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

  // Hide nav on profile screens (any profile path)
  if (!isSocialRoute || hideOnLive || hideOnGoLive || (pathname && /profile/i.test(pathname))) {
    return null;
  }

  const bottomOffset = Platform.OS === 'ios' ? Math.max(insets.bottom || 24, 24) : (insets.bottom ? insets.bottom + 16 : 24);
  const pillWidth = Math.min(screenWidth * 0.88, 400);

  return (
    <View pointerEvents="box-none" style={[styles.outer, { bottom: bottomOffset }]}>
      <PanGestureHandler activeOffsetX={[-18, 18]} failOffsetY={[-18, 18]} onHandlerStateChange={onPanStateChange}>
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
            {/* Ambient subtle wave for social feed */}
            <View style={styles.waveContainer} pointerEvents="none">
              <WaveView style={StyleSheet.absoluteFill} color={accentColor} />
            </View>

            <View style={styles.inner}>
              <NavItem
                onPress={() => deferNav(() => router.push('/social-feed'))}
                icon={isActive('index') ? "home" : "home-outline"}
                active={isActive('index')}
                accentColor={accent}
                badgeBorder={accentLight}
              />
              <NavItem
                onPress={() => deferNav(() => router.push('/social-feed/stories'))}
                icon={isActive('stories') ? "time" : "time-outline"}
                active={isActive('stories')}
                accentColor={accent}
                badgeBorder={accentLight}
              />
              <NavItem
                onPress={() => deferNav(() => router.push('/social-feed/notifications'))}
                icon={isActive('notifications') ? "notifications" : "notifications-outline"}
                active={isActive('notifications')}
                badgeCount={notificationBadge}
                accentColor={accent}
                badgeBorder={accentLight}
              />
              <NavItem
                onPress={() => deferNav(() => router.push('/social-feed/streaks'))}
                icon={isActive('streaks') ? "flame" : "flame-outline"}
                active={isActive('streaks')}
                accentColor={accent}
                badgeBorder={accentLight}
              />
              <NavItem
                onPress={() => deferNav(() => router.push('/profile?from=social-feed'))}
                icon={isActive('profile') ? "person" : "person-outline"}
                active={isActive('profile')}
                accentColor={accent}
                badgeBorder={accentLight}
              />
            </View>
          </LiquidGlass>
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
}

function NavItem({
  onPress,
  icon,
  active,
  badgeCount,
  accentColor,
  badgeBorder,
}: {
  onPress: () => void;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  active?: boolean;
  badgeCount?: number;
  accentColor: string;
  badgeBorder: string;
}) {
  const showBadge = typeof badgeCount === 'number' && badgeCount > 0;
  const badgeDisplay = badgeCount && badgeCount > 99 ? '99+' : badgeCount && badgeCount > 9 ? '9+' : badgeCount;
  
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: active ? 1.15 : 1,
        friction: 8,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: active ? 1 : 0.4,
        duration: 200,
        useNativeDriver: true,
      })
    ]).start();
  }, [active, scaleAnim, opacityAnim]);

  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.item}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      {active && (
        <View style={styles.activePillBackground}>
           <LiquidGlass
              tintColor={accentColor}
              tintOpacity={0.15}
              cornerRadius={24}
              glowColor={accentColor}
              glowIntensity={0.4}
              borderOpacity={0.3}
              style={StyleSheet.absoluteFillObject}
            >
              <LinearGradient
                colors={[`${accentColor}40`, 'transparent']}
                style={StyleSheet.absoluteFillObject}
              />
            </LiquidGlass>
        </View>
      )}
      <Animated.View style={[styles.itemInner, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
        <View style={styles.iconWrap}>
          <Ionicons
            name={icon}
            size={24}
            color="#ffffff"
          />
          {showBadge && (
            <View style={[styles.badge, { backgroundColor: accentColor, borderColor: badgeBorder }]}>
              <Text style={styles.badgeText}>{badgeDisplay}</Text>
            </View>
          )}
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

type RGB = { r: number; g: number; b: number };

function parseColor(color?: string): RGB | null {
  if (!color) return null;
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    }
    if (hex.length !== 6) return null;
    const num = Number.parseInt(hex, 16);
    if (Number.isNaN(num)) return null;
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255,
    };
  }
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (match) {
    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
    };
  }
  return null;
}

function mixColor(base: RGB, target: RGB, amount: number) {
  const clamp = (value: number) => Math.max(0, Math.min(255, value));
  return {
    r: Math.round(clamp(base.r + (target.r - base.r) * amount)),
    g: Math.round(clamp(base.g + (target.g - base.g) * amount)),
    b: Math.round(clamp(base.b + (target.b - base.b) * amount)),
  };
}

function lightenColor(color: string, amount = 0.2) {
  const rgb = parseColor(color);
  if (!rgb) return color;
  const mixed = mixColor(rgb, { r: 255, g: 255, b: 255 }, amount);
  return `rgb(${mixed.r}, ${mixed.g}, ${mixed.b})`;
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
  waveContainer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 36,
    overflow: 'hidden',
    opacity: 0.4,
  },
  inner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
  },
  item: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  itemInner: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  activePillBackground: {
    position: 'absolute',
    width: '80%',
    height: '75%',
    borderRadius: 24,
    overflow: 'hidden',
    zIndex: 0,
  },
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    borderRadius: 10,
    minWidth: 18,
    paddingHorizontal: 4,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});
