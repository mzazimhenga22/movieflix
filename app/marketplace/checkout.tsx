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
  createTicketsForPaidOrder,
  getMarketplaceOrderByDocId,
  marketplaceSubmitPaybillReceipt,
  quoteMarketplaceCart,
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
  const [orderDocId, setOrderDocId] = React.useState<string | null>(null);
  const [orderId, setOrderId] = React.useState<string | null>(null);
  const [receiptCode, setReceiptCode] = React.useState('');
  const [submittingReceipt, setSubmittingReceipt] = React.useState(false);
  const [receiptSubmitted, setReceiptSubmitted] = React.useState(false);
  const [checkingStatus, setCheckingStatus] = React.useState(false);
  const { user } = useUser();
  const activeProfile = useActiveProfile();

  const PAYBILL_NUMBER = (process.env.EXPO_PUBLIC_EQUITY_PAYBILL_NUMBER ?? process.env.EXPO_PUBLIC_PAYBILL_NUMBER ?? '247247').trim();
  const PAYBILL_ACCOUNT = (process.env.EXPO_PUBLIC_EQUITY_PAYBILL_ACCOUNT ?? process.env.EXPO_PUBLIC_PAYBILL_ACCOUNT ?? '480755').trim();

  const busyRef = React.useRef(false);
  const fulfilledRef = React.useRef(false);

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

  const startOrder = async () => {
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

    setPlacing(true);
    busyRef.current = true;
    try {
      const { docId, orderId } = await createMarketplaceOrder({
        buyerId: user.uid,
        buyerProfileId: activeProfile?.id ?? null,
        quote,
      });
      setOrderDocId(docId);
      setOrderId(orderId);
      fulfilledRef.current = false;

      setReceiptCode('');
      setReceiptSubmitted(false);

      Alert.alert(
        'Order created',
        `Pay via M-Pesa Paybill\n\nPaybill: ${PAYBILL_NUMBER}\nAccount/Business No: ${PAYBILL_ACCOUNT}\nAmount: ${formatKsh(quote.total)}\n\nUse reference: ${orderId}\n\nAfter payment, paste the M-Pesa receipt code (e.g. QRTSITS25S) below.`
      );
    } catch (err: any) {
      console.error('[marketplace] order start failed', err);
      Alert.alert('Checkout failed', err?.message || 'Unable to start checkout.');
    } finally {
      setPlacing(false);
      busyRef.current = false;
    }
  };

  const submitReceipt = async () => {
    if (submittingReceipt || placing || busyRef.current) return;
    if (!user?.uid) {
      Alert.alert('Sign in required', 'Please sign in to submit your payment.');
      return;
    }
    if (!orderDocId || !orderId || !quote) {
      Alert.alert('Missing order', 'Create an order first.');
      return;
    }

    const code = receiptCode.trim().toUpperCase();
    if (!code) {
      Alert.alert('Receipt required', 'Paste the M-Pesa receipt code you received by SMS (e.g. QRTSITS25S).');
      return;
    }

    if (!/^[A-Z0-9]{10}$/.test(code)) {
      Alert.alert('Invalid receipt code', 'Receipt code should be 10 characters (letters/numbers), e.g. QRTSITS25S.');
      return;
    }

    setSubmittingReceipt(true);
    busyRef.current = true;
    try {
      const firebaseToken = await user.getIdToken();

      await marketplaceSubmitPaybillReceipt({
        firebaseToken,
        orderDocId,
        receiptCode: code,
      });

      setReceiptSubmitted(true);
      Alert.alert('Receipt submitted', 'We received your receipt code. Verification can take a short while.');
    } catch (err: any) {
      console.error('[marketplace] receipt submit failed', err);
      Alert.alert('Submit failed', err?.message || 'Unable to submit receipt right now.');
    } finally {
      setSubmittingReceipt(false);
      busyRef.current = false;
    }
  };

  const checkPaymentStatus = React.useCallback(async (opts?: { silent?: boolean }) => {
    if (checkingStatus || placing || busyRef.current) return;
    if (!user?.uid) {
      Alert.alert('Sign in required', 'Please sign in to check your order.');
      return;
    }
    if (!orderDocId || !orderId || !quote) {
      Alert.alert('Missing order', 'Create an order first.');
      return;
    }

    setCheckingStatus(true);
    busyRef.current = true;
    try {
      const order = await getMarketplaceOrderByDocId(orderDocId);
      const status = String(order?.status ?? '').toLowerCase();
      if (status !== 'paid') {
        if (!opts?.silent) {
          Alert.alert('Not confirmed yet', 'Your payment is not confirmed yet. Please try again shortly.');
        }
        return;
      }

      if (fulfilledRef.current) return;
      fulfilledRef.current = true;

      const buyerName = activeProfile?.name || user.displayName || 'Buyer';
      const buyerEmail = user.email || null;
      await notifySellers({ quote, orderId, buyerName, buyerEmail });

      let ticketsIssued = 0;
      try {
        const { ticketIds } = await createTicketsForPaidOrder({
          orderDocId,
          orderId,
          buyerId: user.uid,
          buyerProfileId: activeProfile?.id ?? null,
          quote,
        });
        ticketsIssued = ticketIds.length;
      } catch (err) {
        console.warn('[marketplace] ticket issue failed', err);
      }

      await new Promise((r) => setTimeout(r, 350));
      await cart.clearCart();
      Alert.alert(
        'Paid',
        ticketsIssued > 0
          ? `Payment confirmed and your order was sent to sellers. Tickets issued: ${ticketsIssued}.`
          : 'Payment confirmed and your order was sent to sellers.'
      );
      router.replace('/marketplace');
    } catch (err: any) {
      console.error('[marketplace] status check failed', err);
      if (!opts?.silent) {
        Alert.alert('Check failed', err?.message || 'Unable to check payment status right now.');
      }
      fulfilledRef.current = false;
    } finally {
      setCheckingStatus(false);
      busyRef.current = false;
    }
  }, [activeProfile?.id, activeProfile?.name, cart, checkingStatus, notifySellers, orderDocId, orderId, placing, quote, router, user]);

  React.useEffect(() => {
    if (!receiptSubmitted) return;
    if (!orderDocId || !orderId || !quote) return;
    const interval = setInterval(() => {
      void checkPaymentStatus({ silent: true });
    }, 6000);

    return () => clearInterval(interval);
  }, [checkPaymentStatus, orderDocId, orderId, quote, receiptSubmitted]);

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
                <Text style={styles.sectionTitle}>Pay with M-Pesa Paybill (Equity)</Text>
                <Text style={styles.mutedNote}>
                  1) Pay via Paybill {PAYBILL_NUMBER} and use account/business no {PAYBILL_ACCOUNT}.
                  {'\n'}2) After payment, paste the M-Pesa receipt code you received by SMS (e.g. QRTSITS25S).
                  {'\n'}3) We’ll verify and complete your order automatically once confirmed.
                </Text>

                <TouchableOpacity
                  style={[styles.primaryBtn, (placing || !quote) && { opacity: 0.6 }]}
                  onPress={startOrder}
                  disabled={placing || !quote}
                >
                  {placing ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="receipt-outline" size={18} color="#fff" />
                      <Text style={styles.primaryBtnText}>Create order · {formatKsh(quote?.total ?? 0)}</Text>
                    </>
                  )}
                </TouchableOpacity>

                {!!orderDocId && (
                  <>
                    <Text style={styles.inputLabel}>M-Pesa receipt code</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="QRTSITS25S"
                      placeholderTextColor="rgba(255,255,255,0.5)"
                      autoCapitalize="characters"
                      value={receiptCode}
                      onChangeText={(t) => setReceiptCode(t.replace(/[^0-9a-zA-Z]/g, '').toUpperCase())}
                      editable={!placing && !submittingReceipt && !checkingStatus}
                    />

                    <TouchableOpacity
                      style={[styles.secondaryBtn, (submittingReceipt || receiptSubmitted) && { opacity: 0.6 }]}
                      onPress={submitReceipt}
                      disabled={submittingReceipt || receiptSubmitted}
                    >
                      {submittingReceipt ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.secondaryBtnText}>{receiptSubmitted ? 'Receipt submitted' : 'Submit receipt'}</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.secondaryBtn, checkingStatus && { opacity: 0.6 }]}
                      onPress={() => checkPaymentStatus()}
                      disabled={checkingStatus}
                    >
                      {checkingStatus ? <ActivityIndicator color="#fff" /> : <Text style={styles.secondaryBtnText}>Check status</Text>}
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/marketplace/cart')} disabled={placing || submittingReceipt || checkingStatus}>
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
