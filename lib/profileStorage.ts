import AsyncStorage from '@react-native-async-storage/async-storage';

export const ACTIVE_PROFILE_STORAGE_KEY = 'activeProfile';

export const LAST_AUTH_UID_STORAGE_KEY = 'lastAuthUid';

export type StoredProfile = {
  id?: string;
  name?: string;
  avatarColor?: string;
  photoURL?: string | null;
  photoPath?: string | null;
  isKids?: boolean;
  planTier?: string;
};

export const getStoredActiveProfile = async (): Promise<StoredProfile | null> => {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as StoredProfile;
    }
    return null;
  } catch (err) {
    console.warn('[profileStorage] Failed to parse activeProfile', err);
    return null;
  }
};

export const getLastAuthUid = async (): Promise<string | null> => {
  try {
    const raw = await AsyncStorage.getItem(LAST_AUTH_UID_STORAGE_KEY);
    const normalized = typeof raw === 'string' ? raw.trim() : '';
    return normalized ? normalized : null;
  } catch {
    return null;
  }
};

export const setLastAuthUid = async (uid: string | null | undefined): Promise<void> => {
  try {
    const normalized = typeof uid === 'string' ? uid.trim() : '';
    if (!normalized) {
      await AsyncStorage.removeItem(LAST_AUTH_UID_STORAGE_KEY);
      return;
    }
    await AsyncStorage.setItem(LAST_AUTH_UID_STORAGE_KEY, normalized);
  } catch {
    // ignore
  }
};

export const buildProfileScopedKey = (baseKey: string, profileId?: string | null) => {
  if (profileId && profileId.length > 0) {
    return `${baseKey}:${profileId}`;
  }
  return baseKey;
};

export const getProfileScopedKey = async (baseKey: string) => {
  const profile = await getStoredActiveProfile();
  return buildProfileScopedKey(baseKey, profile?.id ?? null);
};
