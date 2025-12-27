import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Product } from '../app/marketplace/api';
import { buildProfileScopedKey } from '../lib/profileStorage';
import { useActiveProfile } from './use-active-profile';

export type CartProductSnapshot = Pick<
  Product,
  'id' | 'name' | 'price' | 'imageUrl' | 'sellerId' | 'sellerName'
>;

export type MarketplaceCartItem = {
  productId: string;
  quantity: number;
  addedAt: number;
  product: CartProductSnapshot;
};

const CART_STORAGE_KEY = 'marketplaceCart';

const MAX_UNIQUE_ITEMS = 25;
const MAX_QTY_PER_ITEM = 10;

const safeParse = (raw: string | null): MarketplaceCartItem[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as MarketplaceCartItem[];
  } catch {
    return [];
  }
};

export function useMarketplaceCart() {
  const activeProfile = useActiveProfile();
  const storageKey = useMemo(
    () => buildProfileScopedKey(CART_STORAGE_KEY, activeProfile?.id ?? null),
    [activeProfile?.id]
  );

  const [items, setItems] = useState<MarketplaceCartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      setItems(safeParse(raw));
    } finally {
      setLoading(false);
    }
  }, [storageKey]);

  const schedulePersist = useCallback(
    (next: MarketplaceCartItem[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void AsyncStorage.setItem(storageKey, JSON.stringify(next));
      }, 60);
    },
    [storageKey]
  );

  useEffect(() => {
    void load();
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [load]);

  const addToCart = useCallback(
    (product: Product & { id: string }, quantity = 1) => {
      const snapshot: CartProductSnapshot = {
        id: product.id,
        name: product.name,
        price: product.price,
        imageUrl: product.imageUrl,
        sellerId: product.sellerId,
        sellerName: product.sellerName,
      };

      const qtyToAdd = Math.max(1, Math.min(MAX_QTY_PER_ITEM, Math.floor(quantity)));

      setItems((prev) => {
        const idx = prev.findIndex((i) => i.productId === product.id);
        const next = [...prev];
        if (idx >= 0) {
          const existing = next[idx];
          next[idx] = {
            ...existing,
            quantity: Math.max(1, Math.min(MAX_QTY_PER_ITEM, existing.quantity + qtyToAdd)),
            product: snapshot,
          };
        } else {
          if (next.length >= MAX_UNIQUE_ITEMS) return prev;
          next.unshift({ productId: product.id, quantity: qtyToAdd, addedAt: Date.now(), product: snapshot });
        }
        schedulePersist(next);
        return next;
      });

      return true;
    },
    [schedulePersist]
  );

  const setQuantity = useCallback(
    (productId: string, quantity: number) => {
      setItems((prev) => {
        const nextQty = Math.max(0, Math.min(MAX_QTY_PER_ITEM, Math.floor(quantity)));
        const next = prev
          .map((i) => (i.productId === productId ? { ...i, quantity: nextQty } : i))
          .filter((i) => i.quantity > 0);
        schedulePersist(next);
        return next;
      });
    },
    [schedulePersist]
  );

  const removeFromCart = useCallback(
    (productId: string) => {
      setItems((prev) => {
        const next = prev.filter((i) => i.productId !== productId);
        schedulePersist(next);
        return next;
      });
    },
    [schedulePersist]
  );

  const clearCart = useCallback(async () => {
    setItems([]);
    await AsyncStorage.removeItem(storageKey);
  }, [storageKey]);

  const count = useMemo(() => items.reduce((acc, i) => acc + i.quantity, 0), [items]);
  const subtotal = useMemo(
    () =>
      items.reduce((acc, i) => {
        const price = Number(i.product.price);
        return acc + i.quantity * (Number.isFinite(price) ? price : 0);
      }, 0),
    [items]
  );

  return {
    items,
    loading,
    count,
    subtotal,
    reload: load,
    addToCart,
    setQuantity,
    removeFromCart,
    clearCart,
  };
}
