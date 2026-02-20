import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface SeekButtonProps {
  onPress: () => void;
  isForward: boolean;
}

export function SeekButton({ onPress, isForward }: SeekButtonProps) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.container}>
      <MaterialIcons name={isForward ? 'forward-10' : 'replay-10'} size={24} color="white" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 10,
  },
});
