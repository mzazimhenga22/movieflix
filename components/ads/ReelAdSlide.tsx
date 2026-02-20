import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAccent } from '../../app/components/AccentContext';
import type { Product } from '../../app/marketplace/api';

export default function ReelAdSlide({
  product,
  onPress,
}: {
  product: Product;
  onPress?: () => void;
}) {
  const { accentColor } = useAccent();
  const accent = accentColor || '#e50914';

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={['#050509', '#120914', '#0b0620', '#05060f'] as const}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.center}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Sponsored</Text>
        </View>
        <Text style={styles.title}>Ad</Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {product.name} · ${Number(product.price ?? 0).toFixed(2)}
        </Text>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={onPress}
          style={[styles.cta, { backgroundColor: accent }]}
        >
          <Ionicons name="cart-outline" size={18} color="#fff" />
          <Text style={styles.ctaText}>Shop</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 12,
  },
  badgeText: {
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '900',
    fontSize: 12,
  },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 8,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  ctaText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
});
