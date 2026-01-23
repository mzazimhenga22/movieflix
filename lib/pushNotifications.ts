import { authPromise, firestore } from '@/constants/firebase';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { arrayUnion, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND_NOTIFICATION_TASK';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Register background task to handle notifications when app is in background/killed
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }: any) => {
  if (error) {
    console.warn('[push] background task error', error);
    return;
  }
  if (data) {
    // This allows the app to perform logic when a notification is received in background.
    // The OS usually wakes the app briefly to execute this.
    console.log('[push] background notification received', data);
  }
});

Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch((err) => {
  console.warn('[push] failed to register background task', err);
});

export const prepareNotificationsAsync = async (): Promise<Notifications.PermissionStatus | null> => {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'MovieFlix',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 150],
      lightColor: '#e50914',
    });

    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#e50914',
    });

    await Notifications.setNotificationChannelAsync('calls', {
      name: 'Calls',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#e50914',
    });

    await Notifications.setNotificationChannelAsync('downloads', {
      name: 'Downloads',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 150],
      lightColor: '#e50914',
    });

    await Notifications.setNotificationChannelAsync('downloads-progress', {
      name: 'Download Progress',
      importance: Notifications.AndroidImportance.LOW,
      vibrationPattern: undefined,
      lightColor: '#e50914',
      sound: undefined,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  return status;
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
    const projectId = getExpoProjectId();
    token = (
      await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
    ).data;
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
  } catch (err) {
    console.warn('[push] failed to persist expo push token', err);
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

  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    handle(response?.notification?.request?.content?.data);
  });

  void Notifications.getLastNotificationResponseAsync().then((response) => {
    handle(response?.notification?.request?.content?.data);
  });

  return () => {
    try {
      responseSub.remove();
    } catch {
      // ignore
    }
  };
};
