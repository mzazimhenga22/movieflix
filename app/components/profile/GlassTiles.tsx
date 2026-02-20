import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AnimatedSection from './AnimatedSection';

interface GlassTilesProps {
  accent: string;
  deferNav: (fn: () => void) => void;
  router: any;
}

const GlassTiles = memo(function GlassTiles({ accent, deferNav, router }: GlassTilesProps) {
  return (
    <AnimatedSection delay={300} style={styles.glassRow}>
      <View style={[styles.glassTile, { borderColor: `${accent}25` }]}>
        <LinearGradient
          colors={[`${accent}15`, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[styles.tileIconWrap, { backgroundColor: `${accent}25` }]}>
          <Ionicons name="trophy" size={18} color={accent} />
        </View>
        <Text style={styles.tileLabel}>Creator Score</Text>
        <Text style={[styles.tileValue, { color: accent }]}>92</Text>
        <Text style={styles.tileSub}>Consistency • Quality</Text>
      </View>
      <View style={[styles.glassTile, { borderColor: 'rgba(100,130,255,0.2)' }]}>
        <LinearGradient
          colors={['rgba(100,130,255,0.1)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[styles.tileIconWrap, { backgroundColor: 'rgba(100,130,255,0.2)' }]}>
          <Ionicons name="wallet" size={18} color="#6482ff" />
        </View>
        <Text style={styles.tileLabel}>Earnings</Text>
        <Text style={[styles.tileValue, { color: '#6482ff' }]}>$1,240</Text>
        <TouchableOpacity
          style={[
            styles.pillCta,
            { backgroundColor: 'rgba(100,130,255,0.15)', borderColor: 'rgba(100,130,255,0.4)' },
          ]}
          onPress={() => deferNav(() => router.push('/marketplace/sell'))}
        >
          <Text style={styles.pillCtaText}>Go to marketplace</Text>
        </TouchableOpacity>
      </View>
    </AnimatedSection>
  );
});

const styles = StyleSheet.create({
  glassRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    flexWrap: 'wrap',
    rowGap: 12,
  },
  glassTile: {
    flex: 1,
    minWidth: 140,
    backgroundColor: 'rgba(15,18,35,0.5)',
    overflow: 'hidden',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    gap: 6,
  },
  tileLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  tileValue: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 18,
  },
  tileSub: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  tileIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  pillCta: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(229,9,20,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.6)',
    alignSelf: 'flex-start',
  },
  pillCtaText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
});

export default GlassTiles;
