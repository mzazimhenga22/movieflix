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
  } catch { }
  return fallback;
}

// Ensures the download directory exists and returns its path
import * as FileSystem from 'expo-file-system/legacy';
export async function ensureDownloadDir(): Promise<string> {
  const downloadsRoot = FileSystem.documentDirectory + 'downloads';
  await FileSystem.makeDirectoryAsync(downloadsRoot, { intermediates: true }).catch(() => { });
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
    downloadStatus: 'completed', // Default to completed
    ...record,
  } as DownloadItem;
  try {
    const next = [entry, ...existing.filter((it) => it && String(it.id) !== String(entry.id))];
    await AsyncStorage.setItem(key, JSON.stringify(next));
  } catch (err) {
    console.error('Failed to persist downloads list', err);
    throw err;
  }
  return entry;
}

// Persist a partial/in-progress download that's playable
export async function persistPartialDownload(record: Partial<DownloadItem>): Promise<DownloadItem> {
  const key = await getProfileScopedKey('downloads');
  const stored = await AsyncStorage.getItem(key);
  const existing: DownloadItem[] = stored ? JSON.parse(stored) : [];
  
  const entry: DownloadItem = {
    id: record.id ?? `${record.mediaId ?? 'download'}-${Date.now()}`,
    isPartial: true,
    downloadStatus: 'downloading',
    ...record,
  } as DownloadItem;
  
  try {
    // Update existing or add new
    const existingIndex = existing.findIndex(it => it?.id === entry.id);
    if (existingIndex >= 0) {
      existing[existingIndex] = { ...existing[existingIndex], ...entry };
    } else {
      existing.unshift(entry);
    }
    await AsyncStorage.setItem(key, JSON.stringify(existing));
  } catch (err) {
    console.error('Failed to persist partial download', err);
    throw err;
  }
  return entry;
}

// Update a download record (for progress updates)
export async function updateDownloadRecord(id: string, updates: Partial<DownloadItem>): Promise<void> {
  const key = await getProfileScopedKey('downloads');
  const stored = await AsyncStorage.getItem(key);
  const existing: DownloadItem[] = stored ? JSON.parse(stored) : [];
  const next = existing.map(item => 
    item?.id === id ? { ...item, ...updates } : item
  );
  await AsyncStorage.setItem(key, JSON.stringify(next));
}

// Mark a partial download as completed
export async function markDownloadCompleted(id: string, finalRecord: Partial<DownloadItem>): Promise<void> {
  const key = await getProfileScopedKey('downloads');
  const stored = await AsyncStorage.getItem(key);
  const existing: DownloadItem[] = stored ? JSON.parse(stored) : [];
  const next = existing.map(item => 
    item?.id === id ? { 
      ...item, 
      ...finalRecord,
      isPartial: false, 
      downloadStatus: 'completed',
      partialProgress: 1,
    } : item
  );
  await AsyncStorage.setItem(key, JSON.stringify(next));
}

export async function removeDownloadRecord(id: string): Promise<void> {
  const key = await getProfileScopedKey('downloads');
  const stored = await AsyncStorage.getItem(key);
  const existing: DownloadItem[] = stored ? JSON.parse(stored) : [];
  const next = existing.filter((item) => item?.id !== id);
  await AsyncStorage.setItem(key, JSON.stringify(next));
}

// Get all downloads including partial ones
export async function getAllDownloads(): Promise<DownloadItem[]> {
  const key = await getProfileScopedKey('downloads');
  const stored = await AsyncStorage.getItem(key);
  return stored ? JSON.parse(stored) : [];
}
