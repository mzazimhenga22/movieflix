import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function NativeAdCard({
  product,
  onPress,
}: {
  product: any;
  onPress?: () => void;
}) {
  if (!product) return null;
  const title = String(product?.title ?? product?.name ?? 'Sponsored');
  return (
    <Pressable onPress={onPress} style={({ focused }: any) => [styles.card, focused ? styles.focused : null]}>
      <Text style={styles.badge}>Sponsored</Text>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      <View style={styles.ctaRow}>
        <Text style={styles.cta}>View</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 420,
    borderRadius: 18,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  focused: {
    transform: [{ scale: 1.03 }],
    borderColor: 'rgba(255,255,255,0.7)',
  },
  badge: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
    opacity: 0.85,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 10,
  },
  ctaRow: {
    marginTop: 14,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#e50914',
  },
  cta: {
    color: '#fff',
    fontWeight: '900',
  },
});
