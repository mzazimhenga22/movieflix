import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Share,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import ScreenWrapper from '../../components/ScreenWrapper';
import { useActiveProfile } from '../../hooks/use-active-profile';
import { useMarketplaceCart } from '../../hooks/use-marketplace-cart';
import { useUser } from '../../hooks/use-user';
import { useAccent } from '../components/AccentContext';
import { findOrCreateConversation, getProfileById, type Profile } from '../messaging/controller';
import { getProductById, reportMarketplaceProduct, type Product } from './api';
import { formatKsh } from '../../lib/money';

export default function MarketplaceProductDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { setAccentColor } = useAccent();
  const activeProfile = useActiveProfile();
  const cart = useMarketplaceCart();
  const { user } = useUser();

  const [product, setProduct] = React.useState<(Product & { id: string }) | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [messagingBusy, setMessagingBusy] = React.useState(false);

  React.useEffect(() => {
    setAccentColor('#e50914');
  }, [setAccentColor]);

  React.useEffect(() => {
    const productId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : undefined;
    if (!productId) {
      setLoading(false);
      setProduct(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const fetched = await getProductById(productId);
        if (!cancelled) setProduct(fetched && fetched.id ? (fetched as any) : null);
      } catch (err) {
        console.error('[marketplace] getProductById failed', err);
        if (!cancelled) setProduct(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleMessageSeller = React.useCallback(async () => {
    if (!product) return;
    if (messagingBusy) return;
    if (!product.sellerProfileId && !product.sellerId) {
      Alert.alert('Unavailable', 'Seller messaging is unavailable for this listing.');
      return;
    }

    setMessagingBusy(true);
    try {
      const profile =
        (product.sellerProfileId && (await getProfileById(product.sellerProfileId))) ||
        (await getProfileById(product.sellerId));

      if (!profile) {
        Alert.alert('Unavailable', 'Seller profile not found yet.');
        return;
      }

      const sellerProfile: Profile = {
        id: profile.id,
        displayName: profile.displayName || product.sellerName || 'Seller',
        photoURL: profile.photoURL || product.sellerAvatar || product.imageUrl,
      };

      const conversationId = await findOrCreateConversation(sellerProfile);
      router.push({ pathname: '/messaging/chat/[id]', params: { id: conversationId } });
    } catch (err) {
      console.error('[marketplace] message seller failed', err);
      Alert.alert('Unable to start chat', 'Please try again in a moment.');
    } finally {
      setMessagingBusy(false);
    }
  }, [messagingBusy, product, router]);

  const productName = product?.name ?? 'Product';

  const handleShare = React.useCallback(async () => {
    if (!product) return;
    try {
      const message = `Check out “${product.name}” on MovieFlix Marketplace — ${formatKsh(Number(product.price))}.`;
      await Share.share({ message });
    } catch {
      // ignore
    }
  }, [product]);

  const handleReport = React.useCallback(async () => {
    if (!product) return;
    if (!user?.uid) {
      Alert.alert('Sign in required', 'Please sign in to report listings.');
      router.push('/profile');
      return;
    }

    const submit = async (reason: string) => {
      try {
        await reportMarketplaceProduct({
          productId: product.id!,
          reporterId: user.uid,
          reporterProfileId: activeProfile?.id ?? null,
          reason,
        });
        Alert.alert('Reported', 'Thanks — our team will review this listing.');
      } catch (err: any) {
        Alert.alert('Report failed', err?.message || 'Unable to submit report right now.');
      }
    };

    Alert.alert('Report listing', 'What’s the issue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Scam / Fraud', onPress: () => void submit('Scam / Fraud') },
      { text: 'Prohibited item', onPress: () => void submit('Prohibited item') },
      { text: 'Counterfeit / fake', onPress: () => void submit('Counterfeit / fake') },
      { text: 'Spam', onPress: () => void submit('Spam') },
      { text: 'Other', onPress: () => void submit('Other') },
    ]);
  }, [activeProfile?.id, product, router, user?.uid]);

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
              <Text style={styles.headerTitle} numberOfLines={1}>
                {productName}
              </Text>
              <Text style={styles.headerSub} numberOfLines={1}>
                {activeProfile?.name ? `Shopping as ${activeProfile.name}` : 'Product details'}
              </Text>
            </View>
            <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/marketplace/cart')}>
              <View>
                <Ionicons name="cart" size={22} color="#fff" />
                {cart.count > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{cart.count > 9 ? '9+' : String(cart.count)}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color="#E50914" />
              <Text style={styles.loadingText}>Loading product…</Text>
            </View>
          ) : !product ? (
            <View style={styles.loading}>
              <Text style={styles.loadingText}>Product not found.</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/marketplace')}>
                <Text style={styles.primaryBtnText}>Back to marketplace</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.mediaWrap}>
                  <Image source={{ uri: product.imageUrl }} style={styles.image} />
                  <LinearGradient
                    colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.75)'] as const}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.imageFade}
                  />
                  <View style={styles.imageMeta}>
                    <Text style={styles.price}>{formatKsh(Number(product.price))}</Text>
                    <Text style={styles.category} numberOfLines={1}>
                      {(product.categoryKey || product.category || 'listing').toString()}
                    </Text>
                  </View>
                </View>

                <View style={styles.card}>
                  <Text style={styles.name}>{product.name}</Text>
                  <Text style={styles.description}>{product.description}</Text>

                  <View style={styles.sellerCard}>
                    <View style={styles.sellerAvatarWrap}>
                      {product.sellerAvatar ? (
                        <Image source={{ uri: product.sellerAvatar }} style={styles.sellerAvatar} />
                      ) : (
                        <View style={styles.sellerFallback}>
                          <Text style={styles.sellerInitial}>{(product.sellerName || 'S').charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.sellerCopy}>
                      <Text style={styles.sellerLabel}>Seller</Text>
                      <Text style={styles.sellerName} numberOfLines={1}>
                        {product.sellerName || 'Creator'}
                      </Text>
                      {!!product.sellerContact && (
                        <Text style={styles.sellerContact} numberOfLines={1}>
                          {product.sellerContact}
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={[styles.messageBtn, messagingBusy && { opacity: 0.6 }]}
                      onPress={handleMessageSeller}
                      disabled={messagingBusy}
                    >
                      <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" />
                      <Text style={styles.messageBtnText}>{messagingBusy ? 'Starting…' : 'Message'}</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.ctaRow}>
                    <TouchableOpacity
                      style={styles.secondaryBtn}
                      onPress={() => {
                        cart.addToCart(product, 1);
                        Alert.alert('Added to cart', `${product.name} was added to your cart.`);
                      }}
                    >
                      <Ionicons name="add-circle-outline" size={18} color="#fff" />
                      <Text style={styles.secondaryBtnText}>Add to cart</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.primaryBtn}
                      onPress={() => {
                        cart.addToCart(product, 1);
                        router.push('/marketplace/checkout');
                      }}
                    >
                      <Ionicons name="flash-outline" size={18} color="#fff" />
                      <Text style={styles.primaryBtnText}>Buy now</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/marketplace/cart')}>
                    <Ionicons name="cart-outline" size={18} color="rgba(255,255,255,0.85)" />
                    <Text style={styles.linkText}>View cart & checkout</Text>
                    <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
                  </TouchableOpacity>

                  <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
                      <Ionicons name="share-outline" size={18} color="#fff" />
                      <Text style={styles.actionText}>Share</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, styles.reportBtn]} onPress={handleReport}>
                      <Ionicons name="flag-outline" size={18} color="#fff" />
                      <Text style={styles.actionText}>Report</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            </>
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
    paddingBottom: 0,
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
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: '#ff8a00',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.35)',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
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
  },
  mediaWrap: {
    marginHorizontal: 12,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  image: {
    width: '100%',
    height: 340,
  },
  imageFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 180,
  },
  imageMeta: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  price: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
  },
  category: {
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '700',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  card: {
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  name: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
  },
  description: {
    color: 'rgba(255,255,255,0.82)',
    marginTop: 10,
    lineHeight: 20,
  },
  sellerCard: {
    marginTop: 14,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  sellerAvatarWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerAvatar: {
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
    fontWeight: '900',
  },
  sellerCopy: {
    flex: 1,
  },
  sellerLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '700',
  },
  sellerName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  sellerContact: {
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
  },
  messageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#e50914',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  messageBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  primaryBtn: {
    flex: 1,
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
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  secondaryBtnText: {
    color: '#fff',
    fontWeight: '800',
  },
  linkRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  linkText: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  reportBtn: {
    backgroundColor: 'rgba(229,9,20,0.18)',
    borderColor: 'rgba(229,9,20,0.55)',
  },
  actionText: {
    color: '#fff',
    fontWeight: '800',
  },
});
