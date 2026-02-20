import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

const { CacheModule } = NativeModules;

export const NativeCache = {
    setItem: async (key: string, value: string): Promise<boolean> => {
        if (Platform.OS === 'android') {
            try {
                await CacheModule.setItem(key, value);
                return true;
            } catch (e) {
                console.warn('[NativeCache] setItem failed', e);
                return false;
            }
        } else {
            await AsyncStorage.setItem(key, value);
            return true;
        }
    },

    getItem: async (key: string): Promise<string | null> => {
        if (Platform.OS === 'android') {
            try {
                return await CacheModule.getItem(key);
            } catch (e) {
                console.warn('[NativeCache] getItem failed', e);
                return null; // Fallback? No, just null.
            }
        } else {
            return await AsyncStorage.getItem(key);
        }
    },

    removeItem: async (key: string): Promise<boolean> => {
        if (Platform.OS === 'android') {
            try {
                await CacheModule.removeItem(key);
                return true;
            } catch (e) {
                return false;
            }
        } else {
            await AsyncStorage.removeItem(key);
            return true;
        }
    },

    getAllKeys: async (): Promise<readonly string[]> => {
        if (Platform.OS === 'android') {
            try {
                return await CacheModule.getAllKeys();
            } catch (e) {
                return [];
            }
        } else {
            return await AsyncStorage.getAllKeys();
        }
    },

    clear: async (): Promise<boolean> => {
        if (Platform.OS === 'android') {
            try {
                await CacheModule.clear();
                return true;
            } catch (e) {
                return false;
            }
        } else {
            await AsyncStorage.clear();
            return true;
        }
    }
};
