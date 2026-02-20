import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import AnimatedSection from './AnimatedSection';
import AnimatedStat from './AnimatedStat';
import LiquidGlass from '../LiquidGlass';

interface StatsSectionProps {
  followersCount: number;
  followingCount: number;
  reviewsCount: number;
  accent: string;
  userIdToDisplay: string | undefined;
  deferNav: (fn: () => void) => void;
  router: any;
  onReviewsPress: () => void;
}

const StatsSection = memo(function StatsSection({
  followersCount,
  followingCount,
  reviewsCount,
  accent,
  userIdToDisplay,
  deferNav,
  router,
  onReviewsPress,
}: StatsSectionProps) {
  return (
    <AnimatedSection delay={200}>
      <LiquidGlass
        glowColor={accent}
        tintColor="#0f1224"
        tintOpacity={0.6}
        cornerRadius={20}
        glowIntensity={0.5}
        borderWidth={1.5}
        style={styles.statsContainer}
        animated={true}
      >
        <AnimatedStat
          value={followersCount}
          label="Followers"
          delay={250}
          accentColor={accent}
          onPress={() =>
            deferNav(() =>
              router.push({ pathname: '/followers', params: { userId: String(userIdToDisplay || '') } } as any)
            )
          }
        />
        <AnimatedStat
          value={followingCount}
          label="Following"
          delay={350}
          accentColor={accent}
          onPress={() =>
            deferNav(() =>
              router.push({ pathname: '/following', params: { userId: String(userIdToDisplay || '') } } as any)
            )
          }
        />
        <AnimatedStat
          value={reviewsCount}
          label="Reviews"
          hint="Tap to view"
          delay={450}
          accentColor={accent}
          onPress={onReviewsPress}
        />
      </LiquidGlass>
    </AnimatedSection>
  );
});

const styles = StyleSheet.create({
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 18,
    marginBottom: 24,
    flexWrap: 'wrap',
    rowGap: 12,
    overflow: 'hidden',
  },
});

export default StatsSection;
