import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

import { authPromise } from '@/constants/firebase';

const logo = require('../assets/images/logo.png');

export default function TvSplash() {
  const didNavigate = useRef(false);
  const [status, setStatus] = useState('Loading…');

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const go = async () => {
      try {
        const auth = await authPromise;
        unsub = onAuthStateChanged(auth, async (user) => {
          if (didNavigate.current) return;

          if (!user) {
            setStatus('Sign in required');
            timeout = setTimeout(() => {
              if (didNavigate.current) return;
              didNavigate.current = true;
              router.replace('/(auth)/login');
            }, 900);
            return;
          }

          setStatus('Preparing profiles…');
          // Always go through profile selection on TV so older devices don't resume into a heavy home screen.
          const target = '/select-profile';
          timeout = setTimeout(() => {
            if (didNavigate.current) return;
            didNavigate.current = true;
            router.replace(target);
          }, 650);
        });
      } catch (err) {
        console.warn('[TvSplash] auth init failed', err);
        setStatus('Startup failed (missing Firebase config)');
      }
    };

    void go();

    return () => {
      try {
        unsub?.();
      } catch {}
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#05060f', '#070815', '#150a13']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.center}>
        <Image source={logo} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>MovieFlix</Text>
        <Text style={styles.subtitle}>TV</Text>
        <View style={styles.statusRow}>
          <ActivityIndicator color="#e50914" />
          <Text style={styles.statusText}>{status}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  logo: { width: 160, height: 160, marginBottom: 18 },
  title: { color: '#fff', fontSize: 52, fontWeight: '900', letterSpacing: 0.6 },
  subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 18, fontWeight: '800', letterSpacing: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 26 },
  statusText: { color: 'rgba(255,255,255,0.8)', fontSize: 16, fontWeight: '700' },
});
