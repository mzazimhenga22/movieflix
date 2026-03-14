/**
 * Reels Clip Prefetch Cache
 * 
 * Prefetches and caches clips from clip.cafe for each genre.
 * Uses background fetching with rate limiting to avoid bot detection.
 * Designed for smooth app performance with no lag.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { InteractionManager } from 'react-native';
import { searchClipCafe, searchClipCafeMultiple } from '../src/providers/shortclips';

// Types
export interface CachedClip {
    id: string;
    url: string;
    title: string;
    clipName?: string; // Name of the specific clip scene
    genre: string;
    movieIndex?: number; // Index of movie this clip belongs to (for grouping)
    fetchedAt: number;
    headers?: Record<string, string>;
}

export interface GenreCache {
    clips: CachedClip[];
    lastFetchedAt: number;
    moviePaths: string[]; // Unfetched movie paths for later
    fetchedCount: number;
}

// Constants
const CACHE_KEY = 'reels_clip_prefetch_cache';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const GENRES = ['action', 'comedy', 'horror', 'sci-fi', 'thriller', 'drama', 'romance', 'animation', 'adventure'];
const INITIAL_MOVIES_COUNT = 2; // Prefetch 2 movies initially
const CLIPS_PER_MOVIE = 3; // 3 clips per movie
const BACKGROUND_MOVIES_COUNT = 2; // Fetch 2 more movies in background
const FETCH_DELAY_MS = 800; // Delay between requests to avoid bot detection

// In-memory cache for fast access
let memoryCache: Record<string, GenreCache> = {};
let isFetching = false;
let fetchQueue: string[] = [];

/**
 * Initialize the prefetch cache from AsyncStorage
 */
export async function initPrefetchCache(): Promise<void> {
    try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            // Only use cache if not too old
            const now = Date.now();
            for (const [genre, data] of Object.entries(parsed as Record<string, GenreCache>)) {
                if (now - data.lastFetchedAt < CACHE_TTL_MS) {
                    memoryCache[genre] = data;
                }
            }
            console.log('[PrefetchCache] Loaded from storage:', Object.keys(memoryCache).length, 'genres');
        }
    } catch (e) {
        console.warn('[PrefetchCache] Failed to load cache:', e);
    }
}

/**
 * Save cache to AsyncStorage (debounced)
 */
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
function scheduleCacheSave(): void {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try {
            await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(memoryCache));
            console.log('[PrefetchCache] Saved to storage');
        } catch (e) {
            console.warn('[PrefetchCache] Failed to save cache:', e);
        }
    }, 2000);
}

/**
 * Fetch movie paths from a genre page (lightweight, no clip fetching)
 */
async function fetchGenreMoviePaths(genre: string): Promise<string[]> {
    try {
        const url = `https://clip.cafe/t/${genre}`;
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
        });

        if (!res.ok) return [];

        const html = await res.text();
        const yearPatternMatches = html.match(/href="([^"]+-\d{4}\/)"/g);

        if (!yearPatternMatches) return [];

        const uniquePaths = Array.from(new Set(yearPatternMatches.map(m => {
            const match = m.match(/href="([^"]+)"/);
            return match ? match[1] : null;
        }))).filter(Boolean) as string[];

        // Shuffle for variety
        return uniquePaths.sort(() => 0.5 - Math.random());
    } catch (e) {
        console.warn('[PrefetchCache] Failed to fetch genre paths:', genre, e);
        return [];
    }
}

/**
 * Fetch multiple clips from a movie path (for grouped viewing)
 */
async function fetchClipsFromPath(path: string, genre: string, movieIndex: number, maxClips: number = 3): Promise<CachedClip[]> {
    try {
        const cleanPath = path.replace(/^\//, '').replace(/\/$/, '');
        const parts = cleanPath.split('-');
        const year = parts.pop();
        const title = parts.join(' ');

        if (!title) return [];

        // Use searchClipCafeMultiple for grouped clips
        const clips = await searchClipCafeMultiple(title, year, maxClips);

        return clips.map((clip, idx) => ({
            id: `${genre}-${cleanPath}-${idx}-${Date.now()}`,
            url: clip.url,
            title: title,
            clipName: clip.clipName,
            genre: genre,
            movieIndex: movieIndex,
            fetchedAt: Date.now(),
            headers: (clip as any).headers,
        }));
    } catch (e) {
        // Silent fail for individual clips
    }
    return [];
}

/**
 * Fetch a single clip from a movie path (legacy, for fallback)
 */
async function fetchClipFromPath(path: string, genre: string): Promise<CachedClip | null> {
    try {
        const cleanPath = path.replace(/^\//, '').replace(/\/$/, '');
        const parts = cleanPath.split('-');
        const year = parts.pop();
        const title = parts.join(' ');

        if (!title) return null;

        const clip = await searchClipCafe(title, year);

        if (clip?.url) {
            return {
                id: `${genre}-${cleanPath}-${Date.now()}`,
                url: clip.url,
                title: title,
                genre: genre,
                fetchedAt: Date.now(),
                headers: (clip as any).headers,
            };
        }
    } catch (e) {
        // Silent fail for individual clips
    }
    return null;
}

/**
 * Background fetch clips for a genre with rate limiting (GROUPED by movie)
 * Fetches multiple clips per movie so they play together
 */
async function backgroundFetchGenre(genre: string, movieCount: number, clipsPerMovie: number = 3): Promise<CachedClip[]> {
    const cache = memoryCache[genre];
    if (!cache?.moviePaths?.length) return [];

    const clips: CachedClip[] = [];
    const pathsToFetch = cache.moviePaths.slice(0, movieCount);

    for (let i = 0; i < pathsToFetch.length; i++) {
        const path = pathsToFetch[i];

        // Use InteractionManager to not block UI
        await new Promise<void>(resolve => {
            InteractionManager.runAfterInteractions(() => resolve());
        });

        // Fetch multiple clips for this movie (grouped)
        const movieClips = await fetchClipsFromPath(path, genre, i, clipsPerMovie);
        clips.push(...movieClips);

        // Remove processed path
        const pathIndex = cache.moviePaths.indexOf(path);
        if (pathIndex > -1) {
            cache.moviePaths.splice(pathIndex, 1);
        }

        // Rate limit delay between movies
        if (i < pathsToFetch.length - 1) {
            await new Promise(resolve => setTimeout(resolve, FETCH_DELAY_MS));
        }
    }

    return clips;
}

/**
 * Get cached clips for a genre (instant, no network)
 */
export function getCachedClips(genre: string): CachedClip[] {
    const normalizedGenre = genre.toLowerCase();
    const cache = memoryCache[normalizedGenre];

    if (!cache) return [];

    // Check if cache is still valid
    if (Date.now() - cache.lastFetchedAt > CACHE_TTL_MS) {
        return [];
    }

    return cache.clips || [];
}

/**
 * Check if we have cached clips for a genre
 */
export function hasCachedClips(genre: string): boolean {
    return getCachedClips(genre).length > 0;
}

/**
 * Prefetch initial clips for a specific genre
 */
export async function prefetchGenre(genre: string): Promise<CachedClip[]> {
    const normalizedGenre = genre.toLowerCase();

    // Check if we already have fresh cache (enough clips means 2 movies * 3 clips = 6)
    const existing = getCachedClips(normalizedGenre);
    if (existing.length >= INITIAL_MOVIES_COUNT * CLIPS_PER_MOVIE) {
        console.log(`[PrefetchCache] Using cached clips for ${genre}:`, existing.length);
        return existing;
    }

    console.log(`[PrefetchCache] Prefetching ${genre}...`);

    try {
        // Get movie paths for this genre
        const paths = await fetchGenreMoviePaths(normalizedGenre);

        if (paths.length === 0) {
            console.log(`[PrefetchCache] No paths found for ${genre}`);
            return [];
        }

        // Initialize cache entry
        memoryCache[normalizedGenre] = {
            clips: existing,
            lastFetchedAt: Date.now(),
            moviePaths: paths,
            fetchedCount: existing.length,
        };

        // Fetch initial clips (grouped by movie)
        const newClips = await backgroundFetchGenre(normalizedGenre, INITIAL_MOVIES_COUNT, CLIPS_PER_MOVIE);

        memoryCache[normalizedGenre].clips = [...existing, ...newClips];
        memoryCache[normalizedGenre].fetchedCount = memoryCache[normalizedGenre].clips.length;

        scheduleCacheSave();

        console.log(`[PrefetchCache] Prefetched ${newClips.length} clips for ${genre}`);
        return memoryCache[normalizedGenre].clips;
    } catch (e) {
        console.warn('[PrefetchCache] Failed to prefetch genre:', genre, e);
        return existing;
    }
}

/**
 * Fetch more clips in background (call while user is watching)
 */
export async function fetchMoreInBackground(genre: string): Promise<void> {
    const normalizedGenre = genre.toLowerCase();
    const cache = memoryCache[normalizedGenre];

    if (!cache || !cache.moviePaths?.length) {
        console.log(`[PrefetchCache] No more paths to fetch for ${genre}`);
        return;
    }

    // Only fetch if we don't have enough
    if (cache.clips.length >= 10) {
        console.log(`[PrefetchCache] Already have enough clips for ${genre}`);
        return;
    }

    console.log(`[PrefetchCache] Background fetching more for ${genre}...`);

    // Use requestIdleCallback pattern with InteractionManager
    InteractionManager.runAfterInteractions(async () => {
        try {
            const newClips = await backgroundFetchGenre(normalizedGenre, BACKGROUND_MOVIES_COUNT, CLIPS_PER_MOVIE);

            if (newClips.length > 0) {
                cache.clips = [...cache.clips, ...newClips];
                cache.fetchedCount = cache.clips.length;
                scheduleCacheSave();
                console.log(`[PrefetchCache] Background fetched ${newClips.length} more for ${genre}`);
            }
        } catch (e) {
            console.warn('[PrefetchCache] Background fetch failed:', genre, e);
        }
    });
}

/**
 * Prefetch all genres in background (call on app start or home screen)
 */
export function prefetchAllGenresInBackground(): void {
    if (isFetching) {
        console.log('[PrefetchCache] Already prefetching...');
        return;
    }

    isFetching = true;
    console.log('[PrefetchCache] Starting background prefetch for all genres...');

    // Use a queue to process genres one at a time
    fetchQueue = [...GENRES];

    const processNext = async () => {
        if (fetchQueue.length === 0) {
            isFetching = false;
            console.log('[PrefetchCache] Completed prefetch for all genres');
            return;
        }

        const genre = fetchQueue.shift()!;

        // Wait for interactions to be idle
        InteractionManager.runAfterInteractions(async () => {
            try {
                await prefetchGenre(genre);
            } catch (e) {
                console.warn('[PrefetchCache] Failed to prefetch:', genre, e);
            }

            // Small delay between genres
            setTimeout(processNext, 500);
        });
    };

    // Start processing after a delay to let the app settle
    setTimeout(() => {
        InteractionManager.runAfterInteractions(processNext);
    }, 2000);
}

/**
 * Clear the prefetch cache
 */
export async function clearPrefetchCache(): Promise<void> {
    memoryCache = {};
    await AsyncStorage.removeItem(CACHE_KEY);
    console.log('[PrefetchCache] Cache cleared');
}

/**
 * Get cache stats for debugging
 */
export function getCacheStats(): Record<string, { count: number; remaining: number }> {
    const stats: Record<string, { count: number; remaining: number }> = {};
    for (const [genre, cache] of Object.entries(memoryCache)) {
        stats[genre] = {
            count: cache.clips.length,
            remaining: cache.moviePaths?.length || 0,
        };
    }
    return stats;
}
