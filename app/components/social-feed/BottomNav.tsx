import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { InteractionManager, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAccent } from '../AccentContext';
import { useUser } from '../../../hooks/use-user';
import { NOTIFICATION_BADGE_STORAGE_PREFIX } from '../../../constants/notifications';

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { accentColor } = useAccent();
  const accent = accentColor || '#e50914';
  const accentLight = lightenColor(accent, 0.25);
  const accentGlass: [string, string] = [`${accent}33`, 'rgba(255,255,255,0.02)'];
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
  const isActive = (route: string) => {
    const currentRoute = pathname?.split('/').pop();
    return currentRoute === route || (route === 'index' && currentRoute === 'social-feed');
  };

  // Hide nav on profile screens (any profile path)
  if (!isSocialRoute || (pathname && /profile/i.test(pathname))) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={[styles.outer, { bottom: insets.bottom }]}>
      <BlurView intensity={95} tint="dark" style={[styles.blurWrap, { borderColor: `${accent}55` }]}>
        <View style={[styles.overlay, { backgroundColor: 'rgba(15,15,25,0.55)' }]} />
        <LinearGradient
          colors={accentGlass}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.glassSheen}
        />
        <View style={styles.inner}>
          <NavItem
            onPress={() => deferNav(() => router.push('/social-feed'))}
            icon="home"
            label="Feeds"
            active={isActive('index')}
            accentGradient={accentGradient}
            accentColor={accent}
            badgeBorder={accentLight}
          />
          <NavItem
            onPress={() => deferNav(() => router.push('/social-feed/stories'))}
            icon="time"
            label="Stories"
            active={isActive('stories')}
            accentGradient={accentGradient}
            accentColor={accent}
            badgeBorder={accentLight}
          />
          <NavItem
            onPress={() => deferNav(() => router.push('/social-feed/notifications'))}
            icon="notifications"
            label="Notifications"
            active={isActive('notifications')}
            badgeCount={notificationBadge}
            accentGradient={accentGradient}
            accentColor={accent}
            badgeBorder={accentLight}
          />
          <NavItem
            onPress={() => deferNav(() => router.push('/social-feed/streaks'))}
            icon="flame"
            label="Streaks"
            active={isActive('streaks')}
            accentGradient={accentGradient}
            accentColor={accent}
            badgeBorder={accentLight}
          />
          <NavItem
            onPress={() => deferNav(() => router.replace('/profile?from=social-feed'))}
            icon="person"
            label="Profile"
            active={isActive('profile')}
            accentGradient={accentGradient}
            accentColor={accent}
            badgeBorder={accentLight}
          />
        </View>
      </BlurView>
    </View>
  );
}

function NavItem({
  onPress,
  icon,
  label,
  active,
  badgeCount,
  accentGradient,
  accentColor,
  badgeBorder,
}: {
  onPress: () => void;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  active?: boolean;
  badgeCount?: number;
  accentGradient: [string, string];
  accentColor: string;
  badgeBorder: string;
}) {
  const showBadge = typeof badgeCount === 'number' && badgeCount > 0;
  const badgeDisplay = badgeCount && badgeCount > 99 ? '99+' : badgeCount && badgeCount > 9 ? '9+' : badgeCount;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.item}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
    >
      <View style={[styles.itemInner, active && [styles.itemInnerActive, { shadowColor: accentColor }]]}>
        {active && (
          <LinearGradient
            colors={accentGradient}
            start={{ x: 0.05, y: 0 }}
            end={{ x: 0.95, y: 1 }}
            style={styles.activePill}
          />
        )}
        <View style={styles.iconWrap}>
          <Ionicons
            name={icon}
            size={22}
            color={active ? '#ffffff' : '#f5f5f5'}
          />
          {showBadge && (
            <View style={[styles.badge, { backgroundColor: accentColor, borderColor: badgeBorder }]}>
              <Text style={styles.badgeText}>{badgeDisplay}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.text, active ? styles.activeText : undefined]}>
          {label}
        </Text>
      </View>
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
    // keep pointerEvents available for children
  },
  blurWrap: {
    width: '92%', // slightly inset from edges for a card-like look
    borderRadius: 22,
    overflow: 'hidden',
    // shadow for depth
    shadowColor: '#0b1736',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    minHeight: 72,
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
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    minHeight: 68,
  },
  item: {
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
    minWidth: 50,
  },
  itemInner: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 16,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    gap: 2,
  },
  itemInnerActive: {
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: {
    color: '#fff',
    fontSize: 10.5,
    marginTop: 4,
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
