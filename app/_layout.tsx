import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import '@react-native-anywhere/polyfill-base64';
import * as Linking from 'expo-linking';
import { router, Stack } from 'expo-router';
import { onAuthStateChanged, User } from 'firebase/auth';
export { ErrorBoundary } from 'expo-router';

import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-get-random-values';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-url-polyfill/auto';
// URL.parse polyfill for p-stream providers
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { AccentProvider } from '../components/app-components/AccentContext';
import FlixySettingsProvider from '../components/app-components/FlixySettingsProvider';
import { FlixyVoiceProvider } from '../components/app-components/FlixyVoice';
import GlobalCommsOverlay from '../components/app-components/GlobalCommsOverlay';
import GlobalMusicPlayerProvider from '../components/app-components/GlobalMusicPlayer';
import GlobalRealtimeNotifications from '../components/app-components/GlobalRealtimeNotifications';
import StartupVideoSplash from '../components/app-components/StartupVideoSplash';
import UpdateGate from '../components/app-components/UpdateGate';
import { authPromise, firestore, isFirestoreQuotaError } from '../constants/firebase';
import { supabase } from '../constants/supabase';
import CustomThemeProvider from '../hooks/use-theme';
import { registerDownloadBackgroundTasks } from '../lib/downloadBackgroundTasks';
import { initializeDownloadManager } from '../lib/downloadManager';
import { getStoredActiveProfile } from '../lib/profileStorage';
import { installPushNavigationHandlers, prepareNotificationsAsync, registerForPushNotificationsAsync } from '../lib/pushNotifications';
import '../lib/trackPlayerShim';
import '../lib/trackPlayerInit';
import '../polyfills/localstorage';
import '../polyfills/node-globals';
import '../polyfills/reanimated-worklet-callback';
import '../polyfills/url';
import { SubscriptionProvider } from '../providers/SubscriptionProvider';


export default function RootLayout() {
  const [showStartupVideo, setShowStartupVideo] = React.useState(true);
  const [quotaExceeded, setQuotaExceeded] = React.useState(false);


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
        unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
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
        unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
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
            } catch (err: any) {
              if (isFirestoreQuotaError(err)) {
                setQuotaExceeded(true);
              }
              // ignore other errors
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
        // Check network connectivity before opening external URLs
        void (async () => {
          try {
            const canOpen = await Linking.canOpenURL(data.externalUrl);
            if (canOpen) {
              await Linking.openURL(data.externalUrl);
            } else {
              console.warn('[push] cannot open external URL:', data.externalUrl);
            }
          } catch (err) {
            console.warn('[push] failed to open external URL:', err);
          }
        })();
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
      // Only handle Supabase auth links
      if (!event.url.includes('access_token=') && !event.url.includes('refresh_token=')) {
        return;
      }

      try {
        const redirectUrl = Linking.createURL('/post-review');
        const auth: any = supabase.auth;
        
        if (typeof auth.getSessionFromUrl === 'function') {
          const { data, error } = await auth.getSessionFromUrl(event.url, {
            redirectTo: redirectUrl,
          });
          if (error) throw error;
          if (data.session) router.replace('/post-review');
        } else {
          // Fallback for newer Supabase versions where session is handled via exchangeCodeForSession or automatically
          console.log('[Supabase] getSessionFromUrl not found, relying on auto-detection or manual parse');
        }
      } catch (error) {
        console.warn('Deep link handling failed:', error);
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);
    return () => subscription.remove();
  }, []);

  return (
    // @ts-ignore
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0E0E0E' }}>
      <BottomSheetModalProvider>
        <SafeAreaProvider>
          <CustomThemeProvider>
            <AccentProvider>
              <SubscriptionProvider>
                <FlixySettingsProvider>
                  <UpdateGate>
                    <GlobalMusicPlayerProvider>
                      <GlobalCommsOverlay />
                      <GlobalRealtimeNotifications />
                      <Stack screenOptions={{ headerShown: false }}>
                        <Stack.Screen name="index" />
                        <Stack.Screen name="select-profile" />
                        <Stack.Screen name="(auth)" />
                        <Stack.Screen name="(tabs)" />
                        <Stack.Screen name="messaging" />
                        <Stack.Screen name="post-review" />
                        <Stack.Screen name="details" />
                        <Stack.Screen name="my-list" />
                        <Stack.Screen name="see-all" />
                        <Stack.Screen name="settings" />
                        <Stack.Screen name="premium" />
                        <Stack.Screen name="profile" />
                        <Stack.Screen name="ad-interstitial" />
                        <Stack.Screen name="admin" />
                        <Stack.Screen name="feed" />
                        <Stack.Screen name="followers" />
                        <Stack.Screen name="following" />
                        <Stack.Screen name="marketplace" />
                        <Stack.Screen name="modal" />
                        <Stack.Screen name="paywall" />
                        <Stack.Screen name="reels" />
                        <Stack.Screen name="social-feed" />
                        <Stack.Screen name="story" />
                        <Stack.Screen name="story-upload" />
                        <Stack.Screen name="story-viewer" />
                        <Stack.Screen name="streaks" />
                        <Stack.Screen name="tv-login" />
                        <Stack.Screen name="watchparty" />
                        <Stack.Screen
                          name="calls"
                          options={{
                            headerShown: false,
                            presentation: 'fullScreenModal',
                          }}
                        />
                        <Stack.Screen
                          name="video-player"
                          options={{
                            headerShown: false,
                            presentation: 'fullScreenModal',
                            animation: 'fade',
                            gestureEnabled: false,
                          }}
                        />
                      </Stack>
                    </GlobalMusicPlayerProvider>
                  </UpdateGate>
                </FlixySettingsProvider>
              </SubscriptionProvider>
            </AccentProvider>
          </CustomThemeProvider>
        </SafeAreaProvider>

        {/* Firestore Quota Exceeded Warning */}
        {quotaExceeded && (
          <View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            backgroundColor: '#e50914',
            paddingVertical: 12,
            paddingHorizontal: 16,
            zIndex: 10000,
          }}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' }}>
              Firebase quota exceeded - Some features may be limited. Upgrade Blaze plan in Firebase Console.
            </Text>
          </View>
        )}

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
