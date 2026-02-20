import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface PlayPauseButtonProps {
  isPlaying: boolean;
  onPress: () => void;
}

export function PlayPauseButton({ isPlaying, onPress }: PlayPauseButtonProps) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.container}>
      <Ionicons name={isPlaying ? 'pause' : 'play'} size={32} color="white" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 10,
  },
});
