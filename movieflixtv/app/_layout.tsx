import '@react-native-anywhere/polyfill-base64';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, usePathname } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-get-random-values';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-url-polyfill/auto';

import { initializeDownloadManager } from '@/lib/downloadManager';
import { prepareNotificationsAsync } from '@/lib/pushNotifications';
import '@/polyfills/node-globals';
import '@/polyfills/reanimated-worklet-callback';
import '@/polyfills/url';
import { SubscriptionProvider } from '@/providers/SubscriptionProvider';
import FlixyAssistantTV from './components/FlixyAssistantTV';
import StartupVideoSplash from './components/StartupVideoSplash';
import { TvAccentProvider } from './components/TvAccentContext';
import { TvCardOverlayProvider } from './components/TvCardOverlay';
import { TvSpatialNavigationProvider } from './components/TvSpatialNavigation';
import UpdateGate from './components/UpdateGate';

const SPLASH_SHOWN_KEY = 'tvSplashShownAt';
const SPLASH_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes - don't show again within this window

export default function RootLayout() {
  const pathname = usePathname();
  const [showStartupVideo, setShowStartupVideo] = useState(false);
  const [splashChecked, setSplashChecked] = useState(false);
  const [flixyEnabled, setFlixyEnabled] = useState(true);

  useEffect(() => {
    // Load Flixy setting
    AsyncStorage.getItem('flixy_enabled_v1').then((val) => {
      if (val !== null) setFlixyEnabled(val === 'true');
    });

    const sub = DeviceEventEmitter.addListener('flixy_settings_changed', (enabled: boolean) => {
      setFlixyEnabled(enabled);
    });
    return () => sub.remove();
  }, []);

  // Only show splash on index route and only once per session
  useEffect(() => {
    let mounted = true;
    const checkSplash = async () => {
      try {
        const lastShown = await AsyncStorage.getItem(SPLASH_SHOWN_KEY);
        const now = Date.now();
        if (lastShown) {
          const elapsed = now - parseInt(lastShown, 10);
          if (elapsed < SPLASH_COOLDOWN_MS) {
            if (mounted) {
              setShowStartupVideo(false);
              setSplashChecked(true);
            }
            return;
          }
        }
        // Show splash only on index route
        if (pathname === '/' || pathname === '/index') {
          await AsyncStorage.setItem(SPLASH_SHOWN_KEY, String(now));
          if (mounted) setShowStartupVideo(true);
        }
      } catch {
        // On error, don't show splash
        if (mounted) setShowStartupVideo(false);
      }
      if (mounted) setSplashChecked(true);
    };
    checkSplash();

    // Safety timeout - auto-hide splash after 8 seconds in case video fails
    const safetyTimeout = setTimeout(() => {
      if (mounted && showStartupVideo) {
        setShowStartupVideo(false);
      }
    }, 8000);

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await prepareNotificationsAsync();
      } catch { }
      try {
        await initializeDownloadManager();
      } catch { }
    })();
  }, []);

  const isPlaybackScreen = pathname?.includes('video-player') || 
                           pathname?.includes('watchparty/player') || 
                           pathname?.includes('live/') || 
                           pathname?.includes('music-player');
  const assistantScreen = pathname?.includes('/details') ? 'details' : pathname?.includes('/movies') ? 'movies' : 'home';

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#05060f' }}>
      <TvSpatialNavigationProvider>
        <TvAccentProvider>
          <TvCardOverlayProvider>
            <SafeAreaProvider>
              <SubscriptionProvider>
                <UpdateGate>
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="select-profile" />
                    <Stack.Screen name="(auth)" />
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="details/[id]" />
                    <Stack.Screen name="video-player" />
                    <Stack.Screen name="watchparty/player" />
                    <Stack.Screen name="live/[id]" />
                    <Stack.Screen name="continue-on-phone" />
                    <Stack.Screen name="premium" />
                    <Stack.Screen name="music-player" />
                  </Stack>
                </UpdateGate>
              </SubscriptionProvider>
            </SafeAreaProvider>
          </TvCardOverlayProvider>
        </TvAccentProvider>
      </TvSpatialNavigationProvider>
      <StartupVideoSplash visible={showStartupVideo} onDone={() => setShowStartupVideo(false)} />

      {/* Flixy TV Assistant - Remote-friendly, no voice required */}
      {!showStartupVideo && flixyEnabled && !isPlaybackScreen && (
        <FlixyAssistantTV screen={assistantScreen} position="bottom-right" />
      )}
    </GestureHandlerRootView>
  );
}
