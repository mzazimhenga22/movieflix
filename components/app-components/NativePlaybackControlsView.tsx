import React from 'react';
import { requireNativeComponent, ViewProps, Platform, View } from 'react-native';
import type { NativeSyntheticEvent } from 'react-native/Libraries/Types/CoreEventTypes';

type SeekEvent = NativeSyntheticEvent<{ positionMs: number }>;

interface NativePlaybackControlsViewProps extends ViewProps {
  durationMs: number;
  positionMs: number;
  accentColor?: string;
  onSeekStart?: (event: SeekEvent) => void;
  onSeek?: (event: SeekEvent) => void;
  onSeekComplete?: (event: SeekEvent) => void;
}

let NativeComp: React.ComponentType<NativePlaybackControlsViewProps> | null = null;

try {
  if (Platform.OS === 'android') {
    NativeComp = requireNativeComponent<NativePlaybackControlsViewProps>('NativePlaybackControlsView');
  }
} catch (e) {
  console.warn('NativePlaybackControlsView not found:', e);
}

const NativePlaybackControlsView = (props: NativePlaybackControlsViewProps) => {
  if (!NativeComp) return <View {...props} />;
  return <NativeComp {...props} />;
};

export default NativePlaybackControlsView;
