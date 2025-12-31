import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import ScreenWrapper from '../components/ScreenWrapper';
import { firestore } from '../constants/firebase';
import { supabase, supabaseConfigured } from '../constants/supabase';
import { getAccentFromPosterPath } from '../constants/theme';
import { useActiveProfile } from '../hooks/use-active-profile';
import { useUser } from '../hooks/use-user';
import { useAccent } from './components/AccentContext';

import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

type UserDoc = {
  displayName?: string;
  photoURL?: string | null;
  photoPath?: string | null;
  favoriteGenres?: string[];
  favoriteColor?: string;
  status?: string;
};

const USER_AVATAR_BUCKET = 'profiles';
const palette = ['#e50914', '#ff914d', '#2ec4b6', '#6c5ce7', '#ff6bcb', '#00b8d9'];

const EditProfileScreen: React.FC = () => {
  const router = useRouter();
  const { user } = useUser();
  const activeProfile = useActiveProfile();
  const { accentColor: globalAccent, setAccentColor } = useAccent();

  const uid = user?.uid ?? '';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState('');
  const [selectedColor, setSelectedColor] = useState(palette[0]);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const favoriteGenres = userDoc?.favoriteGenres ?? [];
  const accentFromProfile = getAccentFromPosterPath(userDoc?.favoriteColor || favoriteGenres[0]);
  const accent = accentFromProfile || globalAccent || '#e50914';

  useEffect(() => {
    if (accentFromProfile) setAccentColor(accentFromProfile);
  }, [accentFromProfile, setAccentColor]);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);

    void (async () => {
      try {
        const snap = await getDoc(doc(firestore, 'users', uid));
        const data = (snap.exists() ? (snap.data() as UserDoc) : {}) as UserDoc;
        if (!alive) return;

        setUserDoc(data);
        setDisplayName(String(data.displayName ?? user?.displayName ?? '').trim());
        setStatus(String((data as any)?.status ?? '').trim());
        setSelectedColor(String(data.favoriteColor ?? palette[0]));
        setAvatarUri(data.photoURL ?? null);
      } catch (err) {
        if (__DEV__) console.warn('[edit-profile] failed to load user doc', err);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [uid, user?.displayName]);

  const fallbackAvatar =
    'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&q=80&w=1780&ixlib=rb-4.0.3';

  const avatarPreview =
    avatarUri || activeProfile?.photoURL || userDoc?.photoURL || fallbackAvatar;

  const uploadAvatarToSupabase = useCallback(
    async (uri: string): Promise<{ url: string; path: string } | null> => {
      if (!uid) return null;
      if (!supabaseConfigured) return null;

      try {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const arrayBuffer = decode(base64);

        const ext = (() => {
          const raw = uri.split('?')[0];
          const last = raw.split('.').pop() || 'jpg';
          const safe = last.toLowerCase();
          if (safe === 'png' || safe === 'jpg' || safe === 'jpeg' || safe === 'webp') return safe;
          return 'jpg';
        })();

        const contentType = ext === 'jpg' ? 'image/jpeg' : ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
        const safeName = `user-avatars/${uid}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.${ext}`;

        const { error } = await supabase.storage.from(USER_AVATAR_BUCKET).upload(safeName, arrayBuffer, {
          cacheControl: '3600',
          upsert: true,
          contentType,
        });
        if (error) throw error;

        const { data: urlData } = supabase.storage.from(USER_AVATAR_BUCKET).getPublicUrl(safeName);
        return { url: urlData.publicUrl, path: safeName };
      } catch (err) {
        console.error('[edit-profile] avatar upload failed', err);
        Alert.alert('Upload failed', 'Unable to upload that photo right now.');
        return null;
      }
    },
    [uid],
  );

  const handlePickAvatar = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'We need access to your photos to set a profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });

      if (result.canceled) return;
      const picked = result.assets?.[0]?.uri;
      if (!picked) return;
      setAvatarUri(picked);
    } catch (err) {
      console.warn('[edit-profile] avatar pick failed', err);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!uid) {
      Alert.alert('Not signed in', 'Please sign in to edit your profile.');
      return;
    }

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      Alert.alert('Name required', 'Please enter a display name.');
      return;
    }

    if (saving) return;
    setSaving(true);

    let photoURL: string | null | undefined = undefined;
    let photoPath: string | null | undefined = undefined;

    try {
      if (avatarUri && avatarUri !== userDoc?.photoURL && supabaseConfigured) {
        setAvatarUploading(true);
        const upload = await uploadAvatarToSupabase(avatarUri);
        if (upload) {
          photoURL = upload.url;
          photoPath = upload.path;
          setAvatarUri(upload.url);
        }
      }

      const payload: Record<string, any> = {
        displayName: trimmedName,
        status: status.trim(),
        favoriteColor: selectedColor,
        updatedAt: serverTimestamp(),
      };
      if (photoURL !== undefined) payload.photoURL = photoURL;
      if (photoPath !== undefined) payload.photoPath = photoPath;

      // Ensure document exists (first save) then update.
      await setDoc(doc(firestore, 'users', uid), payload, { merge: true });
      setAccentColor(selectedColor);
      setUserDoc((prev) => ({ ...(prev ?? {}), ...payload }));
      void AsyncStorage.setItem('profile:lastSavedAt', String(Date.now())).catch(() => {});
      Alert.alert('Saved', 'Your profile has been updated.');
      router.back();
    } catch (err: any) {
      console.error('[edit-profile] save failed', err);
      Alert.alert('Save failed', err?.message || 'Unable to save your profile right now.');
    } finally {
      setAvatarUploading(false);
      setSaving(false);
    }
  }, [avatarUri, displayName, router, saving, selectedColor, status, uid, uploadAvatarToSupabase, userDoc?.photoURL, setAccentColor]);

  const headerSubtitle = useMemo(() => {
    const bits: string[] = [];
    if (favoriteGenres.length) bits.push(`${favoriteGenres.length} genres`);
    if (status.trim()) bits.push('Status set');
    return bits.length ? bits.join(' • ') : 'Photo, bio & personalization';
  }, [favoriteGenres.length, status]);

  if (!uid) {
    return (
      <View style={styles.rootContainer}>
        <ScreenWrapper>
          <LinearGradient
            colors={[accent, '#05060f']}
            start={[0, 0]}
            end={[1, 1]}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.centerState}>
            <Text style={styles.centerTitle}>Sign in required</Text>
            <Text style={styles.centerSubtitle}>You need an account to edit your profile.</Text>
            <TouchableOpacity onPress={() => router.back()} style={[styles.primaryBtn, { backgroundColor: accent }]}> 
              <Text style={styles.primaryBtnText}>Go back</Text>
            </TouchableOpacity>
          </View>
        </ScreenWrapper>
      </View>
    );
  }

  return (
    <View style={styles.rootContainer}>
      <ScreenWrapper>
        <LinearGradient
          colors={[accent, '#05060f']}
          start={[0, 0]}
          end={[1, 1]}
          style={StyleSheet.absoluteFillObject}
        />

        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.headerWrap}>
            <LinearGradient
              colors={[`${accent}33`, 'rgba(10,12,24,0.4)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerGlow}
            />
            <View style={styles.headerBar}>
              <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
                <Ionicons name="chevron-back" size={22} color="#fff" />
              </TouchableOpacity>
              <View style={styles.titleRow}>
                <View style={[styles.accentDot, { backgroundColor: accent, shadowColor: accent }]} />
                <View>
                  <Text style={styles.headerEyebrow} numberOfLines={1}>
                    Your Space
                  </Text>
                  <Text style={styles.headerText} numberOfLines={1}>
                    Edit Profile
                  </Text>
                </View>
              </View>
              <View style={styles.headerIcons}>
                <TouchableOpacity
                  style={[styles.headerSaveBtn, (saving || loading) && { opacity: 0.65 }]}
                  onPress={() => void handleSave()}
                  disabled={saving || loading}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.headerSaveText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {loading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.loaderText}>Loading your profile…</Text>
            </View>
          ) : (
            <View style={styles.inner}>
              <View style={styles.profileHeader}>
                <LinearGradient
                  colors={[`${accent}33`, 'rgba(255,255,255,0.05)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.headerSheen}
                />

                <View style={styles.avatarWrap}>
                  <Image source={{ uri: avatarPreview }} style={[styles.avatar, { borderColor: accent }]} />
                  <TouchableOpacity
                    style={[styles.avatarCta, { borderColor: `${accent}55` }]}
                    onPress={() => void handlePickAvatar()}
                    disabled={avatarUploading || saving}
                  >
                    {avatarUploading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="camera-outline" size={16} color="#fff" />
                        <Text style={styles.avatarCtaText}>Change photo</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                <Text style={styles.name} numberOfLines={1}>
                  {displayName.trim() || 'Your name'}
                </Text>
                <Text style={styles.memberSince}>{headerSubtitle}</Text>
              </View>

              <View style={styles.glassCard}>
                <Text style={styles.sectionTitle}>Profile details</Text>

                <Text style={styles.inputLabel}>Display name</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Your name"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    style={styles.input}
                    autoCapitalize="words"
                    returnKeyType="done"
                  />
                </View>

                <Text style={[styles.inputLabel, { marginTop: 12 }]}>Status</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    value={status}
                    onChangeText={setStatus}
                    placeholder="Watching movies and loving it…"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    style={[styles.input, styles.inputMultiline]}
                    multiline
                    numberOfLines={3}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.inlineCta, { borderColor: `${accent}55` }]}
                  onPress={() => router.push('/categories?pickFavorite=1')}
                >
                  <Ionicons name="sparkles" size={16} color="#fff" />
                  <Text style={styles.inlineCtaText}>Pick your favorite genre</Text>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>
              </View>

              <View style={styles.glassCard}>
                <Text style={styles.sectionTitle}>Theme</Text>
                <Text style={styles.sectionSubtitle}>Choose an accent color</Text>

                <View style={styles.paletteRow}>
                  {palette.map((c) => {
                    const selected = c === selectedColor;
                    return (
                      <TouchableOpacity
                        key={c}
                        onPress={() => setSelectedColor(c)}
                        style={[
                          styles.colorDot,
                          { backgroundColor: c },
                          selected && { borderColor: '#fff', borderWidth: 2 },
                        ]}
                        activeOpacity={0.85}
                      />
                    );
                  })}
                </View>

                {favoriteGenres.length ? (
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.sectionSubtitle}>Favorite genres</Text>
                    <View style={styles.genresList}>
                      {favoriteGenres.map((genre) => (
                        <View key={genre} style={styles.genreTag}>
                          <Text style={styles.genreText}>{genre}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: selectedColor }, (saving || loading) && { opacity: 0.7 }]}
                onPress={() => void handleSave()}
                disabled={saving || loading}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Save changes</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: Platform.OS === 'ios' ? 60 : 40 }} />
        </ScrollView>
      </ScreenWrapper>
    </View>
  );
};

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#05060f',
  },
  container: {
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: 24,
  },
  headerWrap: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 26,
    paddingBottom: 14,
  },
  headerGlow: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: Platform.OS === 'ios' ? 44 : 20,
    height: 78,
    borderRadius: 22,
    opacity: 0.9,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '700',
  },
  headerText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSaveBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  headerSaveText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  inner: {
    paddingHorizontal: 16,
    gap: 14,
  },
  profileHeader: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  headerSheen: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.9,
  },
  avatarWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  avatarCta: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 999,
    backgroundColor: 'rgba(5,6,15,0.45)',
    borderWidth: 1,
  },
  avatarCtaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  name: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  memberSince: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.70)',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  glassCard: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 8,
  },
  sectionSubtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
  },
  inputLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
  },
  inputWrap: {
    borderRadius: 16,
    backgroundColor: 'rgba(5,6,15,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  input: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    padding: 0,
  },
  inputMultiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  inlineCta: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    height: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(5,6,15,0.35)',
    borderWidth: 1,
  },
  inlineCtaText: {
    flex: 1,
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  paletteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  colorDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  genresList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  genreTag: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(5,6,15,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  genreText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  primaryBtn: {
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 6,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  loaderWrap: {
    paddingHorizontal: 16,
    paddingTop: 60,
    alignItems: 'center',
    gap: 12,
  },
  loaderText: {
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '800',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 10,
  },
  centerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },
  centerSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    fontWeight: '700',
  },
});

export default EditProfileScreen;
