import { Ionicons } from '@expo/vector-icons';
import { AVPlaybackStatus, Video } from 'expo-av';
import React, {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Image,
    Keyboard,
    PanResponder,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

const { height: WINDOW_HEIGHT, width: WINDOW_WIDTH } = Dimensions.get('window');

interface MediaContentProps {
  media: { uri: string; type: 'image' | 'video' };
  overlayText: string;
  setOverlayText: (text: string) => void;
  initialOverlayTextPosition?: { x: number; y: number };
  isEditingText: boolean;
  setIsEditingText: (editing: boolean) => void;
  // Accept either an Animated.Value or an Animated.Interpolation
  onMediaScaleChange: Animated.Value | Animated.AnimatedInterpolation<number>;
}

export type MediaContentHandle = {
  getOverlayTextPosition: () => { x: number; y: number };
  resetOverlayPosition: () => void;
};

export default forwardRef<MediaContentHandle | null, MediaContentProps>(function MediaContent(
  {
    media,
    overlayText,
    setOverlayText,
    initialOverlayTextPosition,
    isEditingText,
    setIsEditingText,
    onMediaScaleChange,
  }: MediaContentProps,
  ref
) {
  const video = useRef<Video | null>(null);
  const [status, setStatus] = useState<AVPlaybackStatus | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const overlayTextPosition = useRef(
    new Animated.ValueXY(initialOverlayTextPosition || { x: 0, y: 0 })
  ).current;

  // helper to read current numeric values (casts to any only here)
  const readOverlayPos = () => {
    // Animated.ValueXY stores its coords on x and y which are Animated.Value
    const xVal = (overlayTextPosition.x as any)?._value ?? 0;
    const yVal = (overlayTextPosition.y as any)?._value ?? 0;
    return { x: xVal, y: yVal };
  };

  useImperativeHandle(ref, () => ({
    getOverlayTextPosition: () => readOverlayPos(),
    resetOverlayPosition: () => {
      // clear offset and set value to 0
      try {
        overlayTextPosition.setValue({ x: 0, y: 0 });
        overlayTextPosition.setOffset({ x: 0, y: 0 });
        overlayTextPosition.flattenOffset();
      } catch {
        // ignore if any Animated internals differ
      }
    },
  }));

  const isPlaying = Boolean((status as any)?.isLoaded && (status as any).isPlaying);

  const handlePlayPause = useCallback(async () => {
    if (!video.current || !status || !(status as any).isLoaded) return;
    try {
      if ((status as any).isPlaying) {
        await video.current.pauseAsync();
      } else {
        await video.current.playAsync();
      }
    } catch (e) {
      console.warn('play/pause error', e);
    }
  }, [status]);

  const toggleMute = useCallback(async () => {
    if (media.type !== 'video' || !video.current) return;
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    try {
      await video.current.setIsMutedAsync(newMutedState);
    } catch (e) {
      // setIsMuted already set for UI
    }
  }, [isMuted, media.type]);

  useEffect(() => {
    if (isEditingText) {
      // keyboard will auto focus when TextInput mounts
    } else {
      Keyboard.dismiss();
    }
  }, [isEditingText]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isEditingText && overlayText.length > 0,
      onStartShouldSetPanResponderCapture: () => !isEditingText && overlayText.length > 0,
      onMoveShouldSetPanResponder: () => !isEditingText && overlayText.length > 0,
      onMoveShouldSetPanResponderCapture: () => !isEditingText && overlayText.length > 0,
      onPanResponderGrant: () => {
        // setOffset to current absolute value and zero out the active value
        const pos = readOverlayPos();
        overlayTextPosition.setOffset({ x: pos.x, y: pos.y });
        overlayTextPosition.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: overlayTextPosition.x, dy: overlayTextPosition.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        overlayTextPosition.flattenOffset();
      },
    })
  ).current;

  return (
    <Animated.View style={[styles.mediaWrapper, { transform: [{ scale: (onMediaScaleChange as any) }] }]}>
      {media.type === 'video' ? (
        <>
          <Video
            ref={video}
            source={{ uri: media.uri }}
            style={styles.media}
            resizeMode="cover"
            onPlaybackStatusUpdate={(s) => {
              setStatus(s);
              setIsBuffering(!!(s as any)?.isBuffering);
            }}
            isLooping
            isMuted={isMuted}
          />

          <Pressable
            style={styles.playPauseContainer}
            onPress={handlePlayPause}
            accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          >
            <View style={styles.playIconBackground}>
              {isBuffering ? (
                <ActivityIndicator size="large" color="#fff" />
              ) : (
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={34} color="white" />
              )}
            </View>
          </Pressable>
        </>
      ) : (
        <Image source={{ uri: media.uri }} style={styles.media} />
      )}

      {overlayText.length > 0 && !isEditingText && (
        <Animated.View
          style={[
            styles.overlayTextDisplayWrapper,
            {
              transform: [
                { translateX: overlayTextPosition.x as any },
                { translateY: overlayTextPosition.y as any },
              ],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <Text style={styles.overlayTextDisplay}>{overlayText}</Text>
        </Animated.View>
      )}

      {isEditingText && (
        <TextInput
          placeholder="Add text..."
          placeholderTextColor="#cfcfcf"
          style={styles.overlayTextInput}
          onChangeText={setOverlayText}
          value={overlayText}
          autoFocus
          multiline
          textAlignVertical="center"
        />
      )}

      {media.type === 'video' && (
        <TouchableOpacity style={styles.volumeButton} onPress={toggleMute}>
          <Ionicons name={isMuted ? 'volume-mute-outline' : 'volume-medium-outline'} size={26} color="white" />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  mediaWrapper: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  media: {
    ...StyleSheet.absoluteFillObject,
  },
  playPauseContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIconBackground: {
    width: 78,
    height: 78,
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayTextInput: {
    position: 'absolute',
    top: '30%',
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    padding: 10,
    borderRadius: 10,
    textAlign: 'center',
    zIndex: 10,
    alignSelf: 'center',
  },
  overlayTextDisplayWrapper: {
    position: 'absolute',
    left: WINDOW_WIDTH / 2,
    top: WINDOW_HEIGHT / 2,
    zIndex: 5,
  },
  overlayTextDisplay: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    position: 'absolute',
    alignSelf: 'center',
    transform: [{ translateX: -50 }, { translateY: -12 }],
  },
  volumeButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    right: 16,
    zIndex: 1000,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
  },
});
