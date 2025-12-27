import { Ionicons } from '@expo/vector-icons';
import { Video } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Dimensions, FlatList, Image, NativeScrollEvent, NativeSyntheticEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type MediaItem = {
  id: string;
  url: string;
  type: 'image' | 'video';
};

const MediaViewerScreen = () => {
  const router = useRouter();
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

  const screen = Dimensions.get('window');

  if (!mediaList.length) {
    return (
      <View style={styles.emptyContainer}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
        <Ionicons name="close" size={28} color="#fff" />
      </TouchableOpacity>
      <FlatList
        data={mediaList}
        horizontal
        pagingEnabled
        keyExtractor={(item) => item.id}
        initialScrollIndex={initialIndex}
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, index) => ({
          length: screen.width,
          offset: screen.width * index,
          index,
        })}
        onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / screen.width);
          setCurrentIndex(index);
        }}
        renderItem={({ item }) => {
          const isVideo = item.type === 'video';
          return (
            <View style={[styles.slide, { width: screen.width }]}>
              {isVideo ? (
                <Video
                  source={{ uri: item.url }}
                  style={[styles.media, { width: screen.width, height: screen.height * 0.6 }]}
                  useNativeControls
                  resizeMode="contain"
                  shouldPlay={false}
                />
              ) : (
                <Image
                  source={{ uri: item.url }}
                  style={[styles.media, { width: screen.width, height: screen.height * 0.8 }]}
                  resizeMode="contain"
                />
              )}
            </View>
          );
        }}
      />
      {mediaList.length > 1 && (
        <View style={styles.counter}>
          <Text style={styles.counterText}>
            {currentIndex + 1} / {mediaList.length}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 40,
    paddingHorizontal: 16,
  },
  closeButton: {
    position: 'absolute',
    top: 40,
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  media: {
    borderRadius: 8,
  },
  slide: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  counter: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  counterText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default MediaViewerScreen;
