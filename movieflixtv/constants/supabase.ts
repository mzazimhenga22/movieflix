import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

// Note: These env vars need to be exposed in app.json or .env
// For now we assume they are available via process.env like in mobile app
// If undefined, we gracefully degrade to limited functionality
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const missingConfigMessage = 'Supabase URL and anonymous key are required. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your env.';
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Use a mock storage adapter on the server or if needed
const storage = Platform.OS === 'web' && typeof window === 'undefined' ? {
    getItem: () => null,
    setItem: () => { },
    removeItem: () => { },
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
