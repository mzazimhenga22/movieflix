import { notifyPush } from '@/lib/pushApi';
import { updateStreakForContext } from '@/lib/streaks/streakManager';

import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ResizeMode, Video } from 'expo-av';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { addDoc, collection, doc, getDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  InteractionManager,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenWrapper from '../components/ScreenWrapper';
import StoryMusicPicker, { MusicTrack } from '../components/story/StoryMusicPicker';
import StoryStepIndicator from '../components/story/StoryStepIndicator';
import { firestore } from '../constants/firebase';
import { supabase, supabaseConfigured } from '../constants/supabase';
import { useUser } from '../hooks/use-user';

type UploadStep = 'media' | 'edit' | 'music' | 'share';

export default function StoryUpload() {
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [currentStep, setCurrentStep] = useState<UploadStep>('media');
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [pickedType, setPickedType] = useState<'image' | 'video' | null>(null);
  const [pickedMimeType, setPickedMimeType] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [caption, setCaption] = useState('');
  const [overlayText, setOverlayText] = useState('');
  const deferredOverlayText = useDeferredValue(overlayText);
  const [shareToFeed, setShareToFeed] = useState(false);

  // Music state
  const [selectedMusic, setSelectedMusic] = useState<MusicTrack | null>(null);
  const [musicStartTime, setMusicStartTime] = useState(0);

  const DRAFT_KEY = '@story_draft_v2';
  const router = useRouter();
  const { user } = useUser();
  const fallbackUser = { uid: 'dev-user', displayName: 'You', photoURL: '' };
  const effectiveUser = (user as any) ?? fallbackUser;

  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const shareSheetRef = useRef<BottomSheet | null>(null);
  const shareSheetIndexRef = useRef(-1);
  const shareSheetSnapPoints = useMemo(() => ['45%'], []);
  const pickerInFlightRef = useRef(false);
  const scrollRef = useRef<ScrollView | null>(null);

  // Animation for step transitions
  const slideAnim = useRef(new Animated.Value(0)).current;
  const keyboardHeightAnim = useRef(new Animated.Value(0)).current;

  // Animate step changes
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      friction: 8,
      tension: 100,
    }).start();
  }, [currentStep]);

  // Restore draft on mount
  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed?.pickedUri) {
          setPickedUri(parsed.pickedUri);
          setPickedType(parsed.pickedType ?? null);
          setPickedMimeType(parsed.pickedMimeType ?? null);
          setCurrentStep('edit');
        }
        if (parsed?.caption) setCaption(parsed.caption);
        if (parsed?.overlayText) setOverlayText(parsed.overlayText);
        if (typeof parsed?.shareToFeed === 'boolean') setShareToFeed(parsed.shareToFeed);
        if (parsed?.selectedMusic) setSelectedMusic(parsed.selectedMusic);
      } catch (err) {
        console.warn('[story-upload] restore draft failed', err);
      }
    })();
  }, []);

  // Persist draft when fields change
  useEffect(() => {
    const payload = {
      pickedUri,
      pickedType,
      pickedMimeType,
      caption,
      overlayText,
      shareToFeed,
      selectedMusic,
    };
    void AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(payload)).catch(() => { });
  }, [pickedUri, pickedType, pickedMimeType, caption, overlayText, shareToFeed, selectedMusic]);

  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Permission required',
            'Media access is needed to pick a story image.'
          );
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (cameraPermission?.granted) return;
    void requestCameraPermission();
  }, [cameraPermission?.granted, requestCameraPermission]);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardVisible(true);
        Animated.timing(keyboardHeightAnim, {
          toValue: e.endCoordinates.height,
          duration: e.duration || 250,
          useNativeDriver: false,
        }).start();
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      (e) => {
        setKeyboardVisible(false);
        Animated.timing(keyboardHeightAnim, {
          toValue: 0,
          duration: e.duration || 250,
          useNativeDriver: false,
        }).start();
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const pickImage = async () => {
    if (pickerInFlightRef.current) return;
    pickerInFlightRef.current = true;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission required', 'Media access is needed to pick a story photo or video.');
        return;
      }

      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => InteractionManager.runAfterInteractions(() => resolve()));

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: false,
        videoExportPreset: ImagePicker.VideoExportPreset.H264_640x480,
        quality: 0.85,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        const uri = asset.uri;
        const rawMimeType = (asset as any)?.mimeType ? String((asset as any).mimeType) : null;
        const uriLower = uri.toLowerCase();
        const looksLikeVideo =
          rawMimeType?.startsWith('video/') ||
          uriLower.endsWith('.mp4') ||
          uriLower.endsWith('.mov') ||
          uriLower.endsWith('.m4v') ||
          uriLower.endsWith('.webm') ||
          uriLower.endsWith('.mkv');
        const type = asset.type === 'video' || looksLikeVideo ? 'video' : 'image';
        const mimeType = rawMimeType;

        if (uri.startsWith('file://')) {
          const safeDir = FileSystem.documentDirectory + 'uploads/';
          await FileSystem.makeDirectoryAsync(safeDir, { intermediates: true });
          const ext = type === 'video' ? 'mp4' : 'jpg';
          const fileName = `picked-${Date.now()}.${ext}`;
          const safeUri = safeDir + fileName;
          await FileSystem.copyAsync({ from: uri, to: safeUri });
          setPickedUri(safeUri);
        } else {
          setPickedUri(uri);
        }

        setPickedType(type);
        setPickedMimeType(mimeType);
        setCurrentStep('edit'); // Move to edit step
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Could not open your media library.');
    } finally {
      pickerInFlightRef.current = false;
    }
  };

  const handleMusicSelect = useCallback((track: MusicTrack, startTime: number) => {
    setSelectedMusic(track);
    setMusicStartTime(startTime);
    setCurrentStep('share');
  }, []);

  const handleMusicSkip = useCallback(() => {
    setSelectedMusic(null);
    setCurrentStep('share');
  }, []);

  const goToNextStep = useCallback(() => {
    const steps: UploadStep[] = ['media', 'edit', 'music', 'share'];
    const idx = steps.indexOf(currentStep);
    if (idx < steps.length - 1) {
      setCurrentStep(steps[idx + 1]);
    }
  }, [currentStep]);

  const goToPrevStep = useCallback(() => {
    const steps: UploadStep[] = ['media', 'edit', 'music', 'share'];
    const idx = steps.indexOf(currentStep);
    if (idx > 0) {
      setCurrentStep(steps[idx - 1]);
    } else {
      router.back();
    }
  }, [currentStep, router]);

  const handleUpload = async (options?: { alsoShareToFeed?: boolean }) => {
    if (!pickedUri || !pickedType) {
      Alert.alert('No media', 'Pick a photo or video first.');
      return;
    }
    if (!supabaseConfigured) {
      Alert.alert('Supabase not configured', 'Stories upload requires Supabase keys.');
      return;
    }

    try {
      setIsUploading(true);
      const alsoShareToFeed = Boolean(options?.alsoShareToFeed);
      const isVideo = pickedType === 'video';

      let finalUri = pickedUri;
      let contentType = isVideo ? 'video/mp4' : pickedMimeType || 'image/jpeg';

      if (!isVideo) {
        const manipResult = await manipulateAsync(
          pickedUri,
          [{ resize: { width: 900 } }],
          { compress: 0.7, format: SaveFormat.JPEG }
        );
        finalUri = manipResult.uri;
        contentType = 'image/jpeg';
      }

      const rawName = finalUri.split('/').pop() || `story-${Date.now()}`;
      const fileName = `${effectiveUser.uid}/${Date.now()}-${rawName}`.replace(/\s+/g, '_');

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Missing Supabase env vars.');
      }

      const safePath = fileName
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');

      const uploadUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/stories/${safePath}`;
      const result = await (FileSystem as any).uploadAsync(uploadUrl, finalUri, {
        httpMethod: 'POST',
        uploadType: (FileSystem as any).FileSystemUploadType?.BINARY_CONTENT,
        headers: {
          'content-type': contentType,
          authorization: `Bearer ${supabaseAnonKey}`,
          apikey: supabaseAnonKey,
          'x-upsert': 'true',
        },
      });

      if (!result || (typeof result.status === 'number' && result.status >= 300)) {
        throw new Error(`Upload failed (status ${result?.status ?? 'unknown'})`);
      }

      const { data: publicUrl } = supabase.storage.from('stories').getPublicUrl(fileName);
      const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);

      // Build story document with optional music
      const storyData: any = {
        userId: effectiveUser.uid,
        username: (effectiveUser.displayName as string) || 'You',
        photoURL: !isVideo ? publicUrl.publicUrl : null,
        mediaType: isVideo ? 'video' : 'image',
        mediaUrl: publicUrl.publicUrl,
        userAvatar: effectiveUser.photoURL || null,
        caption,
        overlayText,
        createdAt: serverTimestamp(),
        expiresAt,
      };

      // Add music data if selected
      if (selectedMusic) {
        storyData.musicTrack = {
          videoId: selectedMusic.videoId,
          title: selectedMusic.title,
          artist: selectedMusic.artist,
          thumbnail: selectedMusic.thumbnail,
          startTime: musicStartTime,
          duration: 15, // 15 seconds for stories
        };
      }

      const newStoryDoc = await addDoc(collection(firestore, 'stories'), storyData);

      void notifyPush({ kind: 'story', storyId: newStoryDoc.id });

      // Notify followers
      const profileRef = doc(firestore, 'users', effectiveUser.uid);
      const profileSnap = await getDoc(profileRef);
      if (profileSnap.exists()) {
        const data = profileSnap.data() as any;
        const followers = Array.isArray(data?.followers) ? data.followers.map(String) : [];
        const blocked = Array.isArray(data?.blockedUsers) ? data.blockedUsers.map(String) : [];
        const recipients = Array.from(new Set(followers))
          .filter((id) => id && id !== effectiveUser.uid)
          .filter((id) => !blocked.includes(id));

        for (const followerId of recipients) {
          const ref = await addDoc(collection(firestore, 'notifications'), {
            type: 'new_story',
            scope: 'social',
            channel: 'community',
            actorId: effectiveUser.uid,
            actorName: (effectiveUser.displayName as string) || 'You',
            actorAvatar: effectiveUser.photoURL || null,
            targetUid: followerId,
            targetId: newStoryDoc.id,
            docPath: newStoryDoc.path,
            message: `${(effectiveUser.displayName as string) || 'You'} posted a new story.`,
            read: false,
            createdAt: serverTimestamp(),
          });
          void notifyPush({ kind: 'notification', notificationId: ref.id });
        }
      }

      if (alsoShareToFeed) {
        try {
          await addDoc(collection(firestore, 'reviews'), {
            userId: effectiveUser.uid,
            userDisplayName: (effectiveUser.displayName as string) || 'You',
            userAvatar: effectiveUser.photoURL || null,
            review: caption || '',
            mediaUrl: publicUrl.publicUrl,
            type: isVideo ? 'video' : 'story',
            createdAt: serverTimestamp(),
            likes: 0,
            commentsCount: 0,
          });
        } catch (err) {
          console.warn('Failed to create feed entry for story', err);
        }
      }

      try {
        void updateStreakForContext({ kind: 'story', userId: effectiveUser.uid, username: (effectiveUser.displayName as string) || 'You' });
      } catch (err) {
        console.warn('Failed to update streak', err);
      }

      // Clear draft on success
      try {
        await AsyncStorage.removeItem(DRAFT_KEY);
      } catch { }
      setPickedUri(null);
      setPickedType(null);
      setPickedMimeType(null);
      setCaption('');
      setOverlayText('');
      setShareToFeed(false);
      setSelectedMusic(null);
      setCurrentStep('media');

      Alert.alert('Story posted', 'Your story is now live!');
      router.replace('/social-feed');
    } catch (err: any) {
      console.error('Story upload error', err);
      Alert.alert('Upload failed', err?.message ?? 'Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const closeShareSheet = useCallback(() => {
    shareSheetRef.current?.close();
  }, []);

  const openShareSheet = useCallback(() => {
    shareSheetRef.current?.snapToIndex(0);
  }, []);

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 'media':
        return (
          <View style={styles.stepContent}>
            {Platform.OS !== 'web' && cameraPermission?.granted && !keyboardVisible ? (
              <CameraView style={styles.cameraPreview} facing="back" />
            ) : (
              <LinearGradient
                colors={['#1a1a2e', '#16213e']}
                style={styles.cameraPreview}
              />
            )}
            <View style={styles.mediaPickerOverlay}>
              <TouchableOpacity style={styles.pickBtn} onPress={pickImage} activeOpacity={0.9}>
                <LinearGradient
                  colors={['rgba(229,9,20,0.9)', 'rgba(255,138,0,0.9)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.pickBtnGradient}
                >
                  <Ionicons name="images" size={28} color="#fff" />
                  <Text style={styles.pickBtnText}>Choose from Gallery</Text>
                </LinearGradient>
              </TouchableOpacity>
              <Text style={styles.mediaHint}>Select a photo or video for your story</Text>
            </View>
          </View>
        );

      case 'edit':
        return (
          <View style={styles.stepContent}>
            <ScrollView
              ref={(r) => { scrollRef.current = r; }}
              style={{ flex: 1 }}
              contentContainerStyle={styles.editScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Preview */}
              {pickedUri && (
                <View style={styles.previewWrap}>
                  {pickedType === 'video' ? (
                    <Video
                      source={{ uri: pickedUri }}
                      style={styles.previewMedia}
                      resizeMode={ResizeMode.COVER}
                      shouldPlay={!keyboardVisible}
                      isLooping
                      isMuted
                    />
                  ) : (
                    <Image source={{ uri: pickedUri }} style={styles.previewMedia} />
                  )}
                  {deferredOverlayText ? (
                    <View style={styles.overlayTextChip}>
                      <Text style={styles.overlayTextPreview} numberOfLines={2}>
                        {deferredOverlayText}
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}
            </ScrollView>

            {/* Overlay Text Input - Flexbox layout for KeyboardAvoidingView */}
            <View style={styles.dockedInputSection}>
              <Text style={styles.inputLabel}>Overlay Text</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Add text to your story..."
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={overlayText}
                onChangeText={setOverlayText}
                returnKeyType="done"
              />
            </View>
          </View>
        );

      case 'music':
        return (
          <View style={styles.stepContent}>
            <StoryMusicPicker
              accent="#e50914"
              onSelect={handleMusicSelect}
              onSkip={handleMusicSkip}
            />
          </View>
        );

      case 'share':
        return (
          <ScrollView
            style={styles.stepContent}
            contentContainerStyle={styles.shareScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Preview with music indicator */}
            {pickedUri && (
              <View style={styles.previewWrap}>
                {pickedType === 'video' ? (
                  <Video
                    source={{ uri: pickedUri }}
                    style={styles.previewMedia}
                    resizeMode={ResizeMode.COVER}
                    shouldPlay={!keyboardVisible}
                    isLooping
                    isMuted
                  />
                ) : (
                  <Image source={{ uri: pickedUri }} style={styles.previewMedia} />
                )}
                {deferredOverlayText ? (
                  <View style={styles.overlayTextChip}>
                    <Text style={styles.overlayTextPreview} numberOfLines={2}>
                      {deferredOverlayText}
                    </Text>
                  </View>
                ) : null}

                {/* Music badge */}
                {selectedMusic && (
                  <View style={styles.musicBadge}>
                    <Ionicons name="musical-note" size={14} color="#fff" />
                    <Text style={styles.musicBadgeText} numberOfLines={1}>
                      {selectedMusic.title}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Caption */}
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>Caption</Text>
              <TextInput
                style={[styles.textInput, styles.captionInput]}
                placeholder="Write something about your story..."
                placeholderTextColor="rgba(255,255,255,0.5)"
                multiline
                value={caption}
                onChangeText={setCaption}
                textAlignVertical="top"
              />
            </View>

            {/* Share Options */}
            <TouchableOpacity
              style={[styles.shareOption, !shareToFeed && styles.shareOptionActive]}
              onPress={() => setShareToFeed(false)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={!shareToFeed ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={!shareToFeed ? '#e50914' : 'rgba(255,255,255,0.5)'}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.shareOptionTitle}>Story only</Text>
                <Text style={styles.shareOptionSub}>Disappears after 24 hours</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.shareOption, shareToFeed && styles.shareOptionActive]}
              onPress={() => setShareToFeed(true)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={shareToFeed ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={shareToFeed ? '#e50914' : 'rgba(255,255,255,0.5)'}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.shareOptionTitle}>Story + Feed</Text>
                <Text style={styles.shareOptionSub}>Also appears in your feed</Text>
              </View>
            </TouchableOpacity>

            {/* Post Button */}
            <TouchableOpacity
              style={[styles.postBtn, isUploading && { opacity: 0.6 }]}
              onPress={() => handleUpload({ alsoShareToFeed: shareToFeed })}
              disabled={isUploading}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={['#ff8a00', '#e50914']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.postBtnGradient}
              >
                <Text style={styles.postBtnText}>
                  {isUploading ? 'Posting...' : 'Share Story'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        );
    }
  };

  return (
    <ScreenWrapper style={styles.wrapper}>
      <Animated.View
        style={[styles.container, { paddingBottom: keyboardHeightAnim }]}
      >
        {/* Background */}
        <LinearGradient
          colors={['#e50914', '#150a13', '#05060f']}
          start={[0, 0]}
          end={[1, 1]}
          style={styles.gradient}
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.88)']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.gradientOverlay}
        />

        <View style={styles.container}>
          {/* Header */}
          <View style={[styles.header, { marginTop: Platform.OS === 'ios' ? insets.top : 12 }]}>
            <TouchableOpacity onPress={goToPrevStep} style={styles.headerBtn}>
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>New Story</Text>
            {currentStep === 'edit' ? (
              <TouchableOpacity onPress={goToNextStep} style={styles.headerBtn}>
                <Ionicons name="musical-notes" size={24} color="#e50914" />
              </TouchableOpacity>
            ) : (
              <View style={styles.headerBtn} />
            )}
          </View>

          {/* Step Indicator */}
          <StoryStepIndicator currentStep={currentStep} accent="#e50914" />

          {/* Step Content */}
          <Animated.View
            style={[
              styles.contentContainer,
              { transform: [{ translateX: slideAnim }] },
            ]}
          >
            {renderStepContent()}
          </Animated.View>
        </View>
      </Animated.View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingTop: 0,
  },
  keyboardAvoid: {
    flex: 1,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  contentContainer: {
    flex: 1,
  },
  stepContent: {
    flex: 1,
  },
  cameraPreview: {
    flex: 1,
    borderRadius: 20,
    margin: 16,
    overflow: 'hidden',
  },
  mediaPickerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 40,
    alignItems: 'center',
    gap: 12,
  },
  pickBtn: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  pickBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  pickBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  mediaHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  editScrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  shareScrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  previewWrap: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  previewMedia: {
    width: '100%',
    height: '100%',
  },
  overlayTextChip: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  overlayTextPreview: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  musicBadge: {
    position: 'absolute',
    bottom: 70,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(229,9,20,0.8)',
  },
  musicBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 120,
  },
  inputSection: {
    marginBottom: 16,
  },
  inputLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    color: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  captionInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  dockedInputSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20, // Add explicit bottom padding
    backgroundColor: '#05060f',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  nextBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 8,
  },
  nextBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  nextBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  shareOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 10,
  },
  shareOptionActive: {
    borderColor: 'rgba(229,9,20,0.5)',
    backgroundColor: 'rgba(229,9,20,0.1)',
  },
  shareOptionTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  shareOptionSub: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 2,
  },
  postBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 16,
  },
  postBtnGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  postBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
});
