import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
} from 'react-native-track-player';

// Register the playback service at the top level so it's available as soon as this module is loaded.
// In Expo Router, we import this in _layout.tsx.
try {
  TrackPlayer.registerPlaybackService(() => async () => {
    // This function handles remote control events
    TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
    TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
    TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
    TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
    TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
    TrackPlayer.addEventListener(Event.RemoteSeek, (event) => TrackPlayer.seekTo(event.position));
  });
} catch (e) {
  console.warn('[TrackPlayer] Service registration failed:', e);
}

let _trackPlayerSetupDone = false;
let _trackPlayerSetupPromise: Promise<void> | null = null;
let _trackPlayerSetupError: Error | null = null;

export const isTrackPlayerReady = (): boolean => {
  return _trackPlayerSetupDone;
};

export const initializeTrackPlayer = async () => {
  if (_trackPlayerSetupDone) return;
  
  if (_trackPlayerSetupPromise) {
    await _trackPlayerSetupPromise;
    if (_trackPlayerSetupError) throw _trackPlayerSetupError;
    return;
  }

  _trackPlayerSetupPromise = (async () => {
    try {
      if (typeof TrackPlayer.setupPlayer !== 'function') return;
      
      await TrackPlayer.setupPlayer();
      await TrackPlayer.updateOptions({
        android: {
          appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
        },
        capabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
          Capability.SeekTo,
          Capability.Stop,
        ],
        compactCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
        ],
        notificationCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
          Capability.SeekTo,
        ],
        progressUpdateEventInterval: 1,
      });
      
      _trackPlayerSetupDone = true;
      _trackPlayerSetupError = null;
      console.log('[TrackPlayer] Setup complete');
    } catch (err: any) {
      // If error code is 'player_already_setup', we can treat it as success
      if (err?.code === 'player_already_setup') {
        _trackPlayerSetupDone = true;
        _trackPlayerSetupError = null;
      } else {
        _trackPlayerSetupError = err instanceof Error ? err : new Error(String(err));
        console.warn('[MusicPlayer] TrackPlayer setup error:', err);
      }
    } finally {
      _trackPlayerSetupPromise = null;
    }
  })();
  
  await _trackPlayerSetupPromise;
};

export const ensureTrackPlayer = async () => {
  await initializeTrackPlayer();
  if (!_trackPlayerSetupDone) {
    throw new Error('TrackPlayer failed to initialize.');
  }
};
