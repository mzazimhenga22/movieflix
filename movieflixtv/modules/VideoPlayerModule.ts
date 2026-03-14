import { NativeModules, Platform } from 'react-native';

const { VideoPlayerModule } = NativeModules;

export interface CaptionCue {
    start: number;
    end: number;
    text: string;
}

export interface AudioTrackOption {
    id: string;
    name?: string;
    language?: string;
    groupId?: string;
    isDefault?: boolean;
}

export interface QualityOption {
    id: string;
    label: string;
    uri: string;
    resolution?: string;
    bandwidth?: number;
    codecs?: string;
}

export interface MediaSegment {
    uri: string;
    duration: number | null;
}

/**
 * Parse SRT/VTT caption payload into cue array (native).
 */
export async function parseCaptionPayloadNative(
    payload: string,
    type: 'srt' | 'vtt'
): Promise<CaptionCue[]> {
    if (Platform.OS !== 'android' || !VideoPlayerModule?.parseCaptionPayload) {
        throw new Error('VideoPlayerModule not available');
    }
    const json = await VideoPlayerModule.parseCaptionPayload(payload, type);
    return JSON.parse(json) as CaptionCue[];
}

/**
 * Parse HLS manifest for audio tracks (native).
 */
export async function parseHlsAudioTracksNative(
    manifest: string
): Promise<AudioTrackOption[]> {
    if (Platform.OS !== 'android' || !VideoPlayerModule?.parseHlsAudioTracks) {
        throw new Error('VideoPlayerModule not available');
    }
    const json = await VideoPlayerModule.parseHlsAudioTracks(manifest);
    return JSON.parse(json) as AudioTrackOption[];
}

/**
 * Parse HLS manifest for quality options (native).
 */
export async function parseHlsQualityOptionsNative(
    manifest: string,
    manifestUrl: string
): Promise<QualityOption[]> {
    if (Platform.OS !== 'android' || !VideoPlayerModule?.parseHlsQualityOptions) {
        throw new Error('VideoPlayerModule not available');
    }
    const json = await VideoPlayerModule.parseHlsQualityOptions(manifest, manifestUrl);
    return JSON.parse(json) as QualityOption[];
}

/**
 * Parse HLS media playlist for segments (native).
 */
export async function parseHlsMediaSegmentsNative(
    manifestText: string,
    manifestUrl: string
): Promise<MediaSegment[]> {
    if (Platform.OS !== 'android' || !VideoPlayerModule?.parseHlsMediaSegments) {
        throw new Error('VideoPlayerModule not available');
    }
    const json = await VideoPlayerModule.parseHlsMediaSegments(manifestText, manifestUrl);
    return JSON.parse(json) as MediaSegment[];
}

/**
 * Enter Picture-in-Picture mode (native).
 */
export async function enterPip(width: number = 0, height: number = 0): Promise<boolean> {
    if (Platform.OS !== 'android' || !VideoPlayerModule?.enterPip) {
        return false;
    }
    try {
        return await VideoPlayerModule.enterPip(width, height);
    } catch (e) {
        console.warn('PiP enter failed', e);
        return false;
    }
}

/**
 * Enter Picture-in-Picture mode with minimal controls (native).
 */
export async function enterPipMinimal(width: number = 0, height: number = 0): Promise<boolean> {
    if (Platform.OS !== 'android' || !VideoPlayerModule?.enterPipMinimal) {
        return false;
    }
    try {
        return await VideoPlayerModule.enterPipMinimal(width, height);
    } catch (e) {
        console.warn('PiP minimal enter failed', e);
        return false;
    }
}



/**
 * Fetch fallback subtitles (native).
 */
export async function fetchFallbackSubtitlesNative(
    imdbId: string | undefined,
    tmdbId: string | undefined,
    mediaType: string | undefined,
    seasonNum: number | undefined,
    episodeNum: number | undefined
): Promise<any[]> {
    if (Platform.OS !== 'android' || !VideoPlayerModule?.fetchFallbackSubtitles) {
        return [];
    }
    try {
        const json = await VideoPlayerModule.fetchFallbackSubtitles(
            imdbId || '',
            tmdbId || '',
            mediaType || '',
            seasonNum || 0,
            episodeNum || 0
        );
        return JSON.parse(json);
    } catch (e) {
        console.warn('Native Subtitle Fetch Failed', e);
        return [];
    }
}

/**
 * Fetch TMDB enrichment (native).
 */
export async function fetchTmdbEnrichmentNative(
    tmdbId: string,
    mediaType: string
): Promise<any> {
    if (Platform.OS !== 'android' || !VideoPlayerModule?.fetchTmdbEnrichment) {
        return {};
    }
    try {
        const json = await VideoPlayerModule.fetchTmdbEnrichment(tmdbId, mediaType);
        return JSON.parse(json);
    } catch (e) {
        console.warn('Native Enrichment Failed', e);
        return {};
    }
}

export default VideoPlayerModule;
