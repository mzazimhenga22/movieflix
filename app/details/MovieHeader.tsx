import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { Video } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
    ActivityIndicator,
    PixelRatio,
    Dimensions,
    Image,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IMAGE_BASE_URL } from '../../constants/api';
import { Media } from '../../types';
import PulsePlaceholder from './PulsePlaceholder';

const { width } = Dimensions.get('window');
const BACKDROP_HEIGHT = 460;

type StreamResult = { url: string; type: 'mp4' | 'hls' | 'dash' | 'unknown'; quality?: string };

interface Props {
  movie: Media | null;
  isLoading: boolean;
  onWatchTrailer: () => void;
  onBack: () => void;
  onAddToMyList: () => void;
  onPlayMovie: () => void; // New prop for playing movie via p-stream
  isPStreamPlaying: boolean; // New prop to indicate if p-stream is playing
  accentColor: string;
  isPlayLoading?: boolean;
  onDownload?: () => void;
  downloadStatus?: 'idle' | 'preparing' | 'downloading';
  downloadProgress?: number | null;
  trailer?: StreamResult | null;
  trailerAutoPlay?: boolean;
}

const MovieHeader = forwardRef(function MovieHeader(props: Props, ref) {
  const {
    movie,
    isLoading,
    onWatchTrailer,
    onBack,
    onAddToMyList,
    onPlayMovie,
    isPStreamPlaying,
    accentColor,
    isPlayLoading,
    onDownload,
    downloadStatus = 'idle',
    downloadProgress = null,
    trailer = null,
    trailerAutoPlay = false,
  } = props;
  const backdropUri = movie ? `${IMAGE_BASE_URL}${movie.backdrop_path || movie.poster_path}` : null;
  const isDownloadBusy = downloadStatus !== 'idle';
  const downloadLabel = isDownloadBusy
    ? downloadProgress && downloadProgress > 0
      ? `Downloading ${Math.round(downloadProgress * 100)}%`
      : 'Downloading...'
    : 'Download';

  const videoRef = useRef<Video | null>(null);
  const [isTrailerPlaying, setIsTrailerPlaying] = useState<boolean>(false);
  const [dynamicColors, setDynamicColors] = useState<string[]>([]);
  const colorUpdateInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastColorUpdate = useRef<number>(0);

  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const fontScale = PixelRatio.getFontScale();
  const isCompactLayout = screenWidth < 360 || fontScale > 1.2;
  const topBarTop = Math.max(10, (insets.top || 0) + 6);
  const topBarHeight = isCompactLayout ? 44 : 40;

  useEffect(() => {
    if (trailer && trailerAutoPlay) {
      setIsTrailerPlaying(true);
    }
    return () => {
      setIsTrailerPlaying(false);
    };
  }, [trailer, trailerAutoPlay]);

  useImperativeHandle(ref, () => ({
    pauseTrailer: async () => {
      try {
        setIsTrailerPlaying(false);
        if (videoRef.current && typeof videoRef.current.pauseAsync === 'function') {
          await videoRef.current.pauseAsync();
        }
      } catch {}
    },
    playTrailer: async () => {
      try {
        if (trailer) setIsTrailerPlaying(true);
        if (videoRef.current && typeof videoRef.current.playAsync === 'function') {
          await videoRef.current.playAsync();
        }
      } catch {}
    },
  } as any));

  // Generate dynamic colors based on video playback time
  const generateDynamicColors = useCallback((timePosition: number = 0) => {
    const baseHue = (timePosition * 0.001) % 360; // Slow color cycling
    const saturation = 0.4 + Math.sin(timePosition * 0.002) * 0.2; // Breathing effect
    const lightness = 0.15 + Math.sin(timePosition * 0.003) * 0.05; // Subtle brightness variation

    const color1 = `hsl(${baseHue}, ${saturation * 100}%, ${lightness * 100}%)`;
    const color2 = `hsl(${(baseHue + 60) % 360}, ${(saturation * 0.8) * 100}%, ${(lightness * 0.8) * 100}%)`;
    const color3 = `hsl(${(baseHue + 120) % 360}, ${(saturation * 0.6) * 100}%, ${(lightness * 0.6) * 100}%)`;

    return [color1, color2, color3];
  }, []);

  const updateColors = useCallback((positionMillis: number) => {
    const now = Date.now();
    if (now - lastColorUpdate.current > 200) { // Update every 200ms for smooth transitions
      const newColors = generateDynamicColors(positionMillis);
      setDynamicColors(newColors);
      lastColorUpdate.current = now;
    }
  }, [generateDynamicColors]);

  const isTrailerActive = trailer && isTrailerPlaying;

  useEffect(() => {
    if (isTrailerActive) {
      // Start color update interval
      colorUpdateInterval.current = setInterval(() => {
        const position = Date.now() % 10000; // Use time as position for demo
        updateColors(position);
      }, 100);

      return () => {
        if (colorUpdateInterval.current) {
          clearInterval(colorUpdateInterval.current);
          colorUpdateInterval.current = null;
        }
      };
    } else {
      setDynamicColors([]);
      if (colorUpdateInterval.current) {
        clearInterval(colorUpdateInterval.current);
        colorUpdateInterval.current = null;
      }
    }
  }, [isTrailerActive, updateColors]);

  return (
    <View style={styles.backdropContainer}>
      {!isTrailerActive && (
        <LinearGradient
          colors={[accentColor, '#0a0f1f', '#05060f']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.baseGradient}
          pointerEvents="none"
        />
      )}
      {trailer && isTrailerPlaying ? (
        <Video
          ref={(r) => { videoRef.current = r; }}
          source={{ uri: trailer.url }}
          style={styles.backdropImage}
          resizeMode={'cover' as any}
          shouldPlay
          isLooping={false}
          useNativeControls={false}
        />
      ) : backdropUri ? (
        <Image source={{ uri: backdropUri }} style={styles.backdropImage} />
      ) : (
        <PulsePlaceholder style={styles.backdropPlaceholder} />
      )}
      {!isTrailerActive && (
        <LinearGradient
          colors={['rgba(5,6,15,0.12)', 'rgba(5,6,15,0.6)', 'rgba(5,6,15,0.96)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.backdropTint}
          pointerEvents="none"
        />
      )}

      <View style={[styles.topBar, { top: topBarTop, height: topBarHeight }]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={26} color="white" />
        </TouchableOpacity>

        {isLoading ? (
          <PulsePlaceholder style={styles.titlePlaceholderSmall} />
        ) : (
          <Text
            style={[styles.topTitle, isCompactLayout && styles.topTitleCompact]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {movie?.title || movie?.name}
          </Text>
        )}
      </View>

      {!isTrailerActive && (
        <LinearGradient
          colors={['rgba(5,6,15,0)', 'rgba(5,6,15,0.6)', '#05060f']}
          locations={[0, 0.5, 1]}
          style={styles.gradientOverlay}
          pointerEvents="none"
        />
      )}

      <TouchableOpacity
        style={styles.mainPlayButton}
        onPress={isPStreamPlaying ? onBack : onPlayMovie}
        accessibilityLabel={isPStreamPlaying ? 'Close player' : 'Play movie'}
        disabled={isPlayLoading}
      >
        <View style={styles.mainPlayOuter}>
          {isPlayLoading ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <FontAwesome
              name={isPStreamPlaying ? 'compress' : 'play-circle'}
              size={66}
              color="rgba(255,255,255,0.96)"
            />
          )}
        </View>
      </TouchableOpacity>

      <View style={styles.actionButtonsContainer}>
        {[
          { key: 'trailer', icon: 'play', label: 'Trailer' },
          { key: 'my-list', icon: 'plus', label: 'My List' },
          { key: 'download', icon: 'download', label: downloadLabel },
          { key: 'rate', icon: 'star', label: 'Rate' },
        ].map((btn, i) => (
          <TouchableOpacity
            key={i}
            style={styles.actionItem}
            disabled={btn.key === 'download' && isDownloadBusy}
              onPress={() => {
                if (btn.key === 'my-list') {
                  onAddToMyList();
                } else if (btn.key === 'trailer') {
                  if (trailer) {
                    // toggle in-header trailer playback
                    setIsTrailerPlaying((v) => !v);
                  } else {
                    onWatchTrailer();
                  }
                } else if (btn.key === 'download') {
                  onDownload?.();
                }
              }}
          >
            {btn.key === 'download' && isDownloadBusy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <FontAwesome name={btn.icon as any} size={18} color="white" />
            )}
            <Text style={styles.actionLabel}>{btn.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  backdropContainer: {
    width: '100%',
    height: BACKDROP_HEIGHT,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: '#05060f',
  },
  backdropImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  backdropPlaceholder: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  baseGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  dynamicGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropTint: {
    ...StyleSheet.absoluteFillObject,
  },
  gradientOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '100%',
  },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  backButton: {
    position: 'absolute',
    left: 16,
    top: 0,
    zIndex: 30,
    backgroundColor: 'rgba(0,0,0,0.18)',
    padding: 6,
    borderRadius: 18,
  },
  topTitle: {
    color: '#ff3b30',
    fontSize: 18,
    fontWeight: '600',
    zIndex: 25,
    textAlign: 'center',
  },
  topTitleCompact: {
    fontSize: 16,
  },
  titlePlaceholderSmall: {
    width: 140,
    height: 18,
    borderRadius: 6,
  },
  mainPlayButton: {
    position: 'absolute',
    zIndex: 10,
    alignSelf: 'center',
  },
  mainPlayOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignSelf: 'center',
  },
  actionButtonsContainer: {
    position: 'absolute',
    bottom: 18,
    left: '7%',
    right: '7%',
    width: '86%',
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(5,6,15,0.6)',
    borderRadius: 28,
    paddingVertical: 12,
    paddingHorizontal: 6,
    zIndex: 15,
  },
  actionItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: 4,
  },
  actionLabel: {
    color: '#f5f5f5',
    fontSize: 11,
    fontWeight: '600',
  },
});

export default MovieHeader;
