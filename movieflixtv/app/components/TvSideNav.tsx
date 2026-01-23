import { Ionicons } from '@expo/vector-icons';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUnreadMessagesBadgeCount } from '../../hooks/use-unread-messages';
import { useTvAccent } from './TvAccentContext';
import { TvFocusable } from './TvSpatialNavigation';

export const TV_SIDE_NAV_WIDTH = 80;
const ICON_SIZE = 24;
const ITEM_SIZE = 52;
const TV_OVERSCAN_INSET = Platform.isTV ? 24 : 0;

type Props = {
  pathname: string;
  children: ReactNode;
};

function withAlpha(color: string, alpha: number) {
  const a = Math.max(0, Math.min(1, alpha));
  const c = (color ?? '').trim();
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1];
    const full = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  return c;
}

const GlowOrb = memo(function GlowOrb({ color, size, delay }: { color: string; size: number; delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 2800, delay, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 2800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, [anim, delay]);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity,
        transform: [{ translateY }],
        shadowColor: color,
        shadowOpacity: 0.9,
        shadowRadius: size,
        shadowOffset: { width: 0, height: 0 },
      }}
    />
  );
});

const NavIcon = memo(function NavIcon({
  name,
  size,
  focused,
  selected,
  accent,
}: {
  name: keyof typeof Ionicons.glyphMap;
  size: number;
  focused: boolean;
  selected: boolean;
  accent: string;
}) {
  const colors: [string, string] = focused || selected
    ? ['#ffffff', accent]
    : ['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.5)'];
  return (
    <MaskedView
      style={{ width: size, height: size }}
      maskElement={
        <View style={styles.iconMask}>
          <Ionicons name={name} size={size} color="#000" />
        </View>
      }
    >
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} />
    </MaskedView>
  );
});

const NavItem = memo(function NavItem({
  icon,
  focused,
  selected,
  accent,
  badge,
  onPress,
  onFocus,
  onBlur,
  tvPreferredFocus,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  selected: boolean;
  accent: string;
  badge?: number;
  onPress: () => void;
  onFocus: () => void;
  onBlur: () => void;
  tvPreferredFocus?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  // Only show focus ring when focused, show subtle selected state otherwise
  const isHighlighted = focused;
  const showSelectedBar = selected && !focused;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: focused ? 1.12 : 1, useNativeDriver: true, friction: 7, tension: 120 }),
      Animated.timing(glowOpacity, { toValue: focused ? 1 : 0, duration: 150, useNativeDriver: true }),
    ]).start();
  }, [focused, scale, glowOpacity]);

  return (
    <TvFocusable
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      tvPreferredFocus={tvPreferredFocus}
      isTVSelectable
      style={styles.navItemPressable}
    >
      <Animated.View style={[styles.navItem, { transform: [{ scale }] }]}>
        {/* Outer glow ring - only on focus */}
        <Animated.View
          style={[
            styles.glowRing,
            {
              opacity: glowOpacity,
              borderColor: accent,
              shadowColor: accent,
            },
          ]}
        />
        {/* Glass background */}
        <View style={[
          styles.navItemGlass,
          selected && !focused && styles.navItemSelected,
        ]}>
          <LinearGradient
            colors={
              isHighlighted
                ? [withAlpha(accent, 0.4), withAlpha(accent, 0.15), 'transparent']
                : selected
                  ? ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.04)', 'transparent']
                  : ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'transparent']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          {/* Active indicator bar - only when selected but not focused */}
          {showSelectedBar && (
            <View style={styles.activeBar}>
              <LinearGradient
                colors={[accent, withAlpha(accent, 0.5)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
            </View>
          )}
          <NavIcon name={icon} size={ICON_SIZE} focused={focused} selected={selected} accent={accent} />
        </View>
        {/* Badge */}
        {badge !== undefined && badge > 0 && (
          <View style={[styles.badge, { backgroundColor: accent }]}>
            <Animated.Text style={styles.badgeText}>{badge > 99 ? '99+' : String(badge)}</Animated.Text>
          </View>
        )}
      </Animated.View>
    </TvFocusable>
  );
});

export default function TvSideNav({ pathname, children }: Props) {
  const router = useRouter();
  const { accentColor } = useTvAccent();
  const unreadBadgeCount = useUnreadMessagesBadgeCount();
  const accent = accentColor || '#e50914';
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const guardLeft = Math.max(TV_OVERSCAN_INSET, insets.left || 0);
  const guardTop = Math.max(TV_OVERSCAN_INSET, insets.top || 0);
  const guardBottom = Math.max(TV_OVERSCAN_INSET, insets.bottom || 0);
  const availableHeight = Math.max(0, screenHeight - guardTop - guardBottom);

  const focusedKeyRef = useRef<string | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);

  const navScale = useRef(new Animated.Value(1)).current;
  const navGlow = useRef(new Animated.Value(0.5)).current;
  const edgeFlashOpacity = useRef(new Animated.Value(0)).current;
  const edgeFlashScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(navScale, { toValue: focusedKey ? 1.02 : 1, useNativeDriver: true, friction: 8, tension: 100 }),
      Animated.timing(navGlow, { toValue: focusedKey ? 0.9 : 0.5, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [focusedKey, navScale, navGlow]);

  // Edge flash effect on focus change
  useEffect(() => {
    Animated.parallel([
      Animated.sequence([
        Animated.timing(edgeFlashOpacity, { toValue: focusedKey ? 1 : 0.5, duration: 100, useNativeDriver: true }),
        Animated.timing(edgeFlashOpacity, { toValue: 0, duration: 350, delay: 50, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.spring(edgeFlashScale, { toValue: 1.1, useNativeDriver: true, friction: 5, tension: 200 }),
        Animated.spring(edgeFlashScale, { toValue: 0.8, useNativeDriver: true, friction: 8, tension: 100 }),
      ]),
    ]).start();
  }, [focusedKey, edgeFlashOpacity, edgeFlashScale]);

  const tabs = useMemo(
    () => [
      { key: 'movies', href: '/(tabs)/movies', icon: 'home' as const },
      { key: 'search', href: '/(tabs)/search', icon: 'search' as const },
      { key: 'reels', href: '/(tabs)/reels', icon: 'play-circle' as const },
      { key: 'music', href: '/(tabs)/music', icon: 'musical-notes' as const },
      { key: 'lives', href: '/(tabs)/lives', icon: 'radio' as const },
      { key: 'categories', href: '/(tabs)/categories', icon: 'apps' as const },
      { key: 'downloads', href: '/(tabs)/downloads', icon: 'cloud-download' as const },
      { key: 'watchparty', href: '/(tabs)/watchparty', icon: 'videocam' as const },
    ],
    []
  );

  const extras = useMemo(
    () => [
      { key: 'marketplace', icon: 'storefront' as const },
      { key: 'social', icon: 'sparkles' as const },
      { key: 'messaging', icon: 'chatbubbles' as const },
      { key: 'subscriptions', icon: 'diamond' as const },
    ],
    []
  );

  const handleFocus = (key: string) => {
    if (!hasInteracted) setHasInteracted(true);
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    focusedKeyRef.current = key;
    setFocusedKey(key);
  };

  const handleBlur = (key: string) => {
    blurTimerRef.current = setTimeout(() => {
      if (focusedKeyRef.current === key) {
        focusedKeyRef.current = null;
        setFocusedKey(null);
      }
    }, 80);
  };

  return (
    <View style={styles.root}>
      <View style={styles.content} data-tv-region="content">{children}</View>

      <Animated.View
        data-tv-region="sidenav"
        pointerEvents="box-none"
        style={[
          styles.navOverlay,
          {
            left: guardLeft,
            top: guardTop,
            bottom: guardBottom,
            height: availableHeight || undefined,
            transform: [{ scale: navScale }],
          },
        ]}
      >
        {/* Seamless background that blends nav into content */}
        <View style={styles.seamlessBackground}>
          {/* Transparent fade - blends with any background */}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(0,0,0,0.75)', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.3)', 'transparent']}
            locations={[0, 0.4, 0.7, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
        </View>

        {/* Accent glow near rail - subtle */}
        <Animated.View style={[styles.ambientGlow, { opacity: navGlow }]}>
          <LinearGradient
            colors={[withAlpha(accent, 0.08), withAlpha(accent, 0.02), 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>

        {/* Subtle separator line */}
        <View style={[styles.separatorLine, { left: TV_SIDE_NAV_WIDTH - 4 }]}>
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.08)', 'transparent']}
            locations={[0, 0.2, 0.8, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        </View>

        {/* Edge flash on focus */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.edgeFlash,
            {
              left: TV_SIDE_NAV_WIDTH - 6,
              opacity: edgeFlashOpacity,
              transform: [{ scaleY: edgeFlashScale }],
            },
          ]}
        >
          <LinearGradient
            colors={['transparent', withAlpha(accent, 0.8), 'transparent']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.edgeFlashInner}
          />
          <LinearGradient
            colors={[withAlpha(accent, 0.4), 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.edgeFlashGlow}
          />
        </Animated.View>

        {/* Main glass rail */}
        <View style={styles.railContainer}>
          <View style={styles.railOuter}>
            {Platform.OS === 'ios' || Platform.OS === 'web' ? (
              <BlurView intensity={40} tint="dark" style={styles.rail}>
                <RailInner accent={accent} />
              </BlurView>
            ) : (
              <View style={[styles.rail, styles.railFallback]}>
                <RailInner accent={accent} />
              </View>
            )}

            {/* Glass edge highlight */}
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.04)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.glassEdgeTop}
            />
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(255,255,255,0.12)', 'transparent']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.glassEdgeLeft}
            />

            {/* Floating orbs */}
            <View style={styles.orbContainer}>
              <GlowOrb color={withAlpha(accent, 0.5)} size={8} delay={0} />
              <GlowOrb color="rgba(255,255,255,0.3)" size={5} delay={800} />
              <GlowOrb color={withAlpha(accent, 0.4)} size={6} delay={1600} />
            </View>

            {/* Nav items */}
            <View style={styles.navSection}>
              {tabs.map((tab) => {
                // Match pathname to current tab
                const pathLower = pathname.toLowerCase();
                const isSelected =
                  pathLower.includes(`/${tab.key}`) ||
                  pathLower.includes(`(tabs)/${tab.key}`) ||
                  pathname.startsWith(tab.href) ||
                  (tab.key === 'movies' && (pathLower === '/' || pathLower === '/index' || pathLower.endsWith('(tabs)') || pathLower.endsWith('(tabs)/')));
                return (
                  <NavItem
                    key={tab.key}
                    icon={isSelected || focusedKey === tab.key ? tab.icon : (`${tab.icon}-outline` as any)}
                    focused={focusedKey === tab.key}
                    selected={isSelected}
                    accent={accent}
                    onPress={() => router.push(tab.href as any)}
                    onFocus={() => handleFocus(tab.key)}
                    onBlur={() => handleBlur(tab.key)}
                    tvPreferredFocus={isSelected && !focusedKey && !hasInteracted}
                  />
                );
              })}
            </View>

            {/* Divider with glow */}
            <View style={styles.divider}>
              <LinearGradient
                colors={['transparent', withAlpha(accent, 0.4), 'transparent']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.dividerLine}
              />
              <View style={[styles.dividerDot, { backgroundColor: accent, shadowColor: accent }]} />
            </View>

            {/* Extra items */}
            <View style={[styles.navSection, { marginBottom: 10 }]}>
              {extras.map((item) => (
                <NavItem
                  key={item.key}
                  icon={focusedKey === item.key ? item.icon : (`${item.icon}-outline` as any)}
                  focused={focusedKey === item.key}
                  selected={false}
                  accent={accent}
                  badge={item.key === 'messaging' ? unreadBadgeCount : undefined}
                  onPress={() => router.push(`/continue-on-phone?feature=${item.key}`)}
                  onFocus={() => handleFocus(item.key)}
                  onBlur={() => handleBlur(item.key)}
                />
              ))}
            </View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

function RailInner({ accent }: { accent: string }) {
  return (
    <>
      <LinearGradient
        pointerEvents="none"
        colors={[withAlpha(accent, 0.1), 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, position: 'relative', backgroundColor: '#000000' },
  content: { flex: 1 },
  navOverlay: {
    position: 'absolute',
    justifyContent: 'center',
    zIndex: 30,
  },
  seamlessBackground: {
    position: 'absolute',
    top: -50,
    bottom: -50,
    left: -20,
    width: TV_SIDE_NAV_WIDTH + 50,
  },
  edgeBlend: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 40,
  },
  separatorLine: {
    position: 'absolute',
    top: '6%',
    bottom: '6%',
    width: 1,
  },
  ambientGlow: {
    position: 'absolute',
    top: '15%',
    bottom: '15%',
    left: 0,
    width: TV_SIDE_NAV_WIDTH + 30,
    borderRadius: 60,
  },
  railContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 8, // Reduced padding for end-to-end look
    paddingLeft: 10,
  },
  railOuter: {
    flex: 1, // Full height
    width: TV_SIDE_NAV_WIDTH - 12,
    // borderRadius: 36, // Keep rounded corners or make small if truly end-to-end?
    borderRadius: 24,
    backgroundColor: 'rgba(12,14,28,0.92)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 16 },
    shadowOpacity: 0.75,
    shadowRadius: 40,
    elevation: 28,
    overflow: 'hidden',
    paddingVertical: 16,
    paddingHorizontal: 10,
  },
  rail: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
    overflow: 'hidden',
  },
  railFallback: {
    backgroundColor: 'rgba(12,14,30,0.95)',
  },
  glassEdgeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 60,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },
  glassEdgeLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 16,
    borderTopLeftRadius: 32,
    borderBottomLeftRadius: 32,
  },
  orbContainer: {
    position: 'absolute',
    top: 60,
    left: 10,
    width: 20,
    height: 200,
    gap: 60,
  },
  navSection: {
    gap: 8,
    alignItems: 'center',
  },
  navItemPressable: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
  },
  navItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 14,
  },
  navItemGlass: {
    width: ITEM_SIZE - 4,
    height: ITEM_SIZE - 4,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  navItemSelected: {
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(10,12,25,0.9)',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  divider: {
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
  },
  dividerLine: {
    width: 32,
    height: 1,
  },
  dividerDot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  iconMask: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  edgeFlash: {
    position: 'absolute',
    top: '12%',
    bottom: '12%',
    width: 20,
  },
  edgeFlashInner: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 2,
    borderRadius: 1,
  },
  edgeFlashGlow: {
    position: 'absolute',
    left: 0,
    top: '5%',
    bottom: '5%',
    width: 16,
    borderRadius: 8,
  },
});
