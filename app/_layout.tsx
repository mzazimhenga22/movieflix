
// app/_layout.tsx
import '@react-native-anywhere/polyfill-base64';
import * as Linking from 'expo-linking';
import { Stack, router } from 'expo-router';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { onAuthStateChanged } from 'firebase/auth';
import 'react-native-get-random-values';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-url-polyfill/auto';
// URL.parse polyfill for p-stream providers
import '../polyfills/url';
import '../polyfills/node-globals';
import '../polyfills/reanimated-worklet-callback';
import { supabase } from '../constants/supabase';
import { authPromise } from '../constants/firebase';
import { CustomThemeProvider } from '../hooks/use-theme';
import { installPushNavigationHandlers, prepareNotificationsAsync, registerForPushNotificationsAsync } from '../lib/pushNotifications';
import { initializeDownloadManager } from '../lib/downloadManager';
import { SubscriptionProvider } from '../providers/SubscriptionProvider';
import { AccentProvider } from './components/AccentContext';
import UpdateGate from './components/UpdateGate';

export default function RootLayout() {
  useEffect(() => {
    void prepareNotificationsAsync().catch(() => {});
  }, []);

  useEffect(() => {
    void initializeDownloadManager().catch(() => {});
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    void authPromise
      .then((auth) => {
        unsubscribe = onAuthStateChanged(auth, (user) => {
          if (!user?.uid) return;
          void registerForPushNotificationsAsync(user.uid).catch((err) => {
            console.warn('[push] registration failed', err);
          });
        });
      })
      .catch(() => {});

    return () => {
      try {
        unsubscribe?.();
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    return installPushNavigationHandlers((data) => {
      if (!data) return;
      if (data.externalUrl && typeof data.externalUrl === 'string') {
        void Linking.openURL(data.externalUrl).catch(() => {});
        return;
      }
      if (data.url && typeof data.url === 'string') {
        router.push(data.url as any);
        return;
      }
      if (data.type === 'call' && data.callId) {
        router.push({ pathname: '/calls/[id]', params: { id: String(data.callId) } });
        return;
      }
      if (data.type === 'message' && data.conversationId) {
        router.push({ pathname: '/messaging/chat/[id]', params: { id: String(data.conversationId) } });
      }
    });
  }, []);

  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      const redirectUrl = Linking.createURL('/post-review');
      // Supabase types sometimes miss getSessionFromUrl in certain versions; cast to any for now.
      const { data, error } = await (supabase.auth as any).getSessionFromUrl(event.url, {
        redirectTo: redirectUrl,
      });

      if (error) {
        console.warn('Deep link handling failed:', error);
        return;
      }

      if (data.session) {
        router.replace('/post-review');
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Clean up the subscription when the component unmounts
    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0E0E0E' }}>
      <SafeAreaProvider>
        <CustomThemeProvider>
          <AccentProvider>
            <SubscriptionProvider>
              <UpdateGate>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="index" />
                  <Stack.Screen name="select-profile" />
                  <Stack.Screen name="(auth)" />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="post-review" />
                  <Stack.Screen
                    name="calls/[id]"
                    options={{
                      headerShown: false,
                      presentation: 'fullScreenModal',
                    }}
                  />
                </Stack>
              </UpdateGate>
            </SubscriptionProvider>
          </AccentProvider>
        </CustomThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
