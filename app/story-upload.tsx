import { updateStreakForContext } from '@/lib/streaks/streakManager';
import { notifyPush } from '@/lib/pushApi';

import BottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { ResizeMode, Video } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { addDoc, collection, serverTimestamp, Timestamp, doc, getDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenWrapper from '../components/ScreenWrapper';
import { firestore } from '../constants/firebase';
import { supabase, supabaseConfigured } from '../constants/supabase';
import { useUser } from '../hooks/use-user';

export default function StoryUpload() {
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [pickedType, setPickedType] = useState<'image' | 'video' | null>(null);
  const [pickedMimeType, setPickedMimeType] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [caption, setCaption] = useState('');
  const [overlayText, setOverlayText] = useState('');
  const [shareToFeed, setShareToFeed] = useState(false);
  const router = useRouter();
  const { user } = useUser();
  const fallbackUser = { uid: 'dev-user', displayName: 'You', photoURL: '' };
  const effectiveUser = (user as any) ?? fallbackUser;

  const shareSheetRef = useRef<BottomSheet | null>(null);
  const shareSheetSnapPoints = useMemo(() => ['40%'], []);

  const openShareSheet = useCallback(() => {
    shareSheetRef.current?.snapToIndex(0);
  }, []);

  const closeShareSheet = useCallback(() => {
    shareSheetRef.current?.close();
  }, []);

  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Permission required',
            'Media access is needed to pick a story image. You can enable this later in system settings.'
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

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: false,
        videoExportPreset: ImagePicker.VideoExportPreset.HEVC_1920x1080,
        quality: 1,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        const uri = asset.uri;
        const type = asset.type === 'video' ? 'video' : 'image';
        const mimeType = (asset as any)?.mimeType ? String((asset as any).mimeType) : null;

        if (uri.startsWith('file://')) {
          // Copy to a stable path to avoid Android cache issues
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
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Could not open your media library.');
    }
  };

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
      let contentType = pickedMimeType || (isVideo ? 'video/mp4' : 'image/jpeg');

      if (!isVideo) {
        // Manipulate the image (resize and compress)
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

      // Use Blob upload to avoid base64 memory spikes (esp. for video)
      const blob = await (await fetch(finalUri)).blob();

      const { error } = await supabase.storage.from('stories').upload(fileName, blob, {
        contentType,
        upsert: true,
      });

      if (error) throw error;

      const { data: publicUrl } = supabase.storage.from('stories').getPublicUrl(fileName);

      const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);

      const newStoryDoc = await addDoc(collection(firestore, 'stories'), {
        userId: effectiveUser.uid,
        username: (effectiveUser.displayName as string) || 'You',
        // legacy + new fields
        photoURL: !isVideo ? publicUrl.publicUrl : null,
        mediaType: isVideo ? 'video' : 'image',
        mediaUrl: publicUrl.publicUrl,
        userAvatar: effectiveUser.photoURL || null,
        caption,
        overlayText,
        createdAt: serverTimestamp(),
        expiresAt,
      });

      // Push notify followers
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
          await addDoc(collection(firestore, 'notifications'), {
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
        }
      }

      if (alsoShareToFeed) {
        // Optional: also show in feed cards
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

      // Update local streak state for posting a story
      try {
        void updateStreakForContext({ kind: 'story', userId: effectiveUser.uid, username: (effectiveUser.displayName as string) || 'You' });
      } catch (err) {
        console.warn('Failed to update streak after story upload', err);
      }
      Alert.alert('Story posted', 'Your story is now live.');
      router.replace('/social-feed');
    } catch (err: any) {
      console.error('Story upload error', err);
      Alert.alert('Upload failed', err?.message ?? 'Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <ScreenWrapper style={styles.wrapper}>
      {Platform.OS !== 'web' && cameraPermission?.granted ? (
        <CameraView style={StyleSheet.absoluteFillObject} facing="back" />
      ) : (
        <LinearGradient
          colors={['#e50914', '#150a13', '#05060f']}
          start={[0, 0]}
          end={[1, 1]}
          style={styles.gradient}
        />
      )}

      {/* Keep UI readable on top of the camera */}
      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.88)']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={styles.cameraTint}
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

      <View style={styles.container}>
        <View style={[styles.headerWrap, { marginTop: Platform.OS === 'ios' ? Math.max(12, insets.top + 6) : 12 }]}>
          <LinearGradient
            colors={['rgba(229,9,20,0.22)', 'rgba(10,12,24,0.4)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGlow}
          />
          <View style={styles.headerBar}>
            <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} accessibilityLabel="Back">
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerEyebrow} numberOfLines={1} ellipsizeMode="tail">Share to stories</Text>
              <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">New Story</Text>
            </View>
            <View style={styles.iconBtnPlaceholder} />
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 140 + Math.max(0, insets.bottom) }]}
        >
          <TouchableOpacity style={styles.pickCard} onPress={pickImage} activeOpacity={0.9}>
            <LinearGradient
              colors={['rgba(229,9,20,0.22)', 'rgba(10,12,24,0.9)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <Text style={styles.pickTitle}>{pickedUri ? 'Change story media' : 'Pick story media'}</Text>
            <Text style={styles.pickSubtitle}>Choose a photo or video from your gallery</Text>
          </TouchableOpacity>

          {pickedUri && (
            <View style={styles.previewWrap}>
              {pickedType === 'video' ? (
                <Video
                  source={{ uri: pickedUri }}
                  style={styles.image}
                  resizeMode={ResizeMode.COVER}
                  shouldPlay
                  isLooping
                  isMuted
                />
              ) : (
                <Image source={{ uri: pickedUri }} style={styles.image} />
              )}
              {overlayText ? (
                <View style={styles.overlayTextChip}>
                  <Text style={styles.overlayTextPreview} numberOfLines={2} ellipsizeMode="tail">
                    {overlayText}
                  </Text>
                </View>
              ) : null}
            </View>
          )}

          <View style={styles.inputsWrap}>
            <Text style={styles.label}>Overlay text</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Add a short phrase on top of your story…"
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={overlayText}
              onChangeText={setOverlayText}
              returnKeyType="done"
            />

            <Text style={[styles.label, { marginTop: 12 }]}>Caption</Text>
            <TextInput
              style={[styles.textInput, styles.captionInput]}
              placeholder="Write a caption for your story…"
              placeholderTextColor="rgba(255,255,255,0.5)"
              multiline
              value={caption}
              onChangeText={setCaption}
            />
          </View>
        </ScrollView>

        <View style={[styles.bottomBar, { paddingBottom: Math.max(12, insets.bottom + 10) }]}>
          <TouchableOpacity
            style={[styles.uploadButton, (!pickedUri || isUploading) && styles.uploadButtonDisabled]}
            disabled={!pickedUri || isUploading}
            onPress={openShareSheet}
            activeOpacity={0.92}
          >
            <LinearGradient
              colors={['#ff8a00', '#e50914']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.uploadGradient}
            >
              <Text style={styles.uploadText}>{isUploading ? 'Uploading…' : 'Post Story'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <BottomSheet
          ref={shareSheetRef}
          index={-1}
          snapPoints={shareSheetSnapPoints}
          enablePanDownToClose
          backdropComponent={(props) => (
            <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.55} />
          )}
          backgroundStyle={styles.sheetBg}
          handleIndicatorStyle={styles.sheetHandle}
        >
          <View style={styles.sheetContent}>
            <Text style={styles.sheetTitle}>Where should this go?</Text>
            <Text style={styles.sheetSubtitle}>You can share to Stories only, or also add it to your feed.</Text>

            <TouchableOpacity
              style={[styles.sheetOption, !shareToFeed && styles.sheetOptionActive]}
              activeOpacity={0.88}
              onPress={() => setShareToFeed(false)}
              disabled={isUploading}
            >
              <Ionicons name={!shareToFeed ? 'radio-button-on' : 'radio-button-off'} size={20} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetOptionTitle}>Story only</Text>
                <Text style={styles.sheetOptionSub}>Won{"'"}t appear in your feed cards.</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sheetOption, shareToFeed && styles.sheetOptionActive]}
              activeOpacity={0.88}
              onPress={() => setShareToFeed(true)}
              disabled={isUploading}
            >
              <Ionicons name={shareToFeed ? 'radio-button-on' : 'radio-button-off'} size={20} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetOptionTitle}>Story + Feed</Text>
                <Text style={styles.sheetOptionSub}>Also shows up in your feed cards.</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sheetPrimaryBtn, isUploading && { opacity: 0.6 }]}
              activeOpacity={0.9}
              disabled={isUploading}
              onPress={async () => {
                closeShareSheet();
                await handleUpload({ alsoShareToFeed: shareToFeed });
              }}
            >
              <LinearGradient
                colors={['#ff8a00', '#e50914']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sheetPrimaryGradient}
              >
                <Text style={styles.sheetPrimaryText}>{isUploading ? 'Uploading…' : 'Post now'}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetSecondaryBtn}
              activeOpacity={0.9}
              onPress={closeShareSheet}
              disabled={isUploading}
            >
              <Text style={styles.sheetSecondaryText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </BottomSheet>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingTop: 0,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  cameraTint: {
    ...StyleSheet.absoluteFillObject,
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
  container: {
    flex: 1,
  },
  headerWrap: {
    marginHorizontal: 12,
    marginBottom: 12,
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
  headerEyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    letterSpacing: 0.6,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
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
  iconBtnPlaceholder: {
    width: 40,
    height: 40,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  pickCard: {
    width: '100%',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    marginBottom: 18,
  },
  pickTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  pickSubtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
  },
  previewWrap: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    marginBottom: 18,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlayTextChip: {
    position: 'absolute',
    bottom: 18,
    left: 16,
    right: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  overlayTextPreview: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  inputsWrap: {
    width: '100%',
    marginBottom: 18,
  },
  label: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  textInput: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  captionInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  uploadButton: {
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
  },
  uploadButtonDisabled: {
    opacity: 0.5,
  },
  uploadGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  bottomBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 0,
    paddingTop: 10,
  },

  sheetBg: {
    backgroundColor: '#101320',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  sheetHandle: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    width: 44,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
    gap: 10,
  },
  sheetTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  sheetSubtitle: { color: 'rgba(255,255,255,0.72)', marginTop: -4, marginBottom: 4 },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  sheetOptionActive: {
    borderColor: 'rgba(255,138,0,0.55)',
    backgroundColor: 'rgba(255,138,0,0.10)',
  },
  sheetOptionTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  sheetOptionSub: { color: 'rgba(255,255,255,0.68)', fontSize: 12, marginTop: 2 },
  sheetPrimaryBtn: { width: '100%', borderRadius: 18, overflow: 'hidden', marginTop: 6 },
  sheetPrimaryGradient: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  sheetPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  sheetSecondaryBtn: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  sheetSecondaryText: { color: 'rgba(255,255,255,0.92)', fontWeight: '800' },
});
