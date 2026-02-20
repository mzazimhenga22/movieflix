import AsyncStorage from '@react-native-async-storage/async-storage';
import { getProfileScopedKey } from '@/lib/profileStorage';

export interface MessagingSettings {
  notificationsEnabled: boolean;
  showPreviews: boolean;
  readReceipts: boolean;
  typingIndicators: boolean;
  mediaAutoDownloadWifi: boolean;
  mediaAutoDownloadCellular: boolean;
  hibernate: boolean;
}

export const DEFAULT_MESSAGING_SETTINGS: MessagingSettings = {
  notificationsEnabled: true,
  showPreviews: true,
  readReceipts: true,
  typingIndicators: true,
  mediaAutoDownloadWifi: true,
  mediaAutoDownloadCellular: false,
  hibernate: false,
};

type Listener = (settings: MessagingSettings) => void;
const listeners = new Set<Listener>();

const emit = (settings: MessagingSettings) => {
  for (const l of listeners) {
    try {
      l(settings);
    } catch {
      // ignore
    }
  }
};

export const loadMessagingSettings = async (): Promise<MessagingSettings> => {
  try {
    const key = await getProfileScopedKey('messagingSettings');
    const stored = await AsyncStorage.getItem(key);
    if (!stored) return DEFAULT_MESSAGING_SETTINGS;
    const parsed = JSON.parse(stored);
    return { ...DEFAULT_MESSAGING_SETTINGS, ...(parsed as any) };
  } catch {
    return DEFAULT_MESSAGING_SETTINGS;
  }
};

export const saveMessagingSettings = async (settings: MessagingSettings): Promise<void> => {
  const key = await getProfileScopedKey('messagingSettings');
  await AsyncStorage.setItem(key, JSON.stringify(settings));
  emit(settings);
};

export const subscribeMessagingSettings = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
