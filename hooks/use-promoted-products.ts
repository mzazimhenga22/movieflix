import { useEffect, useMemo, useState } from 'react';

import { getProducts, isProductPromoted, type Product } from '../app/marketplace/api';

type Placement = 'search' | 'story' | 'feed';

const scorePromotedProduct = (product: Product) => {
  const bid = Number(product.promotionBid ?? 0);
  const weight = Number(product.promotionWeight ?? 1);
  const createdAtMs =
    typeof (product as any)?.createdAt?.toMillis === 'function'
      ? (product as any).createdAt.toMillis()
      : Date.now();
  const ageHours = Math.max(1, (Date.now() - createdAtMs) / (1000 * 60 * 60));
  const freshnessBoost = Math.max(0.2, 1 - ageHours / 72);
  const randomJitter = Math.random() * 0.35;
  return bid * 0.6 + weight * 0.25 + freshnessBoost * 0.15 + randomJitter;
};

export function usePromotedProducts(opts?: { placement?: Placement; limit?: number }) {
  const placement = opts?.placement;
  const limit = opts?.limit;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const all = await getProducts();
        const promoted = all.filter((p) => isProductPromoted(p, placement));
        const scored = promoted
          .map((p) => ({ p, score: scorePromotedProduct(p) }))
          .sort((a, b) => b.score - a.score)
          .map((e) => e.p);
        const finalList = typeof limit === 'number' && limit > 0 ? scored.slice(0, limit) : scored;
        if (!cancelled) setProducts(finalList);
      } catch {
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [placement, limit]);

  const hasAds = useMemo(() => products.length > 0, [products.length]);

  return { products, hasAds, loading };
}
