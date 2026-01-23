import { Ionicons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

type MediaItem = {
  id: string;
  url: string;
  type: 'image' | 'video';
};

const MediaViewerScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ url?: string; type?: string; media?: string; index?: string }>();
  const fallbackUrl = params.url as string | undefined;
  const fallbackType = (params.type as string | undefined) || 'image';

  const mediaList: MediaItem[] = useMemo(() => {
    if (params.media) {
      try {
        const parsed = JSON.parse(params.media as string) as MediaItem[];
        return parsed.filter(m => m && m.url && (m.type === 'image' || m.type === 'video'));
      } catch {
        // fall through to fallback
      }
    }

    if (fallbackUrl) {
      return [
        {
          id: 'single',
          url: fallbackUrl,
          type: fallbackType === 'video' ? 'video' : 'image',
        },
      ];
    }

    return [];
  }, [params.media, fallbackUrl, fallbackType]);

  const initialIndex = useMemo(() => {
    if (!params.index) return 0;
    const idx = Number(params.index);
    if (Number.isNaN(idx)) return 0;
    return Math.min(Math.max(idx, 0), Math.max(mediaList.length - 1, 0));
  }, [params.index, mediaList.length]);

  const [currentIndex, setCurrentIndex] = useState<number>(initialIndex);

  const listRef = useRef<FlatList<MediaItem> | null>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const safeCurrentIndex = Math.min(Math.max(currentIndex, 0), Math.max(mediaList.length - 1, 0));
  const currentItem = mediaList[safeCurrentIndex];
  const headerTitle = mediaList.length > 1 ? `${safeCurrentIndex + 1} of ${mediaList.length}` : 'Media';
  const typeLabel = currentItem?.type === 'video' ? 'Video' : 'Photo';

  const jumpToIndex = useCallback(
    (index: number) => {
      if (!mediaList.length) return;
      const next = Math.min(Math.max(index, 0), mediaList.length - 1);
      setCurrentIndex(next);
      try {
        listRef.current?.scrollToIndex({ index: next, animated: true, viewPosition: 0.5 });
      } catch {
        // ignore
      }
    },
    [mediaList.length],
  );

  if (!mediaList.length) {
    return (
      <View style={styles.emptyContainer}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(0,0,0,0.95)', 'rgba(0,0,0,0.65)', 'rgba(0,0,0,1)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={[styles.topBar, { paddingTop: Math.max(10, insets.top + 8) }]}>
        <BlurView intensity={40} tint="dark" style={styles.topBarBlur}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>

          <View style={styles.topBarCenter}>
            <Text style={styles.headerTitle}>{headerTitle}</Text>
            <View style={styles.headerBadgesRow}>
              <View style={styles.badgePill}>
                <Ionicons name={currentItem?.type === 'video' ? 'videocam' : 'image'} size={12} color="#fff" />
                <Text style={styles.badgeText}>{typeLabel}</Text>
              </View>
            </View>
          </View>

          <View style={styles.iconButtonSpacer} />
        </BlurView>
      </View>

      <FlatList
        ref={(r) => {
          listRef.current = r;
        }}
        data={mediaList}
        horizontal
        pagingEnabled
        keyExtractor={(item) => item.id}
        initialScrollIndex={initialIndex}
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, index) => ({
          length: screenWidth,
          offset: screenWidth * index,
          index,
        })}
        onScrollToIndexFailed={(info) => {
          // Retry once after layout settles.
          setTimeout(() => {
            try {
              listRef.current?.scrollToIndex({ index: info.index, animated: true });
            } catch {
              // ignore
            }
          }, 80);
        }}
        onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
          setCurrentIndex(index);
        }}
        renderItem={({ item }) => {
          const isVideo = item.type === 'video';
          return (
            <View style={[styles.slide, { width: screenWidth, height: screenHeight }]}>
              <View style={[styles.mediaCard, { width: screenWidth, height: screenHeight }]}>
                {isVideo ? (
                  <Video
                    source={{ uri: item.url }}
                    style={[styles.media, { width: screenWidth, height: Math.round(screenHeight * 0.62) }]}
                    useNativeControls
                    resizeMode={ResizeMode.CONTAIN}
                    shouldPlay={false}
                  />
                ) : (
                  <Image
                    source={{ uri: item.url }}
                    style={[styles.media, { width: screenWidth, height: Math.round(screenHeight * 0.78) }]}
                    resizeMode="contain"
                  />
                )}

                {isVideo ? (
                  <View style={styles.videoHintPill} pointerEvents="none">
                    <Ionicons name="play" size={12} color="#fff" />
                    <Text style={styles.videoHintText}>Tap controls to play</Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        }}
      />

      {mediaList.length > 1 ? (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(12, insets.bottom + 10) }]}>
          <BlurView intensity={40} tint="dark" style={styles.bottomBarBlur}>
            <FlatList
              data={mediaList}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => `thumb-${item.id}`}
              contentContainerStyle={styles.thumbListContent}
              renderItem={({ item, index }) => {
                const selected = index === safeCurrentIndex;
                return (
                  <TouchableOpacity
                    style={[styles.thumbButton, selected && styles.thumbButtonSelected]}
                    onPress={() => jumpToIndex(index)}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${item.type === 'video' ? 'video' : 'photo'} ${index + 1}`}
                  >
                    {item.type === 'image' ? (
                      <Image source={{ uri: item.url }} style={styles.thumbImage} />
                    ) : (
                      <LinearGradient
                        colors={['rgba(255,255,255,0.14)', 'rgba(0,0,0,0.55)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.thumbVideo}
                      >
                        <Ionicons name="videocam" size={16} color="#fff" />
                      </LinearGradient>
                    )}
                    {item.type === 'video' ? (
                      <View style={styles.thumbVideoBadge}>
                        <Ionicons name="play" size={10} color="#fff" />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              }}
            />

            <View style={styles.bottomMetaRow}>
              <Text style={styles.bottomMetaText}>{typeLabel}</Text>
              <Text style={styles.bottomMetaDot}>•</Text>
              <Text style={styles.bottomMetaText}>{headerTitle}</Text>
            </View>
          </BlurView>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 40,
    paddingHorizontal: 16,
  },
  media: {
    borderRadius: 8,
  },
  slide: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 84,
    paddingBottom: 120,
  },
  topBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 0,
    zIndex: 10,
  },
  topBarBlur: {
    borderRadius: 18,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(10,10,14,0.55)',
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  iconButtonSpacer: {
    width: 42,
    height: 42,
  },
  topBarCenter: {
    flex: 1,
    paddingHorizontal: 10,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  headerBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  badgeText: {
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '800',
    fontSize: 12,
  },
  videoHintPill: {
    position: 'absolute',
    bottom: 120,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  videoHintText: {
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '800',
    fontSize: 12,
  },
  bottomBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 0,
    zIndex: 10,
  },
  bottomBarBlur: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(10,10,14,0.55)',
    paddingVertical: 10,
  },
  thumbListContent: {
    paddingHorizontal: 10,
    gap: 10,
  },
  thumbButton: {
    width: 58,
    height: 58,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  thumbButtonSelected: {
    borderColor: '#e50914',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbVideo: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbVideoBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  bottomMetaText: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    fontWeight: '800',
  },
  bottomMetaDot: {
    color: 'rgba(255,255,255,0.45)',
    paddingHorizontal: 8,
    fontWeight: '900',
  },
});

export default MediaViewerScreen;
