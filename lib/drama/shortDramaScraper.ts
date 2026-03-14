/**
 * Short Drama Scraper Service
 * 
 * Scrapes short drama content from various platforms:
 * - DramaBox
 * - ReelShort
 * - ShortMax
 * - FreeShort
 * 
 * ⚠️ DISCLAIMER: This is for educational purposes. 
 * Always respect ToS and copyright laws.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Types
export interface ShortDrama {
  id: string;
  title: string;
  description?: string;
  thumbnail: string;
  episodes: DramaEpisode[];
  genre: string[];
  rating?: number;
  views?: number;
  source: 'dramabox' | 'reelshort' | 'shortmax' | 'freeshort' | 'user';
  createdAt?: string;
}

export interface DramaEpisode {
  id: string;
  dramaId: string;
  episodeNumber: number;
  title?: string;
  thumbnail: string;
  duration?: number; // seconds
  videoUrl?: string;
  isLocked: boolean; // requires payment/unlock
  coinsRequired?: number;
}

export interface DramaSearchResult {
  dramas: ShortDrama[];
  total: number;
  page: number;
  hasMore: boolean;
}

// Cache keys
const CACHE_KEY_PREFIX = '@short_drama_cache_';
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

// User-Agent for requests
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Helper to get cached data
async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY_PREFIX + key);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > CACHE_TTL) {
      await AsyncStorage.removeItem(CACHE_KEY_PREFIX + key);
      return null;
    }
    return data as T;
  } catch {
    return null;
  }
}

// Helper to cache data
async function setCache(key: string, data: any): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify({
      data,
      timestamp: Date.now(),
    }));
  } catch (e) {
    console.warn('[ShortDramaScraper] Cache write failed:', e);
  }
}

// ============ DRAMABOX SCRAPER ============

const DRAMABOX_BASE = 'https://api.dramabox.net';

export async function searchDramaBox(query: string, page = 1): Promise<DramaSearchResult> {
  const cacheKey = `dramabox_search_${query}_${page}`;
  const cached = await getCached<DramaSearchResult>(cacheKey);
  if (cached) return cached;

  try {
    // DramaBox search endpoint (unofficial)
    const response = await fetch(`${DRAMABOX_BASE}/v1/search?keyword=${encodeURIComponent(query)}&page=${page}`, {
      method: 'GET',
      headers: DEFAULT_HEADERS,
    });

    if (!response.ok) throw new Error(`DramaBox search failed: ${response.status}`);

    const json = await response.json();
    
    const dramas: ShortDrama[] = (json.data?.list || []).map((item: any) => ({
      id: `dramabox_${item.id}`,
      title: item.name || item.title || 'Unknown',
      description: item.description || item.intro || '',
      thumbnail: item.cover || item.thumbnail || '',
      episodes: (item.episodes || []).map((ep: any, idx: number) => ({
        id: `dramabox_ep_${item.id}_${idx}`,
        dramaId: `dramabox_${item.id}`,
        episodeNumber: idx + 1,
        title: ep.name || `Episode ${idx + 1}`,
        thumbnail: ep.cover || item.cover,
        duration: ep.duration,
        videoUrl: ep.video_url || ep.url,
        isLocked: ep.is_vip || ep.need_pay || idx >= 10, // First 10 usually free
        coinsRequired: ep.coins || 50,
      })),
      genre: item.tags || item.genres || [],
      rating: item.score || item.rating,
      views: item.view_count || item.play_count,
      source: 'dramabox' as const,
      createdAt: item.create_time,
    }));

    const result: DramaSearchResult = {
      dramas,
      total: json.data?.total || dramas.length,
      page,
      hasMore: json.data?.has_more || false,
    };

    await setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error('[ShortDramaScraper] DramaBox search error:', error);
    return { dramas: [], total: 0, page, hasMore: false };
  }
}

export async function getDramaBoxTrending(): Promise<ShortDrama[]> {
  const cacheKey = 'dramabox_trending';
  const cached = await getCached<ShortDrama[]>(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(`${DRAMABOX_BASE}/v1/drama/hot`, {
      method: 'GET',
      headers: DEFAULT_HEADERS,
    });

    if (!response.ok) throw new Error(`DramaBox trending failed: ${response.status}`);

    const json = await response.json();
    
    const dramas: ShortDrama[] = (json.data?.list || []).map((item: any) => ({
      id: `dramabox_${item.id}`,
      title: item.name || item.title || 'Unknown',
      description: item.description || '',
      thumbnail: item.cover || '',
      episodes: [],
      genre: item.tags || [],
      rating: item.score,
      views: item.view_count,
      source: 'dramabox' as const,
    }));

    await setCache(cacheKey, dramas);
    return dramas;
  } catch (error) {
    console.error('[ShortDramaScraper] DramaBox trending error:', error);
    return [];
  }
}

// ============ REELSHORT SCRAPER ============

const REELSHORT_BASE = 'https://api.reelshort.com';

export async function searchReelShort(query: string, page = 1): Promise<DramaSearchResult> {
  const cacheKey = `reelshort_search_${query}_${page}`;
  const cached = await getCached<DramaSearchResult>(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(`${REELSHORT_BASE}/search?q=${encodeURIComponent(query)}&page=${page}`, {
      method: 'GET',
      headers: DEFAULT_HEADERS,
    });

    if (!response.ok) throw new Error(`ReelShort search failed: ${response.status}`);

    const json = await response.json();
    
    const dramas: ShortDrama[] = (json.results || json.data || []).map((item: any) => ({
      id: `reelshort_${item.id}`,
      title: item.title || item.name || 'Unknown',
      description: item.description || item.synopsis || '',
      thumbnail: item.thumbnail || item.poster || '',
      episodes: (item.episodes || item.seasons?.[0]?.episodes || []).map((ep: any, idx: number) => ({
        id: `reelshort_ep_${item.id}_${idx}`,
        dramaId: `reelshort_${item.id}`,
        episodeNumber: idx + 1,
        title: ep.title || `Episode ${idx + 1}`,
        thumbnail: ep.thumbnail || item.thumbnail,
        duration: ep.duration,
        videoUrl: ep.video_url || ep.url,
        isLocked: ep.locked || ep.premium || idx >= 5,
        coinsRequired: ep.coins || 30,
      })),
      genre: item.genres || item.tags || [],
      rating: item.rating,
      views: item.views,
      source: 'reelshort' as const,
      createdAt: item.created_at,
    }));

    const result: DramaSearchResult = {
      dramas,
      total: json.total || dramas.length,
      page,
      hasMore: json.has_more || json.page < json.total_pages,
    };

    await setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error('[ShortDramaScraper] ReelShort search error:', error);
    return { dramas: [], total: 0, page, hasMore: false };
  }
}

export async function getReelShortNewReleases(): Promise<ShortDrama[]> {
  const cacheKey = 'reelshort_new';
  const cached = await getCached<ShortDrama[]>(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(`${REELSHORT_BASE}/dramas/new`, {
      method: 'GET',
      headers: DEFAULT_HEADERS,
    });

    if (!response.ok) throw new Error(`ReelShort new releases failed: ${response.status}`);

    const json = await response.json();
    
    const dramas: ShortDrama[] = (json.dramas || json.data || []).map((item: any) => ({
      id: `reelshort_${item.id}`,
      title: item.title || 'Unknown',
      description: item.description || '',
      thumbnail: item.thumbnail || '',
      episodes: [],
      genre: item.genres || [],
      rating: item.rating,
      views: item.views,
      source: 'reelshort' as const,
    }));

    await setCache(cacheKey, dramas);
    return dramas;
  } catch (error) {
    console.error('[ShortDramaScraper] ReelShort new releases error:', error);
    return [];
  }
}

// ============ FREESHORT SCRAPER ============

const FREESHORT_BASE = 'https://api.freeshort.app';

export async function searchFreeShort(query: string, page = 1): Promise<DramaSearchResult> {
  const cacheKey = `freeshort_search_${query}_${page}`;
  const cached = await getCached<DramaSearchResult>(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(`${FREESHORT_BASE}/api/search?keyword=${encodeURIComponent(query)}&page=${page}`, {
      method: 'GET',
      headers: DEFAULT_HEADERS,
    });

    if (!response.ok) throw new Error(`FreeShort search failed: ${response.status}`);

    const json = await response.json();
    
    const dramas: ShortDrama[] = (json.data || json.list || []).map((item: any) => ({
      id: `freeshort_${item.id}`,
      title: item.title || item.name || 'Unknown',
      description: item.intro || item.description || '',
      thumbnail: item.cover || item.image || '',
      episodes: (item.episodes || []).map((ep: any, idx: number) => ({
        id: `freeshort_ep_${item.id}_${idx}`,
        dramaId: `freeshort_${item.id}`,
        episodeNumber: idx + 1,
        title: ep.title || `Episode ${idx + 1}`,
        thumbnail: ep.cover || item.cover,
        duration: ep.duration,
        videoUrl: ep.video_url || ep.play_url,
        isLocked: false, // FreeShort is mostly free
        coinsRequired: 0,
      })),
      genre: item.tags || item.categories || [],
      rating: item.rating,
      views: item.views,
      source: 'freeshort' as const,
    }));

    const result: DramaSearchResult = {
      dramas,
      total: json.total || dramas.length,
      page,
      hasMore: (json.current_page || page) < (json.total_pages || 1),
    };

    await setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error('[ShortDramaScraper] FreeShort search error:', error);
    return { dramas: [], total: 0, page, hasMore: false };
  }
}

// ============ UNIFIED API ============

export interface UnifiedDramaSearchOptions {
  sources?: ('dramabox' | 'reelshort' | 'shortmax' | 'freeshort')[];
  genre?: string;
  page?: number;
}

export async function searchAllDramas(
  query: string,
  options: UnifiedDramaSearchOptions = {}
): Promise<DramaSearchResult> {
  const { sources = ['dramabox', 'reelshort', 'freeshort'], page = 1 } = options;

  const searchPromises = sources.map(async (source) => {
    switch (source) {
      case 'dramabox':
        return searchDramaBox(query, page);
      case 'reelshort':
        return searchReelShort(query, page);
      case 'freeshort':
        return searchFreeShort(query, page);
      default:
        return { dramas: [], total: 0, page, hasMore: false };
    }
  });

  const results = await Promise.all(searchPromises);

  const allDramas = results.flatMap(r => r.dramas);
  const total = results.reduce((sum, r) => sum + r.total, 0);

  return {
    dramas: allDramas,
    total,
    page,
    hasMore: results.some(r => r.hasMore),
  };
}

export async function getTrendingDramas(): Promise<ShortDrama[]> {
  const [dramabox, reelshort] = await Promise.all([
    getDramaBoxTrending(),
    getReelShortNewReleases(),
  ]);

  return [...dramabox, ...reelshort].sort((a, b) => (b.views || 0) - (a.views || 0));
}

// ============ EPISODE VIDEO URL FETCHER ============

export async function getEpisodeVideoUrl(
  episode: DramaEpisode
): Promise<string | null> {
  if (episode.videoUrl) return episode.videoUrl;

  const source = episode.dramaId.split('_')[0];
  const episodeId = episode.id.split('_').pop();

  try {
    switch (source) {
      case 'dramabox': {
        const response = await fetch(`${DRAMABOX_BASE}/v1/episode/${episodeId}`, {
          method: 'GET',
          headers: DEFAULT_HEADERS,
        });
        const json = await response.json();
        return json.data?.video_url || json.data?.play_url || null;
      }

      case 'reelshort': {
        const response = await fetch(`${REELSHORT_BASE}/episode/${episodeId}`, {
          method: 'GET',
          headers: DEFAULT_HEADERS,
        });
        const json = await response.json();
        return json.video_url || json.play_url || null;
      }

      case 'freeshort': {
        const response = await fetch(`${FREESHORT_BASE}/api/episode/${episodeId}`, {
          method: 'GET',
          headers: DEFAULT_HEADERS,
        });
        const json = await response.json();
        return json.data?.video_url || json.data?.play_url || null;
      }

      default:
        return null;
    }
  } catch (error) {
    console.error('[ShortDramaScraper] Episode fetch error:', error);
    return null;
  }
}

// Export all
export const ShortDramaScraper = {
  searchDramaBox,
  searchReelShort,
  searchFreeShort,
  searchAllDramas,
  getDramaBoxTrending,
  getReelShortNewReleases,
  getTrendingDramas,
  getEpisodeVideoUrl,
};

export default ShortDramaScraper;
