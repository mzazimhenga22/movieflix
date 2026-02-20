import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import ScreenWrapper from '../../components/ScreenWrapper';
import { useAccent } from '../components/AccentContext';
import { useUser } from '../../hooks/use-user';
import { redeemTicketByTicketId } from './api';

type TicketQrPayload = {
  v?: number;
  t?: string;
  ticketId?: string;
};

function parseTicketCode(value: string): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as TicketQrPayload;
    const id = String(parsed?.ticketId ?? '').trim();
    if (id) return id;
  } catch {
    // ignore
  }

  // fallback: QR is just the code
  if (/^MFTK-[A-Z0-9-]{6,}$/i.test(raw)) return raw.trim();
  return null;
}

export default function MarketplaceScanTicketScreen() {
  const router = useRouter();
  const { setAccentColor } = useAccent();
  const { user } = useUser();
  const [permission, requestPermission] = useCameraPermissions();

  const [submitting, setSubmitting] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  React.useEffect(() => {
    setAccentColor('#e50914');
  }, [setAccentColor]);

  const signedIn = !!user?.uid;

  const overlayCopy = useMemo(() => {
    if (!signedIn) return 'Sign in to scan and redeem event tickets.';
    return 'Point the camera at a customer ticket QR to confirm entry.';
  }, [signedIn]);

  const redeem = useCallback(
    async (ticketId: string) => {
      if (!user?.uid) {
        Alert.alert('Sign in required', 'Please sign in to redeem tickets.');
        router.push('/profile');
        return;
      }

      setSubmitting(true);
      try {
        const ticket = await redeemTicketByTicketId({ ticketId, redeemerId: user.uid });
        Alert.alert('Redeemed', `Entry confirmed for: ${ticket.productName}\n\nTicket: ${ticket.ticketId}`, [
          { text: 'Scan next', onPress: () => setHasScanned(false) },
        ]);
      } catch (e: any) {
        Alert.alert('Not redeemed', e?.message ?? 'Unable to redeem this ticket.', [
          { text: 'Try again', onPress: () => setHasScanned(false) },
        ]);
      } finally {
        setSubmitting(false);
      }
    },
    [router, user?.uid]
  );

  const onBarcodeScanned = useCallback(
    (event: { data?: string }) => {
      if (hasScanned || submitting) return;
      const code = parseTicketCode(String(event?.data ?? ''));
      if (!code) {
        Alert.alert('Invalid ticket', 'This QR does not look like a MovieFlix ticket.', [
          { text: 'OK', onPress: () => setHasScanned(false) },
        ]);
        return;
      }

      setHasScanned(true);
      void redeem(code);
    },
    [hasScanned, redeem, submitting]
  );

  return (
    <ScreenWrapper>
      <LinearGradient colors={['#e50914', '#150a13', '#05060f'] as const} start={[0, 0]} end={[1, 1]} style={styles.gradient}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Scan Ticket</Text>
            <Pressable onPress={() => router.back()} style={styles.closeBtn}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          {!permission ? (
            <View style={styles.center}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : !permission.granted ? (
            <View style={styles.center}>
              <Text style={styles.copy}>Allow camera access to scan event tickets.</Text>
              <Pressable onPress={() => void requestPermission()} style={styles.primaryBtn}>
                <Text style={styles.primaryText}>Enable camera</Text>
              </Pressable>
            </View>
          ) : !signedIn ? (
            <View style={styles.center}>
              <Text style={styles.copy}>{overlayCopy}</Text>
              <Pressable onPress={() => router.push('/profile')} style={styles.primaryBtn}>
                <Text style={styles.primaryText}>Go to profile</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.cameraWrap}>
              <CameraView
                style={StyleSheet.absoluteFill}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={onBarcodeScanned}
              />
              <View pointerEvents="none" style={styles.overlay}>
                <View style={styles.frame} />
                <Text style={styles.hint}>{overlayCopy}</Text>
                {submitting ? <ActivityIndicator color="#fff" style={{ marginTop: 10 }} /> : null}
              </View>
            </View>
          )}
        </View>
      </LinearGradient>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  gradient: { ...StyleSheet.absoluteFillObject },
  container: { flex: 1, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  closeBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)' },
  closeText: { color: '#fff', fontWeight: '700' },
  cameraWrap: { flex: 1, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 20 },
  frame: {
    width: 240,
    height: 240,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(0,0,0,0.20)',
  },
  hint: { marginTop: 18, color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, gap: 14 },
  copy: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  primaryBtn: { marginTop: 6, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, backgroundColor: '#e50914' },
  primaryText: { color: '#fff', fontWeight: '900' },
});
