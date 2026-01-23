import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  mpesaMarketplaceQuery,
  mpesaMarketplaceStkPush,
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
  const [mpesaPhone, setMpesaPhone] = React.useState('');
  const [mpesaBusy, setMpesaBusy] = React.useState(false);
  const [mpesaCheckoutRequestId, setMpesaCheckoutRequestId] = React.useState<string | null>(null);
  const [mpesaStatus, setMpesaStatus] = React.useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = React.useState(false);
  const { user } = useUser();
  const activeProfile = useActiveProfile();

  const MPESA_PHONE_CACHE_KEY = 'marketplaceMpesaPhone';

  const busyRef = React.useRef(false);
  const fulfilledRef = React.useRef(false);

  React.useEffect(() => {
    setAccentColor('#e50914');
  }, [setAccentColor]);

  React.useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(MPESA_PHONE_CACHE_KEY)
      .then((stored) => {
        if (!mounted) return;
        if (stored && stored.trim()) setMpesaPhone(stored.trim());
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [MPESA_PHONE_CACHE_KEY]);

  const isLikelyKenyaPhone = React.useCallback((raw: string) => {
    const cleaned = raw.trim().replace(/^[+]/, '').replace(/\s|-/g, '');
    if (!cleaned) return false;
    if (!/^\d+$/.test(cleaned)) return false;
    return cleaned.startsWith('0') || cleaned.startsWith('254') || cleaned.startsWith('7') || cleaned.startsWith('1');
  }, []);

  const buildLocalQuote = React.useCallback((): MarketplaceCartQuote | null => {
    if (cart.items.length === 0) return null;

    const lines = cart.items
      .map((item) => {
        const quantity = Math.max(1, Math.min(10, Math.floor(Number(item.quantity) || 1)));
        const unitPrice = Math.round(Number(item.product.price));
        if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null;

        return {
          product: item.product as any,
          quantity,
          unitPrice,
          lineTotal: unitPrice * quantity,
        };
      })
      .filter(Boolean) as any[];

    if (lines.length === 0) return null;

    const subtotal = lines.reduce((sum, l) => sum + Number(l.lineTotal ?? 0), 0);
    const platformFee = Math.round(subtotal * 0.05);
    const total = subtotal + platformFee;

    return {
      currency: 'KES',
      lines: lines as any,
      subtotal,
      platformFee,
      total,
    } as MarketplaceCartQuote;
  }, [cart.items]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setQuoteError(null);
        setQuoteLoading(true);

        const local = buildLocalQuote();
        if (!cancelled && local) setQuote(local);

        const q = await quoteMarketplaceCart({
          items: cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          buyerId: user?.uid ?? null,
        });
        if (!cancelled) setQuote(q);
      } catch (err: any) {
        if (!cancelled) {
          const local = buildLocalQuote();
          setQuote(local);
          setQuoteError(err?.message || 'Unable to price your cart right now.');
        }
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [buildLocalQuote, cart.items, user?.uid]);

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

    const activeQuote = quote ?? buildLocalQuote();
    if (!activeQuote || activeQuote.total <= 0) {
      Alert.alert('Unable to checkout', quoteError || 'Please try again.');
      return;
    }

    if (activeQuote.lines.some((l: any) => String(l?.product?.sellerId ?? '').trim() === user.uid)) {
      Alert.alert('Not allowed', 'You cannot purchase your own listing.');
      return;
    }

    if (!mpesaPhone.trim() || !isLikelyKenyaPhone(mpesaPhone)) {
      Alert.alert('Invalid phone', 'Enter a Kenya phone number (e.g. 07XXXXXXXX or 2547XXXXXXXX).');
      return;
    }

    setPlacing(true);
    busyRef.current = true;
    try {
      const firebaseToken = await user.getIdToken(true);

      const { docId, orderId } = await createMarketplaceOrder({
        buyerId: user.uid,
        buyerProfileId: activeProfile?.id ?? null,
        quote: activeQuote,
      });
      setOrderDocId(docId);
      setOrderId(orderId);
      fulfilledRef.current = false;

      setMpesaCheckoutRequestId(null);
      setMpesaStatus(null);

      try {
        await AsyncStorage.setItem(MPESA_PHONE_CACHE_KEY, mpesaPhone.trim());
      } catch {
        // ignore
      }

      setMpesaBusy(true);
      const stk = await mpesaMarketplaceStkPush({
        firebaseToken,
        phone: mpesaPhone.trim(),
        amount: Math.round(activeQuote.total),
        accountReference: orderId,
        transactionDesc: `Marketplace order ${orderId}`,
      });

      setMpesaCheckoutRequestId(stk.checkoutRequestId ?? null);
      setMpesaStatus(stk.customerMessage ?? 'STK push sent. Enter your M-Pesa PIN then tap “Check status”.');

      Alert.alert('Check your phone', stk.customerMessage ?? 'Enter your M-Pesa PIN prompt then tap “Check status”.');
    } catch (err: any) {
      console.error('[marketplace] order start failed', err);
      Alert.alert('Checkout failed', err?.message || 'Unable to start checkout.');
    } finally {
      setPlacing(false);
      setMpesaBusy(false);
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

    if (!mpesaCheckoutRequestId) {
      Alert.alert('Missing request', 'Start payment first to get an STK prompt.');
      return;
    }

    setCheckingStatus(true);
    busyRef.current = true;
    try {
      const firebaseToken = await user.getIdToken(true);
      const res = await mpesaMarketplaceQuery({
        firebaseToken,
        checkoutRequestId: mpesaCheckoutRequestId,
        orderDocId,
      });

      const status = String(res?.order?.status ?? '').toLowerCase();
      const resultCode = res?.resultCode;

      if (status !== 'paid') {
        const desc = res?.resultDesc || (resultCode != null ? `Result code: ${String(resultCode)}` : 'Not confirmed yet');
        setMpesaStatus(desc);
        if (!opts?.silent) {
          Alert.alert('Not confirmed yet', desc);
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
  }, [activeProfile?.id, activeProfile?.name, cart, checkingStatus, mpesaCheckoutRequestId, notifySellers, orderDocId, orderId, placing, quote, router, user]);

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

          {cart.loading || (quoteLoading && !quote) ? (
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
                <Text style={styles.sectionTitle}>Pay with M-Pesa (STK Push)</Text>
                <Text style={styles.mutedNote}>
                  1) Enter your phone number.
                  {'\n'}2) Tap “Create order & pay” to receive an M-Pesa prompt.
                  {'\n'}3) Enter your M-Pesa PIN, then tap “Check status”.
                </Text>

                <Text style={styles.inputLabel}>Phone number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="07XXXXXXXX"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  keyboardType="phone-pad"
                  value={mpesaPhone}
                  onChangeText={(t) => setMpesaPhone(t)}
                  editable={!placing && !mpesaBusy && !checkingStatus}
                />

                {!!mpesaStatus && <Text style={styles.mutedNote}>{mpesaStatus}</Text>}

                <TouchableOpacity
                  style={[styles.primaryBtn, (placing || !quote || (quote?.total ?? 0) <= 0) && { opacity: 0.6 }]}
                  onPress={startOrder}
                  disabled={placing || !quote || (quote?.total ?? 0) <= 0}
                >
                  {placing ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="phone-portrait-outline" size={18} color="#fff" />
                      <Text style={styles.primaryBtnText}>Create order & pay · {formatKsh(quote?.total ?? cart.subtotal ?? 0)}</Text>
                    </>
                  )}
                </TouchableOpacity>

                {!!orderDocId && (
                  <>
                    {mpesaCheckoutRequestId ? (
                      <Text style={styles.mutedNote}>CheckoutRequestID: {mpesaCheckoutRequestId}</Text>
                    ) : null}

                    <TouchableOpacity
                      style={[styles.secondaryBtn, checkingStatus && { opacity: 0.6 }]}
                      onPress={() => checkPaymentStatus()}
                      disabled={checkingStatus}
                    >
                      {checkingStatus ? <ActivityIndicator color="#fff" /> : <Text style={styles.secondaryBtnText}>Check status</Text>}
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/marketplace/cart')} disabled={placing || mpesaBusy || checkingStatus}>
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
