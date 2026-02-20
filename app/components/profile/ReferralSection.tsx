import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AnimatedSection from './AnimatedSection';
import LiquidGlass from '../LiquidGlass';

interface ReferralSectionProps {
  accent: string;
  referralCode: string;
  referralsCount: number;
  handleShareReferral: () => void;
}

const ReferralSection = memo(function ReferralSection({
  accent,
  referralCode,
  referralsCount,
  handleShareReferral,
}: ReferralSectionProps) {
  return (
    <AnimatedSection delay={400}>
      <LiquidGlass
        glowColor={accent}
        tintColor="#0f1224"
        tintOpacity={0.6}
        cornerRadius={20}
        glowIntensity={0.5}
        borderWidth={1.5}
        style={styles.glassCard}
        animated={true}
      >
        <LinearGradient
          colors={[`${accent}10`, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: 18 }]}
        />
        <View style={styles.sectionHeader}>
          <LiquidGlass
            glowColor={accent}
            tintColor="#1a1a2e"
            tintOpacity={0.4}
            cornerRadius={10}
            glowIntensity={0.4}
            borderWidth={1}
            style={styles.iconWrap}
            animated={false}
          >
            <Ionicons name="gift" size={20} color={accent} />
          </LiquidGlass>
          <Text style={styles.sectionTitle}>Referral</Text>
        </View>
        <Text style={styles.referralHint}>
          Share your link. 5 signups = free Plus plan • 10 signups = free Premium plan.
        </Text>

        <View style={styles.referralRow}>
          <LiquidGlass
            glowColor={accent}
            tintColor="#1a1a2e"
            tintOpacity={0.4}
            cornerRadius={14}
            glowIntensity={0.3}
            borderWidth={1}
            style={styles.referralCodePill}
            animated={false}
          >
            <Ionicons name="pricetag" size={16} color={accent} />
            <Text style={styles.referralCodeText}>{referralCode || '—'}</Text>
          </LiquidGlass>
          <TouchableOpacity
            onPress={handleShareReferral}
            disabled={!referralCode}
            activeOpacity={0.85}
          >
            <LiquidGlass
              glowColor={accent}
              tintColor={accent}
              tintOpacity={0.3}
              cornerRadius={14}
              glowIntensity={0.6}
              borderWidth={1.5}
              style={styles.referralShareBtn}
              animated={true}
            >
              <Ionicons name="share-social" size={18} color="#fff" />
              <Text style={styles.referralShareText}>Share</Text>
            </LiquidGlass>
          </TouchableOpacity>
        </View>

        {/* Referral progress bar */}
        <View style={styles.referralProgressWrap}>
          <LiquidGlass
            glowColor={accent}
            tintColor="#1a1a2e"
            tintOpacity={0.5}
            cornerRadius={3}
            glowIntensity={0.2}
            borderWidth={1}
            style={styles.referralProgressBar}
            animated={false}
          >
            <View
              style={[
                styles.referralProgressFill,
                { width: `${Math.min(100, (referralsCount / 10) * 100)}%`, backgroundColor: accent },
              ]}
            />
          </LiquidGlass>
          <Text style={styles.referralProgressText}>
            {referralsCount} / 10 referrals
          </Text>
        </View>
      </LiquidGlass>
    </AnimatedSection>
  );
});

const styles = StyleSheet.create({
  glassCard: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: 'white',
    marginBottom: 0,
  },
  referralHint: {
    marginTop: -6,
    marginBottom: 12,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    lineHeight: 16,
  },
  referralRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  referralCodePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    flexGrow: 1,
    minWidth: 180,
    overflow: 'hidden',
  },
  referralCodeText: {
    color: '#fff',
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  referralShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    overflow: 'hidden',
  },
  referralShareText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  referralProgressWrap: {
    marginTop: 14,
  },
  referralProgressBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  referralProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  referralProgressText: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.3,
  },
});

export default ReferralSection;
