import React from 'react';
import { requireNativeComponent } from 'react-native';
import type { NativeSyntheticEvent } from 'react-native/Libraries/Types/CoreEventTypes';
import type { ViewStyle } from 'react-native/Libraries/StyleSheet/StyleSheetTypes';

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

const NativeStoryViewComponent = requireNativeComponent('StoryView') as React.ComponentType<NativeStoryViewProps>;

export const NativeStoryView: React.FC<NativeStoryViewProps> = (props) => {
    return <NativeStoryViewComponent {...props} style={[{ flex: 1 }, props.style] as any} />;
};
