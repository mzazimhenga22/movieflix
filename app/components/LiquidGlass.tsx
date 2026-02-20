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

    style?: any;
    children?: React.ReactNode;
}

/**
 * `<LiquidGlass>` — iOS 26 liquid-glass panel.
 *
 * On Android the glass is rendered by a Kotlin native `Canvas` view with:
 * - Touch-responsive morphing
 * - Content awareness and refraction
 * - Multi-layer composition
 * - Hardware-informed curvature
 * - Scroll edge integration
 * - Accessibility-aware (reduced motion/transparency)
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
