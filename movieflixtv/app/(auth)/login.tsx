import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { signInWithCustomToken, signInWithEmailAndPassword } from 'firebase/auth';
import axios from 'axios';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { authPromise } from '@/constants/firebase';
import TvVirtualKeyboard from '../components/TvVirtualKeyboard';
import { TvFocusable } from '../components/TvSpatialNavigation';
import QRCode from 'react-native-qrcode-svg';

export default function TvLoginScreen() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrSession, setQrSession] = useState<{ code: string; nonce: string; expiresAt: number } | null>(null);
  const [activeField, setActiveField] = useState<'email' | 'password'>('email');
  const [lowercase, setLowercase] = useState(true);

  const cardAnim = useRef(new Animated.Value(0)).current;
  const logoAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(100, [
      Animated.spring(logoAnim, { toValue: 1, friction: 8, tension: 50, useNativeDriver: true }),
      Animated.spring(cardAnim, { toValue: 1, friction: 9, tension: 55, useNativeDriver: true }),
    ]).start();
  }, [cardAnim, logoAnim]);

  const cleanEnv = (value: string) => value.trim().replace(/^['"]/, '').replace(/['"]$/, '');

  const supabaseUrl = cleanEnv(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  const supabaseAnonKey = cleanEnv(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '');

  const postTvLogin = useCallback(
    async (payload: Record<string, unknown>, timeoutMs: number) => {
      try {
        const url = `${supabaseUrl}/functions/v1/tv-login`;
        const response = await axios.post(url, payload, {
          timeout: timeoutMs,
          headers: {
            'Content-Type': 'application/json',
            ...(supabaseAnonKey
              ? {
                  apikey: supabaseAnonKey,
                  authorization: `Bearer ${supabaseAnonKey}`,
                }
              : null),
          },
          validateStatus: () => true,
        });

        return {
          res: { ok: response.status >= 200 && response.status < 300, status: response.status } as any,
          json: response.data,
        };
      } catch (e: any) {
        const isTimeout = e?.code === 'ECONNABORTED' || String(e?.message ?? '').toLowerCase().includes('timeout');
        if (isTimeout) {
          throw new Error('TV login request timed out. Check the TV has internet access.');
        }
        throw e;
      }
    },
    [supabaseAnonKey, supabaseUrl],
  );

  const createQrSession = useCallback(async () => {
    if (!supabaseUrl || !supabaseAnonKey) {
      setQrError('QR login not configured');
      setQrSession(null);
      return;
    }

    if (!/^https?:\/\//i.test(supabaseUrl)) {
      setQrError('Invalid configuration');
      setQrSession(null);
      return;
    }
    try {
      setQrBusy(true);
      setQrError(null);
      const { res, json } = await postTvLogin({ action: 'create' }, 60_000);
      if (!res.ok) throw new Error(json?.error || 'Unable to create QR session');
      if (!json?.code || !json?.nonce) throw new Error('Invalid session response');
      setQrSession({ code: String(json.code), nonce: String(json.nonce), expiresAt: Number(json.expiresAt) });
    } catch (e: any) {
      setQrError(e?.message ?? 'Unable to create QR session');
      setQrSession(null);
    } finally {
      setQrBusy(false);
    }
  }, [postTvLogin, supabaseAnonKey, supabaseUrl]);

  const claimQrSession = useCallback(async () => {
    if (!supabaseUrl || !qrSession || qrBusy) return;
    if (Date.now() > qrSession.expiresAt) {
      void createQrSession();
      return;
    }
    try {
      const { res, json } = await postTvLogin(
        { action: 'claim', code: qrSession.code, nonce: qrSession.nonce },
        15_000,
      );
      if (!res.ok) return;
      if (!json?.customToken) return;

      setBusy(true);
      const auth = await authPromise;
      await signInWithCustomToken(auth, String(json.customToken));
      router.replace('/select-profile');
    } catch {
    } finally {
      setBusy(false);
    }
  }, [createQrSession, postTvLogin, qrBusy, qrSession, supabaseUrl]);

  useEffect(() => {
    void createQrSession();
  }, [createQrSession]);

  useEffect(() => {
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

  // Responsive sizing
  const isCompact = screenHeight < 800;
  const cardMaxWidth = Math.min(1280, screenWidth - 160);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#1a0a12', '#0d0815', '#05060f']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Accent glow */}
      <View style={styles.glowContainer}>
        <LinearGradient
          colors={['rgba(229,9,20,0.15)', 'transparent']}
          style={styles.glow}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </View>

      {/* Logo */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: logoAnim,
            transform: [{ translateY: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }],
          },
        ]}
      >
        <View style={styles.logoIcon}>
          <Ionicons name="film" size={32} color="#e50914" />
        </View>
        <Text style={styles.logoText}>MovieFlix</Text>
      </Animated.View>

      {/* Main card */}
      <Animated.View
        style={[
          styles.card,
          { maxWidth: cardMaxWidth },
          {
            opacity: cardAnim,
            transform: [
              { translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
              { scale: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'transparent']}
          style={[StyleSheet.absoluteFill, { borderRadius: 32 }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />

        <View style={styles.columns}>
          {/* Left: Form */}
          <View style={styles.formColumn}>
            <View style={styles.header}>
              <Text style={[styles.title, isCompact && styles.titleCompact]}>Welcome back</Text>
              <Text style={styles.subtitle}>Sign in to continue watching</Text>
            </View>

            {/* Input fields */}
            <View style={styles.fieldsRow}>
              <TvFocusable
                onPress={() => setActiveField('email')}
                tvPreferredFocus={activeField === 'email'}
                isTVSelectable={true}
                accessibilityLabel="Email field"
                style={({ focused }: any) => [
                  styles.field,
                  activeField === 'email' && styles.fieldActive,
                  focused && styles.fieldFocused,
                ]}
              >
                <View style={styles.fieldIcon}>
                  <Ionicons name="mail-outline" size={18} color={activeField === 'email' ? '#e50914' : 'rgba(255,255,255,0.5)'} />
                </View>
                <View style={styles.fieldContent}>
                  <Text style={styles.fieldLabel}>Email</Text>
                  <Text style={styles.fieldValue} numberOfLines={1}>
                    {email || 'Enter your email'}
                  </Text>
                </View>
                {activeField === 'email' && <View style={styles.fieldIndicator} />}
              </TvFocusable>

              <TvFocusable
                onPress={() => setActiveField('password')}
                isTVSelectable={true}
                accessibilityLabel="Password field"
                style={({ focused }: any) => [
                  styles.field,
                  activeField === 'password' && styles.fieldActive,
                  focused && styles.fieldFocused,
                ]}
              >
                <View style={styles.fieldIcon}>
                  <Ionicons name="lock-closed-outline" size={18} color={activeField === 'password' ? '#e50914' : 'rgba(255,255,255,0.5)'} />
                </View>
                <View style={styles.fieldContent}>
                  <Text style={styles.fieldLabel}>Password</Text>
                  <Text style={styles.fieldValue} numberOfLines={1}>
                    {password ? '•'.repeat(Math.min(password.length, 20)) : 'Enter your password'}
                  </Text>
                </View>
                {activeField === 'password' && <View style={styles.fieldIndicator} />}
              </TvFocusable>
            </View>

            {/* Keyboard header */}
            <View style={styles.keyboardHeader}>
              <Text style={styles.keyboardLabel}>
                <Ionicons name="keypad-outline" size={14} color="rgba(255,255,255,0.5)" />{' '}
                Typing: {activeField === 'email' ? 'Email' : 'Password'}
              </Text>
              <TvFocusable
                onPress={() => setLowercase((prev) => !prev)}
                isTVSelectable={true}
                accessibilityLabel="Toggle case"
                style={({ focused }: any) => [styles.caseBtn, focused && styles.caseBtnFocused]}
              >
                <Ionicons name={lowercase ? 'text-outline' : 'text'} size={16} color="#fff" />
                <Text style={styles.caseText}>{lowercase ? 'abc' : 'ABC'}</Text>
              </TvFocusable>
            </View>

            {/* Virtual keyboard */}
            <View style={[styles.keyboardContainer, isCompact && styles.keyboardContainerCompact]}>
              <TvVirtualKeyboard
                mode={activeField === 'email' ? 'email' : 'default'}
                disabled={busy}
                onKeyPress={applyKey}
              />
            </View>

            {/* Action buttons */}
            <View style={styles.actionsRow}>
              <TvFocusable
                onPress={() => void submit()}
                disabled={!canSubmit}
                isTVSelectable={true}
                accessibilityLabel="Sign in"
                style={({ focused }: any) => [
                  styles.primaryBtn,
                  !canSubmit && styles.btnDisabled,
                  focused && styles.primaryBtnFocused,
                ]}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="log-in-outline" size={20} color="#fff" />
                )}
                <Text style={styles.primaryText}>{busy ? 'Signing in...' : 'Sign In'}</Text>
              </TvFocusable>

              <TvFocusable
                onPress={() => router.push('/(auth)/signup')}
                isTVSelectable={true}
                accessibilityLabel="Create account"
                style={({ focused }: any) => [styles.secondaryBtn, focused && styles.secondaryBtnFocused]}
              >
                <Ionicons name="person-add-outline" size={18} color="#fff" />
                <Text style={styles.secondaryText}>Create Account</Text>
              </TvFocusable>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.divider}>
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.15)', 'transparent']}
              style={styles.dividerLine}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
            />
            <View style={styles.dividerBadge}>
              <Text style={styles.dividerText}>OR</Text>
            </View>
          </View>

          {/* Right: QR Code */}
          <View style={styles.qrColumn}>
            <View style={styles.qrHeader}>
              <View style={styles.qrIconWrap}>
                <Ionicons name="qr-code-outline" size={24} color="#e50914" />
              </View>
              <View>
                <Text style={styles.qrTitle}>Quick Sign In</Text>
                <Text style={styles.qrSubtitle}>Scan with your phone</Text>
              </View>
            </View>

            <View style={styles.qrBox}>
              {qrSession ? (
                <View style={styles.qrCodeWrap}>
                  <QRCode
                    value={JSON.stringify({ v: 1, t: 'mf_tv_login', code: qrSession.code, nonce: qrSession.nonce })}
                    size={180}
                    quietZone={10}
                    backgroundColor="#ffffff"
                    color="#000000"
                  />
                </View>
              ) : (
                <View style={styles.qrPlaceholder}>
                  {qrBusy ? (
                    <ActivityIndicator color="#e50914" size="large" />
                  ) : (
                    <Ionicons name="alert-circle-outline" size={40} color="rgba(0,0,0,0.4)" />
                  )}
                  <Text style={styles.qrPlaceholderText}>{qrError || 'Loading...'}</Text>
                </View>
              )}
            </View>

            {qrSession && (
              <View style={styles.qrCodeDisplay}>
                <Text style={styles.qrCodeLabel}>Code</Text>
                <Text style={styles.qrCodeValue}>{qrSession.code}</Text>
              </View>
            )}

            <View style={styles.qrSteps}>
              <View style={styles.qrStep}>
                <View style={styles.qrStepNum}><Text style={styles.qrStepNumText}>1</Text></View>
                <Text style={styles.qrStepText}>Open MovieFlix on phone</Text>
              </View>
              <View style={styles.qrStep}>
                <View style={styles.qrStepNum}><Text style={styles.qrStepNumText}>2</Text></View>
                <Text style={styles.qrStepText}>Go to Settings → TV Sign-in</Text>
              </View>
              <View style={styles.qrStep}>
                <View style={styles.qrStepNum}><Text style={styles.qrStepNumText}>3</Text></View>
                <Text style={styles.qrStepText}>Scan this QR code</Text>
              </View>
            </View>

            <TvFocusable
              onPress={() => void createQrSession()}
              isTVSelectable={true}
              accessibilityLabel="Refresh QR code"
              style={({ focused }: any) => [styles.qrRefreshBtn, focused && styles.qrRefreshBtnFocused]}
            >
              <Ionicons name="refresh-outline" size={18} color="#fff" />
              <Text style={styles.qrRefreshText}>Refresh QR Code</Text>
            </TvFocusable>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 80,
    paddingVertical: 40,
  },
  glowContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  glow: {
    flex: 1,
    borderBottomLeftRadius: 500,
    borderBottomRightRadius: 500,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 28,
  },
  logoIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(229,9,20,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  card: {
    width: '100%',
    borderRadius: 32,
    padding: 36,
    backgroundColor: 'rgba(10,12,25,0.85)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 20,
  },
  columns: {
    flexDirection: 'row',
    gap: 32,
  },
  formColumn: {
    flex: 1,
    minWidth: 0,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  titleCompact: {
    fontSize: 30,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  fieldsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
    overflow: 'hidden',
  },
  fieldActive: {
    borderColor: 'rgba(229,9,20,0.6)',
    backgroundColor: 'rgba(229,9,20,0.08)',
  },
  fieldFocused: {
    transform: [{ scale: 1.02 }],
    borderColor: '#fff',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  fieldIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldContent: {
    flex: 1,
    minWidth: 0,
  },
  fieldLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  fieldValue: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 4,
  },
  fieldIndicator: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 12,
    width: 4,
    borderRadius: 2,
    backgroundColor: '#e50914',
  },
  keyboardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 8,
  },
  keyboardLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '700',
  },
  caseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  caseBtnFocused: {
    transform: [{ scale: 1.05 }],
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  caseText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  keyboardContainer: {
    marginTop: 4,
  },
  keyboardContainerCompact: {
    marginTop: 0,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 24,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#e50914',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  primaryBtnFocused: {
    transform: [{ scale: 1.03 }],
    backgroundColor: '#ff1a28',
    borderColor: '#fff',
    shadowColor: '#e50914',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
  },
  primaryText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '900',
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 60,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  secondaryBtnFocused: {
    transform: [{ scale: 1.03 }],
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  secondaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  divider: {
    width: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dividerLine: {
    position: 'absolute',
    top: 40,
    bottom: 40,
    width: 1,
  },
  dividerBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(10,12,25,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  dividerText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '800',
  },
  qrColumn: {
    width: 320,
    paddingLeft: 8,
  },
  qrHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
  qrIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(229,9,20,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
  },
  qrSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  qrBox: {
    height: 220,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  qrCodeWrap: {
    padding: 10,
  },
  qrPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 20,
  },
  qrPlaceholderText: {
    color: 'rgba(0,0,0,0.5)',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  qrCodeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  qrCodeLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '700',
  },
  qrCodeValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 4,
  },
  qrSteps: {
    marginTop: 20,
    gap: 12,
  },
  qrStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  qrStepNum: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: 'rgba(229,9,20,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrStepNumText: {
    color: '#e50914',
    fontSize: 12,
    fontWeight: '900',
  },
  qrStepText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  qrRefreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 20,
    height: 50,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  qrRefreshBtnFocused: {
    transform: [{ scale: 1.03 }],
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  qrRefreshText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
});
