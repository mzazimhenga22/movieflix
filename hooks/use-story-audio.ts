import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { usePStream } from '../src/pstream/usePStream';

export type MusicData = {
    videoId: string;
    title?: string;
    artist?: string;
    thumbnail?: string;
    startTime?: number; // In seconds
    duration?: number;  // In seconds
};

type UseStoryAudioProps = {
    musicTrack?: MusicData | null;
    /**
     * If true, the hook will attempt to load/play.
     * If false, it will pause.
     */
    active: boolean;
    /**
     * Global mute state.
     */
    muted: boolean;
    /**
     * Optional volume (0.0 - 1.0).
     */
    volume?: number;
};

export function useStoryAudio({ musicTrack, active, muted, volume = 1.0 }: UseStoryAudioProps) {
    const { getMusicStream } = usePStream();
    const soundRef = useRef<Audio.Sound | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Track the unique key to detect track changes
    const trackId = musicTrack?.videoId;
    const startTime = musicTrack?.startTime ?? 0;

    useEffect(() => {
        // Unload when component unmounts
        return () => {
            if (soundRef.current) {
                soundRef.current.unloadAsync().catch(() => { });
            }
        };
    }, []);

    useEffect(() => {
        let mounted = true;

        const loadAudio = async () => {
            if (!trackId) {
                // If no track, unload current
                if (soundRef.current) {
                    await soundRef.current.unloadAsync();
                    soundRef.current = null;
                    setIsLoaded(false);
                }
                return;
            }

            // If we already have this loaded, just reset position
            // (This is a simplified check; usually we might re-create for safety/simplicity)
            if (soundRef.current) {
                await soundRef.current.unloadAsync();
                soundRef.current = null;
                setIsLoaded(false);
            }

            setError(null);

            try {
                const directory = (FileSystem as any).cacheDirectory + 'story-music/';
                await (FileSystem as any).makeDirectoryAsync(directory, { intermediates: true });

                const safeId = trackId.replace(/[^a-zA-Z0-9]/g, '_');
                const fileUri = directory + `${safeId}.m4a`;

                // Check if cached
                const info = await (FileSystem as any).getInfoAsync(fileUri);
                let finalUri = fileUri;

                if (!info.exists) {
                    console.log(`[useStoryAudio] Cache miss for ${trackId}, resolving...`);
                    // Resolve stream - request download-ready file (skip HLS)
                    const result = await getMusicStream(trackId, 'audio', true);
                    if (!result?.uri) {
                        throw new Error('Failed to resolve audio stream');
                    }

                    // Download to cache
                    console.log(`[useStoryAudio] Downloading to ${fileUri}`);
                    await (FileSystem as any).downloadAsync(result.uri, fileUri);
                } else {
                    console.log(`[useStoryAudio] Cache hit for ${trackId}`);
                }

                if (!mounted) return;

                // Load sound
                const { sound } = await Audio.Sound.createAsync(
                    { uri: finalUri },
                    {
                        shouldPlay: false, // We control play separately
                        isLooping: true,
                        volume: muted ? 0 : volume,
                        positionMillis: startTime * 1000,
                    }
                );

                soundRef.current = sound;
                setIsLoaded(true);

            } catch (err: any) {
                console.warn('[useStoryAudio] Load failed:', err);
                if (mounted) setError(err.message);
            }
        };

        loadAudio();

        return () => {
            mounted = false;
            // Don't unload here immediately to avoid stutter on quick changes, 
            // relying on the next loadAudio or component unmount to clean up.
        };
    }, [trackId, getMusicStream]); // Re-run if track changes

    // Handle Play/Pause/Mute updates
    useEffect(() => {
        const sound = soundRef.current;
        if (!sound || !isLoaded) return;

        const sync = async () => {
            try {
                // Mute / Volume
                const targetVol = muted ? 0 : volume;
                await sound.setVolumeAsync(targetVol);

                // Play / Pause
                const status = await sound.getStatusAsync();
                if (!status.isLoaded) return;

                if (active && !status.isPlaying) {
                    await sound.playFromPositionAsync(status.positionMillis);
                    // Ensure looping if needed (createAsync handles it but good to be sure)
                    // await sound.setIsLoopingAsync(true);
                } else if (!active && status.isPlaying) {
                    await sound.pauseAsync();
                }
            } catch (e) {
                console.warn('[useStoryAudio] Sync error:', e);
            }
        };

        void sync();
    }, [active, muted, volume, isLoaded]); // Re-sync when these change

    return { isLoaded, error };
}
