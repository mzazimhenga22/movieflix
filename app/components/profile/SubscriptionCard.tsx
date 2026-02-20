import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AnimatedSection from './AnimatedSection';

interface SubscriptionCardProps {
  subscriptionStatus: string;
  subscriptionPending: boolean;
  subscriptionTemp: boolean;
  subscriptionReceipt: string;
  planTier: string;
  accent: string;
  deferNav: (fn: () => void) => void;
  router: any;
}

const SubscriptionCard = memo(function SubscriptionCard({
  subscriptionStatus,
  subscriptionPending,
  subscriptionTemp,
  subscriptionReceipt,
  planTier,
  accent,
  deferNav,
  router,
}: SubscriptionCardProps) {
  if (!subscriptionPending && !subscriptionTemp && subscriptionStatus !== 'rejected') {
    return null;
  }

  return (
    <AnimatedSection delay={230} style={[styles.glassCard, { borderColor: `${accent}25` }]}>
      <LinearGradient
        colors={[`${accent}10`, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFillObject, { borderRadius: 18 }]}
      />
      <View style={styles.sectionHeader}>
        <Ionicons
          name={subscriptionStatus === 'rejected' ? 'alert-circle' : 'time-outline'}
          size={18}
          color={subscriptionStatus === 'rejected' ? '#ff6b6b' : accent}
        />
        <Text style={styles.sectionTitle}>
          {subscriptionStatus === 'rejected' ? 'Subscription review' : 'Subscription pending'}
        </Text>
      </View>

      {subscriptionStatus === 'rejected' ? (
        <Text style={styles.referralHint}>
          Your payment could not be confirmed and temporary access was revoked. You are now on{' '}
          <Text style={{ fontWeight: '800', color: '#fff' }}>{String(planTier || 'free')}</Text>.
        </Text>
      ) : (
        <Text style={styles.referralHint}>
          Temporary access is enabled while an admin confirms your Paybill receipt. If the payment can’t be confirmed,
          access may be revoked.
        </Text>
      )}

      {subscriptionReceipt ? (
        <View style={[styles.referralCodePill, { borderColor: 'rgba(255,255,255,0.14)', marginTop: 10 }]}>
          <Ionicons name="receipt-outline" size={16} color={accent} />
          <Text style={styles.referralCodeText}>{subscriptionReceipt}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.referralShareBtn, { borderColor: accent, backgroundColor: `${accent}20`, marginTop: 10 }]}
        onPress={() => deferNav(() => router.push('/premium?source=profile'))}
      >
        <Ionicons name="diamond-outline" size={18} color="#fff" />
        <Text style={styles.referralShareText}>View plan</Text>
      </TouchableOpacity>
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
});

export default SubscriptionCard;
