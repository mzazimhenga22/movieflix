import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CallType } from '@/lib/calls/types';

type ControlProps = {
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  speakerOn: boolean;
  callType: CallType;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleSpeaker: () => void;
  onEnd: () => void;
  onOpenFilters?: () => void;
  filterLabel?: string;
};

const CallControls = ({
  isAudioMuted,
  isVideoMuted,
  speakerOn,
  callType,
  onToggleAudio,
  onToggleVideo,
  onToggleSpeaker,
  onEnd,
  onOpenFilters,
  filterLabel,
}: ControlProps) => (
  <View style={styles.container}>
    <ControlButton
      icon={isAudioMuted ? 'mic-off' : 'mic'}
      label={isAudioMuted ? 'Unmute' : 'Mute'}
      onPress={onToggleAudio}
    />
    {callType === 'video' && (
      <ControlButton
        icon={isVideoMuted ? 'videocam-off' : 'videocam'}
        label={isVideoMuted ? 'Camera off' : 'Camera on'}
        onPress={onToggleVideo}
      />
    )}
    <ControlButton
      icon={speakerOn ? 'volume-high' : 'volume-mute'}
      label="Speaker"
      onPress={onToggleSpeaker}
    />
    {callType === 'video' && onOpenFilters ? (
      <ControlButton icon="color-filter" label={filterLabel ? `Filter: ${filterLabel}` : 'Filters'} onPress={onOpenFilters} />
    ) : null}
    <TouchableOpacity style={[styles.controlButton, styles.hangup]} onPress={onEnd}>
      <Ionicons name="call" size={24} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
      <Text style={styles.controlLabel}>Hang up</Text>
    </TouchableOpacity>
  </View>
);

const ControlButton = ({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) => (
  <TouchableOpacity style={styles.controlButton} onPress={onPress}>
    <Ionicons name={icon} size={24} color="#fff" />
    <Text style={styles.controlLabel}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  controlButton: {
    flexGrow: 1,
    flexBasis: 110,
    maxWidth: 160,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    margin: 6,
  },
  controlLabel: {
    marginTop: 6,
    color: '#fff',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  hangup: {
    backgroundColor: '#E50914',
    borderWidth: 1,
    borderColor: '#ff748b',
  },
});

export default CallControls;
