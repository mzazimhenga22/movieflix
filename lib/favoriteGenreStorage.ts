import AsyncStorage from '@react-native-async-storage/async-storage';

import { getProfileScopedKey } from './profileStorage';

export type FavoriteGenre = {
  id: number;
  name: string;
};

const BASE_KEY = 'favoriteGenre';

export async function getFavoriteGenre(): Promise<FavoriteGenre | null> {
  try {
    const key = await getProfileScopedKey(BASE_KEY);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FavoriteGenre>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.id !== 'number' || !Number.isFinite(parsed.id)) return null;
    if (typeof parsed.name !== 'string' || parsed.name.trim().length === 0) return null;
    return { id: parsed.id, name: parsed.name };
  } catch {
    return null;
  }
}

export async function setFavoriteGenre(genre: FavoriteGenre | null): Promise<void> {
  const key = await getProfileScopedKey(BASE_KEY);
  if (!genre) {
    await AsyncStorage.removeItem(key);
    return;
  }
  await AsyncStorage.setItem(key, JSON.stringify({ id: genre.id, name: genre.name }));
}
