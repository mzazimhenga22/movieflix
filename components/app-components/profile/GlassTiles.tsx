import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AnimatedSection from './AnimatedSection';
import LiquidGlass from '../LiquidGlass';

interface GlassTilesProps {
  accent: string;
  deferNav: (fn: () => void) => void;
  router: any;
}

const GlassTiles = memo(function GlassTiles({ accent, deferNav, router }: GlassTilesProps) {
  return (
    <AnimatedSection delay={300} style={styles.glassRow}>
      <LiquidGlass
        glowColor={accent}
        tintColor="#0f1224"
        tintOpacity={0.55}
        cornerRadius={14}
        glowIntensity={0.5}
        borderWidth={1}
        style={styles.glassTile}
        animated={true}
      >
        <LinearGradient
          colors={[`${accent}15`, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <LiquidGlass
          glowColor={accent}
          tintColor="#1a1a2e"
          tintOpacity={0.4}
          cornerRadius={12}
          glowIntensity={0.4}
          borderWidth={1}
          style={[styles.tileIconWrap, { borderColor: `${accent}40` }]}
          animated={false}
        >
          <Ionicons name="trophy" size={18} color={accent} />
        </LiquidGlass>
        <Text style={styles.tileLabel}>Creator Score</Text>
        <Text style={[styles.tileValue, { color: accent }]}>92</Text>
        <Text style={styles.tileSub}>Consistency • Quality</Text>
      </LiquidGlass>

      <LiquidGlass
        glowColor="#6482ff"
        tintColor="#0f1224"
        tintOpacity={0.55}
        cornerRadius={14}
        glowIntensity={0.5}
        borderWidth={1}
        style={styles.glassTile}
        animated={true}
      >
        <LinearGradient
          colors={['rgba(100,130,255,0.1)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <LiquidGlass
          glowColor="#6482ff"
          tintColor="#1a1a2e"
          tintOpacity={0.4}
          cornerRadius={12}
          glowIntensity={0.4}
          borderWidth={1}
          style={[styles.tileIconWrap, { borderColor: 'rgba(100,130,255,0.4)' }]}
          animated={false}
        >
          <Ionicons name="wallet" size={18} color="#6482ff" />
        </LiquidGlass>
        <Text style={styles.tileLabel}>Earnings</Text>
        <Text style={[styles.tileValue, { color: '#6482ff' }]}>$1,240</Text>
        <TouchableOpacity
          onPress={() => deferNav(() => router.push('/marketplace/sell'))}
          activeOpacity={0.85}
        >
          <LiquidGlass
            glowColor="#6482ff"
            tintColor="rgba(100,130,255,0.2)"
            tintOpacity={0.8}
            cornerRadius={12}
            glowIntensity={0.4}
            borderWidth={1}
            style={styles.pillCta}
            animated={false}
          >
            <Text style={styles.pillCtaText}>Go to marketplace</Text>
          </LiquidGlass>
        </TouchableOpacity>
      </LiquidGlass>
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
    overflow: 'hidden',
    borderRadius: 14,
    padding: 12,
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
    overflow: 'hidden',
  },
  pillCta: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
  pillCtaText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
});

export default GlassTiles;
