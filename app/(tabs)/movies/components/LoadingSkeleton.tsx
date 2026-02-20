import React from 'react';
import { View, StyleSheet } from 'react-native';

const LoadingSkeleton = () => (
  <View style={styles.skeletonContainer}>
    {/* Glassy header hero */}
    <View style={[styles.skeletonBlock, styles.skeletonHeader]}>
      <View style={styles.skeletonHeaderLeft}>
        <View style={styles.skeletonAccentDot} />
        <View>
          <View style={styles.skeletonLineShort} />
          <View style={[styles.skeletonLine, { width: '70%', marginTop: 6 }]} />
        </View>
      </View>
      <View style={styles.skeletonIconRow} />
    </View>

    {/* Meta pills under header */}
    <View style={[styles.skeletonBlock, styles.skeletonMetaPills]}>
      <View style={styles.skeletonPill} />
      <View style={styles.skeletonPill} />
      <View style={[styles.skeletonPill, { width: 80 }]} />
    </View>

    {/* Stories strip */}
    <View style={[styles.skeletonBlock, styles.skeletonStory]}>
      <View style={styles.skeletonStoryRow}>
        <View style={styles.skeletonStoryAvatar} />
        <View style={styles.skeletonStoryAvatar} />
        <View style={styles.skeletonStoryAvatar} />
        <View style={styles.skeletonStoryAvatar} />
      </View>
    </View>

    {/* Filter chips + browse-by-genre row */}
    <View style={[styles.skeletonBlock, styles.skeletonFilters]}>
      <View style={styles.skeletonChipRow}>
        <View style={styles.skeletonChip} />
        <View style={styles.skeletonChip} />
        <View style={styles.skeletonChip} />
        <View style={[styles.skeletonChip, { width: 70 }]} />
      </View>
      <View style={[styles.skeletonLineShort, { marginTop: 10, width: 120 }]} />
    </View>

    {/* Featured movie card */}
    <View style={[styles.skeletonBlock, styles.skeletonFeatured]}>
      <View style={styles.skeletonFeaturedPoster} />
      <View style={styles.skeletonFeaturedMeta}>
        <View style={styles.skeletonLineLarge} />
        <View style={[styles.skeletonLine, { width: '60%', marginTop: 6 }]} />
        <View style={styles.skeletonPillRow}>
          <View style={styles.skeletonPill} />
          <View style={styles.skeletonPill} />
        </View>
      </View>
    </View>

    {/* Song list / horizontal carousels */}
    <View style={[styles.skeletonBlock, styles.skeletonList]}>
      <View style={styles.skeletonLineShort} />
      <View style={styles.skeletonCarouselRow}>
        <View style={styles.skeletonPosterSmall} />
        <View style={styles.skeletonPosterSmall} />
        <View style={styles.skeletonPosterSmall} />
      </View>
    </View>

    {/* Extra movie rows */}
    <View style={[styles.skeletonBlock, styles.skeletonListRow]}>
      <View style={styles.skeletonLineShort} />
      <View style={styles.skeletonRow} />
    </View>
    <View style={[styles.skeletonBlock, styles.skeletonListRow]}>
      <View style={styles.skeletonLineShort} />
      <View style={styles.skeletonRow} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  skeletonContainer: {
    padding: 14,
    gap: 12,
  },
  skeletonBlock: {
    borderRadius: 14,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    marginBottom: 12,
  },
  skeletonHeader: {
    height: 64,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skeletonHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  skeletonAccentDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(229,9,20,0.65)',
  },
  skeletonLine: {
    height: 12,
    width: '60%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    marginBottom: 8,
  },
  skeletonLineLarge: {
    height: 14,
    width: '80%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    marginBottom: 8,
  },
  skeletonLineShort: {
    height: 12,
    width: '40%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
  },
  skeletonIconRow: {
    width: 110,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
  },
  skeletonRow: {
    height: 86,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
  },
  skeletonMetaPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  skeletonPill: {
    height: 26,
    width: 80,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  skeletonStory: {
    height: 110,
    justifyContent: 'center',
  },
  skeletonStoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  skeletonStoryAvatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  skeletonFilters: {
    paddingVertical: 10,
  },
  skeletonChipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  skeletonChip: {
    height: 28,
    width: 70,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  skeletonFeatured: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  skeletonFeaturedPoster: {
    width: 110,
    height: 150,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  skeletonFeaturedMeta: {
    flex: 1,
    justifyContent: 'center',
    gap: 8,
  },
  skeletonPillRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  skeletonList: {
    paddingVertical: 10,
  },
  skeletonCarouselRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  skeletonPosterSmall: {
    width: 90,
    height: 130,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  skeletonListRow: {
    paddingVertical: 10,
  },
});

export default LoadingSkeleton;
