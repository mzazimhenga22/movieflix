import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

import ScreenWrapper from '../../../components/ScreenWrapper';
import { useMarketplaceCart } from '../../../hooks/use-marketplace-cart';
import { useAccent } from '../../components/AccentContext';
import ProductCard from '../components/ProductCard';
import { getProductsBySellerId, type Product } from '../api';
import { findOrCreateConversation, getProfileById, type Profile } from '../../messaging/controller';

export default function MarketplaceSellerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { setAccentColor } = useAccent();
  const cart = useMarketplaceCart();

  const sellerId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';

  const [loading, setLoading] = React.useState(true);
  const [products, setProducts] = React.useState<(Product & { id: string })[]>([]);
  const [seller, setSeller] = React.useState<Profile | null>(null);
  const [messagingBusy, setMessagingBusy] = React.useState(false);

  React.useEffect(() => {
    setAccentColor('#e50914');
  }, [setAccentColor]);

  React.useEffect(() => {
    if (!sellerId) {
      setLoading(false);
      setProducts([]);
      setSeller(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [sellerProfile, sellerProducts] = await Promise.all([
          getProfileById(sellerId),
          getProductsBySellerId(sellerId),
        ]);

        if (cancelled) return;

        setSeller(
          sellerProfile
            ? {
                id: sellerId,
                displayName: sellerProfile.displayName || 'Seller',
                photoURL: sellerProfile.photoURL || '',
              }
            : {
                id: sellerId,
                displayName: 'Seller',
                photoURL: '',
              }
        );

        setProducts(sellerProducts.filter((p): p is Product & { id: string } => !!p.id));
      } catch (err) {
        console.error('[marketplace] load seller storefront failed', err);
        if (!cancelled) {
          setProducts([]);
          setSeller({ id: sellerId, displayName: 'Seller', photoURL: '' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  const handleMessageSeller = React.useCallback(async () => {
    if (!sellerId) return;
    if (messagingBusy) return;
    setMessagingBusy(true);
    try {
      const profile = await getProfileById(sellerId);
      if (!profile) {
        Alert.alert('Unavailable', 'Seller profile not found yet.');
        return;
      }

      const sellerProfile: Profile = {
        id: profile.id,
        displayName: profile.displayName || 'Seller',
        photoURL: profile.photoURL || '',
      };
      const conversationId = await findOrCreateConversation(sellerProfile);
      router.push({ pathname: '/messaging/chat/[id]', params: { id: conversationId } });
    } catch (err) {
      console.error('[marketplace] message seller failed', err);
      Alert.alert('Unable to start chat', 'Please try again in a moment.');
    } finally {
      setMessagingBusy(false);
    }
  }, [messagingBusy, router, sellerId]);

  const title = seller?.displayName || 'Seller';

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
              <Text style={styles.headerEyebrow}>Storefront</Text>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {title}
              </Text>
              <Text style={styles.headerSub} numberOfLines={1}>
                {loading ? 'Loading listings…' : `${products.length} listing${products.length === 1 ? '' : 's'}`}
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
              <Text style={styles.loadingText}>Loading storefront…</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <View style={styles.sellerCard}>
                <View style={styles.sellerAvatarWrap}>
                  {seller?.photoURL ? (
                    <Image source={{ uri: seller.photoURL }} style={styles.sellerAvatar} />
                  ) : (
                    <View style={styles.sellerFallback}>
                      <Text style={styles.sellerInitial}>{title.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.sellerCopy}>
                  <Text style={styles.sellerLabel}>Seller</Text>
                  <Text style={styles.sellerName} numberOfLines={1}>
                    {title}
                  </Text>
                  <Text style={styles.sellerMeta} numberOfLines={1}>
                    {sellerId}
                  </Text>
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

              {products.length === 0 ? (
                <View style={styles.empty}>
                  <Ionicons name="storefront-outline" size={40} color="rgba(255,255,255,0.65)" />
                  <Text style={styles.emptyTitle}>No listings yet</Text>
                  <Text style={styles.emptySub}>This seller hasn’t published products in the marketplace yet.</Text>
                </View>
              ) : (
                <View style={styles.grid}>
                  {products.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={{
                        id: p.id,
                        name: p.name,
                        description: p.description,
                        price: Number(p.price),
                        imageUrl: p.imageUrl,
                        sellerName: p.sellerName,
                        sellerAvatar: p.sellerAvatar,
                        promoted: p.promoted,
                      }}
                      onPress={() => router.push({ pathname: '/marketplace/[id]', params: { id: p.id } })}
                    />
                  ))}
                </View>
              )}
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
    gap: 12,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  headerSub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: '#e50914',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 12,
    color: 'rgba(255,255,255,0.85)',
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 14,
  },
  sellerAvatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
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
    fontSize: 18,
    fontWeight: '800',
  },
  sellerCopy: {
    flex: 1,
    minWidth: 0,
  },
  sellerLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '700',
  },
  sellerName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  sellerMeta: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginTop: 2,
  },
  messageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#e50914',
  },
  messageBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  empty: {
    paddingTop: 40,
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  emptyTitle: {
    marginTop: 10,
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  emptySub: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
});
