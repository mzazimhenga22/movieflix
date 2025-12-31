import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { authPromise, firestore } from '@/constants/firebase';
import TvVirtualKeyboard from '../components/TvVirtualKeyboard';
import { TvFocusable } from '../components/TvSpatialNavigation';

export default function TvSignupScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeField, setActiveField] = useState<'name' | 'email' | 'password' | 'confirm'>('name');
  const [lowercase, setLowercase] = useState(true);

  const canSubmit = useMemo(() => {
    return (
      name.trim().length >= 2 &&
      email.trim().length > 3 &&
      password.length >= 6 &&
      confirm.length >= 6 &&
      password === confirm &&
      !busy
    );
  }, [busy, confirm, email, name, password]);

  const applyKey = useCallback(
    (value: string) => {
      const set =
        activeField === 'name'
          ? setName
          : activeField === 'email'
            ? setEmail
            : activeField === 'password'
              ? setPassword
              : setConfirm;

      if (value === 'DEL') {
        set((prev) => prev.slice(0, -1));
        return;
      }
      if (value === 'CLEAR') {
        set('');
        return;
      }

      if (value === ' ' && activeField === 'email') return;

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
    const displayName = name.trim();
    const e = email.trim();
    if (!displayName || !e || !password) {
      Alert.alert('Missing info', 'Fill in all fields.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Passwords do not match', 'Re-enter your password.');
      return;
    }

    try {
      setBusy(true);
      const auth = await authPromise;
      const cred = await createUserWithEmailAndPassword(auth, e, password);
      await updateProfile(cred.user, { displayName });
      await setDoc(
        doc(firestore, 'users', cred.user.uid),
        {
          displayName,
          email: e,
          planTier: 'free',
          createdAt: Date.now(),
        },
        { merge: true },
      );
      router.replace('/select-profile');
    } catch (err: any) {
      Alert.alert('Sign up failed', err?.message ?? 'Unable to create account.');
    } finally {
      setBusy(false);
    }
  }, [confirm, email, name, password]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#150a13', '#070815', '#05060f']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        style={{ flex: 1, width: '100%' }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>Use the same account on phone and TV.</Text>

        <View style={styles.fieldsGrid}>
          <TvFocusable
            onPress={() => setActiveField('name')}
            style={({ focused }: any) => [
              styles.field,
              activeField === 'name' ? styles.fieldActive : null,
              focused ? styles.fieldFocused : null,
            ]}
          >
            <Text style={styles.fieldLabel}>Name</Text>
            <Text style={styles.fieldValue} numberOfLines={1}>
              {name || '—'}
            </Text>
          </TvFocusable>

          <TvFocusable
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
          </TvFocusable>

          <TvFocusable
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
          </TvFocusable>

          <TvFocusable
            onPress={() => setActiveField('confirm')}
            style={({ focused }: any) => [
              styles.field,
              activeField === 'confirm' ? styles.fieldActive : null,
              focused ? styles.fieldFocused : null,
            ]}
          >
            <Text style={styles.fieldLabel}>Confirm</Text>
            <Text style={styles.fieldValue} numberOfLines={1}>
              {confirm ? '•'.repeat(Math.min(confirm.length, 18)) : '—'}
            </Text>
          </TvFocusable>
        </View>

        <View style={styles.keyboardHeaderRow}>
          <Text style={styles.keyboardHint}>Use the on-screen keyboard</Text>
          <TvFocusable
            onPress={() => setLowercase((prev) => !prev)}
            style={({ focused }: any) => [styles.caseBtn, focused ? styles.caseBtnFocused : null]}
          >
            <Text style={styles.caseText}>{lowercase ? 'abc' : 'ABC'}</Text>
          </TvFocusable>
        </View>

        <TvVirtualKeyboard
          mode={activeField === 'email' ? 'email' : 'default'}
          disabled={busy}
          onKeyPress={applyKey}
        />

        <TvFocusable
          onPress={() => void submit()}
          disabled={!canSubmit}
          style={({ focused }: any) => [
            styles.primaryBtn,
            !canSubmit ? styles.btnDisabled : null,
            focused ? styles.btnFocused : null,
          ]}
        >
          {busy ? <ActivityIndicator color="#fff" /> : null}
          <Text style={styles.primaryText}>{busy ? 'Creating…' : 'Create account'}</Text>
        </TvFocusable>

          <TvFocusable
            onPress={() => router.replace('/(auth)/login')}
            style={({ focused }: any) => [styles.secondaryBtn, focused ? styles.btnFocused : null]}
          >
            <Text style={styles.secondaryText}>Back to login</Text>
          </TvFocusable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  card: {
    width: '92%',
    maxWidth: 980,
    borderRadius: 24,
    padding: 26,
    backgroundColor: 'rgba(0,0,0,0.26)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  title: { color: '#fff', fontSize: 34, fontWeight: '900' },
  subtitle: { color: 'rgba(255,255,255,0.72)', fontSize: 16, fontWeight: '700', marginTop: 6 },
  fieldsGrid: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  field: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 320,
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
