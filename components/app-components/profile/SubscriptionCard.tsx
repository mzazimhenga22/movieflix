import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AnimatedSection from './AnimatedSection';
import LiquidGlass from '../LiquidGlass';

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

  const statusColor = subscriptionStatus === 'rejected' ? '#ff6b6b' : accent;

  return (
    <AnimatedSection delay={230}>
      <LiquidGlass
        glowColor={statusColor}
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
            glowColor={statusColor}
            tintColor="#1a1a2e"
            tintOpacity={0.4}
            cornerRadius={10}
            glowIntensity={0.4}
            borderWidth={1}
            style={styles.iconWrap}
            animated={false}
          >
            <Ionicons
              name={subscriptionStatus === 'rejected' ? 'alert-circle' : 'time-outline'}
              size={18}
              color={statusColor}
            />
          </LiquidGlass>
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
            Temporary access is enabled while an admin confirms your Paybill receipt. If the payment can not be confirmed,
            access may be revoked.
          </Text>
        )}

        {subscriptionReceipt ? (
          <LiquidGlass
            glowColor={accent}
            tintColor="#1a1a2e"
            tintOpacity={0.4}
            cornerRadius={14}
            glowIntensity={0.3}
            borderWidth={1}
            style={[styles.referralCodePill, { marginTop: 10 }]}
            animated={false}
          >
            <Ionicons name="receipt-outline" size={16} color={accent} />
            <Text style={styles.referralCodeText}>{subscriptionReceipt}</Text>
          </LiquidGlass>
        ) : null}

        <TouchableOpacity
          onPress={() => deferNav(() => router.push('/premium?source=profile'))}
          activeOpacity={0.85}
        >
          <LiquidGlass
            glowColor={accent}
            tintColor={accent}
            tintOpacity={0.3}
            cornerRadius={14}
            glowIntensity={0.6}
            borderWidth={1.5}
            style={[styles.referralShareBtn, { marginTop: 10 }]}
            animated={true}
          >
            <Ionicons name="diamond-outline" size={18} color="#fff" />
            <Text style={styles.referralShareText}>View plan</Text>
          </LiquidGlass>
        </TouchableOpacity>
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
});

export default SubscriptionCard;
