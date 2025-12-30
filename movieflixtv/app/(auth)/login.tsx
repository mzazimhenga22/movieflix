import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { signInWithCustomToken, signInWithEmailAndPassword } from 'firebase/auth';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { authPromise } from '@/constants/firebase';
import TvVirtualKeyboard from '../components/TvVirtualKeyboard';
import QRCode from 'react-native-qrcode-svg';

export default function TvLoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrSession, setQrSession] = useState<{ code: string; nonce: string; expiresAt: number } | null>(null);
  const [activeField, setActiveField] = useState<'email' | 'password'>('email');
  const [lowercase, setLowercase] = useState(true);

  const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/$/, '');

  const createQrSession = useCallback(async () => {
    if (!supabaseUrl) {
      setQrError('Supabase not configured');
      setQrSession(null);
      return;
    }
    try {
      setQrBusy(true);
      setQrError(null);
      const res = await fetch(`${supabaseUrl}/functions/v1/tv-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Unable to create QR session');
      if (!json?.code || !json?.nonce) throw new Error('Invalid session response');
      setQrSession({ code: String(json.code), nonce: String(json.nonce), expiresAt: Number(json.expiresAt) });
    } catch (e: any) {
      setQrError(e?.message ?? 'Unable to create QR session');
      setQrSession(null);
    } finally {
      setQrBusy(false);
    }
  }, [supabaseUrl]);

  const claimQrSession = useCallback(async () => {
    if (!supabaseUrl || !qrSession || qrBusy) return;
    if (Date.now() > qrSession.expiresAt) {
      void createQrSession();
      return;
    }
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/tv-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim', code: qrSession.code, nonce: qrSession.nonce }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return;
      if (!json?.customToken) return;

      setBusy(true);
      const auth = await authPromise;
      await signInWithCustomToken(auth, String(json.customToken));
      router.replace('/select-profile');
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }, [createQrSession, qrBusy, qrSession, supabaseUrl]);

  React.useEffect(() => {
    void createQrSession();
  }, [createQrSession]);

  React.useEffect(() => {
    if (!qrSession) return;
    const t = setInterval(() => {
      void claimQrSession();
    }, 1500);
    return () => clearInterval(t);
  }, [claimQrSession, qrSession]);

  const canSubmit = useMemo(() => {
    const e = email.trim();
    return e.length > 3 && password.length >= 6 && !busy;
  }, [busy, email, password.length]);

  const applyKey = useCallback(
    (value: string) => {
      const set = activeField === 'email' ? setEmail : setPassword;
      if (value === 'DEL') {
        set((prev) => prev.slice(0, -1));
        return;
      }
      if (value === 'CLEAR') {
        set('');
        return;
      }
      if (value === ' ') {
        set((prev) => (activeField === 'email' ? prev : `${prev} `));
        return;
      }
      const next = (() => {
        if (lowercase && /^[A-Z]$/.test(value)) return value.toLowerCase();
        return value;
      })();
      set((prev) => {
        const merged = `${prev}${next}`;
        return merged.length > 64 ? merged.slice(0, 64) : merged;
      });
    },
    [activeField, lowercase],
  );

  const submit = useCallback(async () => {
    const e = email.trim();
    if (!e || !password) {
      Alert.alert('Missing info', 'Enter your email and password.');
      return;
    }

    try {
      setBusy(true);
      const auth = await authPromise;
      await signInWithEmailAndPassword(auth, e, password);
      router.replace('/select-profile');
    } catch (err: any) {
      Alert.alert('Login failed', err?.message ?? 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  }, [email, password]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#150a13', '#070815', '#05060f']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.card}>
        <View style={styles.leftPane}>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>Use your MovieFlix account.</Text>

        <View style={styles.fieldsRow}>
          <Pressable
            onPress={() => setActiveField('email')}
            style={({ focused }: any) => [
              styles.field,
              activeField === 'email' ? styles.fieldActive : null,
              focused ? styles.fieldFocused : null,
            ]}
          >
            <Text style={styles.fieldLabel}>Email</Text>
            <Text style={styles.fieldValue} numberOfLines={1}>
              {email || '—'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveField('password')}
            style={({ focused }: any) => [
              styles.field,
              activeField === 'password' ? styles.fieldActive : null,
              focused ? styles.fieldFocused : null,
            ]}
          >
            <Text style={styles.fieldLabel}>Password</Text>
            <Text style={styles.fieldValue} numberOfLines={1}>
              {password ? '•'.repeat(Math.min(password.length, 18)) : '—'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.keyboardHeaderRow}>
          <Text style={styles.keyboardHint}>Use the on-screen keyboard</Text>
          <Pressable
            onPress={() => setLowercase((prev) => !prev)}
            style={({ focused }: any) => [styles.caseBtn, focused ? styles.caseBtnFocused : null]}
          >
            <Text style={styles.caseText}>{lowercase ? 'abc' : 'ABC'}</Text>
          </Pressable>
        </View>

        <TvVirtualKeyboard
          mode={activeField === 'email' ? 'email' : 'default'}
          disabled={busy}
          onKeyPress={applyKey}
        />

        <Pressable
          onPress={() => void submit()}
          disabled={!canSubmit}
          style={({ focused }: any) => [
            styles.primaryBtn,
            !canSubmit ? styles.btnDisabled : null,
            focused ? styles.btnFocused : null,
          ]}
        >
          {busy ? <ActivityIndicator color="#fff" /> : null}
          <Text style={styles.primaryText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
        </Pressable>

          <Pressable
            onPress={() => router.push('/(auth)/signup')}
            style={({ focused }: any) => [styles.secondaryBtn, focused ? styles.btnFocused : null]}
          >
            <Text style={styles.secondaryText}>Create account</Text>
          </Pressable>
        </View>

        <View style={styles.qrPane}>
          <Text style={styles.qrTitle}>Sign in with QR</Text>
          <Text style={styles.qrHint}>Open MovieFlix on your phone → Movies → + → TV Sign-in</Text>

          <View style={styles.qrBox}>
            {qrSession ? (
              <QRCode
                value={JSON.stringify({ v: 1, t: 'mf_tv_login', code: qrSession.code, nonce: qrSession.nonce })}
                size={210}
                backgroundColor="transparent"
                color="#ffffff"
              />
            ) : (
              <View style={styles.qrPlaceholder}>
                {qrBusy ? <ActivityIndicator color="#fff" /> : null}
                <Text style={styles.qrPlaceholderText}>{qrError ? qrError : 'Generating…'}</Text>
              </View>
            )}
          </View>

          {qrSession ? <Text style={styles.qrCodeText}>{qrSession.code}</Text> : null}

          <Pressable
            onPress={() => void createQrSession()}
            style={({ focused }: any) => [styles.qrRefreshBtn, focused ? styles.btnFocused : null]}
          >
            <Text style={styles.secondaryText}>Refresh QR</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  card: {
    width: 1120,
    borderRadius: 24,
    padding: 26,
    backgroundColor: 'rgba(0,0,0,0.26)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    gap: 20,
  },
  leftPane: { flex: 1, minWidth: 0 },
  qrPane: {
    width: 320,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  title: { color: '#fff', fontSize: 34, fontWeight: '900' },
  subtitle: { color: 'rgba(255,255,255,0.72)', fontSize: 16, fontWeight: '700', marginTop: 6 },
  qrTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  qrHint: { marginTop: 6, color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '700', lineHeight: 16 },
  qrBox: {
    marginTop: 12,
    height: 240,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.20)',
    overflow: 'hidden',
  },
  qrPlaceholder: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 12 },
  qrPlaceholderText: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  qrCodeText: { marginTop: 10, color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  qrRefreshBtn: {
    marginTop: 12,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldsRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  field: {
    flex: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  fieldActive: { borderColor: 'rgba(229,9,20,0.95)', backgroundColor: 'rgba(229,9,20,0.12)' },
  fieldFocused: { transform: [{ scale: 1.02 }], borderColor: '#fff' },
  fieldLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase' },
  fieldValue: { color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 8 },
  keyboardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  keyboardHint: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '800' },
  caseBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  caseBtnFocused: { transform: [{ scale: 1.03 }], borderColor: '#fff' },
  caseText: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 1.2 },
  primaryBtn: {
    marginTop: 18,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(229,9,20,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.95)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  secondaryBtn: {
    marginTop: 12,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  btnFocused: { transform: [{ scale: 1.03 }], borderColor: '#fff' },
  btnDisabled: { opacity: 0.6 },
});
