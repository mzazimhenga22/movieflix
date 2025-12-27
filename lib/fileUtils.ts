// Utility for guessing file extension from a URL
export function guessFileExtension(url: string, fallback: string = 'mp4'): string {
  if (!url) return fallback;
  try {
    const clean = url.split('?')[0].split('#')[0];
    const last = clean.split('/').pop() ?? '';
    if (last.includes('.')) {
      const ext = last.split('.').pop();
      if (ext && ext.length <= 5) return ext.toLowerCase();
    }
  } catch {}
  return fallback;
}

// Ensures the download directory exists and returns its path
import * as FileSystem from 'expo-file-system/legacy';
export async function ensureDownloadDir(): Promise<string> {
  const downloadsRoot = FileSystem.documentDirectory + 'downloads';
  await FileSystem.makeDirectoryAsync(downloadsRoot, { intermediates: true }).catch(() => {});
  return downloadsRoot;
}

// Persists a download record to AsyncStorage
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DownloadItem } from '../types';
import { getProfileScopedKey } from './profileStorage';

export async function persistDownloadRecord(record: Partial<DownloadItem>): Promise<DownloadItem> {
  const key = await getProfileScopedKey('downloads');
  const stored = await AsyncStorage.getItem(key);
  const existing: DownloadItem[] = stored ? JSON.parse(stored) : [];
  const entry: DownloadItem = {
    id: record.id ?? `${record.mediaId ?? 'download'}-${Date.now()}`,
    ...record,
  } as DownloadItem;
  try {
    await AsyncStorage.setItem(key, JSON.stringify([entry, ...existing]));
  } catch (err) {
    console.error('Failed to persist downloads list', err);
    throw err;
  }
  return entry;
}

export async function removeDownloadRecord(id: string): Promise<void> {
  const key = await getProfileScopedKey('downloads');
  const stored = await AsyncStorage.getItem(key);
  const existing: DownloadItem[] = stored ? JSON.parse(stored) : [];
  const next = existing.filter((item) => item?.id !== id);
  await AsyncStorage.setItem(key, JSON.stringify(next));
}
