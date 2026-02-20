import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import ScreenWrapper from '../../components/ScreenWrapper';
import { useAccent } from '../components/AccentContext';
import { useUser } from '../../hooks/use-user';
import { formatKsh } from '../../lib/money';
import {
  getOrdersForBuyer,
  getOrdersForSeller,
  type MarketplaceOrder,
} from './api';

const toMillis = (value: any): number => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === 'function') {
    try {
      return value.toMillis();
    } catch {
      return 0;
    }
  }
  if (typeof value?.toDate === 'function') {
    try {
      const d = value.toDate();
      return d instanceof Date ? d.getTime() : 0;
    } catch {
      return 0;
    }
  }
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
};

export default function MarketplaceOrdersScreen() {
  const router = useRouter();
  const { setAccentColor } = useAccent();
  const { user } = useUser();

  const [tab, setTab] = React.useState<'purchases' | 'sales'>('purchases');
  const [loading, setLoading] = React.useState(true);
  const [orders, setOrders] = React.useState<MarketplaceOrder[]>([]);

  React.useEffect(() => {
    setAccentColor('#e50914');
  }, [setAccentColor]);

  React.useEffect(() => {
    if (!user?.uid) {
      setOrders([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const list =
          tab === 'sales' ? await getOrdersForSeller(user.uid) : await getOrdersForBuyer(user.uid);
        if (cancelled) return;
        setOrders(list.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)));
      } catch (err) {
        console.error('[marketplace] load orders failed', err);
        if (!cancelled) setOrders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tab, user?.uid]);

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
              <Text style={styles.headerTitle}>Orders</Text>
              <Text style={styles.headerSub}>Track purchases and sales</Text>
            </View>
            <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/marketplace')}>
              <Ionicons name="storefront" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabPill, tab === 'purchases' && styles.tabPillActive]}
              onPress={() => setTab('purchases')}
            >
              <Text style={[styles.tabText, tab === 'purchases' && styles.tabTextActive]}>Purchases</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabPill, tab === 'sales' && styles.tabPillActive]}
              onPress={() => setTab('sales')}
            >
              <Text style={[styles.tabText, tab === 'sales' && styles.tabTextActive]}>Sales</Text>
            </TouchableOpacity>
          </View>

          {!user?.uid ? (
            <View style={styles.center}>
              <Ionicons name="person-circle-outline" size={42} color="rgba(255,255,255,0.7)" />
              <Text style={styles.centerTitle}>Sign in required</Text>
              <Text style={styles.centerSub}>Sign in to view your marketplace orders.</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/profile')}>
                <Text style={styles.primaryBtnText}>Go to profile</Text>
              </TouchableOpacity>
            </View>
          ) : loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#E50914" />
              <Text style={styles.centerSub}>Loading orders…</Text>
            </View>
          ) : orders.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="receipt-outline" size={42} color="rgba(255,255,255,0.7)" />
              <Text style={styles.centerTitle}>No orders yet</Text>
              <Text style={styles.centerSub}>
                {tab === 'sales' ? 'When you sell items, orders will show up here.' : 'When you buy items, orders will show up here.'}
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/marketplace')}>
                <Text style={styles.primaryBtnText}>Browse marketplace</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              {orders.map((o) => {
                const when = toMillis(o.createdAt);
                const linesPreview = o.items.slice(0, 3).map((it) => `${it.quantity}× ${it.name}`).join(' • ');

                return (
                  <View key={o.id || o.orderId} style={styles.card}>
                    <View style={styles.cardTop}>
                      <View style={styles.cardLeft}>
                        <Text style={styles.orderId} numberOfLines={1}>
                          {o.orderId}
                        </Text>
                        <Text style={styles.orderMeta} numberOfLines={1}>
                          {when ? new Date(when).toLocaleString() : '—'}
                        </Text>
                      </View>
                      <View style={styles.statusPill}>
                        <Text style={styles.statusText}>{String(o.status || 'pending').replace(/_/g, ' ')}</Text>
                      </View>
                    </View>

                    <Text style={styles.lines} numberOfLines={2}>
                      {linesPreview || '—'}
                    </Text>

                    <View style={styles.cardBottom}>
                      <Text style={styles.total}>{formatKsh(Number(o.total))}</Text>
                      <Text style={styles.itemCount}>{o.items.length} item{o.items.length === 1 ? '' : 's'}</Text>
                    </View>
                  </View>
                );
              })}
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
  tabRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  tabPill: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabPillActive: {
    backgroundColor: '#e50914',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  tabText: {
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '800',
  },
  tabTextActive: {
    color: '#fff',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  centerTitle: {
    marginTop: 10,
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  centerSub: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  primaryBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#e50914',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '900',
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  card: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 12,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardLeft: {
    flex: 1,
    minWidth: 0,
  },
  orderId: {
    color: '#fff',
    fontWeight: '900',
  },
  orderMeta: {
    marginTop: 3,
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  lines: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 18,
  },
  cardBottom: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  total: {
    color: '#fff',
    fontWeight: '900',
  },
  itemCount: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
  },
});
