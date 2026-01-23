
// app/_layout.tsx
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import '@react-native-anywhere/polyfill-base64';
import * as Linking from 'expo-linking';
import { Stack, router } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-get-random-values';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-url-polyfill/auto';
// URL.parse polyfill for p-stream providers
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { authPromise, firestore } from '../constants/firebase';
import { supabase } from '../constants/supabase';
import { CustomThemeProvider } from '../hooks/use-theme';
import { registerDownloadBackgroundTasks } from '../lib/downloadBackgroundTasks';
import { initializeDownloadManager } from '../lib/downloadManager';
import { getStoredActiveProfile } from '../lib/profileStorage';
import { installPushNavigationHandlers, prepareNotificationsAsync, registerForPushNotificationsAsync } from '../lib/pushNotifications';
import '../polyfills/node-globals';
import '../polyfills/reanimated-worklet-callback';
import '../polyfills/url';
import { SubscriptionProvider } from '../providers/SubscriptionProvider';
import { AccentProvider } from './components/AccentContext';
import { FlixySettingsProvider } from './components/FlixySettingsProvider';
import { FlixyVoiceProvider } from './components/FlixyVoice';
import GlobalCommsOverlay from './components/GlobalCommsOverlay';
import GlobalRealtimeNotifications from './components/GlobalRealtimeNotifications';
import StartupVideoSplash from './components/StartupVideoSplash';
import UpdateGate from './components/UpdateGate';

export default function RootLayout() {
  const [showStartupVideo, setShowStartupVideo] = React.useState(true);

  useEffect(() => {
    // Ensure notification permissions/channels are ready before download manager emits download notifications.
    void (async () => {
      try {
        await prepareNotificationsAsync();
      } catch {
        // ignore
      }
      try {
        await initializeDownloadManager();
        await registerDownloadBackgroundTasks();
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    // Ensure notification permissions/channels are ready before download manager emits download notifications.
    void (async () => {
      try {
        await prepareNotificationsAsync();
      } catch {
        // ignore
      }
      try {
        await initializeDownloadManager();
        await registerDownloadBackgroundTasks();
      } catch {
        // ignore
      }
    })();
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
      .catch(() => { });

    return () => {
      try {
        unsubscribe?.();
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    // Ensure the selected household profile identity (name/avatar) is reflected in Firestore users/<uid>
    // so messaging/chat headers can show the correct profile picture.
    let unsubscribe: (() => void) | null = null;

    void authPromise
      .then((auth) => {
        unsubscribe = onAuthStateChanged(auth, (user) => {
          if (!user?.uid) return;
          void (async () => {
            try {
              const profile = await getStoredActiveProfile();
              const displayName = typeof profile?.name === 'string' && profile.name.trim() ? profile.name.trim() : null;
              const photoURL = typeof profile?.photoURL === 'string' && profile.photoURL.trim() ? profile.photoURL.trim() : null;
              if (!displayName && !photoURL) return;
              await setDoc(
                doc(firestore, 'users', user.uid),
                {
                  ...(displayName ? { displayName } : {}),
                  ...(photoURL ? { photoURL } : {}),
                  activeProfileId: profile?.id ?? null,
                  activeProfileUpdatedAt: serverTimestamp(),
                },
                { merge: true },
              );
            } catch {
              // ignore
            }
          })();
        });
      })
      .catch(() => { });

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
        void Linking.openURL(data.externalUrl).catch(() => { });
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
      <BottomSheetModalProvider>
        <SafeAreaProvider>
          <CustomThemeProvider>
            <AccentProvider>
              <SubscriptionProvider>
                <FlixySettingsProvider>
                  <UpdateGate>
                    <GlobalCommsOverlay />
                    <GlobalRealtimeNotifications />
                    <Stack screenOptions={{ headerShown: false }}>
                      <Stack.Screen name="index" />
                      <Stack.Screen name="select-profile" />
                      <Stack.Screen name="(auth)" />
                      <Stack.Screen name="(tabs)" />
                      <Stack.Screen name="messaging" />
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
                </FlixySettingsProvider>
              </SubscriptionProvider>
            </AccentProvider>
          </CustomThemeProvider>
        </SafeAreaProvider>

        <StartupVideoSplash visible={showStartupVideo} onDone={() => setShowStartupVideo(false)} />
      </BottomSheetModalProvider>

      {/* Flixy Voice Provider - Global "Hey Flixy" voice activation */}
      <FlixyVoiceProvider>
        {/* Voice provider children render as overlay when needed */}
        <></>
      </FlixyVoiceProvider>
    </GestureHandlerRootView>
  );
}
