import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TvFocusable } from './components/TvSpatialNavigation';

export default function PremiumTv() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#150a13', '#070815', '#05060f']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.card}>
        <Text style={styles.title}>Subscriptions on phone</Text>
        <Text style={styles.subtitle}>
          Manage upgrades and billing in the MovieFlix phone app.
        </Text>
        <Text style={styles.hint}>Open the phone app to upgrade, then come back to TV.</Text>
        <View style={styles.actions}>
          <TvFocusable
            onPress={() => router.back()}
            tvPreferredFocus
            style={({ focused }: any) => [styles.primaryBtn, focused ? styles.btnFocused : null]}
          >
            <Text style={styles.primaryText}>Go back</Text>
          </TvFocusable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  card: {
    width: '100%',
    maxWidth: 860,
    padding: 34,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(5,6,15,0.86)',
  },
  title: { color: '#fff', fontSize: 36, fontWeight: '900', marginBottom: 10 },
  subtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 18, marginBottom: 12 },
  hint: { color: 'rgba(255,255,255,0.65)', fontSize: 14 },
  actions: { marginTop: 22, flexDirection: 'row', gap: 12 },
  primaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 16,
    backgroundColor: '#e50914',
  },
  btnFocused: { 
    transform: [{ scale: 1.08 }], 
    borderWidth: 2, 
    borderColor: '#fff',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 10,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
