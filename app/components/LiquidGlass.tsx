import React from 'react';
import {
    Platform,
    requireNativeComponent,
    StyleSheet,
    View
} from 'react-native';

/* ─── Native component (Android only) ─────────────────────────────────────── */

interface NativeLiquidGlassProps {
    glowColor?: string;
    tintColor?: string;
    tintOpacity?: number;
    cornerRadius?: number;
    glowIntensity?: number;
    borderWidth?: number;
    animated?: boolean;
    // iOS 26 properties
    contentColor?: number;
    ambientLight?: number;
    scrollOpacity?: number;
    scrollVelocity?: number;
    // iOS 26 10/10 advanced properties
    causticIntensity?: number;
    chromaticAberration?: number;
    glassThickness?: number;
    parallaxStrength?: number;
    quality?: number; // 0=LOW, 1=MEDIUM, 2=HIGH, 3=ULTRA
}

const NativeLiquidGlass =
    Platform.OS === 'android'
        ? (requireNativeComponent('LiquidGlassView') as React.ComponentType<NativeLiquidGlassProps>)
        : null;

/* ─── Public API ──────────────────────────────────────────────────────────── */

export interface LiquidGlassProps {
    /** Glow/border accent color. Default: amber #FF9500 */
    glowColor?: string;
    /** Fill tint color. Default: dark navy #1A1A2E */
    tintColor?: string;
    /** Fill opacity 0-1. Default: 0.55 */
    tintOpacity?: number;
    /** Corner radius in dp. Default: 28 */
    cornerRadius?: number;
    /** Glow intensity 0-1. Default: 0.7 */
    glowIntensity?: number;
    /** Border width in dp. Default: 1.8 */
    borderWidth?: number;
    /** Animate the glow pulse. Default: true */
    animated?: boolean;

    // iOS 26 properties (Android only)
    /** Content color beneath for refraction effect */
    contentColor?: number;
    /** Ambient light level 0-1 */
    ambientLight?: number;
    /** Scroll edge opacity 0-1 */
    scrollOpacity?: number;
    /** Scroll velocity for dynamic effects */
    scrollVelocity?: number;

    // iOS 26 10/10 advanced properties (Android ULTRA quality)
    /** Caustic light intensity 0-1. Simulates light focusing through glass. Default: 0.6 */
    causticIntensity?: number;
    /** Chromatic aberration amount 0-1. RGB channel splitting for optical realism. Default: 0.8 */
    chromaticAberration?: number;
    /** Glass thickness in dp. Creates volumetric 3D depth. Default: 12 */
    glassThickness?: number;
    /** Parallax response strength 0-0.5. How much glass responds to touch position. Default: 0.15 */
    parallaxStrength?: number;
    /** Quality level 0-3. 0=LOW, 1=MEDIUM, 2=HIGH, 3=ULTRA. Default: 2 */
    quality?: 0 | 1 | 2 | 3;

    style?: any;
    children?: React.ReactNode;
}

/**
 * `<LiquidGlass>` — iOS 26 Liquid Glass (10/10 Implementation)
 *
 * On Android the glass is rendered by a Kotlin native `Canvas` view with:
 * - **Real-time backdrop blur** with RenderScript
 * - **Volumetric 3D thickness** — side faces with proper shading
 * - **Caustic light effects** — light focusing through glass material
 * - **Chromatic aberration** — RGB channel splitting on ULTRA quality
 * - **Dynamic noise** — temporally varying glass imperfections
 * - **Parallax touch response** — glass responds to finger position
 * - **Touch-responsive morphing** with spring physics
 * - **Content awareness** and color refraction
 * - **13-layer cinematic composition**
 * - **Accessibility-aware** (reduced motion/transparency)
 *
 * Quality levels:
 * - `quality=3` (ULTRA): Full caustics + chromatic aberration + dynamic noise
 * - `quality=2` (HIGH): Caustics + dynamic noise
 * - `quality=1` (MEDIUM): Simplified effects
 * - `quality=0` (LOW): Basic glass (accessibility fallback)
 *
 * On iOS/web it falls back to a CSS-approximated frosted panel.
 */
const LiquidGlass: React.FC<LiquidGlassProps> = ({
    glowColor = '#FF9500',
    tintColor = '#1A1A2E',
    tintOpacity = 0.55,
    cornerRadius = 28,
    glowIntensity = 0.7,
    borderWidth = 1.8,
    animated = true,
    // iOS 26 properties
    contentColor,
    ambientLight = 0.8,
    scrollOpacity = 1.0,
    scrollVelocity = 0,
    // iOS 26 10/10 advanced properties
    causticIntensity = 0.6,
    chromaticAberration = 0.8,
    glassThickness = 12,
    parallaxStrength = 0.15,
    quality = 2,
    style,
    children,
}) => {
    if (NativeLiquidGlass) {
        return (
            <View style={[styles.container, style]}>
                <NativeLiquidGlass
                    glowColor={glowColor}
                    tintColor={tintColor}
                    tintOpacity={tintOpacity}
                    cornerRadius={cornerRadius}
                    glowIntensity={glowIntensity}
                    borderWidth={borderWidth}
                    animated={animated}
                    contentColor={contentColor}
                    ambientLight={ambientLight}
                    scrollOpacity={scrollOpacity}
                    scrollVelocity={scrollVelocity}
                    causticIntensity={causticIntensity}
                    chromaticAberration={chromaticAberration}
                    glassThickness={glassThickness}
                    parallaxStrength={parallaxStrength}
                    quality={quality}
                />
                <View style={styles.content}>{children}</View>
            </View>
        );
    }

    /* ─── Fallback: CSS-based glass (iOS / web) ─────────────────────────────── */
    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: tintColor + Math.round(tintOpacity * 255).toString(16).padStart(2, '0'),
                    borderRadius: cornerRadius,
                    borderWidth,
                    borderColor: glowColor + '66',
                    overflow: 'hidden',
                },
                style,
            ]}
        >
            <View style={styles.content}>{children}</View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        overflow: 'hidden',
    },
    content: {
        flex: 1,
    },
});

export default React.memo(LiquidGlass);
