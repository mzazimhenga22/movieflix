import React from 'react';
import { View, Text, StyleSheet, ImageBackground, TouchableOpacity } from 'react-native';
import LiquidGlass from '@/components/app-components/LiquidGlass';

interface Props {
  title: string;
  image: string;
  onPress: () => void;
}

const CategoryCard: React.FC<Props> = ({ title, image, onPress }) => {
  return (
    <TouchableOpacity onPress={onPress} style={styles.container} activeOpacity={0.9}>
      <LiquidGlass
        glowColor="#FF9500"
        tintColor="#1A1A2E"
        tintOpacity={0.45}
        cornerRadius={12}
        glowIntensity={0.6}
        borderWidth={1.2}
        animated={true}
        style={styles.glassContainer}
      >
        <ImageBackground source={{ uri: image }} style={styles.image}>
          <View style={styles.overlay} />
          <Text style={styles.title}>{title}</Text>
        </ImageBackground>
      </LiquidGlass>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 15,
  },
  glassContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  image: {
    flex: 1,
    resizeMode: 'cover',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  title: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
});

export default CategoryCard;