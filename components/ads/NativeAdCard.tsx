import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAccent } from '../../app/components/AccentContext';
import type { Product } from '../../app/marketplace/api';

export default function NativeAdCard({
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
        colors={[`rgba(229,9,20,0.14)`, 'rgba(10,12,24,0.60)'] as const}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.row}>
        <View style={[styles.badge, { borderColor: `rgba(255,255,255,0.14)` }]}>
          <Text style={styles.badgeText}>Sponsored</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {product.name}
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {product.description}
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={onPress}
          style={[styles.cta, { backgroundColor: accent }]}
        >
          <Ionicons name="cart-outline" size={16} color="#fff" />
          <Text style={styles.ctaText}>Shop</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(5,6,15,0.55)',
    padding: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
  },
  badgeText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '800',
  },
  title: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
  },
  ctaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
});
