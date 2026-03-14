import React from 'react';
import { requireNativeComponent, UIManager, View } from 'react-native';
import type { ViewStyle } from 'react-native/Libraries/StyleSheet/StyleSheetTypes';
import type { NativeSyntheticEvent } from 'react-native/Libraries/Types/CoreEventTypes';

interface NativeStoryViewProps {
    stories: string;
    initialStoryIndex?: number;
    initialMediaIndex?: number;
    style?: ViewStyle | ViewStyle[];
    onStoryChange?: (event: NativeSyntheticEvent<{ index: number }>) => void;
    onMediaChange?: (event: NativeSyntheticEvent<{ storyIndex: number; mediaIndex: number }>) => void;
    onClose?: (event: NativeSyntheticEvent<{}>) => void;
    onReply?: (event: NativeSyntheticEvent<{ storyId: string }>) => void;
    onSwipeUp?: (event: NativeSyntheticEvent<{}>) => void;
}

let NativeStoryViewComponent: React.ComponentType<NativeStoryViewProps> | null = null;

if (UIManager.getViewManagerConfig('StoryView') != null) {
    try {
        NativeStoryViewComponent = requireNativeComponent('StoryView');
    } catch (e) {
        console.warn('StoryView native component not found');
    }
} else {
    // Silently fall back
}

export const NativeStoryView: React.FC<NativeStoryViewProps> = (props) => {
    if (!NativeStoryViewComponent) return <View {...props as any} />;
    return <NativeStoryViewComponent {...props} style={[{ flex: 1 }, props.style] as any} />;
};
