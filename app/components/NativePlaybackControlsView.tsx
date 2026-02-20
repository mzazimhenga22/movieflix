import React from 'react';
import { requireNativeComponent, ViewProps } from 'react-native';
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

const NativePlaybackControlsView = requireNativeComponent<NativePlaybackControlsViewProps>('NativePlaybackControlsView');

export default NativePlaybackControlsView;
