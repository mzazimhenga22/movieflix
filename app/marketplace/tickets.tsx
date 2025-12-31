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
  TouchableOpacity,
  View,
} from 'react-native';

import ScreenWrapper from '../../components/ScreenWrapper';
import { useAccent } from '../components/AccentContext';
import { useUser } from '../../hooks/use-user';
import { getTicketsForBuyer, type MarketplaceTicket } from './api';

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

export default function MarketplaceTicketsScreen() {
  const router = useRouter();
  const { setAccentColor } = useAccent();
  const { user } = useUser();

  const [loading, setLoading] = React.useState(true);
  const [tickets, setTickets] = React.useState<MarketplaceTicket[]>([]);

  React.useEffect(() => {
    setAccentColor('#e50914');
  }, [setAccentColor]);

  React.useEffect(() => {
    if (!user?.uid) {
      setTickets([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const list = await getTicketsForBuyer(user.uid);
        if (cancelled) return;
        setTickets(list.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)));
      } catch (err) {
        console.error('[marketplace] load tickets failed', err);
        if (!cancelled) setTickets([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

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
              <Text style={styles.headerTitle}>Tickets</Text>
              <Text style={styles.headerSub}>Theater & party room access</Text>
            </View>
            <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/marketplace')}>
              <Ionicons name="storefront" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {!user?.uid ? (
            <View style={styles.center}>
              <Ionicons name="person-circle-outline" size={42} color="rgba(255,255,255,0.7)" />
              <Text style={styles.centerTitle}>Sign in required</Text>
              <Text style={styles.centerSub}>Sign in to view your tickets.</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/profile')}>
                <Text style={styles.primaryBtnText}>Go to profile</Text>
              </TouchableOpacity>
            </View>
          ) : loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#E50914" />
              <Text style={styles.centerSub}>Loading tickets…</Text>
            </View>
          ) : tickets.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="ticket-outline" size={42} color="rgba(255,255,255,0.7)" />
              <Text style={styles.centerTitle}>No tickets yet</Text>
              <Text style={styles.centerSub}>Buy an event listing to receive a ticket here.</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/marketplace?category=events' as any)}>
                <Text style={styles.primaryBtnText}>Browse events</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              {tickets.map((t) => {
                const when = t.eventStartsAt ? Date.parse(String(t.eventStartsAt)) : 0;
                const kind = t.eventKind ? String(t.eventKind).replace(/_/g, ' ') : 'event';

                return (
                  <TouchableOpacity
                    key={t.id || t.ticketId}
                    style={styles.card}
                    activeOpacity={0.9}
                    onPress={() => router.push({ pathname: '/marketplace/tickets/[id]', params: { id: t.ticketId } })}
                  >
                    <View style={styles.cardTop}>
                      <View style={styles.cardLeft}>
                        <Text style={styles.ticketId} numberOfLines={1}>
                          {t.ticketId}
                        </Text>
                        <Text style={styles.ticketMeta} numberOfLines={1}>
                          Order: {t.orderId}
                        </Text>
                      </View>
                      <View style={styles.kindPill}>
                        <Text style={styles.kindText}>{kind}</Text>
                      </View>
                    </View>

                    <Text style={styles.productName} numberOfLines={2}>
                      {t.productName}
                    </Text>

                    {!!t.eventVenue && (
                      <Text style={styles.venue} numberOfLines={1}>
                        Venue: {t.eventVenue}
                      </Text>
                    )}

                    {!!when && (
                      <Text style={styles.venue} numberOfLines={1}>
                        Starts: {new Date(when).toLocaleString()}
                      </Text>
                    )}

                    {!!t.eventRoomCode && (
                      <Text style={styles.venue} numberOfLines={1}>
                        Room code: {t.eventRoomCode}
                      </Text>
                    )}

                    <TouchableOpacity
                      style={styles.copyBtn}
                      onPress={() => Alert.alert('Ticket', t.ticketId)}
                    >
                      <Ionicons name="copy-outline" size={16} color="#fff" />
                      <Text style={styles.copyBtnText}>View ticket code</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
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
  ticketId: {
    color: '#fff',
    fontWeight: '900',
  },
  ticketMeta: {
    marginTop: 3,
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
  },
  kindPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  kindText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  productName: {
    marginTop: 10,
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
  },
  venue: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  copyBtn: {
    marginTop: 12,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#e50914',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  copyBtnText: {
    color: '#fff',
    fontWeight: '900',
  },
});
