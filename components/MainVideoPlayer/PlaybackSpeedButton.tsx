import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

interface PlaybackSpeedButtonProps {
  onPress: () => void;
  currentSpeed: number;
}

export function PlaybackSpeedButton({ onPress, currentSpeed }: PlaybackSpeedButtonProps) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.container}>
      <Text style={styles.text}>{currentSpeed}x</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 10,
  },
  text: {
    color: 'white',
    fontWeight: 'bold',
  },
});
