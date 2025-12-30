import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import MediaPicker from './components/post-review/MediaPicker';
// eslint-disable-next-line import/namespace, import/no-named-as-default, import/no-named-as-default-member
import MediaPreview from './components/post-review/MediaPreview';
import { supabase, supabaseConfigured } from '../constants/supabase';

import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useUser } from '../hooks/use-user';
import { useRouter } from 'expo-router';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { firestore } from '../constants/firebase';
import ScreenWrapper from '../components/ScreenWrapper';
import { notifyPush } from '../lib/pushApi';

if (typeof atob === 'undefined') {
  // @ts-ignore
  global.atob = decode;
}
if (typeof btoa === 'undefined') {
  // @ts-ignore
  global.btoa = (str: string) => encode(str);
}

export default function PostReviewScreen() {
  const [media, setMedia] = useState<{ uri: string; type: 'image' | 'video' } | null>(null);
  const router = useRouter();
  const { user } = useUser();
  const fallbackUser = { uid: 'dev-user' }; // allow uploads in Expo Go when not authenticated
  const effectiveUser = user ?? fallbackUser;

  const handleMediaPick = (uri: string, type: 'image' | 'video') => {
    setMedia({ uri, type });
  };

  const handlePost = async (reviewData: any) => {
    if (!media) {
      Alert.alert('No media selected', 'Please pick a photo or video to post.');
      return;
    }
    if (!supabaseConfigured) {
      Alert.alert('Missing configuration', 'Supabase is not configured. Add your Supabase keys and try again.');
      return;
    }
    if (!effectiveUser?.uid) {
      Alert.alert('Not signed in', 'Please sign in before posting.');
      return;
    }

    try {
      let authorDisplayName = user?.displayName ?? 'watcher';
      let authorAvatar = (user as any)?.photoURL ?? null;
      let authorHandle: string | null = null;

      if (effectiveUser?.uid) {
        try {
          const profileRef = doc(firestore, 'users', effectiveUser.uid);
          const profileSnap = await getDoc(profileRef);
          if (profileSnap.exists()) {
            const profileData = profileSnap.data() as any;
            authorDisplayName = profileData.name ?? profileData.displayName ?? authorDisplayName;
            authorAvatar = profileData.avatar ?? profileData.photoURL ?? authorAvatar;
            authorHandle = profileData.username ?? profileData.handle ?? authorHandle;
          }
        } catch (profileError) {
          console.warn('Failed to load user profile for review posting', profileError);
        }
      }

      let finalUri = media.uri;
      let contentType = media.type === 'image' ? 'image/jpeg' : 'video/mp4';

      // Optimize images before upload
      if (media.type === 'image' && media.uri.startsWith('file://')) {
        // Copy the image to a temporary location to avoid Android cache issues
        const tempDir = FileSystem.cacheDirectory + 'temp/';
        await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });
        const tempFileName = `temp-image-${Date.now()}.jpg`;
        const tempUri = tempDir + tempFileName;
        await FileSystem.copyAsync({ from: media.uri, to: tempUri });

        const manipResult = await manipulateAsync(
          tempUri,
          [{ resize: { width: 1000 } }],
          { compress: 0.7, format: SaveFormat.JPEG }
        );
        finalUri = manipResult.uri;

        // Clean up temp file
        await FileSystem.deleteAsync(tempUri, { idempotent: true });
      }

      // Read file as Base64 and prepare binary payload for Supabase
      const readLocalFile = async (uri: string) => {
        const base64Data = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        const binary = atob(base64Data);
        return Uint8Array.from(binary, (c) => c.charCodeAt(0)).buffer;
      };

      const fetchRemoteFile = async (uri: string) => {
        const res = await fetch(uri);
        const buf = await res.arrayBuffer();
        // try to infer content-type if available
        const ct = res.headers.get('content-type');
        return { buffer: buf, contentType: ct || contentType };
      };

      let fileBuffer: ArrayBuffer;
      if (finalUri.startsWith('http')) {
        const remote = await fetchRemoteFile(finalUri);
        fileBuffer = remote.buffer;
        contentType = remote.contentType || contentType;
      } else {
        fileBuffer = await readLocalFile(finalUri);
      }

      const rawName = finalUri.split('/').pop() || `upload-${Date.now()}`;
      const fileName = `${effectiveUser.uid}/${Date.now()}-${rawName}`.replace(/\s+/g, '_');

      // Upload directly to Supabase Storage (feeds bucket)
      const { data, error } = await supabase.storage
        .from('feeds')
        .upload(fileName, fileBuffer, {
          contentType,
          upsert: true,
        });

      if (error) throw error;

      // Get public URL (if bucket is public)
      const { data: publicUrl } = supabase.storage.from('feeds').getPublicUrl(fileName);

      // Store review metadata in Firestore so social feed can display it
      try {
        const newReviewDoc = await addDoc(collection(firestore, 'reviews'), {
          userId: effectiveUser.uid,
          userDisplayName: authorDisplayName,
          userName: authorHandle ?? authorDisplayName,
          userAvatar: authorAvatar,
          review: reviewData.review ?? '',
          title: reviewData.title ?? '',
          rating: reviewData.rating ?? 0,
          mediaUrl: publicUrl.publicUrl,
          type: media.type,
          videoUrl: media.type === 'video' ? publicUrl.publicUrl : null,
          createdAt: serverTimestamp(),
          likes: 0,
          commentsCount: 0,
        });

        // Push notify followers
        void notifyPush({ kind: 'reel', reviewId: newReviewDoc.id });

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
              type: 'new_post',
              scope: 'social',
              channel: 'community',
              actorId: effectiveUser.uid,
              actorName: authorDisplayName,
              actorAvatar: authorAvatar,
              targetUid: followerId,
              targetId: newReviewDoc.id,
              docPath: newReviewDoc.path,
              message: `${authorDisplayName} posted a new review.`,
              read: false,
              createdAt: serverTimestamp(),
            });
          }
        }
      } catch (metaError: any) {
        console.warn('Failed to save review metadata to Firestore', metaError);
        Alert.alert('Upload issue', 'Media uploaded but failed to save review details. Please try again.');
        return;
      }

      Alert.alert('Success', 'Your review has been posted.');
      console.log('Uploaded file:', data);
      console.log('Public URL:', publicUrl.publicUrl);
    } catch (error: any) {
      console.error('Upload error:', error);
      Alert.alert('Upload failed', error.message || 'Please try again.');
    }
  };

  return (
    <ScreenWrapper style={styles.wrapper}>
      <View style={styles.container}>
        {!media ? (
          <MediaPicker
            onMediaPicked={handleMediaPick}
            // Do not navigate away when the picker closes; just stay here
            // so selecting/cancelling media never kicks you back to the feed.
            onClose={() => setMedia(null)}
          />
        ) : (
          <MediaPreview
            media={media}
            onPost={handlePost}
            onClose={() => {
              // When closing from the preview, clear media and go back once.
              setMedia(null);
              router.back();
            }}
          />
        )}
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingTop: 0,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
