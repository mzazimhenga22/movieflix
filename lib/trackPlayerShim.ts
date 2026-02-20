// Lightweight TrackPlayer shim to avoid crashes when native module isn't linked.
// This file installs no-op async functions onto the imported `react-native-track-player`
// object if the native implementation is not available at runtime. Import this
// early (e.g. in `_layout.tsx`) so other modules can safely call TrackPlayer.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const TrackPlayer: any = require('react-native-track-player');
  if (!TrackPlayer) {
    // nothing to do
  } else {
    const hasSetup = typeof TrackPlayer.setupPlayer === 'function';
    if (!hasSetup) {
      console.warn('[trackPlayerShim] TrackPlayer native module not available — installing no-op shims');
      const noopAsync = async (..._args: any[]) => null;
      const noopSync = (..._args: any[]) => null;
      const methods = [
        'setupPlayer',
        'updateOptions',
        'seekTo',
        'play',
        'pause',
        'getState',
        'reset',
        'add',
        'remove',
        'getQueue',
        'skip',
        'skipToNext',
        'skipToPrevious',
        'getCurrentTrack',
        'getPosition',
        'getDuration',
        'getVolume',
        'setVolume',
      ];

      for (const m of methods) {
        if (typeof TrackPlayer[m] !== 'function') {
          // Keep them async to match original API where applicable
          TrackPlayer[m] = noopAsync;
        }
      }
    }
  }
} catch (e) {
  // If require fails (module not installed), ignore — app should still run without music features.
}

export { };

