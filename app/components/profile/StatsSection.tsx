import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import AnimatedSection from './AnimatedSection';
import AnimatedStat from './AnimatedStat';

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
    <AnimatedSection delay={200} style={styles.statsContainer}>
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
    </AnimatedSection>
  );
});

const styles = StyleSheet.create({
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(15,18,35,0.6)',
    padding: 18,
    borderRadius: 20,
    marginBottom: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    flexWrap: 'wrap',
    rowGap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
});

export default StatsSection;
