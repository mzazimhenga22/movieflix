import React, { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  UIManager,
  View,
  processColor,
  requireNativeComponent,
  type ViewStyle,
  type ViewProps,
  Animated,
  Easing,
  Text,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ============================================================================
// LiquidHeroView - Cinematic Hero Background
// ============================================================================

type NativeLiquidHeroViewProps = {
  accentColor?: number | null;
  secondaryColor?: number | null;
  glowIntensity?: number;
  animated?: boolean;
  style?: ViewStyle;
};

export type LiquidHeroViewProps = ViewProps & {
  accentColor?: string;
  secondaryColor?: string;
  glowIntensity?: number;
  animated?: boolean;
  children?: React.ReactNode;
};

let NativeHeroComponent: React.ComponentType<NativeLiquidHeroViewProps> | null = null;

function getNativeHero() {
  if (Platform.OS !== 'android') return null;
  if (!NativeHeroComponent) {
    try {
      if (UIManager.hasViewManagerConfig?.('LiquidHeroView') || UIManager.getViewManagerConfig?.('LiquidHeroView')) {
        NativeHeroComponent = requireNativeComponent<NativeLiquidHeroViewProps>('LiquidHeroView');
      }
    } catch { NativeHeroComponent = null; }
  }
  return NativeHeroComponent;
}

export const LiquidHeroView = React.memo(function LiquidHeroView({
  accentColor = '#e50914',
  secondaryColor = '#22d3ee',
  glowIntensity = 0.4,
  animated = true,
  style,
  children,
  ...rest
}: LiquidHeroViewProps) {
  const NativeComponent = useMemo(() => getNativeHero(), []);
  const processedAccent = useMemo(() => processColor(accentColor), [accentColor]);
  const processedSecondary = useMemo(() => processColor(secondaryColor), [secondaryColor]);

  if (NativeComponent) {
    return (
      <NativeComponent
        style={[styles.hero, style]}
        accentColor={processedAccent}
        secondaryColor={processedSecondary}
        glowIntensity={glowIntensity}
        animated={animated}
        {...rest}
      >
        {children}
      </NativeComponent>
    );
  }

  return <View style={[styles.hero, style]} {...rest}>{children}</View>;
});

// ============================================================================
// LiquidRatingBadge - Premium Rating Badge
// ============================================================================

type NativeLiquidRatingBadgeProps = {
  rating?: number;
  accentColor?: number | null;
  showStar?: boolean;
  style?: ViewStyle;
};

export type LiquidRatingBadgeProps = ViewProps & {
  rating?: number;
  accentColor?: string;
  showStar?: boolean;
  size?: number;
};

let NativeRatingComponent: React.ComponentType<NativeLiquidRatingBadgeProps> | null = null;

function getNativeRating() {
  if (Platform.OS !== 'android') return null;
  if (!NativeRatingComponent) {
    try {
      if (UIManager.hasViewManagerConfig?.('LiquidRatingBadge') || UIManager.getViewManagerConfig?.('LiquidRatingBadge')) {
        NativeRatingComponent = requireNativeComponent<NativeLiquidRatingBadgeProps>('LiquidRatingBadge');
      }
    } catch { NativeRatingComponent = null; }
  }
  return NativeRatingComponent;
}

export const LiquidRatingBadge = React.memo(function LiquidRatingBadge({
  rating = 0,
  accentColor = '#e50914',
  showStar = true,
  size = 60,
  style,
  ...rest
}: LiquidRatingBadgeProps) {
  const NativeComponent = useMemo(() => getNativeRating(), []);
  const processedAccent = useMemo(() => processColor(accentColor), [accentColor]);

  const containerStyle = useMemo(() => [
    styles.ratingBadge,
    { minWidth: size, minHeight: size * 0.5 },
    style
  ], [size, style]);

  if (NativeComponent) {
    return (
      <NativeComponent
        style={containerStyle}
        rating={rating}
        accentColor={processedAccent}
        showStar={showStar}
        {...rest}
      />
    );
  }

  // Fallback
  const isHighRated = rating >= 7.5;
  return (
    <View style={[containerStyle, styles.ratingFallback, isHighRated && styles.ratingHigh]} {...rest}>
      {showStar && <View style={[styles.star, { backgroundColor: isHighRated ? '#ffd700' : '#fff' }]} />}
      <View style={styles.ratingTextWrap}>
        <View style={styles.ratingText}>{rating.toFixed(1)}</View>
      </View>
    </View>
  );
});

// ============================================================================
// LiquidWaveformView - Real-time Audio Waveform
// ============================================================================

type NativeLiquidWaveformViewProps = {
  barColor?: number | null;
  secondaryColor?: number | null;
  barCount?: number;
  isPlaying?: boolean;
  style?: ViewStyle;
};

export type LiquidWaveformViewProps = ViewProps & {
  barColor?: string;
  secondaryColor?: string;
  barCount?: number;
  isPlaying?: boolean;
  height?: number;
  animated?: boolean;
  color?: string;
  onAmplitudeUpdate?: (amplitudes: number[]) => void;
};

let NativeWaveformComponent: React.ComponentType<NativeLiquidWaveformViewProps> | null = null;

function getNativeWaveform() {
  if (Platform.OS !== 'android') return null;
  if (!NativeWaveformComponent) {
    try {
      if (UIManager.hasViewManagerConfig?.('LiquidWaveformView') || UIManager.getViewManagerConfig?.('LiquidWaveformView')) {
        NativeWaveformComponent = requireNativeComponent<NativeLiquidWaveformViewProps>('LiquidWaveformView');
      }
    } catch { NativeWaveformComponent = null; }
  }
  return NativeWaveformComponent;
}

export const LiquidWaveformView = React.memo(function LiquidWaveformView({
  barColor = '#ff2d55',
  secondaryColor = '#22d3ee',
  barCount = 48,
  isPlaying = false,
  height = 120,
  animated = true,
  color,
  style,
  ...rest
}: LiquidWaveformViewProps) {
  const NativeComponent = useMemo(() => getNativeWaveform(), []);
  const effectiveColor = color || barColor;
  const processedBarColor = useMemo(() => processColor(effectiveColor), [effectiveColor]);
  const processedSecondaryColor = useMemo(() => processColor(secondaryColor), [secondaryColor]);

  const containerStyle = useMemo(() => [
    styles.waveform,
    { height },
    style
  ], [height, style]);

  if (NativeComponent) {
    return (
      <NativeComponent
        style={containerStyle}
        barColor={processedBarColor}
        secondaryColor={processedSecondaryColor}
        barCount={barCount}
        isPlaying={isPlaying}
        {...rest}
      />
    );
  }

  // Fallback with animated bars
  return (
    <View style={containerStyle} {...rest}>
      <LiquidWaveformFallback barCount={barCount} color={effectiveColor} animated={animated} />
    </View>
  );
});

// Fallback waveform with JS animation
const LiquidWaveformFallback = ({ barCount = 48, color = '#ff2d55', animated = true }: { barCount?: number; color?: string; animated?: boolean }) => {
  const bars = useMemo(() => 
    Array.from({ length: barCount }, (_, i) => ({ id: i, height: 20 + Math.random() * 60 })),
    [barCount]
  );
  
  const animValues = useRef(bars.map(() => new Animated.Value(0.5))).current;
  
  useEffect(() => {
    if (!animated) return;
    
    const animations = animValues.map((anim, i) => 
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 0.3 + Math.random() * 0.7,
            duration: 200 + Math.random() * 300,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.2 + Math.random() * 0.3,
            duration: 200 + Math.random() * 300,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      )
    );
    
    animations.forEach(a => a.start());
    return () => animations.forEach(a => a.stop());
  }, [animated, animValues]);
  
  return (
    <View style={styles.waveformBars}>
      {bars.map((bar, i) => (
        <Animated.View
          key={bar.id}
          style={[
            styles.waveformBar,
            {
              backgroundColor: color,
              height: animValues[i].interpolate({
                inputRange: [0, 1],
                outputRange: [4, 80],
              }),
            }
          ]}
        />
      ))}
    </View>
  );
};

// ============================================================================
// LiquidChipView - Premium Category Chip
// ============================================================================

type NativeLiquidChipViewProps = {
  text?: string;
  label?: string;
  accentColor?: number | null;
  selected?: boolean;
  size?: string;
  style?: ViewStyle;
  onPress?: () => void;
};

export type LiquidChipViewProps = ViewProps & {
  text?: string;
  label?: string;
  accentColor?: string;
  selected?: boolean;
  size?: 'small' | 'medium' | 'large';
  onPress?: () => void;
};

let NativeChipComponent: React.ComponentType<NativeLiquidChipViewProps> | null = null;

function getNativeChip() {
  if (Platform.OS !== 'android') return null;
  if (!NativeChipComponent) {
    try {
      if (UIManager.hasViewManagerConfig?.('LiquidChipView') || UIManager.getViewManagerConfig?.('LiquidChipView')) {
        NativeChipComponent = requireNativeComponent<NativeLiquidChipViewProps>('LiquidChipView');
      }
    } catch { NativeChipComponent = null; }
  }
  return NativeChipComponent;
}

export const LiquidChipView = React.memo(function LiquidChipView({
  text = '',
  label,
  accentColor = '#e50914',
  selected = false,
  size = 'medium',
  onPress,
  style,
  ...rest
}: LiquidChipViewProps) {
  const NativeComponent = useMemo(() => getNativeChip(), []);
  const processedAccent = useMemo(() => processColor(accentColor), [accentColor]);
  const displayText = label || text;

  const sizeStyles = useMemo(() => {
    switch (size) {
      case 'small': return { paddingHorizontal: 14, paddingVertical: 8 };
      case 'large': return { paddingHorizontal: 24, paddingVertical: 16 };
      default: return { paddingHorizontal: 20, paddingVertical: 12 };
    }
  }, [size]);

  const containerStyle = useMemo(() => [
    styles.chip,
    sizeStyles,
    selected && styles.chipSelected,
    style
  ], [selected, sizeStyles, style]);

  if (NativeComponent) {
    return (
      <NativeComponent
        style={containerStyle}
        text={displayText}
        label={displayText}
        accentColor={processedAccent}
        selected={selected}
        size={size}
        onPress={onPress}
        {...rest}
      />
    );
  }

  // Fallback
  return (
    <TouchableOpacity 
      style={[
        containerStyle, 
        { backgroundColor: selected ? `${accentColor}30` : 'rgba(15,18,30,0.65)', borderColor: selected ? accentColor : 'rgba(255,255,255,0.1)' }
      ]} 
      onPress={onPress}
      activeOpacity={0.8}
      {...rest}
    >
      <Text style={[styles.chipText, selected && { color: '#fff' }]}>{displayText}</Text>
    </TouchableOpacity>
  );
});

// ============================================================================
// LiquidGlassCard - Premium Glass Card
// ============================================================================

type NativeLiquidGlassCardProps = {
  posterPath?: string;
  title?: string;
  subtitle?: string;
  progress?: number;
  glowIntensity?: number;
  interactive?: boolean;
  style?: ViewStyle;
};

export type LiquidGlassCardProps = ViewProps & {
  posterPath?: string;
  title?: string;
  subtitle?: string;
  progress?: number;
  glowIntensity?: number;
  interactive?: boolean;
  children?: React.ReactNode;
};

let NativeGlassCardComponent: React.ComponentType<NativeLiquidGlassCardProps> | null = null;

function getNativeGlassCard() {
  if (Platform.OS !== 'android') return null;
  if (!NativeGlassCardComponent) {
    try {
      if (UIManager.hasViewManagerConfig?.('LiquidGlassCard') || UIManager.getViewManagerConfig?.('LiquidGlassCard')) {
        NativeGlassCardComponent = requireNativeComponent<NativeLiquidGlassCardProps>('LiquidGlassCard');
      }
    } catch { NativeGlassCardComponent = null; }
  }
  return NativeGlassCardComponent;
}

export const LiquidGlassCard = React.memo(function LiquidGlassCard({
  posterPath,
  title,
  subtitle,
  progress = 0,
  glowIntensity = 0.3,
  interactive = false,
  style,
  children,
  ...rest
}: LiquidGlassCardProps) {
  const NativeComponent = useMemo(() => getNativeGlassCard(), []);

  if (NativeComponent) {
    return (
      <NativeComponent
        style={[styles.glassCard, style]}
        posterPath={posterPath}
        title={title}
        subtitle={subtitle}
        progress={progress}
        glowIntensity={glowIntensity}
        interactive={interactive}
        {...rest}
      >
        {children}
      </NativeComponent>
    );
  }

  // Fallback
  return (
    <View style={[styles.glassCard, style]} {...rest}>
      {posterPath && (
        <View style={StyleSheet.absoluteFill}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />
        </View>
      )}
      {children}
    </View>
  );
});

// ============================================================================
// LiquidGlassButton - Premium Glass Button
// ============================================================================

type NativeLiquidGlassButtonProps = {
  icon?: string;
  label?: string;
  accentColor?: number | null;
  size?: string;
  variant?: string;
  style?: ViewStyle;
  onPress?: () => void;
};

export type LiquidGlassButtonProps = ViewProps & {
  icon?: string;
  label?: string;
  accentColor?: string;
  size?: 'small' | 'medium' | 'large';
  variant?: 'primary' | 'secondary' | 'ghost';
  onPress?: () => void;
  children?: React.ReactNode;
};

let NativeGlassButtonComponent: React.ComponentType<NativeLiquidGlassButtonProps> | null = null;

function getNativeGlassButton() {
  if (Platform.OS !== 'android') return null;
  if (!NativeGlassButtonComponent) {
    try {
      if (UIManager.hasViewManagerConfig?.('LiquidGlassButton') || UIManager.getViewManagerConfig?.('LiquidGlassButton')) {
        NativeGlassButtonComponent = requireNativeComponent<NativeLiquidGlassButtonProps>('LiquidGlassButton');
      }
    } catch { NativeGlassButtonComponent = null; }
  }
  return NativeGlassButtonComponent;
}

const ICON_MAP: Record<string, string> = {
  play: 'play',
  pause: 'pause',
  stop: 'stop',
  heart: 'heart',
  'heart-outline': 'heart-outline',
  search: 'search',
  home: 'home',
  download: 'download',
  settings: 'settings',
  info: 'information-circle',
  close: 'close',
  add: 'add',
  remove: 'remove',
  bookmark: 'bookmark',
  'bookmark-outline': 'bookmark-outline',
  list: 'list',
  refresh: 'refresh',
  skip: 'play-skip-forward',
  previous: 'play-skip-back',
};

export const LiquidGlassButton = React.memo(function LiquidGlassButton({
  icon,
  label,
  accentColor = '#e50914',
  size = 'medium',
  variant = 'primary',
  onPress,
  style,
  children,
  ...rest
}: LiquidGlassButtonProps) {
  const NativeComponent = useMemo(() => getNativeGlassButton(), []);
  const processedAccent = useMemo(() => processColor(accentColor), [accentColor]);

  const sizeStyles = useMemo(() => {
    switch (size) {
      case 'small': return { paddingHorizontal: 12, paddingVertical: 8, iconSize: 16, fontSize: 12 };
      case 'large': return { paddingHorizontal: 24, paddingVertical: 16, iconSize: 24, fontSize: 16 };
      default: return { paddingHorizontal: 18, paddingVertical: 12, iconSize: 20, fontSize: 14 };
    }
  }, [size]);

  const containerStyle = useMemo(() => [
    styles.glassButton,
    {
      paddingHorizontal: sizeStyles.paddingHorizontal,
      paddingVertical: sizeStyles.paddingVertical,
      backgroundColor: variant === 'primary' ? `${accentColor}20` : 'rgba(255,255,255,0.1)',
    },
    style
  ], [variant, accentColor, sizeStyles, style]);

  if (NativeComponent) {
    return (
      <NativeComponent
        style={containerStyle}
        icon={ICON_MAP[icon || ''] || icon}
        label={label}
        accentColor={processedAccent}
        size={size}
        variant={variant}
        onPress={onPress}
        {...rest}
      >
        {children}
      </NativeComponent>
    );
  }

  // Fallback
  const iconName = ICON_MAP[icon || ''] || icon || 'help-circle';
  return (
    <TouchableOpacity 
      style={containerStyle}
      onPress={onPress}
      activeOpacity={0.8}
      {...rest}
    >
      <View style={styles.buttonContent}>
        {icon && <Ionicons name={iconName as any} size={sizeStyles.iconSize} color="#fff" />}
        {label && <Text style={[styles.buttonLabel, { fontSize: sizeStyles.fontSize }]}>{label}</Text>}
        {children}
      </View>
    </TouchableOpacity>
  );
});

// ============================================================================
// LiquidShimmer - Loading Skeleton
// ============================================================================

type NativeLiquidShimmerProps = {
  shimmerColor?: number | null;
  backgroundColor?: number | null;
  cornerRadius?: number;
  style?: ViewStyle;
};

export type LiquidShimmerProps = ViewProps & {
  shimmerColor?: string;
  backgroundColor?: string;
  cornerRadius?: number;
  width?: number;
  height?: number;
};

let NativeShimmerComponent: React.ComponentType<NativeLiquidShimmerProps> | null = null;

function getNativeShimmer() {
  if (Platform.OS !== 'android') return null;
  if (!NativeShimmerComponent) {
    try {
      if (UIManager.hasViewManagerConfig?.('LiquidProgressBar') || UIManager.getViewManagerConfig?.('LiquidProgressBar')) {
        NativeShimmerComponent = requireNativeComponent<NativeLiquidShimmerProps>('LiquidProgressBar');
      }
    } catch { NativeShimmerComponent = null; }
  }
  return NativeShimmerComponent;
}

export const LiquidShimmer = React.memo(function LiquidShimmer({
  shimmerColor = 'rgba(255,255,255,0.3)',
  backgroundColor = 'rgba(255,255,255,0.1)',
  cornerRadius = 12,
  width,
  height = 20,
  style,
  ...rest
}: LiquidShimmerProps) {
  const NativeComponent = useMemo(() => getNativeShimmer(), []);
  const processedShimmer = useMemo(() => processColor(shimmerColor), [shimmerColor]);
  const processedBackground = useMemo(() => processColor(backgroundColor), [backgroundColor]);

  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [shimmerAnim]);

  const containerStyle = useMemo(() => [
    styles.shimmer,
    { width, height, borderRadius: cornerRadius },
    style
  ], [width, height, cornerRadius, style]);

  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-width || -100, width || 100],
  });

  return (
    <View style={[containerStyle, { backgroundColor }]} {...rest}>
      <Animated.View
        style={[
          styles.shimmerOverlay,
          {
            transform: [{ translateX: shimmerTranslate }],
            backgroundColor: shimmerColor,
          },
        ]}
      />
    </View>
  );
});

// ============================================================================
// LiquidToast - Notification Toast
// ============================================================================

export type LiquidToastType = 'success' | 'error' | 'info' | 'warning';

export type LiquidToastProps = {
  visible: boolean;
  message: string;
  type?: LiquidToastType;
  duration?: number;
  icon?: string;
  onHide: () => void;
};

export const LiquidToast: React.FC<LiquidToastProps> = ({
  visible,
  message,
  type = 'info',
  duration = 3000,
  icon,
  onHide,
}) => {
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(-50)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.spring(translateYAnim, {
          toValue: 0,
          tension: 100,
          friction: 10,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(translateYAnim, {
            toValue: -50,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start(() => onHide());
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible, duration, opacityAnim, translateYAnim, onHide]);

  if (!visible) return null;

  const typeConfig = {
    success: { color: '#22c55e', iconName: 'checkmark-circle' },
    error: { color: '#ef4444', iconName: 'close-circle' },
    warning: { color: '#f59e0b', iconName: 'warning' },
    info: { color: '#3b82f6', iconName: 'information-circle' },
  };

  const config = typeConfig[type];
  const displayIcon = icon || config.iconName;

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          opacity: opacityAnim,
          transform: [{ translateY: translateYAnim }],
        },
      ]}
    >
      <LinearGradient
        colors={['rgba(0,0,0,0.9)', 'rgba(15,15,25,0.95)']}
        style={styles.toastGradient}
      >
        <View style={[styles.toastAccent, { backgroundColor: config.color }]} />
        <Ionicons name={displayIcon as any} size={24} color={config.color} />
        <Text style={styles.toastMessage}>{message}</Text>
      </LinearGradient>
    </Animated.View>
  );
};

// ============================================================================
// LiquidBottomNav - Tab Navigation Bar
// ============================================================================

export type NavItem = {
  key: string;
  icon: string;
  label: string;
  badge?: number;
};

export type LiquidBottomNavProps = {
  items: NavItem[];
  activeKey: string;
  onItemPress: (key: string) => void;
  accentColor?: string;
};

export const LiquidBottomNav: React.FC<LiquidBottomNavProps> = ({
  items,
  activeKey,
  onItemPress,
  accentColor = '#e50914',
}) => {
  const pulseAnims = useRef(items.map(() => new Animated.Value(1))).current;

  const handlePress = useCallback((key: string, index: number) => {
    // Pulse animation
    Animated.sequence([
      Animated.timing(pulseAnims[index], {
        toValue: 1.2,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(pulseAnims[index], {
        toValue: 1,
        tension: 200,
        friction: 5,
        useNativeDriver: true,
      }),
    ]).start();

    onItemPress(key);
  }, [onItemPress, pulseAnims]);

  return (
    <View style={styles.bottomNav}>
      <LinearGradient
        colors={['rgba(0,0,0,0.95)', 'rgba(10,10,20,0.98)']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.navItems}>
        {items.map((item, index) => {
          const isActive = item.key === activeKey;
          return (
            <TouchableOpacity
              key={item.key}
              style={styles.navItem}
              onPress={() => handlePress(item.key, index)}
              activeOpacity={0.7}
            >
              <Animated.View style={[styles.navItemContent, { transform: [{ scale: pulseAnims[index] }] }]}>
                <Ionicons
                  name={item.icon as any}
                  size={24}
                  color={isActive ? accentColor : 'rgba(255,255,255,0.5)'}
                />
                {item.badge && item.badge > 0 && (
                  <View style={[styles.navBadge, { backgroundColor: accentColor }]}>
                    <Text style={styles.navBadgeText}>
                      {item.badge > 99 ? '99+' : item.badge}
                    </Text>
                  </View>
                )}
                <Text
                  style={[
                    styles.navLabel,
                    isActive && { color: accentColor },
                  ]}
                >
                  {item.label}
                </Text>
                {isActive && <View style={[styles.navIndicator, { backgroundColor: accentColor }]} />}
              </Animated.View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

// ============================================================================
// LiquidLiveBadge - Animated Live Badge
// ============================================================================

export type LiquidLiveBadgeProps = ViewProps & {
  viewerCount?: number;
  isLive?: boolean;
  accentColor?: string;
  animated?: boolean;
};

export const LiquidLiveBadge = React.memo(function LiquidLiveBadge({
  viewerCount = 0,
  isLive = true,
  accentColor = '#ef4444',
  animated = true,
  style,
  ...rest
}: LiquidLiveBadgeProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animated || !isLive) return;
    
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.3,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [animated, isLive, pulseAnim]);

  const formatViewers = useCallback((count: number): string => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return String(count);
  }, []);

  if (!isLive) return null;

  return (
    <View style={[styles.liveBadge, style]} {...rest}>
      <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]} />
      <Text style={styles.liveText}>LIVE</Text>
      {viewerCount > 0 && (
        <Text style={styles.viewerCount}>{formatViewers(viewerCount)}</Text>
      )}
    </View>
  );
});

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  hero: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  ratingFallback: {
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  ratingHigh: {
    borderColor: 'rgba(255,215,0,0.5)',
  },
  star: {
    width: 12,
    height: 12,
    marginRight: 6,
  },
  ratingTextWrap: {
    flex: 1,
  },
  ratingText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  waveform: {
    backgroundColor: 'transparent',
  },
  waveformBars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-evenly',
    paddingHorizontal: 4,
  },
  waveformBar: {
    width: 3,
    borderRadius: 2,
  marginHorizontal: 1,
  },
  chip: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(15,18,30,0.65)',
  },
  chipSelected: {
    borderColor: 'rgba(229,9,20,0.8)',
  },
  chipText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
  },
  glassCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,18,30,0.65)',
  },
  glassButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonLabel: {
    color: '#fff',
    fontWeight: '800',
  },
  shimmer: {
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '50%',
  },
  toast: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    zIndex: 9999,
    borderRadius: 16,
    overflow: 'hidden',
  },
  toastGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
    gap: 12,
  },
  toastAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  toastMessage: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  navItems: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  navItemContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBadge: {
    position: 'absolute',
    top: -4,
    right: -12,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  navBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
  navLabel: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '800',
  },
  navIndicator: {
    position: 'absolute',
    bottom: -8,
    width: 24,
    height: 3,
    borderRadius: 2,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  liveText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  viewerCount: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
  },
});

// Export all
export default {
  LiquidHeroView,
  LiquidRatingBadge,
  LiquidWaveformView,
  LiquidChipView,
  LiquidGlassCard,
  LiquidGlassButton,
  LiquidShimmer,
  LiquidToast,
  LiquidBottomNav,
  LiquidLiveBadge,
};
