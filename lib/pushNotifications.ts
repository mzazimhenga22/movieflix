import { authPromise, firestore } from '@/constants/firebase';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { arrayUnion, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

// Lazy-loaded modules to avoid early native initialization that can trigger
// token callbacks before the JS event emitter is ready.
let Notifications: typeof import('expo-notifications') | null = null;
let TaskManager: typeof import('expo-task-manager') | null = null;
let _notificationsInitialized = false;
let _initInFlight: Promise<any> | null = null;

const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND_NOTIFICATION_TASK';

async function ensureNotifications() {
  if (_notificationsInitialized) return { Notifications, TaskManager };
  if (_initInFlight) return _initInFlight;
  try {
    _initInFlight = (async () => {
      if (!Notifications) Notifications = await import('expo-notifications');
      if (!TaskManager) TaskManager = await import('expo-task-manager');

      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });

      TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }: any) => {
        if (error) {
          console.warn('[push] background task error', error);
          return;
        }
        if (data) {
          console.log('[push] background notification received', data);
        }
      });

      Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch((err) => {
        console.warn('[push] failed to register background task', err);
      });

      _notificationsInitialized = true;
      return { Notifications, TaskManager };
    })();

    return await _initInFlight;
  } catch (err) {
    console.warn('[push] notifications modules not available', err);
    return { Notifications: null, TaskManager: null };
  } finally {
    _initInFlight = null;
  }
}

export const prepareNotificationsAsync = async (): Promise<any | null> => {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) return null;

  const mods = await ensureNotifications();
  if (!mods.Notifications) return null;

  try {
    const N = mods.Notifications;
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('default', {
        name: 'MovieFlix',
        importance: N.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 150],
        lightColor: '#e50914',
      });

      await N.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: N.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#e50914',
      });

      await N.setNotificationChannelAsync('calls', {
        name: 'Calls',
        importance: N.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500],
        lightColor: '#e50914',
      });

      await N.setNotificationChannelAsync('downloads', {
        name: 'Downloads',
        importance: N.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 150],
        lightColor: '#e50914',
      });

      await N.setNotificationChannelAsync('downloads-progress', {
        name: 'Download Progress',
        importance: N.AndroidImportance.LOW,
        vibrationPattern: undefined,
        lightColor: '#e50914',
        sound: undefined,
      });
    }

    const existing = await N.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await N.requestPermissionsAsync();
      status = requested.status;
    }

    return status;
  } catch (err) {
    console.warn('[push] prepareNotificationsAsync failed', err);
    return null;
  }
};

const getExpoProjectId = (): string | undefined => {
  return (
    (Constants.easConfig as any)?.projectId ||
    (Constants.expoConfig as any)?.extra?.eas?.projectId ||
    (Constants as any)?.expoConfig?.extra?.eas?.projectId
  );
};

export const registerForPushNotificationsAsync = async (userId: string): Promise<string | null> => {
  if (!userId) return null;
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) return null;

  const status = await prepareNotificationsAsync();
  if (status !== 'granted') return null;

  let token: string;
  try {
    const mods = await ensureNotifications();
    if (!mods.Notifications) return null;
    const projectId = getExpoProjectId();
    token = (await mods.Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  } catch (err) {
    // On Android, this can throw if FCM credentials / google-services.json are not configured
    // for a custom dev client or standalone build.
    console.warn('[push] failed to fetch expo push token', err);
    return null;
  }

  try {
    await setDoc(
      doc(firestore, 'users', userId),
      {
        expoPushToken: token,
        expoPushTokens: arrayUnion(token),
        expoPushUpdatedAt: serverTimestamp(),
      } as any,
      { merge: true },
    );
  } catch (err: any) {
    if ((err?.code || err?.message || String(err))?.includes?.('quota')) {
      console.warn('[push] Firestore quota exceeded - push token may not be saved', err);
    } else {
      console.warn('[push] failed to persist expo push token', err);
    }
  }

  return token;
};

export const getFirebaseIdToken = async (): Promise<string | null> => {
  try {
    const auth = await authPromise;
    const user = auth.currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
};

export type PushRouteData = {
  type?:
  | 'message'
  | 'call'
  | 'story'
  | 'reel'
  | 'continue_watching'
  | 'new_movie'
  | 'app_update';
  conversationId?: string;
  callId?: string;
  storyId?: string;
  reviewId?: string;
  tmdbId?: string;
  mediaType?: 'movie' | 'tv';
  resumeMillis?: number;
  url?: string;
  externalUrl?: string;
};

export const installPushNavigationHandlers = (
  onNavigate: (data: PushRouteData) => void,
): (() => void) => {
  const handle = (data: any) => {
    if (!data || typeof data !== 'object') return;
    onNavigate(data as PushRouteData);
  };

  let responseSub: { remove: () => void } | null = null;
  (async () => {
    const mods = await ensureNotifications();
    if (!mods.Notifications) return;
    responseSub = mods.Notifications.addNotificationResponseReceivedListener((response: any) => {
      handle(response?.notification?.request?.content?.data);
    });

    void mods.Notifications.getLastNotificationResponseAsync().then((response: any) => {
      handle(response?.notification?.request?.content?.data);
    });
  })();

  return () => {
    try {
      responseSub?.remove();
    } catch {
      // ignore
    }
  };
};
