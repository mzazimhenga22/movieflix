import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AnimatedSection from './AnimatedSection';

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
    <AnimatedSection delay={400} style={[styles.glassCard, { borderColor: `${accent}20` }]}>
      <LinearGradient
        colors={[`${accent}10`, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFillObject, { borderRadius: 18 }]}
      />
      <View style={styles.sectionHeader}>
        <Ionicons name="gift" size={20} color={accent} />
        <Text style={styles.sectionTitle}>Referral</Text>
      </View>
      <Text style={styles.referralHint}>
        Share your link. 5 signups = free Plus plan • 10 signups = free Premium plan.
      </Text>

      <View style={styles.referralRow}>
        <View style={[styles.referralCodePill, { borderColor: `${accent}30` }]}>
          <Ionicons name="pricetag" size={16} color={accent} />
          <Text style={styles.referralCodeText}>{referralCode || '—'}</Text>
        </View>
        <TouchableOpacity
          style={[styles.referralShareBtn, { borderColor: accent, backgroundColor: `${accent}20` }]}
          onPress={handleShareReferral}
          disabled={!referralCode}
        >
          <Ionicons name="share-social" size={18} color="#fff" />
          <Text style={styles.referralShareText}>Share</Text>
        </TouchableOpacity>
      </View>

      {/* Referral progress bar */}
      <View style={styles.referralProgressWrap}>
        <View style={styles.referralProgressBar}>
          <View
            style={[
              styles.referralProgressFill,
              { width: `${Math.min(100, (referralsCount / 10) * 100)}%`, backgroundColor: accent },
            ]}
          />
        </View>
        <Text style={styles.referralProgressText}>
          {referralsCount} / 10 referrals
        </Text>
      </View>
    </AnimatedSection>
  );
});

const styles = StyleSheet.create({
  glassCard: {
    backgroundColor: 'rgba(15,18,35,0.6)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
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
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    flexGrow: 1,
    minWidth: 180,
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
    backgroundColor: 'rgba(229,9,20,0.16)',
    borderWidth: 1,
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
    backgroundColor: 'rgba(255,255,255,0.1)',
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
