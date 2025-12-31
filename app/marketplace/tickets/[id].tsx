import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import QRCode from 'react-native-qrcode-svg';

import ScreenWrapper from '../../../components/ScreenWrapper';
import { useAccent } from '../../components/AccentContext';
import { useUser } from '../../../hooks/use-user';
import { getTicketByTicketId, type MarketplaceTicket } from '../api';

const ticketQrPayload = (ticketId: string) =>
  JSON.stringify({ v: 1, t: 'marketplace_ticket', ticketId });

export default function MarketplaceTicketDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { setAccentColor } = useAccent();
  const { user } = useUser();

  const ticketId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';

  const [loading, setLoading] = React.useState(true);
  const [ticket, setTicket] = React.useState<MarketplaceTicket | null>(null);

  React.useEffect(() => {
    setAccentColor('#e50914');
  }, [setAccentColor]);

  React.useEffect(() => {
    if (!ticketId) {
      setTicket(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const t = await getTicketByTicketId(ticketId);
        if (!cancelled) setTicket(t);
      } catch (err) {
        console.error('[marketplace] load ticket failed', err);
        if (!cancelled) setTicket(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  const isOwner = !!user?.uid && !!ticket?.buyerId && user.uid === ticket.buyerId;

  const startsAtMs = ticket?.eventStartsAt ? Date.parse(String(ticket.eventStartsAt)) : 0;

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
                Ticket
              </Text>
              <Text style={styles.headerSub} numberOfLines={1}>
                {ticketId}
              </Text>
            </View>
            <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/marketplace/tickets')}>
              <Ionicons name="ticket" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#E50914" />
              <Text style={styles.centerSub}>Loading ticket…</Text>
            </View>
          ) : !ticket ? (
            <View style={styles.center}>
              <Ionicons name="alert-circle-outline" size={42} color="rgba(255,255,255,0.7)" />
              <Text style={styles.centerTitle}>Ticket not found</Text>
              <Text style={styles.centerSub}>This ticket code is invalid or was removed.</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/marketplace/tickets')}>
                <Text style={styles.primaryBtnText}>Back to tickets</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <View style={styles.ticketCard}>
                <Text style={styles.productName} numberOfLines={2}>
                  {ticket.productName}
                </Text>
                <View style={styles.metaRow}>
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>{String(ticket.status).toUpperCase()}</Text>
                  </View>
                  <View style={styles.pillAlt}>
                    <Text style={styles.pillTextAlt}>{String(ticket.eventKind || 'event').replace(/_/g, ' ').toUpperCase()}</Text>
                  </View>
                </View>

                {!!ticket.eventVenue && <Text style={styles.metaLine}>Venue: {ticket.eventVenue}</Text>}
                {!!startsAtMs && <Text style={styles.metaLine}>Starts: {new Date(startsAtMs).toLocaleString()}</Text>}
                {!!ticket.eventRoomCode && <Text style={styles.metaLine}>Room: {ticket.eventRoomCode}</Text>}

                <View style={styles.qrWrap}>
                  <View style={styles.qrFrame}>
                    <QRCode value={ticketQrPayload(ticket.ticketId)} size={240} color="#111" backgroundColor="#fff" />
                  </View>
                  <Text style={styles.qrHint}>Show this QR at the venue entrance.</Text>
                </View>

                <View style={styles.codeRow}>
                  <Text style={styles.codeLabel}>Ticket code</Text>
                  <Text style={styles.codeValue} selectable>
                    {ticket.ticketId}
                  </Text>
                </View>

                <View style={styles.noteCard}>
                  <Ionicons name="information-circle-outline" size={18} color="#fff" />
                  <Text style={styles.noteText}>
                    {isOwner
                      ? 'Keep this ticket private. Staff will scan your QR to mark entry.'
                      : 'If you are not the ticket holder, do not share this code.'}
                  </Text>
                </View>

                {ticket.status !== 'active' && (
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => Alert.alert('Ticket status', `This ticket is ${ticket.status}.`)}
                  >
                    <Text style={styles.secondaryBtnText}>Why can’t I enter?</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </LinearGradient>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  gradient: { ...StyleSheet.absoluteFillObject },
  container: { flex: 1 },
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
  headerCopy: { flex: 1, minWidth: 0 },
  headerEyebrow: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 2 },
  headerSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  centerTitle: { marginTop: 10, color: '#fff', fontSize: 16, fontWeight: '800' },
  centerSub: { marginTop: 6, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  primaryBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#e50914',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '900' },
  scrollContent: { paddingHorizontal: 12, paddingBottom: 24 },
  ticketCard: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  productName: { color: '#fff', fontSize: 16, fontWeight: '900' },
  metaRow: { marginTop: 10, flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#e50914' },
  pillText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  pillAlt: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)' },
  pillTextAlt: { color: '#fff', fontSize: 11, fontWeight: '900' },
  metaLine: { marginTop: 8, color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  qrWrap: { marginTop: 16, alignItems: 'center' },
  qrFrame: { padding: 14, borderRadius: 22, backgroundColor: '#fff' },
  qrHint: { marginTop: 10, color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  codeRow: { marginTop: 14, padding: 12, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.24)' },
  codeLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '700' },
  codeValue: { marginTop: 4, color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.6 },
  noteCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  noteText: { flex: 1, color: 'rgba(255,255,255,0.85)', fontSize: 12, lineHeight: 18, fontWeight: '700' },
  secondaryBtn: {
    marginTop: 12,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: '#fff', fontWeight: '900' },
});
