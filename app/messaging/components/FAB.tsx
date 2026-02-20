import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface FABProps {
  onPress: () => void;
}

const FAB = ({ onPress }: FABProps) => (
  <TouchableOpacity style={styles.fab} onPress={onPress} accessibilityLabel="New chat">
    <Ionicons name="chatbubble-ellipses" size={22} color="white" />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 22,
    bottom: 28,
    backgroundColor: '#4D8DFF',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
  },
});

export default FAB;
