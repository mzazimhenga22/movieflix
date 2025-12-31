import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Text,
  FlatList,
  Image,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface MediaItem {
  id: string;
  uri: string;
  type: 'image' | 'video';
  timestamp?: number;
}

interface MediaPickerProps {
  onMediaPicked: (uri: string, type: 'image' | 'video') => void;
  onClose: () => void;
}

export default function MediaPicker({ onMediaPicked, onClose }: MediaPickerProps) {
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [recentMedia, setRecentMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    requestPermissions();
  }, []);

  useEffect(() => {
    // Best-effort camera background for the picker; fall back gracefully.
    if (Platform.OS === 'web') return;
    if (cameraPermission?.granted) return;
    void requestCameraPermission();
  }, [cameraPermission?.granted, requestCameraPermission]);

  const requestPermissions = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      setHasPermission(status === 'granted');

      if (status === 'granted') {
        loadRecentMedia();
      } else {
        setLoading(false);
      }
    } catch (error) {
      setHasPermission(false);
      setLoading(false);
    }
  };

  const loadRecentMedia = async () => {
    try {
      // In a real implementation, you'd load recent photos from the device
      // For now, we'll show some placeholder items
      setRecentMedia([
        { id: '1', uri: 'https://picsum.photos/300/400?random=1', type: 'image', timestamp: Date.now() },
        { id: '2', uri: 'https://picsum.photos/300/400?random=2', type: 'image', timestamp: Date.now() - 1000 },
        { id: '3', uri: 'https://picsum.photos/300/400?random=3', type: 'image', timestamp: Date.now() - 2000 },
        { id: '4', uri: 'https://picsum.photos/300/400?random=4', type: 'image', timestamp: Date.now() - 3000 },
        { id: '5', uri: 'https://picsum.photos/300/400?random=5', type: 'image', timestamp: Date.now() - 4000 },
        { id: '6', uri: 'https://picsum.photos/300/400?random=6', type: 'image', timestamp: Date.now() - 5000 },
      ]);
    } catch (error) {
      console.warn('Failed to load recent media', error);
    } finally {
      setLoading(false);
    }
  };

  const pickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: false,
        quality: 1,
        allowsMultipleSelection: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const mediaType = asset.type === 'video' ? 'video' : 'image';
        onMediaPicked(asset.uri, mediaType);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick media from gallery');
    }
  };

  const pickFromCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Camera access is needed to take a photo or video.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        const type: 'image' | 'video' = asset.type === 'video' ? 'video' : 'image';
        onMediaPicked(asset.uri, type);
      }
    } catch (e) {
      Alert.alert('Error', 'Could not open the camera.');
    }
  };

  const handleMediaSelect = (media: MediaItem) => {
    onMediaPicked(media.uri, media.type);
  };

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        {cameraPermission?.granted ? (
          <CameraView style={StyleSheet.absoluteFillObject} facing="back" />
        ) : (
          <LinearGradient
            colors={['#e50914', '#150a13', '#05060f']}
            start={[0, 0]}
            end={[1, 1]}
            style={StyleSheet.absoluteFillObject}
          />
        )}
        <LinearGradient
          colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.88)']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Requesting permissions...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        {cameraPermission?.granted ? (
          <CameraView style={StyleSheet.absoluteFillObject} facing="back" />
        ) : (
          <LinearGradient
            colors={['#e50914', '#150a13', '#05060f']}
            start={[0, 0]}
            end={[1, 1]}
            style={StyleSheet.absoluteFillObject}
          />
        )}
        <LinearGradient
          colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.88)']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <Ionicons name="images" size={64} color="#666" />
        <Text style={styles.errorTitle}>Gallery Access Required</Text>
        <Text style={styles.errorText}>
          Please enable media library permissions in your device settings to create posts.
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={onClose}>
          <Text style={styles.retryText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderMediaItem = ({ item }: { item: MediaItem }) => (
    <TouchableOpacity
      style={styles.mediaItem}
      onPress={() => handleMediaSelect(item)}
      activeOpacity={0.8}
    >
      <Image source={{ uri: item.uri }} style={styles.mediaImage} />
      {item.type === 'video' && (
        <View style={styles.videoIndicator}>
          <Ionicons name="videocam" size={16} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {cameraPermission?.granted ? (
        <CameraView style={StyleSheet.absoluteFillObject} facing="back" />
      ) : (
        <LinearGradient
          colors={['#e50914', '#150a13', '#05060f']}
          start={[0, 0]}
          end={[1, 1]}
          style={StyleSheet.absoluteFillObject}
        />
      )}
      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.88)']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={['rgba(125,216,255,0.18)', 'rgba(255,255,255,0)']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.bgOrbPrimary}
      />
      <LinearGradient
        colors={['rgba(95,132,255,0.14)', 'rgba(255,255,255,0)']}
        start={{ x: 0.8, y: 0 }}
        end={{ x: 0.2, y: 1 }}
        style={styles.bgOrbSecondary}
      />

      <View style={[styles.headerWrap, { marginTop: Math.max(12, insets.top + 6) }]}>
        <LinearGradient
          colors={['rgba(229,9,20,0.22)', 'rgba(10,12,24,0.4)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGlow}
        />
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
              Create Post
            </Text>
          </View>
          <TouchableOpacity onPress={pickFromGallery} style={styles.iconBtn} accessibilityLabel="Open gallery">
            <Ionicons name="images" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Loading recent photos...</Text>
        </View>
      ) : (
        <>
          <View style={styles.recentHeader}>
            <Text style={styles.recentTitle}>Recent</Text>
            <TouchableOpacity onPress={pickFromGallery}>
              <Text style={styles.viewAllText}>View all</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={recentMedia}
            renderItem={renderMediaItem}
            keyExtractor={item => item.id}
            numColumns={3}
            contentContainerStyle={styles.mediaGrid}
            showsVerticalScrollIndicator={false}
          />

          <View style={[styles.bottomBar, { paddingBottom: Math.max(12, insets.bottom + 10) }]}>
            <TouchableOpacity style={styles.bottomPill} onPress={pickFromCamera} activeOpacity={0.9}>
              <Ionicons name="camera" size={20} color="#fff" />
              <Text style={styles.bottomPillText}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bottomPill} onPress={pickFromGallery} activeOpacity={0.9}>
              <Ionicons name="images" size={20} color="#fff" />
              <Text style={styles.bottomPillText}>Gallery</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingTop: 0,
  },
  bgOrbPrimary: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 180,
    top: -60,
    left: -60,
    opacity: 0.6,
    transform: [{ rotate: '15deg' }],
  },
  bgOrbSecondary: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    bottom: -90,
    right: -40,
    opacity: 0.55,
    transform: [{ rotate: '-12deg' }],
  },
  loadingText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    color: '#ccc',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 32,
  },
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  mainScreen: {
    flex: 1,
    backgroundColor: '#000',
  },
  headerWrap: {
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 18,
    overflow: 'hidden',
  },
  headerGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.7,
  },
  headerBar: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  optionsContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 24,
  },
  optionCard: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  optionGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  optionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  optionSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
  },
  cameraScreen: {
    ...StyleSheet.absoluteFillObject,
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  cameraHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 20,
  },
  cameraBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraControls: {
    flexDirection: 'row',
    gap: 16,
  },
  controlButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
    gap: 32,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  recordingButton: {
    backgroundColor: '#ff4444',
  },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ff4444',
  },
  
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  recentTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  viewAllText: {
    color: '#4A90E2',
    fontSize: 14,
    fontWeight: '500',
  },
  mediaGrid: {
    paddingHorizontal: 8,
    paddingBottom: 140,
  },
  mediaItem: {
    flex: 1,
    aspectRatio: 1,
    margin: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  videoIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
    padding: 4,
  },
  bottomBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 0,
    paddingTop: 10,
    flexDirection: 'row',
    gap: 12,
  },
  bottomPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(5,6,15,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  bottomPillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
