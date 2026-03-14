import { BlurView } from 'expo-blur'
import React, { useMemo } from 'react'
import {
  Animated,
  Platform,
  processColor,
  requireNativeComponent,
  StyleSheet,
  UIManager,
  View
} from 'react-native'

/* ────────────────────────────────────────────── */
/* Native Android Backdrop Glass (API 31+)      */
/* ────────────────────────────────────────────── */

interface NativeGlassProps {
  ref?: React.Ref<any>
  cornerRadius?: number
  tintOpacity?: number
  blurRadius?: number
  borderOpacity?: number
  tintColor?: any
  borderColor?: any
  chromaticAberration?: boolean
  breathingEffect?: boolean
  interactiveMalleability?: boolean
  style?: any
}

let NativeGlass: React.ComponentType<NativeGlassProps> | null = null

const getNativeGlass = () => {
  if (Platform.OS !== 'android') return null
  if (!NativeGlass) {
    try {
      const hasViewManager = ('hasViewManagerConfig' in UIManager)
        ? UIManager.hasViewManagerConfig('LiquidGlassView')
        : UIManager.getViewManagerConfig('LiquidGlassView') != null;

      if (hasViewManager) {
        NativeGlass = requireNativeComponent('LiquidGlassView')
      }
    } catch (e) {
      console.warn('LiquidGlassView not available fallback:', e)
    }
  }
  return NativeGlass
}

/* ────────────────────────────────────────────── */
/* Public API                                    */
/* ────────────────────────────────────────────── */

export interface LiquidGlassProps extends React.ComponentProps<typeof View> {
  cornerRadius?: number
  tintOpacity?: number
  tintColor?: string
  blurRadius?: number
  blurIntensity?: number
  borderOpacity?: number
  borderColor?: string
  chromaticAberration?: boolean
  breathingEffect?: boolean
  interactive?: boolean
  fastMode?: boolean
  animated?: boolean
  optimizeForScroll?: boolean
  children?: React.ReactNode
  style?: any
}

/**
 * LiquidGlass — Ultra-Premium Native Hybrid
 * 
 * High-performance translucent panel that offloads all heavy
 * rendering (Squircles, Speculars, Chromatic Blur) to Kotlin.
 */
const LiquidGlass = React.memo(React.forwardRef<any, LiquidGlassProps>(({
  cornerRadius = 28,
  tintOpacity = 0.55,
  tintColor = '#0d0d12',
  blurRadius = 80,
  blurIntensity = 80,
  borderOpacity = 0.3,
  borderColor = '#ffffff',
  chromaticAberration = false,
  breathingEffect = true,
  interactive = true,
  fastMode = false,
  animated = true,
  optimizeForScroll = false,
  style,
  children,
  ...rest
}, ref) => {
  const NativeComponent = useMemo(() => getNativeGlass(), [])

  const resolvedBreathingEffect = optimizeForScroll ? false : breathingEffect
  const resolvedInteractive = optimizeForScroll ? false : interactive
  const resolvedAnimated = optimizeForScroll ? false : animated
  const resolvedFastMode = optimizeForScroll ? true : fastMode

  // Process colors for native bridge
  const processedTintColor = useMemo(() => processColor(tintColor), [tintColor]);
  const processedBorderColor = useMemo(() => processColor(borderColor), [borderColor]);

  const containerStyle = useMemo(() => [
    styles.base,
    { borderRadius: cornerRadius },
    style
  ], [cornerRadius, style]);

  /* ───────── Android Native Path ───────── */
  if (NativeComponent && !resolvedFastMode) {
    const Wrapper = resolvedAnimated ? Animated.View : View;
    return (
      <Wrapper ref={ref} style={containerStyle} pointerEvents="box-none" {...rest as any}>
        <NativeComponent
          style={StyleSheet.absoluteFill}
          cornerRadius={cornerRadius}
          tintOpacity={tintOpacity}
          blurRadius={blurRadius}
          borderOpacity={borderOpacity}
          tintColor={processedTintColor}
          borderColor={processedBorderColor}
          chromaticAberration={chromaticAberration}
          breathingEffect={resolvedBreathingEffect}
          interactiveMalleability={resolvedInteractive}
        />
        {children}
      </Wrapper>
    )
  }

  /* ───────── Fallback Path (iOS/FastMode) ───────── */
  const Wrapper = resolvedAnimated ? Animated.View : View;
  const isDark = tintColor.toLowerCase().includes('0') || tintColor.toLowerCase().includes('1') || tintColor.startsWith('#0') || tintColor.startsWith('#1');

  return (
    <Wrapper ref={ref} style={containerStyle} pointerEvents="box-none" {...rest as any}>
      {!resolvedFastMode ? (
        <BlurView
          intensity={blurIntensity}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: tintColor, opacity: tintOpacity }]} />
      )}
      
      {/* Fallback Border */}
      <View style={[
        StyleSheet.absoluteFill, 
        { 
          borderWidth: StyleSheet.hairlineWidth, 
          borderColor: `rgba(255,255,255,${borderOpacity})`, 
          borderRadius: cornerRadius 
        }
      ]} pointerEvents="none" />
      
      {children}
    </Wrapper>
  )
}));

LiquidGlass.displayName = 'LiquidGlass';

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
})

export default LiquidGlass;
