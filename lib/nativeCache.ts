import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

const { CacheModule } = NativeModules;

// Check if native cache module is available
const isNativeCacheAvailable = Platform.OS === 'android' && CacheModule != null;

export const NativeCache = {
  setItem: async (key: string, value: string): Promise<boolean> => {
    if (isNativeCacheAvailable) {
      try {
        await CacheModule.setItem(key, value);
        return true;
      } catch (e) {
        console.warn('[NativeCache] setItem failed, falling back to AsyncStorage', e);
        // Fall through to AsyncStorage
      }
    }
    try {
      await AsyncStorage.setItem(key, value);
      return true;
    } catch (e) {
      console.warn('[NativeCache] AsyncStorage setItem failed', e);
      return false;
    }
  },

  getItem: async (key: string): Promise<string | null> => {
    if (isNativeCacheAvailable) {
      try {
        return await CacheModule.getItem(key);
      } catch (e) {
        console.warn('[NativeCache] getItem failed, falling back to AsyncStorage', e);
        // Fall through to AsyncStorage
      }
    }
    try {
      return await AsyncStorage.getItem(key);
    } catch (e) {
      console.warn('[NativeCache] AsyncStorage getItem failed', e);
      return null;
    }
  },

  removeItem: async (key: string): Promise<boolean> => {
    if (isNativeCacheAvailable) {
      try {
        await CacheModule.removeItem(key);
        return true;
      } catch (e) {
        console.warn('[NativeCache] removeItem failed, falling back to AsyncStorage', e);
        // Fall through to AsyncStorage
      }
    }
    try {
      await AsyncStorage.removeItem(key);
      return true;
    } catch (e) {
      console.warn('[NativeCache] AsyncStorage removeItem failed', e);
      return false;
    }
  },

  getAllKeys: async (): Promise<readonly string[]> => {
    if (isNativeCacheAvailable) {
      try {
        return await CacheModule.getAllKeys();
      } catch (e) {
        console.warn('[NativeCache] getAllKeys failed, falling back to AsyncStorage', e);
        // Fall through to AsyncStorage
      }
    }
    try {
      return await AsyncStorage.getAllKeys();
    } catch (e) {
      console.warn('[NativeCache] AsyncStorage getAllKeys failed', e);
      return [];
    }
  },

  clear: async (): Promise<boolean> => {
    if (isNativeCacheAvailable) {
      try {
        await CacheModule.clear();
        return true;
      } catch (e) {
        console.warn('[NativeCache] clear failed, falling back to AsyncStorage', e);
        // Fall through to AsyncStorage
      }
    }
    try {
      await AsyncStorage.clear();
      return true;
    } catch (e) {
      console.warn('[NativeCache] AsyncStorage clear failed', e);
      return false;
    }
  }
};
