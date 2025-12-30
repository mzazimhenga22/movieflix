import '@react-native-anywhere/polyfill-base64';
import { Stack } from 'expo-router';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-get-random-values';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-url-polyfill/auto';

import '@/polyfills/url';
import '@/polyfills/node-globals';
import '@/polyfills/reanimated-worklet-callback';
import { SubscriptionProvider } from '@/providers/SubscriptionProvider';
import { initializeDownloadManager } from '@/lib/downloadManager';

export default function RootLayout() {
  useEffect(() => {
    void initializeDownloadManager().catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#05060f' }}>
      <SafeAreaProvider>
        <SubscriptionProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="select-profile" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="details/[id]" />
            <Stack.Screen name="video-player" />
            <Stack.Screen name="watchparty/player" />
            <Stack.Screen name="continue-on-phone" />
            <Stack.Screen name="premium" />
          </Stack>
        </SubscriptionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
