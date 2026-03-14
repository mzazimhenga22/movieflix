import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import FlixyOrbTV from './components/FlixyOrbTV';

export default function FlixyScreen() {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0a0a0a', '#050505', '#000000']}
        style={StyleSheet.absoluteFill}
      />
      <FlixyOrbTV size={200} isFocused isActive accent="#e50914" />
      <Text style={styles.title}>Hi, I'm Flixy!</Text>
      <Text style={styles.subtitle}>Your MovieFlix TV companion</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  title: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '800',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 24,
  },
});
