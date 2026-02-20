import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface PipButtonProps {
  onPress: () => void;
  isPipActive: boolean;
}

export function PipButton({ onPress, isPipActive }: PipButtonProps) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.container}>
      <MaterialIcons name={isPipActive ? 'picture-in-picture-alt' : 'picture-in-picture'} size={24} color="white" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 10,
  },
});
