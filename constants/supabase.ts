import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const missingConfigMessage = 'Supabase URL and anonymous key are required. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your env.';
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Use a mock storage adapter on the server
const storage = Platform.OS === 'web' && typeof window === 'undefined' ? {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
} : AsyncStorage;

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        storage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : createClient('https://example.supabase.co', 'missing-anon-key', {
      auth: {
        storage,
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: () => Promise.reject(new Error(missingConfigMessage)),
      },
    });
