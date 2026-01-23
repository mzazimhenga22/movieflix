import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { RTCView } from 'react-native-webrtc';
import type { User } from 'firebase/auth';
import { LinearGradient } from 'expo-linear-gradient';
import { useAccent } from '../components/AccentContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onAuthChange } from '../messaging/controller';
import { mediaDevices } from 'react-native-webrtc';

const GoLiveScreen = () => {
  const router = useRouter();
  const { accentColor } = useAccent();
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<User | null>(null);
  const [title, setTitle] = useState('Movie night with friends');
  const [coverUrl, setCoverUrl] = useState('');
  const [previewMode, setPreviewMode] = useState(false);
  const [previewStream, setPreviewStream] = useState<any>(null);
  const [cameraFront, setCameraFront] = useState(true);

  const { height: screenHeight } = Dimensions.get('window');

  useEffect(() => {
    const unsubscribe = onAuthChange((authUser) => setUser(authUser));
    return () => unsubscribe();
  }, []);

  const startPreview = useCallback(async () => {
    try {
      const constraints = {
        audio: true,
        video: {
          width: { ideal: 720 },
          height: { ideal: 1280 },
          frameRate: { ideal: 30 },
          facingMode: cameraFront ? 'user' : 'environment',
        },
      };
      const stream = await mediaDevices.getUserMedia(constraints);
      setPreviewStream(stream);
      setPreviewMode(true);
    } catch (err) {
      Alert.alert('Camera Error', 'Unable to access camera');
    }
  }, [cameraFront]);

  const switchCamera = useCallback(async () => {
    if (previewStream) {
      previewStream.getTracks().forEach((track: any) => track.stop());
    }
    setCameraFront(!cameraFront);
    // Restart preview with new camera
    setTimeout(() => {
      startPreview();
    }, 100);
  }, [previewStream, cameraFront, startPreview]);

  const stopPreview = useCallback(() => {
    if (previewStream) {
      previewStream.getTracks().forEach((track: any) => track.stop());
      setPreviewStream(null);
    }
    setPreviewMode(false);
  }, [previewStream]);

  const handleContinueToLive = useCallback(async () => {
    if (!user?.uid) {
      Alert.alert('Please sign in', 'You need an account to go live.');
      return;
    }

    // Stop preview stream before navigating so the host screen can claim the camera cleanly.
    if (previewStream) {
      previewStream.getTracks().forEach((track: any) => track.stop());
      setPreviewStream(null);
    }
    setPreviewMode(false);

    await new Promise((r) => setTimeout(r, 300));

    router.push({
      pathname: '/social-feed/live/host',
      params: {
        title: title.trim() || 'Live on MovieFlix',
        coverUrl: coverUrl.trim() || '',
        cameraFront: cameraFront ? '1' : '0',
      },
    } as any);
  }, [cameraFront, coverUrl, previewStream, router, title, user?.uid]);

  return (
    <LinearGradient
      colors={[accentColor, '#05050a']}
      style={StyleSheet.absoluteFill}
    >
      <View style={[styles.safeArea, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}> 
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
            <Text style={styles.backLabel}>Feed</Text>
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Go Live</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={[styles.previewContainer, { maxHeight: screenHeight * 0.5 }]}>
          {previewMode && previewStream ? (
            <RTCView
              streamURL={previewStream.toURL()}
              style={styles.preview}
              objectFit="cover"
            />
          ) : (
            <View style={styles.previewPlaceholder}>
              <Ionicons name="videocam" size={48} color="rgba(255,255,255,0.8)" />
              <Text style={styles.previewHint}>
                {previewMode ? 'Adjust your settings' : 'Tap "Go Live" to open your camera'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Live title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="What are we watching?"
            placeholderTextColor="rgba(255,255,255,0.4)"
            style={styles.input}
          />
          <Text style={styles.label}>Cover image URL</Text>
          <TextInput
            value={coverUrl}
            onChangeText={setCoverUrl}
            placeholder="Optional thumbnail"
            placeholderTextColor="rgba(255,255,255,0.4)"
            style={styles.input}
          />
        </View>

        {!previewMode && (
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.goLiveButton, { backgroundColor: accentColor }]}
              onPress={startPreview}
            >
              <Ionicons name="videocam" size={20} color="#fff" />
              <Text style={styles.goLiveLabel}>Start Camera</Text>
            </TouchableOpacity>
          </View>
        )}

        {previewMode && (
          <View style={styles.previewControls}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={switchCamera}
            >
              <Ionicons name="camera-reverse" size={24} color="#fff" />
              <Text style={styles.controlLabel}>Flip</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.startStreamButton}
              onPress={handleContinueToLive}
            >
              <Ionicons name="radio" size={20} color="#fff" />
              <Text style={styles.startStreamLabel}>
                Next
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlButton}
              onPress={stopPreview}
            >
              <Ionicons name="close" size={24} color="#fff" />
              <Text style={styles.controlLabel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 0,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backLabel: {
    color: '#fff',
    marginLeft: 6,
    fontWeight: '600',
  },
  screenTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  previewContainer: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  previewPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  previewHint: {
    color: 'rgba(255,255,255,0.7)',
  },
  form: {
    gap: 12,
  },
  label: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#fff',
  },
  goLiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff4b4b',
    borderRadius: 16,
    paddingVertical: 16,
    gap: 10,
  },
  disabledBtn: {
    opacity: 0.8,
  },
  goLiveLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  buttonContainer: {
    paddingBottom: 20,
  },
  previewControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 20,
  },
  controlButton: {
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    minWidth: 70,
  },
  controlLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  startStreamButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff4b4b',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 10,
  },
  startStreamLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});

export default GoLiveScreen;
