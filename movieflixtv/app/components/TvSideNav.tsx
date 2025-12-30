import { Ionicons } from '@expo/vector-icons';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { useTvAccent } from './TvAccentContext';

export const TV_SIDE_NAV_WIDTH = 120;

const ROUTE_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  movies: { label: 'Home', icon: 'home-outline' },
  search: { label: 'Search', icon: 'search-outline' },
  categories: { label: 'Categories', icon: 'grid-outline' },
  downloads: { label: 'Downloads', icon: 'cloud-download-outline' },
  watchparty: { label: 'Watch Party', icon: 'people-outline' },
};

function iconForKey(key: string, active: boolean): keyof typeof Ionicons.glyphMap {
  switch (key) {
    case 'movies':
      return active ? 'home' : 'home-outline';
    case 'categories':
      return active ? 'grid' : 'grid-outline';
    case 'search':
      return active ? 'search' : 'search-outline';
    case 'downloads':
      return active ? 'cloud-download' : 'cloud-download-outline';
    case 'watchparty':
      return active ? 'people' : 'people-outline';
    default:
      return active ? 'ellipse' : 'ellipse-outline';
  }
}

type Props = {
  pathname: string;
  children: ReactNode;
};

type GradientIconProps = {
  name: keyof typeof Ionicons.glyphMap;
  size: number;
  colors: readonly [string, string];
};

function GradientIonicon({ name, size, colors }: GradientIconProps) {
  return (
    <MaskedView
      style={{ width: size, height: size }}
      maskElement={
        <View style={styles.iconMask}>
          <Ionicons name={name as any} size={size} color="#000" />
        </View>
      }
    >
      <LinearGradient colors={colors as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} />
    </MaskedView>
  );
}

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

  const hsla = c.match(/^hsla\((.+)\)$/i);
  if (hsla) {
    const parts = hsla[1].split(',').map((p) => p.trim());
    if (parts.length >= 4) parts[3] = String(a);
    return `hsla(${parts.join(', ')})`;
  }
  const hsl = c.match(/^hsl\((.+)\)$/i);
  if (hsl) return `hsla(${hsl[1]}, ${a})`;

  const rgba = c.match(/^rgba\((.+)\)$/i);
  if (rgba) {
    const parts = rgba[1].split(',').map((p) => p.trim());
    if (parts.length >= 4) parts[3] = String(a);
    return `rgba(${parts.join(', ')})`;
  }
  const rgb = c.match(/^rgb\((.+)\)$/i);
  if (rgb) return `rgba(${rgb[1]}, ${a})`;

  return c;
}

export default function TvSideNav({ pathname, children }: Props) {
  const router = useRouter();
  const { accentColor } = useTvAccent();
  const accent = accentColor || '#e50914';
  const iconGradientActive: [string, string] = ['rgba(255,255,255,0.95)', accent];
  const iconGradientDefault: [string, string] = ['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.55)'];
  const focusedKeyRef = useRef<string | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  const pillWidth = useRef(new Animated.Value(TV_SIDE_NAV_WIDTH)).current;
  useEffect(() => {
    Animated.spring(pillWidth, {
      toValue: focusedKey ? TV_SIDE_NAV_WIDTH + 18 : TV_SIDE_NAV_WIDTH,
      useNativeDriver: false,
      friction: 10,
      tension: 90,
    }).start();
  }, [focusedKey, pillWidth]);

  const tabs = useMemo(
    () => [
      { key: 'movies', href: '/(tabs)/movies', ...ROUTE_META.movies },
      { key: 'search', href: '/(tabs)/search', ...ROUTE_META.search },
      { key: 'categories', href: '/(tabs)/categories', ...ROUTE_META.categories },
      { key: 'downloads', href: '/(tabs)/downloads', ...ROUTE_META.downloads },
      { key: 'watchparty', href: '/(tabs)/watchparty', ...ROUTE_META.watchparty },
    ],
    [],
  );

  const extras = useMemo(
    () => [
      { key: 'marketplace', label: 'Marketplace', icon: 'bag-outline' as const },
      { key: 'social', label: 'Social', icon: 'camera-outline' as const },
      { key: 'messaging', label: 'Messages', icon: 'chatbubble-outline' as const },
      { key: 'subscriptions', label: 'Subscriptions', icon: 'card-outline' as const },
    ],
    [],
  );

  return (
    <View style={styles.root}>
      <View style={styles.content}>{children}</View>

      <View pointerEvents="box-none" style={styles.navOverlay}>
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0.18)', 'rgba(0,0,0,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.navScrim}
        />

        <View style={styles.railOuter}>
          <Animated.View style={[styles.pillOuter, { width: pillWidth }]}>
            <BlurView intensity={22} tint="dark" style={styles.pill}>
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.03)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <LinearGradient
                pointerEvents="none"
                colors={[withAlpha(accent, 0.10), 'rgba(0,0,0,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />

              <View style={styles.section}>
                {tabs.map((tab) => {
                  const isSelected = pathname.startsWith(tab.href);
                  const icon = iconForKey(tab.key, isSelected);
                  return (
                    <Pressable
                      key={tab.key}
                      onPress={() => router.push(tab.href as any)}
                      onFocus={() => {
                        if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
                        focusedKeyRef.current = tab.key;
                        setFocusedKey(tab.key);
                      }}
                      onBlur={() => {
                        const key = tab.key;
                        blurTimerRef.current = setTimeout(() => {
                          if (focusedKeyRef.current === key) {
                            focusedKeyRef.current = null;
                            setFocusedKey(null);
                          }
                        }, 60);
                      }}
                      style={({ focused }: any) => [styles.iconItem, (focused || isSelected) ? styles.iconItemActive : null]}
                    >
                      {({ focused }: any) => (
                        <View
                          style={[
                            styles.iconItemInner,
                            (focused || isSelected) ? styles.iconItemInnerActive : null,
                          ]}
                        >
                          {(focused || isSelected) ? (
                            <LinearGradient
                              pointerEvents="none"
                              colors={[withAlpha(accent, 0.28), withAlpha(accent, 0.06)]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={StyleSheet.absoluteFillObject}
                            />
                          ) : null}
                          <GradientIonicon
                            name={icon}
                            size={22}
                            colors={(focused || isSelected) ? iconGradientActive : iconGradientDefault}
                          />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.pillDivider} />

              <View style={styles.section}>
                {extras.map((it) => (
                  <Pressable
                    key={it.key}
                    onPress={() => router.push(`/continue-on-phone?feature=${it.key}`)}
                    onFocus={() => {
                      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
                      focusedKeyRef.current = it.key;
                      setFocusedKey(it.key);
                    }}
                    onBlur={() => {
                      const key = it.key;
                      blurTimerRef.current = setTimeout(() => {
                        if (focusedKeyRef.current === key) {
                          focusedKeyRef.current = null;
                          setFocusedKey(null);
                        }
                      }, 60);
                    }}
                    style={({ focused }: any) => [styles.iconItem, focused ? styles.iconItemActive : null]}
                  >
                    {({ focused }: any) => (
                      <View style={[styles.iconItemInner, focused ? styles.iconItemInnerActive : null]}>
                        {focused ? (
                          <LinearGradient
                            pointerEvents="none"
                            colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.03)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFillObject}
                          />
                        ) : null}
                        <GradientIonicon name={it.icon} size={22} colors={iconGradientDefault} />
                      </View>
                    )}
                  </Pressable>
                ))}
              </View>
            </BlurView>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, position: 'relative', backgroundColor: '#05060f' },
  content: {
    flex: 1,
    // Reserve space for the left rail so screens don't render underneath it.
    paddingLeft: TV_SIDE_NAV_WIDTH,
  },
  navOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'center',
  },
  navScrim: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: TV_SIDE_NAV_WIDTH + 140,
  },
  railOuter: {
    width: TV_SIDE_NAV_WIDTH,
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 0,
  },
  pillOuter: {
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 7,
  },
  pill: {
    borderRadius: 28,
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(5,6,15,0.20)',
    overflow: 'hidden',
  },
  section: { gap: 10 },
  pillDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  iconItem: {
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconItemActive: {
    transform: [{ scale: 1.05 }],
  },
  iconItemInner: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  iconItemInnerActive: {
    borderColor: 'rgba(255,255,255,0.22)',
  },
  iconMask: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
