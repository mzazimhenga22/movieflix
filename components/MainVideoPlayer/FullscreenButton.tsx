import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface FullscreenButtonProps {
  onPress: () => void;
  isFullscreen: boolean;
}

export function FullscreenButton({ onPress, isFullscreen }: FullscreenButtonProps) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.container}>
      <MaterialCommunityIcons name={isFullscreen ? 'fullscreen-exit' : 'fullscreen'} size={24} color="white" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 10,
  },
});
