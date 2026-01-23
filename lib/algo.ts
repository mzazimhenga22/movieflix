import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { firestore } from '@/constants/firebase';

/**
 * INTERTWINED RECOMMENDATION ENGINE v2
 * Connects: Watch History, Marketplace, Social, Trailers, MovieMatch
 */

export type InteractionType = 
  | 'view' | 'like' | 'comment' | 'share' | 'story_view' 
  | 'watch_complete' | 'watch_partial' | 'trailer_view'
  | 'party_join' | 'market_view' | 'market_purchase'
  | 'match_swipe_right' | 'match_swipe_left'
  | 'follow_user';

export type InteractionEvent = {
  type: InteractionType;
  actorId?: string | null;
  targetId?: string | number | null; // Content ID (TMDB) or Product ID
  targetType?: 'movie' | 'tv' | 'product' | 'user' | 'feed_post';
  targetUserId?: string | null; // Author of content/post
  timestamp: number;
  meta?: Record<string, any>; // e.g. { genres: [28, 12], completion: 0.9 }
};

const EVENTS_KEY = 'movieflix_algo_events_v2';
const TASTE_PROFILE_KEY = 'user_taste_profile_v1';
const MAX_EVENTS = 1000;

// Scoring Weights
const WEIGHTS: Record<InteractionType, number> = {
  market_purchase: 25,
  party_join: 18,
  watch_complete: 15,
  match_swipe_right: 12,
  follow_user: 10,
  market_view: 8,
  trailer_view: 6,
  like: 4,
  view: 2,
  story_view: 2,
  comment: 3,
  share: 5,
  watch_partial: 5,
  match_swipe_left: -15, // Explicit dislike
};

type TasteProfile = {
  genres: Record<number, number>; // genreId -> score
  keywords: Record<string, number>;
  actors: Record<string, number>;
  updatedAt: number;
};

/**
 * 1. PERSISTENCE LAYER
 */
async function loadEvents(): Promise<InteractionEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(EVENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveEvents(events: InteractionEvent[]) {
  try {
    await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {}
}

/**
 * 2. TASTE PROFILE ENGINE
 * Aggregates all interactions into a weighted profile of preferences
 */
export async function updateTasteProfile(actorId: string): Promise<TasteProfile> {
  const events = await loadEvents();
  const profile: TasteProfile = { genres: {}, keywords: {}, actors: {}, updatedAt: Date.now() };

  // Only consider events from the last 30 days for freshness
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  
  events.filter(e => e.timestamp > thirtyDaysAgo).forEach(e => {
    const weight = WEIGHTS[e.type] || 0;
    
    // Process Genres from meta
    if (e.meta?.genres && Array.isArray(e.meta.genres)) {
      e.meta.genres.forEach((gId: number) => {
        profile.genres[gId] = (profile.genres[gId] || 0) + weight;
      });
    }

    // Process Keywords (e.g. from marketplace products or movie tags)
    if (e.meta?.keywords && Array.isArray(e.meta.keywords)) {
      e.meta.keywords.forEach((tag: string) => {
        profile.keywords[tag] = (profile.keywords[tag] || 0) + weight;
      });
    }
  });

  await AsyncStorage.setItem(TASTE_PROFILE_KEY, JSON.stringify(profile));
  return profile;
}

export async function getTasteProfile(): Promise<TasteProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(TASTE_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/**
 * 3. CORE LOGGING
 * Should be called from VideoPlayer, Marketplace, MovieMatch, and Feed
 */
export async function logInteraction(evt: Omit<InteractionEvent, 'timestamp'>) {
  try {
    const events = await loadEvents();
    const newEvent = { ...evt, timestamp: Date.now() };
    events.push(newEvent);
    await saveEvents(events);

    // If it's a high-intent event, trigger a profile update in the background
    if (evt.actorId && (WEIGHTS[evt.type] > 10)) {
      void updateTasteProfile(evt.actorId);
    }
  } catch {}
}

/**
 * 4. HYBRID RECOMMENDATION SCORING
 * Scores a candidate item against the user's Taste Profile + Social signals
 */
export async function scoreContent(item: any, profile: TasteProfile | null, socialSignals: { followingIds: string[] }) {
  let score = 0;

  // Base popularity (from TMDB or internal stats)
  const popularity = Number(item.vote_average || item.popularity || 0);
  score += popularity * 0.1;

  if (profile) {
    // 1. Genre Match
    const itemGenres = item.genre_ids || (item.genres?.map((g: any) => g.id)) || [];
    itemGenres.forEach((gId: number) => {
      const affinity = profile.genres[gId] || 0;
      score += (affinity * 0.5); // Weight genre affinity heavily
    });

    // 2. Keyword/Tag Match (Connects Marketplace items to Movies)
    const itemTags = [...(item.keywords || []), ...(item.tags || [])];
    itemTags.forEach((tag: string) => {
      const affinity = profile.keywords[tag] || 0;
      score += (affinity * 0.3);
    });
  }

  // 3. Social Boost
  // If friends have watched/liked this, boost it
  if (item._socialActivityCount) {
    score += (item._socialActivityCount * 5);
  }

  // 4. Recency (New releases or recently active products)
  const dateStr = item.release_date || item.first_air_date || item.createdAt;
  if (dateStr) {
    const ageInDays = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
    const recencyBoost = Math.max(0, 10 - Math.log(1 + ageInDays));
    score += recencyBoost;
  }

  return score;
}

/**
 * 5. FEATURE-SPECIFIC WRAPPERS
 */

// For the Home Screen / "Recommended for You"
export async function recommendContent(items: any[], userId?: string | null) {
  const profile = await getTasteProfile();
  // In a real app, you'd fetch who the user follows here
  const followingIds: string[] = []; 

  const scored = await Promise.all(items.map(async (it) => {
    const score = await scoreContent(it, profile, { followingIds });
    return { ...it, _algoScore: score };
  }));

  return scored.sort((a, b) => b._algoScore - a._algoScore);
}

// For the Marketplace (recommends merch based on watch history)
export async function recommendProducts(products: any[], userId?: string | null) {
  const profile = await getTasteProfile();
  
  const scored = products.map(p => {
    let score = 0;
    // Boost products that share keywords with high-affinity genres/movies
    if (profile) {
      const productTags = p.tags || [];
      productTags.forEach((tag: string) => {
        score += (profile.keywords[tag] || 0);
        // Map common keywords to genres? (Simplified: direct tag match)
      });
    }
    return { ...p, _algoScore: score };
  });

  return scored.sort((a, b) => b._algoScore - a._algoScore);
}

// Social Feed Ranking (Optimized for author affinity)
export async function rankFeed(items: any[], userId: string, following: string[]) {
  const events = await loadEvents();
  const followingSet = new Set(following);

  // Author Affinity: How much do I interact with this creator?
  const affinities: Record<string, number> = {};
  events.filter(e => e.targetUserId).forEach(e => {
    affinities[e.targetUserId!] = (affinities[e.targetUserId!] || 0) + 1;
  });

  const scored = items.map(it => {
    let score = 0;
    const authorId = String(it.userId || '');
    
    if (followingSet.has(authorId)) score += 10;
    score += (affinities[authorId] || 0) * 2;
    
    // Standard popularity
    score += Math.log(1 + (it.likes || 0) + (it.commentsCount || 0));

    // Recency
    const hrs = (Date.now() - new Date(it.createdAt).getTime()) / 3600000;
    score += Math.exp(-hrs / 12) * 5;

    return { ...it, _algoScore: score };
  });

  return scored.sort((a, b) => b._algoScore - a._algoScore);
}

/**
 * 5. CROSS-FEATURE DISCOVERY
 * Mixes content types for a unified "For You" experience
 */
export type DiscoveryItem = {
  type: 'movie' | 'tv' | 'product' | 'feed_post';
  data: any;
  score: number;
};

export async function getIntertwinedDiscovery(
  options: {
    movies: any[];
    products: any[];
    posts: any[];
    userId: string;
    following: string[];
  }
): Promise<DiscoveryItem[]> {
  const profile = await getTasteProfile();
  const socialSignals = { followingIds: options.following };

  const scoredMovies = await Promise.all(options.movies.map(async m => ({
    type: 'movie' as const,
    data: m,
    score: (await scoreContent(m, profile, socialSignals)) * 1.2 // Content is primary
  })));

  const scoredProducts = options.products.map(p => ({
    type: 'product' as const,
    data: p,
    score: (profile ? (p.tags || []).reduce((acc: number, tag: string) => acc + (profile.keywords[tag] || 0), 0) : 0) * 0.8
  }));

  const scoredPosts = options.posts.map(post => {
    let score = 5; // Base post score
    if (options.following.includes(post.userId)) score += 15;
    // Boost posts about movies the user likes
    if (profile && post.mediaId) {
      const genreMatch = (post.genres || []).some((g: number) => (profile.genres[g] || 0) > 20);
      if (genreMatch) score += 10;
    }
    return { type: 'feed_post' as const, data: post, score };
  });

  const all: DiscoveryItem[] = [...scoredMovies, ...scoredProducts, ...scoredPosts];
  return all.sort((a, b) => b.score - a.score);
}

/**
 * 6. WATCH PARTY INTELLIGENCE
 * Combines multiple user profiles to find common ground
 */
export async function getWatchPartyRecommendations(
  participants: string[], // List of user IDs
  candidateMovies: any[]
): Promise<any[]> {
  // In a real app, you would fetch profiles from Firestore.
  // For this local logic, we simulate by assuming profiles are available or using a simplified "vibe" check.
  
  // Here we would ideally pull aggregated genre stats for the group
  // For now, we'll return movies sorted by general popularity + genre diversity
  return candidateMovies.sort((a, b) => {
    const popA = a.vote_average || 0;
    const popB = b.vote_average || 0;
    return popB - popA;
  });
}

/**
 * 7. MARKETPLACE CONTEXTUALIZATION
 * Recommends products based on the movie currently being viewed
 */
export function getRelatedMerch(movie: any, products: any[]) {
  const movieTags = new Set([...(movie.keywords || []), ...(movie.genres?.map((g:any) => g.name) || [])]);
  
  return products.map(p => {
    let relevance = 0;
    const productTags = p.tags || [];
    productTags.forEach((tag: string) => {
      if (movieTags.has(tag)) relevance += 10;
    });
    
    // Boost if product title contains movie title
    if (movie.title && p.title.toLowerCase().includes(movie.title.toLowerCase())) {
      relevance += 50;
    }
    
    return { ...p, _relevance: relevance };
  }).sort((a, b) => b._relevance - a._relevance);
}

export function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default { 
  logInteraction, 
  updateTasteProfile, 
  getTasteProfile, 
  recommendContent, 
  recommendProducts, 
  rankFeed,
  shuffle 
};