import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import ScreenWrapper from '../../components/ScreenWrapper';
import { useMarketplaceCart } from '../../hooks/use-marketplace-cart';
import { useAccent } from '../components/AccentContext';
import { getSellerPaymentDetails, type SellerPaymentDetails } from './api';
import { formatKsh } from '../../lib/money';

const COMMISSION_RATE = 0.05;

const maskTail = (value?: string | null, tail = 4) => {
  if (!value) return '';
  const clean = value.replace(/\s+/g, '');
  if (clean.length <= tail) return clean;
  return `•••• ${clean.slice(-tail)}`;
};

export default function MarketplaceCartScreen() {
  const router = useRouter();
  const cart = useMarketplaceCart();
  const { setAccentColor } = useAccent();

  const platformFee = React.useMemo(() => cart.subtotal * COMMISSION_RATE, [cart.subtotal]);
  const totalWithFee = React.useMemo(() => cart.subtotal + platformFee, [cart.subtotal, platformFee]);

  const [payouts, setPayouts] = React.useState<Record<string, SellerPaymentDetails | null>>({});
  const [payoutsLoading, setPayoutsLoading] = React.useState(false);

  React.useEffect(() => {
    setAccentColor('#e50914');
  }, [setAccentColor]);

  const sellerIds = React.useMemo(() => {
    const set = new Set<string>();
    for (const item of cart.items) {
      if (item.product?.sellerId) set.add(item.product.sellerId);
    }
    return Array.from(set);
  }, [cart.items]);

  const loadPayouts = React.useCallback(async () => {
    if (sellerIds.length === 0) {
      setPayouts({});
      return;
    }
    setPayoutsLoading(true);
    try {
      const entries = await Promise.all(
        sellerIds.map(async (sellerId) => {
          try {
            const details = await getSellerPaymentDetails(sellerId);
            return [sellerId, details] as const;
          } catch (err) {
            console.warn('[marketplace] payout details load failed', sellerId, err);
            return [sellerId, null] as const;
          }
        })
      );
      setPayouts(Object.fromEntries(entries));
    } finally {
      setPayoutsLoading(false);
    }
  }, [sellerIds]);

  React.useEffect(() => {
    void loadPayouts();
  }, [loadPayouts]);

  return (
    <ScreenWrapper>
      <StatusBar barStyle="light-content" backgroundColor="#0E0E0E" />
      <LinearGradient colors={['#e50914', '#150a13', '#05060f'] as const} start={[0, 0]} end={[1, 1]} style={styles.gradient}>
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerCopy}>
              <Text style={styles.headerEyebrow}>Marketplace</Text>
              <Text style={styles.headerTitle}>Cart</Text>
              <Text style={styles.headerSub}>{cart.count} item{cart.count === 1 ? '' : 's'}</Text>
            </View>
            <TouchableOpacity
              style={[styles.headerBtn, cart.count === 0 && { opacity: 0.6 }]}
              onPress={() => router.push('/marketplace/checkout')}
              disabled={cart.count === 0}
            >
              <Ionicons name="cash" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {cart.loading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color="#E50914" />
              <Text style={styles.loadingText}>Loading cart…</Text>
            </View>
          ) : cart.items.length === 0 ? (
            <View style={styles.loading}>
              <Ionicons name="cart-outline" size={40} color="rgba(255,255,255,0.65)" />
              <Text style={styles.loadingText}>Your cart is empty.</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/marketplace')}>
                <Text style={styles.primaryBtnText}>Browse marketplace</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Items</Text>
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert('Clear cart', 'Remove all items from your cart?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Clear', style: 'destructive', onPress: () => void cart.clearCart() },
                      ]);
                    }}
                  >
                    <Text style={styles.sectionLink}>Clear</Text>
                  </TouchableOpacity>
                </View>

                {cart.items.map((item) => (
                  <View key={item.productId} style={styles.itemRow}>
                    <Image source={{ uri: item.product.imageUrl }} style={styles.itemImage} />
                    <View style={styles.itemCopy}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.product.name}
                      </Text>
                      <Text style={styles.itemMeta} numberOfLines={1}>
                        by {item.product.sellerName || 'Creator'}
                      </Text>
                      <Text style={styles.itemPrice}>{formatKsh(Number(item.product.price))}</Text>
                      <View style={styles.qtyRow}>
                        <TouchableOpacity
                          style={styles.qtyBtn}
                          onPress={() => cart.setQuantity(item.productId, item.quantity - 1)}
                        >
                          <Ionicons name="remove" size={16} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.qtyText}>{item.quantity}</Text>
                        <TouchableOpacity
                          style={styles.qtyBtn}
                          onPress={() => cart.setQuantity(item.productId, item.quantity + 1)}
                        >
                          <Ionicons name="add" size={16} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.trashBtn} onPress={() => cart.removeFromCart(item.productId)}>
                          <Ionicons name="trash-outline" size={16} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Seller payment details</Text>
                  <TouchableOpacity style={[styles.refreshBtn, payoutsLoading && { opacity: 0.6 }]} onPress={loadPayouts} disabled={payoutsLoading}>
                    <Ionicons name="refresh" size={16} color="#fff" />
                    <Text style={styles.refreshText}>{payoutsLoading ? 'Loading…' : 'Refresh'}</Text>
                  </TouchableOpacity>
                </View>

                {sellerIds.map((sellerId) => {
                  const details = payouts[sellerId];
                  return (
                    <View key={sellerId} style={styles.payoutCard}>
                      <View style={styles.payoutTop}>
                        <Ionicons name="person-circle" size={22} color="#fff" />
                        <Text style={styles.payoutSeller} numberOfLines={1}>
                          {cart.items.find((i) => i.product.sellerId === sellerId)?.product.sellerName || 'Seller'}
                        </Text>
                        <View style={styles.payoutPill}>
                          <Text style={styles.payoutPillText}>{details?.method ? details.method.toUpperCase() : 'N/A'}</Text>
                        </View>
                      </View>

                      {!details ? (
                        <Text style={styles.payoutMuted}>No payment details provided yet.</Text>
                      ) : details.method === 'paypal' ? (
                        <>
                          <Text style={styles.payoutLine}>PayPal: {details.paypalEmail || '—'}</Text>
                          {!!details.accountName && <Text style={styles.payoutMuted}>Account name: {details.accountName}</Text>}
                        </>
                      ) : details.method === 'bank' ? (
                        <>
                          <Text style={styles.payoutLine}>Bank: {details.bankName || '—'}</Text>
                          <Text style={styles.payoutLine}>Account: {maskTail(details.bankAccountNumber) || '—'}</Text>
                          {!!details.bankRoutingNumber && <Text style={styles.payoutMuted}>Routing: {maskTail(details.bankRoutingNumber)}</Text>}
                          {!!details.accountName && <Text style={styles.payoutMuted}>Account name: {details.accountName}</Text>}
                        </>
                      ) : (
                        <>
                          <Text style={styles.payoutLine}>Network: {details.momoNetwork || '—'}</Text>
                          <Text style={styles.payoutLine}>Number: {maskTail(details.momoNumber) || '—'}</Text>
                          {!!details.accountName && <Text style={styles.payoutMuted}>Account name: {details.accountName}</Text>}
                        </>
                      )}
                    </View>
                  );
                })}
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Summary</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Subtotal</Text>
                  <Text style={styles.summaryValue}>{formatKsh(cart.subtotal)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Platform fee (5%)</Text>
                  <Text style={styles.summaryValue}>{formatKsh(platformFee)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Total</Text>
                  <Text style={styles.summaryValue}>{formatKsh(totalWithFee)}</Text>
                </View>
                <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/marketplace/checkout')}>
                  <Ionicons name="lock-closed-outline" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>Checkout · {formatKsh(totalWithFee)}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </LinearGradient>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  container: {
    flex: 1,
  },
  header: {
    marginHorizontal: 12,
    marginTop: Platform.OS === 'ios' ? 64 : 48,
    marginBottom: 12,
    borderRadius: 18,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  headerCopy: {
    flex: 1,
  },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  headerSub: {
    color: 'rgba(255,255,255,0.72)',
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.9)',
    marginTop: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  scrollContent: {
    paddingBottom: 28,
    paddingHorizontal: 12,
  },
  sectionCard: {
    marginTop: 12,
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  sectionLink: {
    color: '#ffb4b8',
    fontWeight: '800',
  },
  itemRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  itemImage: {
    width: 74,
    height: 74,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  itemCopy: {
    flex: 1,
  },
  itemName: {
    color: '#fff',
    fontWeight: '900',
  },
  itemMeta: {
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
    fontWeight: '700',
    fontSize: 12,
  },
  itemPrice: {
    color: '#fff',
    marginTop: 6,
    fontWeight: '900',
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  qtyBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  qtyText: {
    color: '#fff',
    fontWeight: '900',
    minWidth: 22,
    textAlign: 'center',
  },
  trashBtn: {
    marginLeft: 'auto',
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e50914',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  refreshText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  payoutCard: {
    marginTop: 10,
    borderRadius: 16,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  payoutTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  payoutSeller: {
    flex: 1,
    color: '#fff',
    fontWeight: '900',
  },
  payoutPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  payoutPillText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 12,
  },
  payoutLine: {
    color: 'rgba(255,255,255,0.88)',
    marginTop: 8,
    fontWeight: '700',
  },
  payoutMuted: {
    color: 'rgba(255,255,255,0.62)',
    marginTop: 8,
    fontWeight: '600',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  summaryLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '700',
  },
  summaryValue: {
    color: '#fff',
    fontWeight: '900',
  },
  summaryMuted: {
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '700',
  },
  primaryBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#e50914',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '900',
  },
});
