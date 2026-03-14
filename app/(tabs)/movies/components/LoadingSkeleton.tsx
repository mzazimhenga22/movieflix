import LiquidGlass from '@/components/app-components/LiquidGlass';
import React from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * LoadingSkeleton — Apple-like glass aesthetic
 *
 * Uses very subtle glass (low tint, dark tintColor, minimal borders)
 * to create a clean, premium skeleton loading experience.
 */
const LoadingSkeleton = () => (
  <View style={styles.skeletonContainer}>
    {/* Glassy header hero */}
    <LiquidGlass tintOpacity={0.06} tintColor="#0a0a0a" cornerRadius={24} borderOpacity={0.08} style={[styles.skeletonBlock, styles.skeletonHeader]}>
      <View style={styles.skeletonHeaderLeft}>
        <View style={[styles.skeletonAccentDot, { backgroundColor: 'rgba(229,9,20,0.4)', borderRadius: 6 }]} />
        <View>
          <View style={[styles.skeletonLineShort, { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6 }]} />
          <View style={[styles.skeletonLine, { width: '70%', marginTop: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 6 }]} />
        </View>
      </View>
      <View style={[styles.skeletonIconRow, { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12 }]} />
    </LiquidGlass>

    {/* Meta pills under header */}
    <View style={[styles.skeletonBlock, styles.skeletonMetaPills]}>
      <View style={[styles.skeletonPill, { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 999 }]} />
      <View style={[styles.skeletonPill, { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 999 }]} />
      <View style={[styles.skeletonPill, { width: 80, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 999 }]} />
    </View>

    {/* Stories strip */}
    <View style={[styles.skeletonBlock, styles.skeletonStory]}>
      <View style={styles.skeletonStoryRow}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.skeletonStoryAvatar, { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 35 }]} />
        ))}
      </View>
    </View>

    {/* Filter chips + browse-by-genre row */}
    <View style={[styles.skeletonBlock, styles.skeletonFilters, { backgroundColor: 'transparent' }]}>
      <View style={styles.skeletonChipRow}>
        <View style={[styles.skeletonChip, { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 999 }]} />
        <View style={[styles.skeletonChip, { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 999 }]} />
        <View style={[styles.skeletonChip, { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 999 }]} />
        <View style={[styles.skeletonChip, { width: 70, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 999 }]} />
      </View>
      <View style={[styles.skeletonLineShort, { marginTop: 14, width: 120, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 6 }]} />
    </View>

    {/* Featured movie card */}
    <LiquidGlass tintOpacity={0.04} tintColor="#0a0a0a" cornerRadius={26} borderOpacity={0.06} style={[styles.skeletonBlock, styles.skeletonFeatured]}>
      <View style={[styles.skeletonFeaturedPoster, { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16 }]} />
      <View style={styles.skeletonFeaturedMeta}>
        <View style={[styles.skeletonLineLarge, { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6 }]} />
        <View style={[styles.skeletonLine, { width: '60%', marginTop: 6, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 6 }]} />
        <View style={styles.skeletonPillRow}>
          <View style={[styles.skeletonPill, { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12 }]} />
          <View style={[styles.skeletonPill, { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12 }]} />
        </View>
      </View>
    </LiquidGlass>

    {/* Song list / horizontal carousels */}
    <View style={[styles.skeletonBlock, styles.skeletonList, { backgroundColor: 'transparent' }]}>
      <View style={[styles.skeletonLineShort, { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 6 }]} />
      <View style={styles.skeletonCarouselRow}>
        {[1, 2, 3].map((i) => (
          <View key={i} style={[styles.skeletonPosterSmall, { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16 }]} />
        ))}
      </View>
    </View>

    {/* Extra movie rows */}
    {[1, 2].map((i) => (
      <View key={`row-${i}`} style={[styles.skeletonBlock, styles.skeletonListRow, { backgroundColor: 'transparent' }]}>
        <View style={[styles.skeletonLineShort, { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 6 }]} />
        <View style={[styles.skeletonRow, { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 18 }]} />
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  skeletonContainer: {
    padding: 14,
    gap: 12,
  },
  skeletonBlock: {
    marginBottom: 12,
  },
  skeletonHeader: {
    height: 72,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skeletonHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  skeletonAccentDot: {
    width: 14,
    height: 14,
  },
  skeletonLine: {
    height: 12,
    width: '60%',
  },
  skeletonLineLarge: {
    height: 16,
    width: '80%',
  },
  skeletonLineShort: {
    height: 14,
    width: '40%',
  },
  skeletonIconRow: {
    width: 100,
    height: 36,
  },
  skeletonRow: {
    height: 100,
    marginTop: 10,
  },
  skeletonMetaPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  skeletonPill: {
    height: 28,
    width: 70,
  },
  skeletonStory: {
    height: 110,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  skeletonStoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  skeletonStoryAvatar: {
    width: 70,
    height: 70,
  },
  skeletonFilters: {
    paddingVertical: 10,
  },
  skeletonChipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  skeletonChip: {
    height: 32,
    width: 75,
  },
  skeletonFeatured: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
  },
  skeletonFeaturedPoster: {
    width: 110,
    height: 150,
  },
  skeletonFeaturedMeta: {
    flex: 1,
    justifyContent: 'center',
    gap: 8,
  },
  skeletonPillRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  skeletonList: {
    paddingVertical: 10,
  },
  skeletonCarouselRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  skeletonPosterSmall: {
    width: 100,
    height: 140,
  },
  skeletonListRow: {
    paddingVertical: 10,
  },
});

export default LoadingSkeleton;