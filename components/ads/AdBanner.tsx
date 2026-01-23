import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { trackPromotionClick, trackPromotionImpression } from '../../app/marketplace/api';
import { usePromotedProducts } from '../../hooks/use-promoted-products';
import { useNavigationGuard } from '../../hooks/use-navigation-guard';
import { useSubscription } from '../../providers/SubscriptionProvider';

export default function AdBanner({ placement = 'feed' }: { placement?: 'feed' | 'story' | 'search' }) {
  const router = useRouter();
  const { deferNav } = useNavigationGuard({ cooldownMs: 900 });
  const { currentPlan } = useSubscription();
  const { products } = usePromotedProducts({ placement, limit: 20 });

  const pickRef = useRef(Math.floor(Math.random() * 10_000));
  const lastImpressionIdRef = useRef<string | null>(null);
  const product = useMemo(() => {
    if (!products.length) return null;
    return products[pickRef.current % products.length];
  }, [products]);

  // best-effort: count one impression per picked product per mount
  useEffect(() => {
    if (currentPlan !== 'free') return;
    if (!product?.id) return;
    if (lastImpressionIdRef.current === product.id) return;
    lastImpressionIdRef.current = product.id;
    void trackPromotionImpression({ productId: product.id, placement }).catch(() => {});
  }, [currentPlan, placement, product?.id]);

  if (currentPlan !== 'free') return null;
  if (!product?.id) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => {
        void trackPromotionClick({ productId: product.id, placement }).catch(() => {});
        deferNav(() => router.push((`/marketplace/${product.id}`) as any));
      }}
      style={styles.wrap}
    >
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Sponsored</Text>
      </View>
      <Text style={styles.text} numberOfLines={1} ellipsizeMode="tail">
        {product.name}
      </Text>
      <Text style={styles.price} numberOfLines={1} ellipsizeMode="tail">
        ${Number(product.price ?? 0).toFixed(2)}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(229,9,20,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.30)',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  text: {
    color: 'rgba(255,255,255,0.85)',
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  price: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '800',
  },
});
