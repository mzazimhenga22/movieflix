import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import ScreenWrapper from '../../components/ScreenWrapper';
import { useMarketplaceCart } from '../../hooks/use-marketplace-cart';
import { useActiveProfile } from '../../hooks/use-active-profile';
import { useUser } from '../../hooks/use-user';
import { useAccent } from '../components/AccentContext';
import { findOrCreateConversation, getProfileById, sendMessage, type Profile } from '../messaging/controller';
import { formatKsh } from '../../lib/money';
import {
  createMarketplaceOrder,
  mpesaMarketplaceQuery,
  mpesaMarketplaceStkPush,
  quoteMarketplaceCart,
  updateMarketplaceOrder,
  type MarketplaceCartQuote,
} from './api';

export default function MarketplaceCheckoutScreen() {
  const router = useRouter();
  const cart = useMarketplaceCart();
  const { setAccentColor } = useAccent();
  const [placing, setPlacing] = React.useState(false);
  const [quote, setQuote] = React.useState<MarketplaceCartQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = React.useState(false);
  const [quoteError, setQuoteError] = React.useState<string | null>(null);
  const [phone, setPhone] = React.useState('');
  const [orderDocId, setOrderDocId] = React.useState<string | null>(null);
  const [orderId, setOrderId] = React.useState<string | null>(null);
  const [checkoutRequestId, setCheckoutRequestId] = React.useState<string | null>(null);
  const [verifying, setVerifying] = React.useState(false);
  const { user } = useUser();
  const activeProfile = useActiveProfile();

  const busyRef = React.useRef(false);

  React.useEffect(() => {
    setAccentColor('#e50914');
  }, [setAccentColor]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setQuoteError(null);
        setQuoteLoading(true);
        const q = await quoteMarketplaceCart({
          items: cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          buyerId: user?.uid ?? null,
        });
        if (!cancelled) setQuote(q);
      } catch (err: any) {
        if (!cancelled) {
          setQuote(null);
          setQuoteError(err?.message || 'Unable to price your cart right now.');
        }
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cart.items, user?.uid]);

  const notifySellers = React.useCallback(
    async (args: { quote: MarketplaceCartQuote; orderId: string; buyerName: string; buyerEmail: string | null }) => {
      const groupedBySeller = args.quote.lines.reduce((acc, line) => {
        const sellerId = line.product.sellerId;
        if (!sellerId) return acc;
        (acc[sellerId] ||= []).push(line);
        return acc;
      }, {} as Record<string, typeof args.quote.lines>);

      await Promise.all(
        Object.entries(groupedBySeller).map(async ([sellerId, lines]) => {
          const sellerSubtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
          const profile = await getProfileById(sellerId);
          const sellerProfile: Profile = {
            id: sellerId,
            displayName: profile?.displayName || lines[0]?.product.sellerName || 'Seller',
            photoURL: profile?.photoURL || '',
          };

          const conversationId = await findOrCreateConversation(sellerProfile);

          const itemsText = lines
            .map((l) => `• ${l.quantity}× ${l.product.name} (${formatKsh(l.unitPrice)})`)
            .join('\n');

          const text =
            `Paid order ${args.orderId} received.\n\n` +
            `Items:\n${itemsText}\n\n` +
            `Seller subtotal: ${formatKsh(sellerSubtotal)}\n\n` +
            `Buyer: ${args.buyerName} (${user?.uid ?? 'unknown'})` +
            (args.buyerEmail ? `\nEmail: ${args.buyerEmail}` : '');

          await sendMessage(conversationId, { text, clientId: `order-${args.orderId}-${sellerId}` });
        })
      );
    },
    [user?.uid]
  );

  const startMpesaPayment = async () => {
    if (placing || busyRef.current) return;

    if (cart.items.length === 0) {
      Alert.alert('Cart is empty', 'Add items before checking out.');
      router.replace('/marketplace');
      return;
    }

    if (!user?.uid) {
      Alert.alert('Sign in required', 'Please sign in to complete your purchase.');
      router.push('/profile');
      return;
    }

    if (!quote) {
      Alert.alert('Unable to checkout', quoteError || 'Please try again.');
      return;
    }

    const phoneInput = phone.trim();
    if (!phoneInput) {
      Alert.alert('Phone required', 'Enter your M-Pesa phone number (e.g., 07XXXXXXXX).');
      return;
    }

    setPlacing(true);
    busyRef.current = true;
    try {
      const buyerName = activeProfile?.name || user.displayName || 'Buyer';
      const buyerEmail = user.email || null;

      const { docId, orderId } = await createMarketplaceOrder({
        buyerId: user.uid,
        buyerProfileId: activeProfile?.id ?? null,
        quote,
      });
      setOrderDocId(docId);
      setOrderId(orderId);

      const firebaseToken = await user.getIdToken();
      const pay = await mpesaMarketplaceStkPush({
        firebaseToken,
        phone: phoneInput,
        amount: quote.total,
        accountReference: orderId,
        transactionDesc: `MovieFlix order ${orderId}`,
      });

      if (!pay.checkoutRequestId) throw new Error('Payment request did not return a checkoutRequestId');

      setCheckoutRequestId(pay.checkoutRequestId);

      await updateMarketplaceOrder(docId, {
        payment: {
          method: 'mpesa',
          checkoutRequestId: pay.checkoutRequestId,
          merchantRequestId: pay.merchantRequestId,
          phone: phoneInput,
          amount: pay.amount,
          status: 'initiated',
        },
      });

      Alert.alert('M-Pesa prompt sent', pay.customerMessage || 'Complete the payment on your phone, then verify below.');
    } catch (err: any) {
      console.error('[marketplace] mpesa start failed', err);
      Alert.alert('Payment failed', err?.message || 'Unable to start M-Pesa payment.');
    } finally {
      setPlacing(false);
      busyRef.current = false;
    }
  };

  const verifyMpesaPayment = async () => {
    if (verifying || placing || busyRef.current) return;
    if (!user?.uid) {
      Alert.alert('Sign in required', 'Please sign in to verify your payment.');
      return;
    }
    if (!orderDocId || !orderId || !quote || !checkoutRequestId) {
      Alert.alert('Nothing to verify', 'Start a payment first.');
      return;
    }

    setVerifying(true);
    busyRef.current = true;
    try {
      const firebaseToken = await user.getIdToken();
      const result = await mpesaMarketplaceQuery({ firebaseToken, checkoutRequestId, orderDocId });
      const ok = String(result.resultCode ?? '') === '0';

      if (!ok) {
        Alert.alert('Not paid yet', result.resultDesc || 'Complete the payment on your phone, then try again.');
        return;
      }

      const buyerName = activeProfile?.name || user.displayName || 'Buyer';
      const buyerEmail = user.email || null;
      await notifySellers({ quote, orderId, buyerName, buyerEmail });

      await new Promise((r) => setTimeout(r, 350));
      await cart.clearCart();
      Alert.alert('Paid', 'Payment confirmed and your order was sent to sellers.');
      router.replace('/marketplace');
    } catch (err: any) {
      console.error('[marketplace] mpesa verify failed', err);
      Alert.alert('Verify failed', err?.message || 'Unable to verify payment right now.');
    } finally {
      setVerifying(false);
      busyRef.current = false;
    }
  };

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
              <Text style={styles.headerTitle}>Checkout</Text>
              <Text style={styles.headerSub}>Review and place your order</Text>
            </View>
            <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/marketplace/cart')}>
              <Ionicons name="cart" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {cart.loading || quoteLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color="#E50914" />
              <Text style={styles.loadingText}>Preparing checkout…</Text>
            </View>
          ) : cart.items.length === 0 ? (
            <View style={styles.loading}>
              <Text style={styles.loadingText}>Your cart is empty.</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/marketplace')}>
                <Text style={styles.primaryBtnText}>Browse marketplace</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              {!!quoteError && (
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Checkout issue</Text>
                  <Text style={styles.mutedNote}>{quoteError}</Text>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/marketplace/cart')}>
                    <Text style={styles.secondaryBtnText}>Back to cart</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Order summary</Text>
                {(quote?.lines || []).length > 0
                  ? quote!.lines.map((line) => (
                      <View key={line.product.id} style={styles.lineItem}>
                        <View style={styles.lineLeft}>
                          <Text style={styles.lineName} numberOfLines={1}>
                            {line.product.name}
                          </Text>
                          <Text style={styles.lineMeta} numberOfLines={1}>
                            {line.quantity} × {formatKsh(line.unitPrice)}
                          </Text>
                        </View>
                        <Text style={styles.lineTotal}>{formatKsh(line.lineTotal)}</Text>
                      </View>
                    ))
                  : cart.items.map((item) => (
                      <View key={item.productId} style={styles.lineItem}>
                        <View style={styles.lineLeft}>
                          <Text style={styles.lineName} numberOfLines={1}>
                            {item.product.name}
                          </Text>
                          <Text style={styles.lineMeta} numberOfLines={1}>
                            {item.quantity} × {formatKsh(Number(item.product.price))}
                          </Text>
                        </View>
                        <Text style={styles.lineTotal}>{formatKsh(item.quantity * Number(item.product.price))}</Text>
                      </View>
                    ))}

                <View style={styles.divider} />
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Subtotal</Text>
                  <Text style={styles.totalValue}>{formatKsh(quote?.subtotal ?? cart.subtotal)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Platform fee (5%)</Text>
                  <Text style={styles.totalValue}>{formatKsh(quote?.platformFee ?? 0)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>{formatKsh(quote?.total ?? cart.subtotal)}</Text>
                </View>
                <Text style={styles.mutedNote}>A 5% platform fee is added to every purchase.</Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Pay with M-Pesa</Text>
                <Text style={styles.mutedNote}>
                  We’ll send an STK prompt to your phone. After you approve it, tap “Verify payment” to confirm.
                </Text>
                <Text style={styles.inputLabel}>Phone number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="07XXXXXXXX"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={(t) => setPhone(t.replace(/[^0-9+]/g, ''))}
                  editable={!placing && !verifying}
                />

                <TouchableOpacity
                  style={[styles.primaryBtn, (placing || !quote) && { opacity: 0.6 }]}
                  onPress={startMpesaPayment}
                  disabled={placing || !quote}
                >
                  {placing ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="phone-portrait-outline" size={18} color="#fff" />
                      <Text style={styles.primaryBtnText}>Pay · {formatKsh(quote?.total ?? 0)}</Text>
                    </>
                  )}
                </TouchableOpacity>

                {!!checkoutRequestId && (
                  <TouchableOpacity
                    style={[styles.secondaryBtn, verifying && { opacity: 0.6 }]}
                    onPress={verifyMpesaPayment}
                    disabled={verifying}
                  >
                    {verifying ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.secondaryBtnText}>Verify payment</Text>
                    )}
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/marketplace/cart')} disabled={placing || verifying}>
                  <Text style={styles.secondaryBtnText}>Back to cart</Text>
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
    paddingHorizontal: 12,
    paddingBottom: 28,
  },
  card: {
    marginTop: 12,
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 10,
  },
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  lineLeft: {
    flex: 1,
  },
  lineName: {
    color: '#fff',
    fontWeight: '900',
  },
  lineMeta: {
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
    fontWeight: '700',
    fontSize: 12,
  },
  lineTotal: {
    color: '#fff',
    fontWeight: '900',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
    marginTop: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  totalLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '800',
  },
  totalValue: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 16,
  },
  mutedNote: {
    color: 'rgba(255,255,255,0.62)',
    marginTop: 10,
    fontWeight: '600',
    lineHeight: 18,
  },
  inputLabel: {
    color: 'rgba(255,255,255,0.82)',
    fontWeight: '800',
    marginTop: 10,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    fontWeight: '700',
  },
  primaryBtn: {
    marginTop: 12,
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
  secondaryBtn: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#fff',
    fontWeight: '800',
  },
});
