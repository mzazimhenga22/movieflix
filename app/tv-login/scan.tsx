import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import ScreenWrapper from '../../components/ScreenWrapper';
import { authPromise } from '../../constants/firebase';

type TvLoginPayload = {
  v?: number;
  t?: string;
  code?: string;
  nonce?: string;
};

function parseQr(value: string): { code: string; nonce: string } | null {
  const raw = String(value || '').trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as TvLoginPayload;
    const code = String(parsed?.code ?? '').trim().toUpperCase();
    const nonce = String(parsed?.nonce ?? '').trim();
    if (code && nonce) return { code, nonce };
  } catch {
    // ignore
  }

  return null;
}

export default function TvLoginScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [submitting, setSubmitting] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  const supabaseUrl = useMemo(
    () => (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/$/, ''),
    [],
  );

  const approve = useCallback(
    async (code: string, nonce: string) => {
      if (!supabaseUrl) {
        Alert.alert('Supabase not configured', 'Set EXPO_PUBLIC_SUPABASE_URL to enable TV login.');
        return;
      }

      const auth = await authPromise;
      const user = auth.currentUser;
      if (!user) {
        Alert.alert('Sign in required', 'Please sign in on your phone first.');
        router.replace('/(auth)/login');
        return;
      }

      setSubmitting(true);
      try {
        const idToken = await user.getIdToken(true);
        const res = await fetch(`${supabaseUrl}/functions/v1/tv-login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ action: 'approve', code, nonce }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || 'Unable to approve TV sign-in');

        Alert.alert('TV signed in', 'You can continue on your TV now.');
        router.back();
      } catch (e: any) {
        Alert.alert('Failed', e?.message ?? 'Unable to approve TV sign-in');
        setHasScanned(false);
      } finally {
        setSubmitting(false);
      }
    },
    [supabaseUrl],
  );

  const onBarcodeScanned = useCallback(
    (event: { data?: string }) => {
      if (hasScanned || submitting) return;
      const data = String(event?.data ?? '');
      const parsed = parseQr(data);
      if (!parsed) {
        Alert.alert('Invalid QR', 'This QR code is not a MovieFlix TV sign-in code.');
        return;
      }
      setHasScanned(true);
      void approve(parsed.code, parsed.nonce);
    },
    [approve, hasScanned, submitting],
  );

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>TV Sign-in</Text>
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
            <Text style={styles.copy}>Allow camera access to scan the TV QR code.</Text>
            <Pressable onPress={() => void requestPermission()} style={styles.primaryBtn}>
              <Text style={styles.primaryText}>Enable camera</Text>
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
              <Text style={styles.hint}>Point your camera at the QR code shown on your TV.</Text>
              {submitting ? <ActivityIndicator color="#fff" style={{ marginTop: 10 }} /> : null}
            </View>
          </View>
        )}
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
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
