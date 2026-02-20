import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { IMAGE_BASE_URL } from '../../../../constants/api';
import { Media } from '../../../../types/index';

interface PreviewSheetProps {
  previewVisible: boolean;
  featuredMovie: Media | null;
  closeQuickPreview: () => void;
  handleOpenDetails: (item: Media) => void;
  getGenreNames: (genreIds: number[]) => string;
  featuredAccent: string;
}

const PreviewSheet: React.FC<PreviewSheetProps> = ({
  previewVisible,
  featuredMovie,
  closeQuickPreview,
  handleOpenDetails,
  getGenreNames,
  featuredAccent,
}) => {
  const previewTranslate = useRef(new Animated.Value(320)).current;

  useEffect(() => {
    if (previewVisible) {
      previewTranslate.setValue(320);
      Animated.timing(previewTranslate, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [previewVisible, previewTranslate]);

  if (!previewVisible || !featuredMovie) return null;

  return (
    <Animated.View
      style={[styles.previewSheet, { transform: [{ translateY: previewTranslate }] }]}
    >
      <View
        style={[
          styles.previewCard,
          {
            borderColor: featuredAccent,
          },
        ]}
      >
        <View style={styles.previewRow}>
          <Image
            source={{ uri: `${IMAGE_BASE_URL}${featuredMovie.poster_path}` }}
            style={styles.previewPoster}
          />
          <View style={styles.previewTitleBlock}>
            <Text numberOfLines={2} style={styles.previewTitle}>
              {featuredMovie.title || featuredMovie.name}
            </Text>
            <Text style={styles.previewMeta}>
              {((featuredMovie.vote_average || 0) * 10).toFixed(0)}% match •{' '}
              {(featuredMovie.release_date || featuredMovie.first_air_date || '').slice(0, 4)}
            </Text>
            <Text numberOfLines={1} style={styles.previewMeta}>
              {getGenreNames(featuredMovie.genre_ids || [])}
            </Text>
          </View>
          <TouchableOpacity style={styles.previewCloseIcon} onPress={closeQuickPreview}>
            <Ionicons name="close" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {featuredMovie.overview ? (
          <Text numberOfLines={3} style={styles.previewOverview}>
            {featuredMovie.overview}
          </Text>
        ) : null}

        <View style={styles.previewActions}>
          <TouchableOpacity
            style={styles.previewPrimaryBtn}
            onPress={() => handleOpenDetails(featuredMovie)}
          >
            <Ionicons name="play" size={16} color="#000" />
            <Text style={styles.previewPrimaryText}>Play</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.previewSecondaryBtn}
            onPress={() => handleOpenDetails(featuredMovie)}
          >
            <Ionicons name="information-circle-outline" size={16} color="#fff" />
            <Text style={styles.previewSecondaryText}>Full details</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  previewSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 130,
    paddingHorizontal: 12,
    paddingBottom: 0,
  },
  previewCard: {
    borderRadius: 26,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: 'rgba(5,6,15,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  previewPoster: {
    width: 60,
    height: 90,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    marginRight: 12,
  },
  previewTitleBlock: {
    flex: 1,
  },
  previewTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  previewMeta: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 4,
  },
  previewOverview: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    marginBottom: 10,
  },
  previewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  previewPrimaryText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 8,
  },
  previewSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  previewSecondaryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
    marginLeft: 6,
  },
  previewCloseIcon: {
    padding: 6,
  },
});

export default PreviewSheet;
