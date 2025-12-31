import React from 'react';
import { TouchableOpacity, Image, Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { formatKsh } from '../../../lib/money';

interface Product {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  description: string;
  sellerName?: string;
  sellerAvatar?: string | null;
  promoted?: boolean;
}

interface ProductCardProps {
  product: Product;
  onPress: () => void;
  onMessage?: () => void;
}

export default function ProductCard({ product, onPress, onMessage }: ProductCardProps) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <Image source={{ uri: product.imageUrl }} style={styles.image} />
      <View style={styles.infoContainer}>
        <Text style={styles.name}>{product.name}</Text>
        {!!product.promoted && (
          <View style={styles.promotedPill}>
            <Ionicons name="sparkles" size={12} color="#fff" />
            <Text style={styles.promotedText}>Sponsored</Text>
          </View>
        )}
        <Text style={styles.price}>{formatKsh(product.price)}</Text>
        {(product.sellerName || product.sellerAvatar) && (
          <View style={styles.sellerRow}>
            <View style={styles.sellerAvatarWrap}>
              {product.sellerAvatar ? (
                <Image source={{ uri: product.sellerAvatar }} style={styles.sellerAvatarImage} />
              ) : (
                <View style={styles.sellerFallback}>
                  <Text style={styles.sellerInitial}>
                    {(product.sellerName || 'U').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.sellerCopy}>
              <Text style={styles.sellerLabel}>by {product.sellerName || 'Creator'}</Text>
              <Text style={styles.sellerSub}>Tap to view details</Text>
            </View>
            {onMessage && (
              <TouchableOpacity
                style={styles.messageBtn}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  onMessage();
                }}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel="Message seller"
              >
                <Ionicons name="chatbubble-outline" size={16} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '48%', // Roughly half width, adjusted for margin
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    marginVertical: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
    elevation: 5,
  },
  image: {
    width: '100%',
    height: 150,
    resizeMode: 'cover',
  },
  infoContainer: {
    padding: 10,
  },
  name: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 5,
  },
  price: {
    fontSize: 14,
    color: '#E50914',
    fontWeight: '600',
  },
  promotedPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#e50914',
    marginTop: 8,
  },
  promotedText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 11,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 8,
  },
  sellerAvatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerAvatarImage: {
    width: '100%',
    height: '100%',
  },
  sellerFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerInitial: {
    color: '#fff',
    fontWeight: '700',
  },
  sellerCopy: {
    flex: 1,
  },
  sellerLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  sellerSub: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
  },
  messageBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e50914',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
