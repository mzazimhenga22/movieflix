/**
 * TV Remote Utility Functions
 * 
 * Provides consistent TV remote handling across all TV screens.
 * On Android TV, TVEventHandler may not always fire reliably,
 * so we also use BackHandler and keyboard events.
 */

import { Platform, BackHandler, TVEventHandler as TVEventHandlerType } from 'react-native';

type TvRemoteCallback = (eventType: string) => void;

let tvEventHandler: any = null;

/**
 * Enable TV remote event handling
 * Returns a cleanup function to disable the handler
 */
export function enableTvRemoteHandler(callback: TvRemoteCallback): () => void {
  const cleanupFns: (() => void)[] = [];

  // 1. Try native TVEventHandler (works on some Android TV devices and tvOS)
  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    try {
      // Dynamic require to avoid issues on non-TV platforms
      const TVEventHandler = (require('react-native') as any)?.TVEventHandler;
      if (TVEventHandler) {
        tvEventHandler = new TVEventHandler();
        tvEventHandler.enable(null, (_cmp: any, evt: any) => {
          const eventType = evt?.eventType;
          if (eventType) {
            callback(eventType);
          }
        });
        cleanupFns.push(() => {
          try {
            tvEventHandler?.disable();
            tvEventHandler = null;
          } catch {}
        });
      }
    } catch (e) {
      // TVEventHandler not available on this platform
    }
  }

  // 2. BackHandler for Android TV back button
  if (Platform.OS === 'android') {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      callback('back');
      return true; // Prevent default behavior
    });
    cleanupFns.push(() => backHandler.remove());
  }

  // 3. Return cleanup function
  return () => {
    cleanupFns.forEach(fn => fn());
  };
}

/**
 * TV Remote Event Types
 */
export const TV_REMOTE_EVENTS = {
  SELECT: 'select',
  PLAY_PAUSE: 'playPause',
  PLAY: 'play',
  PAUSE: 'pause',
  STOP: 'stop',
  FAST_FORWARD: 'fastForward',
  REWIND: 'rewind',
  LEFT: 'left',
  RIGHT: 'right',
  UP: 'up',
  DOWN: 'down',
  MENU: 'menu',
  BACK: 'back',
  EXIT: 'exit',
} as const;

/**
 * Check if we're running on a TV device
 */
export function isTvDevice(): boolean {
  if (Platform.isTV) return true;
  if (Platform.OS === 'android') {
    // Android TV detection via UI mode
    const isAndroidTV = (Platform as any).constants?.uiMode === 'tv';
    return Boolean(isAndroidTV);
  }
  return false;
}

/**
 * Play tick sound for navigation feedback
 */
let tickSound: any = null;
let lastTickTime = 0;

export async function playTickSound(): Promise<void> {
  const now = Date.now();
  if (now - lastTickTime < 50) return; // Throttle
  lastTickTime = now;

  if (!tickSound) {
    try {
      const { Audio } = require('expo-av');
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sounds/tick.wav'),
        { volume: 0.15, shouldPlay: false }
      );
      tickSound = sound;
    } catch {
      // Sound not available
    }
  }

  if (tickSound) {
    try {
      await tickSound.setPositionAsync(0);
      await tickSound.playAsync();
    } catch {}
  }
}

/**
 * Haptic feedback for TV remote navigation
 * Uses subtle vibration on Android devices
 */
export async function tvHapticFeedback(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const { Haptics } = require('expo-haptics');
    await Haptics.selectionAsync();
  } catch {
    // Haptics not available
  }
}

/**
 * Determines if any key press should wake controls
 * This is used when controls are hidden to show them on any input
 */
export function isWakeKey(eventType: string): boolean {
  // All keys except menu/back/exit should wake controls
  return !['menu', 'back', 'exit'].includes(eventType);
}

/**
 * Determines if a key should perform navigation
 * (left/right/up/down) rather than an action
 */
export function isNavigationKey(eventType: string): boolean {
  return ['left', 'right', 'up', 'down'].includes(eventType);
}

/**
 * Determines if a key should trigger an action
 * (select, playPause, fastForward, rewind)
 */
export function isActionKey(eventType: string): boolean {
  return ['select', 'playPause', 'play', 'pause', 'fastForward', 'rewind'].includes(eventType);
}
