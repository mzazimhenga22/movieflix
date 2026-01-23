/**
 * Background Task Scheduler
 * 
 * Distributes heavy work (like clip prefetching) across app idle times.
 * Uses InteractionManager and requestIdleCallback patterns.
 * Respects CPU/RAM by limiting concurrent work and adding delays.
 */

import { AppState, AppStateStatus, InteractionManager } from 'react-native';
import { getCacheStats, initPrefetchCache, prefetchAllGenresInBackground } from './reelsPrefetchCache';

// Track app state
let appState: AppStateStatus = 'active';
let isInitialized = false;
let hasStartedPrefetch = false;
let prefetchTriggerCount = 0;

// Screens that can trigger prefetch (lighter screens)
const PREFETCH_TRIGGER_SCREENS = [
    'profile',
    'settings',
    'my-list',
    'search',
    'notifications',
];

// Screens that should NOT trigger prefetch (heavy screens)
const HEAVY_SCREENS = [
    'movies',
    'movieDetails',
    'video-player',
    'reels',
    'social-feed',
];

/**
 * Initialize the background scheduler
 * Call this once on app start (e.g., in _layout.tsx)
 */
export function initBackgroundScheduler(): () => void {
    if (isInitialized) return () => { };
    isInitialized = true;

    // Listen to app state changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Initialize cache on startup (but don't prefetch yet)
    InteractionManager.runAfterInteractions(async () => {
        await initPrefetchCache();
        console.log('[BackgroundScheduler] Cache initialized');
    });

    return () => {
        subscription.remove();
    };
}

function handleAppStateChange(nextAppState: AppStateStatus): void {
    const wasBackground = appState === 'background' || appState === 'inactive';
    const isNowActive = nextAppState === 'active';

    appState = nextAppState;

    // When app comes back to foreground, check if we should prefetch
    if (wasBackground && isNowActive && !hasStartedPrefetch) {
        // Delay prefetch to let the app settle
        setTimeout(() => {
            if (appState === 'active') {
                triggerIdlePrefetch('app_foreground');
            }
        }, 3000);
    }
}

/**
 * Trigger idle prefetch from a screen
 * Only triggers if on a "light" screen and hasn't prefetched recently
 */
export function triggerIdlePrefetch(source: string): void {
    // Don't prefetch more than once per session unless explicitly requested
    if (hasStartedPrefetch && source !== 'force') {
        console.log('[BackgroundScheduler] Prefetch already started, skipping');
        return;
    }

    // Check cache stats - if we have enough clips, don't prefetch
    const stats = getCacheStats();
    const totalClips = Object.values(stats).reduce((sum, s) => sum + s.count, 0);
    if (totalClips >= 30 && source !== 'force') {
        console.log('[BackgroundScheduler] Already have', totalClips, 'clips cached, skipping prefetch');
        return;
    }

    hasStartedPrefetch = true;
    prefetchTriggerCount++;
    console.log(`[BackgroundScheduler] Starting prefetch from: ${source} (count: ${prefetchTriggerCount})`);

    // Run prefetch in background with low priority
    InteractionManager.runAfterInteractions(() => {
        prefetchAllGenresInBackground();
    });
}

/**
 * Call this when navigating to a light screen
 * It will trigger prefetch in the background if needed
 */
export function onLightScreenFocus(screenName: string): void {
    if (!PREFETCH_TRIGGER_SCREENS.includes(screenName)) {
        return;
    }

    // Wait for screen to settle before triggering
    setTimeout(() => {
        if (appState === 'active') {
            triggerIdlePrefetch(`screen_${screenName}`);
        }
    }, 1500);
}

/**
 * Pause prefetching when entering a heavy screen
 */
export function onHeavyScreenFocus(screenName: string): void {
    if (HEAVY_SCREENS.includes(screenName)) {
        console.log(`[BackgroundScheduler] Heavy screen focused: ${screenName}, pausing prefetch`);
        // The prefetch system already uses InteractionManager, so it should
        // naturally yield to heavy screens. This is just for logging.
    }
}

/**
 * Run a task in the background with low priority
 * Perfect for non-urgent work that shouldn't block UI
 */
export function runInBackground<T>(
    task: () => Promise<T>,
    options: { delay?: number; onComplete?: (result: T) => void } = {}
): void {
    const { delay = 0, onComplete } = options;

    setTimeout(() => {
        InteractionManager.runAfterInteractions(async () => {
            try {
                const result = await task();
                onComplete?.(result);
            } catch (e) {
                console.warn('[BackgroundScheduler] Background task failed:', e);
            }
        });
    }, delay);
}

/**
 * Queue multiple tasks to run sequentially in background
 * With delays between each to avoid overwhelming the system
 */
export function queueBackgroundTasks(
    tasks: Array<() => Promise<void>>,
    delayBetween: number = 500
): void {
    if (tasks.length === 0) return;

    const runNext = (index: number) => {
        if (index >= tasks.length) return;

        InteractionManager.runAfterInteractions(async () => {
            try {
                await tasks[index]();
            } catch (e) {
                console.warn('[BackgroundScheduler] Queued task failed:', e);
            }

            setTimeout(() => runNext(index + 1), delayBetween);
        });
    };

    // Start after initial delay
    setTimeout(() => runNext(0), 1000);
}

/**
 * Check if we're on a heavy screen and should defer work
 */
export function shouldDeferWork(): boolean {
    return appState !== 'active';
}

/**
 * Get prefetch status for debugging
 */
export function getPrefetchStatus(): { initialized: boolean; hasStarted: boolean; triggerCount: number } {
    return {
        initialized: isInitialized,
        hasStarted: hasStartedPrefetch,
        triggerCount: prefetchTriggerCount,
    };
}
