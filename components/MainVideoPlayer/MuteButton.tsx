import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface MuteButtonProps {
  onPress: () => void;
  isMuted: boolean;
}

export function MuteButton({ onPress, isMuted }: MuteButtonProps) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.container}>
      <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={24} color="white" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 10,
  },
});
