import React, { useMemo } from 'react';
import {
    Platform,
    requireNativeComponent,
    StyleSheet,
    UIManager,
    View,
} from 'react-native';

const NATIVE_COMPONENT_NAME = 'LiquidSliderView';

interface NativeSliderProps {
    progress?: number;
    onValueChange?: (event: any) => void;
    onSlidingComplete?: (event: any) => void;
    style?: any;
}

let NativeSlider: React.ComponentType<NativeSliderProps> | null = null;

const getNativeSlider = () => {
    if (Platform.OS !== 'android') return null;
    if (!NativeSlider) {
        if (UIManager.getViewManagerConfig(NATIVE_COMPONENT_NAME) != null) {
            NativeSlider = requireNativeComponent(NATIVE_COMPONENT_NAME);
        }
    }
    return NativeSlider;
};

export interface LiquidSliderProps {
    progress?: number; // 0.0 to 1.0
    onValueChange?: (value: number) => void;
    onSlidingComplete?: (value: number) => void;
    width?: number;
    style?: any;
}

export const LiquidSlider: React.FC<LiquidSliderProps> = ({
    progress = 0.5,
    onValueChange,
    onSlidingComplete,
    width = 250,
    style,
}) => {
    const NativeComponent = useMemo(() => getNativeSlider(), []);

    const handleValueChange = (event: any) => {
        onValueChange?.(event.nativeEvent.value);
    };

    const handleSlidingComplete = (event: any) => {
        onSlidingComplete?.(event.nativeEvent.value);
    };

    if (!NativeComponent) {
        // Fallback for iOS/Web or if manager isn't registered yet
        return (
            <View style={[styles.fallbackTrack, { width }, style]}>
                <View style={[styles.fallbackThumb, { left: `${progress * 100}%` }]} />
            </View>
        );
    }

    return (
        <View style={[{ width, height: 60, justifyContent: 'center' }, style]} pointerEvents="auto">
            <NativeComponent
                style={StyleSheet.absoluteFill}
                progress={progress}
                onValueChange={handleValueChange}
                onSlidingComplete={handleSlidingComplete}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    fallbackTrack: {
        height: 16,
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: 8,
        justifyContent: 'center',
        overflow: 'visible',
    },
    fallbackThumb: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#fff',
        position: 'absolute',
        marginLeft: -12,
    },
});
