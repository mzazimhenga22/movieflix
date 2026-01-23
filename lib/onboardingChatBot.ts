import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, API_KEY, IMAGE_BASE_URL } from '@/constants/api';

export const ONBOARDING_BOT_SENDER_ID = 'movieflix-bot';
const LAST_BOT_MESSAGE_KEY = 'onboarding_bot_last_message_ts';
const BOT_MESSAGE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

const RECENT_BOT_KEYS_KEY = 'onboarding_bot_recent_keys_v1';
const RECENT_BOT_KEYS_MAX = 40;

const TMDB_LIST_CACHE_MS = 30 * 60 * 1000;
const NEWS_CACHE_MS = 30 * 60 * 1000;

const DEFAULT_NEWS_FEEDS: string[] = [
  'https://deadline.com/feed/',
  'https://www.hollywoodreporter.com/c/movies/feed/',
  'https://variety.com/feed/',
];

const envNewsFeeds = (process.env.EXPO_PUBLIC_ONBOARDING_NEWS_FEEDS ?? '').trim();
const NEWS_FEEDS = (envNewsFeeds
  ? envNewsFeeds.split(',').map((s) => s.trim())
  : DEFAULT_NEWS_FEEDS
).filter(Boolean);

export type TmdbTrendingItem = {
  id: number;
  media_type?: 'movie' | 'tv';
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  release_date?: string;
  first_air_date?: string;
};

export type TmdbMovieDetails = TmdbTrendingItem & {
  budget?: number;
  revenue?: number;
  runtime?: number;
  tagline?: string;
  production_companies?: { id: number; name: string; logo_path?: string | null }[];
  production_countries?: { iso_3166_1: string; name: string }[];
  spoken_languages?: { english_name: string; iso_639_1: string; name: string }[];
  genres?: { id: number; name: string }[];
  status?: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  created_by?: { id: number; name: string }[];
  networks?: { id: number; name: string }[];
};

export type OnboardingBotMessageKind = 'fun_fact' | 'budget' | 'production' | 'cast_trivia' | 'general';

type NewsHeadline = {
  title: string;
  link?: string;
  source?: string;
  publishedAt?: number;
  imageUrl?: string;
};

type OnboardingBotMessage = ReturnType<typeof buildOnboardingBotMessage>;

const safeTitle = (item: TmdbTrendingItem | null) =>
  (item?.title || item?.name || 'this title').trim();

const safeYear = (item: TmdbTrendingItem | null) => {
  const raw = (item?.media_type === 'tv' ? item?.first_air_date : item?.release_date) || '';
  const year = raw.slice(0, 4);
  return year && /^\d{4}$/.test(year) ? year : '';
};

const posterUrl = (item: TmdbTrendingItem | null) => {
  if (!item?.poster_path) return null;
  return `${IMAGE_BASE_URL}${item.poster_path}`;
};

const formatBudget = (amount: number): string => {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(0)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount}`;
};

export async function fetchOnboardingTrending(signal?: AbortSignal): Promise<TmdbTrendingItem[]> {
  if (!API_KEY) return [];

  const url = `${API_BASE_URL}/trending/all/day?api_key=${encodeURIComponent(API_KEY)}&language=en-US`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const json = (await res.json()) as any;
  const results = Array.isArray(json?.results) ? (json.results as TmdbTrendingItem[]) : [];
  return results.filter((item) => Boolean(item?.id) && Boolean(item?.poster_path));
}

const tmdbListCache: Record<string, { ts: number; items: TmdbTrendingItem[] }> = {};

async function fetchTmdbList(
  path: string,
  opts?: { mediaType?: 'movie' | 'tv'; signal?: AbortSignal },
): Promise<TmdbTrendingItem[]> {
  if (!API_KEY) return [];
  const key = `${path}::${opts?.mediaType ?? 'any'}`;

  const cached = tmdbListCache[key];
  if (cached && Date.now() - cached.ts < TMDB_LIST_CACHE_MS) return cached.items;

  try {
    const url = `${API_BASE_URL}/${path}?api_key=${encodeURIComponent(API_KEY)}&language=en-US`;
    const res = await fetch(url, { signal: opts?.signal });
    if (!res.ok) return [];
    const json = (await res.json()) as any;
    const raw = Array.isArray(json?.results) ? (json.results as TmdbTrendingItem[]) : [];
    const normalized = raw
      .map((it) => ({
        ...it,
        media_type: (it.media_type || opts?.mediaType) as any,
      }))
      .filter((item) => Boolean(item?.id) && Boolean(item?.poster_path) && (item.media_type === 'movie' || item.media_type === 'tv'));

    tmdbListCache[key] = { ts: Date.now(), items: normalized };
    return normalized;
  } catch {
    return [];
  }
}

async function fetchOnboardingCandidates(signal?: AbortSignal): Promise<TmdbTrendingItem[]> {
  const lists = await Promise.all([
    fetchOnboardingTrending(signal),
    fetchTmdbList('trending/all/week', { signal }),
    fetchTmdbList('movie/now_playing', { mediaType: 'movie', signal }),
    fetchTmdbList('movie/upcoming', { mediaType: 'movie', signal }),
    fetchTmdbList('movie/top_rated', { mediaType: 'movie', signal }),
    fetchTmdbList('tv/on_the_air', { mediaType: 'tv', signal }),
  ]);

  const seen = new Set<string>();
  const merged: TmdbTrendingItem[] = [];
  for (const list of lists) {
    for (const item of list) {
      const mt = item.media_type || 'movie';
      const k = `${mt}:${item.id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(item);
    }
  }
  return merged;
}

export async function fetchMovieDetails(
  id: number,
  mediaType: 'movie' | 'tv',
  signal?: AbortSignal,
): Promise<TmdbMovieDetails | null> {
  if (!API_KEY || !id) return null;

  try {
    const url = `${API_BASE_URL}/${mediaType}/${id}?api_key=${encodeURIComponent(API_KEY)}&language=en-US`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    return (await res.json()) as TmdbMovieDetails;
  } catch {
    return null;
  }
}

export async function shouldSendBotMessage(): Promise<boolean> {
  try {
    const lastTs = await AsyncStorage.getItem(LAST_BOT_MESSAGE_KEY);
    if (!lastTs) return true;
    const elapsed = Date.now() - parseInt(lastTs, 10);
    return elapsed >= BOT_MESSAGE_INTERVAL_MS;
  } catch {
    return true;
  }
}

export async function markBotMessageSent(): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_BOT_MESSAGE_KEY, String(Date.now()));
  } catch {}
}

function normalizeKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 160);
}

async function loadRecentKeys(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_BOT_KEYS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => String(v)).filter(Boolean);
  } catch {
    return [];
  }
}

async function pushRecentKeys(keys: string[]): Promise<void> {
  try {
    const prev = await loadRecentKeys();
    const next = [...keys, ...prev].filter(Boolean);
    const uniq: string[] = [];
    const seen = new Set<string>();
    for (const k of next) {
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(k);
      if (uniq.length >= RECENT_BOT_KEYS_MAX) break;
    }
    await AsyncStorage.setItem(RECENT_BOT_KEYS_KEY, JSON.stringify(uniq));
  } catch {}
}

function stripCdata(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m?.[1] ? decodeEntities(stripCdata(m[1])) : '';
}

function extractAtomLink(xml: string): string {
  const m = xml.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>(?:<\/link>)?/i);
  return m?.[1] ? decodeEntities(m[1]) : '';
}

function extractRssImageUrl(block: string): string {
  // Common RSS image patterns.
  const mediaContent = block.match(/<media:(?:content|thumbnail)[^>]*url=["']([^"']+)["'][^>]*\/?>(?:<\/media:(?:content|thumbnail)>)?/i);
  if (mediaContent?.[1]) return decodeEntities(mediaContent[1]);

  const enclosure = block.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*\/?>(?:<\/enclosure>)?/i);
  if (enclosure?.[1]) return decodeEntities(enclosure[1]);

  const encoded = extractTag(block, 'content:encoded');
  if (encoded) {
    const img = encoded.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i);
    if (img?.[1]) return decodeEntities(img[1]);
  }

  // Some feeds put an <image> inside the item.
  const imgTag = extractTag(block, 'image');
  if (imgTag) {
    const src = imgTag.match(/https?:\/\/[^\s"']+/i);
    if (src?.[0]) return decodeEntities(src[0]);
  }

  return '';
}

function extractAtomImageUrl(block: string): string {
  const media = block.match(/<media:(?:content|thumbnail)[^>]*url=["']([^"']+)["'][^>]*\/?>(?:<\/media:(?:content|thumbnail)>)?/i);
  if (media?.[1]) return decodeEntities(media[1]);
  const content = extractTag(block, 'content');
  if (content) {
    const img = content.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i);
    if (img?.[1]) return decodeEntities(img[1]);
  }
  return '';
}

const newsCache: { ts: number; items: NewsHeadline[] } = { ts: 0, items: [] };

const tmdbPosterCache: Record<string, { ts: number; posterUrl: string | null }> = {};
const TMDB_POSTER_CACHE_MS = 6 * 60 * 60 * 1000;

function extractLikelyTmdbQuery(headline: string): string {
  let t = String(headline || '').trim();
  if (!t) return '';
  t = t.replace(/[“”"]/g, '').replace(/\s+/g, ' ');

  // Prefer the first segment before common separators.
  const parts = t.split(/\s*(?:—|–|-|\||:)\s*/).filter(Boolean);
  if (parts[0] && parts[0].length >= 4) t = parts[0];

  // Remove trailing parenthetical like (Trailer) / (Review)
  t = t.replace(/\s*\([^)]*\)\s*$/g, '').trim();

  // Light cleanup of common news words.
  t = t.replace(/\b(?:exclusive|trailer|review|first\s+look|box\s+office|release\s+date)\b/gi, '').trim();
  t = t.replace(/\s+/g, ' ').trim();
  return t.slice(0, 80);
}

async function fetchTmdbPosterForHeadline(headlineTitle: string, signal?: AbortSignal): Promise<string | null> {
  if (!API_KEY) return null;
  const query = extractLikelyTmdbQuery(headlineTitle);
  if (!query) return null;

  const cacheKey = normalizeKey(query);
  const cached = tmdbPosterCache[cacheKey];
  if (cached && Date.now() - cached.ts < TMDB_POSTER_CACHE_MS) return cached.posterUrl;

  try {
    const url = `${API_BASE_URL}/search/multi?api_key=${encodeURIComponent(API_KEY)}&language=en-US&include_adult=false&query=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const results = Array.isArray(json?.results) ? json.results : [];
    const hit = results.find(
      (r: any) => (r?.media_type === 'movie' || r?.media_type === 'tv') && typeof r?.poster_path === 'string' && r.poster_path,
    );
    const posterPath = hit?.poster_path ? String(hit.poster_path) : '';
    const posterUrl = posterPath ? `${IMAGE_BASE_URL}${posterPath}` : null;
    tmdbPosterCache[cacheKey] = { ts: Date.now(), posterUrl };
    return posterUrl;
  } catch {
    return null;
  }
}

async function fetchMovieNews(signal?: AbortSignal): Promise<NewsHeadline[]> {
  if (!NEWS_FEEDS.length) return [];
  if (newsCache.items.length && Date.now() - newsCache.ts < NEWS_CACHE_MS) return newsCache.items;

  const headlines: NewsHeadline[] = [];

  await Promise.all(
    NEWS_FEEDS.slice(0, 5).map(async (feedUrl) => {
      try {
        const res = await fetch(feedUrl, { signal, headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*' } });
        if (!res.ok) return;
        const xml = await res.text();

        const host = (() => {
          try {
            return new URL(feedUrl).hostname.replace(/^www\./, '');
          } catch {
            return undefined;
          }
        })();

        // RSS
        const rssItems = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
        for (const block of rssItems.slice(0, 10)) {
          const title = extractTag(block, 'title');
          const link = extractTag(block, 'link');
          const pub = extractTag(block, 'pubDate');
          const publishedAt = pub ? Date.parse(pub) : NaN;
          const imageUrl = extractRssImageUrl(block);
          if (!title) continue;
          headlines.push({
            title,
            link: link || undefined,
            source: host,
            publishedAt: Number.isFinite(publishedAt) ? publishedAt : undefined,
            imageUrl: imageUrl || undefined,
          });
        }

        // Atom
        if (!rssItems.length) {
          const entries = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
          for (const block of entries.slice(0, 10)) {
            const title = extractTag(block, 'title');
            const link = extractAtomLink(block);
            const updated = extractTag(block, 'updated') || extractTag(block, 'published');
            const publishedAt = updated ? Date.parse(updated) : NaN;
            const imageUrl = extractAtomImageUrl(block);
            if (!title) continue;
            headlines.push({
              title,
              link: link || undefined,
              source: host,
              publishedAt: Number.isFinite(publishedAt) ? publishedAt : undefined,
              imageUrl: imageUrl || undefined,
            });
          }
        }
      } catch {
        // ignore feed failures
      }
    }),
  );

  // De-dupe by title
  const seen = new Set<string>();
  const uniq: NewsHeadline[] = [];
  for (const h of headlines) {
    const k = normalizeKey(h.title);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    uniq.push(h);
  }

  // Prefer newest first when available
  uniq.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));

  newsCache.ts = Date.now();
  newsCache.items = uniq.slice(0, 50);
  return newsCache.items;
}

function buildOnboardingNewsMessage(headline: NewsHeadline, opts?: { now?: number; posterUrl?: string | null }): OnboardingBotMessage {
  const createdAt = typeof opts?.now === 'number' ? opts.now : Date.now();
  const sourceLabel = headline.source ? headline.source : 'movie news';
  const text = `\uD83D\uDD25 Hot from ${sourceLabel}: ${headline.title}` + (headline.link ? `\n${headline.link}` : '');
  const posterUrl = headline.imageUrl || opts?.posterUrl || null;
  return {
    id: `onboarding-news-${createdAt}-${Math.random().toString(16).slice(2)}`,
    sender: ONBOARDING_BOT_SENDER_ID,
    text,
    createdAt,
    ...(posterUrl ? { mediaUrl: posterUrl, mediaType: 'image' as const } : {}),
    __local: true,
    __onboardingBot: true,
  } as any;
}

export function buildOnboardingBotMessage(
  item: TmdbTrendingItem | null,
  details: TmdbMovieDetails | null,
  opts?: { now?: number },
) {
  const createdAt = typeof opts?.now === 'number' ? opts.now : Date.now();

  const title = safeTitle(item);
  const year = safeYear(item);
  const typeLabel = item?.media_type === 'tv' ? 'Series' : 'Movie';
  const rating = typeof item?.vote_average === 'number' ? item.vote_average.toFixed(1) : '';
  const voteCount = typeof item?.vote_count === 'number' ? item.vote_count : 0;

  const funFacts: string[] = [];

  // Budget facts (movies only)
  if (details?.budget && details.budget > 0) {
    const budgetStr = formatBudget(details.budget);
    funFacts.push(`💰 ${title} had a production budget of ${budgetStr}.`);
    if (details.revenue && details.revenue > 0) {
      const revenueStr = formatBudget(details.revenue);
      const profit = details.revenue - details.budget;
      if (profit > 0) {
        funFacts.push(`📈 ${title} made ${revenueStr} at the box office — that's ${formatBudget(profit)} profit!`);
      } else {
        funFacts.push(`🎬 ${title} earned ${revenueStr} at the box office worldwide.`);
      }
    }
  }

  // Runtime facts
  if (details?.runtime && details.runtime > 0) {
    const hours = Math.floor(details.runtime / 60);
    const mins = details.runtime % 60;
    const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins} minutes`;
    funFacts.push(`⏱️ ${title} has a runtime of ${timeStr}.`);
  }

  // Production company facts
  if (details?.production_companies?.length) {
    const companies = details.production_companies.slice(0, 2).map((c) => c.name).join(' and ');
    funFacts.push(`🎥 ${title} was produced by ${companies}.`);
  }

  // Filming location facts
  if (details?.production_countries?.length) {
    const countries = details.production_countries.slice(0, 3).map((c) => c.name).join(', ');
    funFacts.push(`🌍 ${title} was filmed in ${countries}.`);
  }

  // TV show specific facts
  if (item?.media_type === 'tv') {
    if (details?.number_of_seasons) {
      const epCount = details.number_of_episodes || 0;
      funFacts.push(`📺 ${title} has ${details.number_of_seasons} season${details.number_of_seasons > 1 ? 's' : ''}${epCount ? ` with ${epCount} episodes` : ''}.`);
    }
    if (details?.networks?.length) {
      const network = details.networks[0]?.name;
      if (network) funFacts.push(`📡 ${title} originally aired on ${network}.`);
    }
    if (details?.created_by?.length) {
      const creators = details.created_by.slice(0, 2).map((c) => c.name).join(' and ');
      funFacts.push(`✍️ ${title} was created by ${creators}.`);
    }
  }

  // Tagline fact
  if (details?.tagline) {
    funFacts.push(`💬 "${details.tagline}" — ${title}${year ? ` (${year})` : ''}`);
  }

  // Genre facts
  if (details?.genres?.length) {
    const genres = details.genres.slice(0, 3).map((g) => g.name).join(', ');
    funFacts.push(`🎭 ${title} is a ${genres} ${typeLabel.toLowerCase()}.`);
  }

  // Rating facts
  if (rating && voteCount > 1000) {
    funFacts.push(`⭐ ${title} is rated ${rating}/10 based on ${voteCount.toLocaleString()} reviews.`);
  }

  // Language facts
  if (details?.spoken_languages?.length && details.spoken_languages.length > 1) {
    const langs = details.spoken_languages.slice(0, 3).map((l) => l.english_name || l.name).join(', ');
    funFacts.push(`🗣️ ${title} features dialogue in ${langs}.`);
  }

  // Fallback general facts if we couldn't get details
  if (funFacts.length === 0) {
    funFacts.push(
      `🔥 ${typeLabel} spotlight: ${title}${year ? ` (${year})` : ''} is trending right now!`,
      `🎬 ${title} is making waves — check it out on MovieFlix.`,
      `✨ ${title}${rating ? ` (${rating}/10)` : ''} is popular right now. Add it to your watchlist!`,
    );
  }

  const text = funFacts[Math.floor(Math.random() * funFacts.length)];
  const mediaUrl = posterUrl(item);

  return {
    id: `onboarding-${createdAt}-${Math.random().toString(16).slice(2)}`,
    sender: ONBOARDING_BOT_SENDER_ID,
    text,
    createdAt,
    ...(mediaUrl ? { mediaUrl, mediaType: 'image' as const } : {}),
    __local: true,
    __onboardingBot: true,
  };
}

export async function generateBotMessageWithDetails(
  signal?: AbortSignal,
): Promise<ReturnType<typeof buildOnboardingBotMessage> | null> {
  try {
    const recent = await loadRecentKeys();
    const recentSet = new Set(recent);

    // 1) Occasionally send a real movie-world headline (RSS). Completely optional + best-effort.
    if (NEWS_FEEDS.length && Math.random() < 0.4) {
      const news = await fetchMovieNews(signal);
      for (let i = 0; i < Math.min(10, news.length); i++) {
        const h = news[i];
        const k = `news:${normalizeKey(h.title)}`;
        if (!k || recentSet.has(k)) continue;
        const posterUrl = h.imageUrl ? null : await fetchTmdbPosterForHeadline(h.title, signal);
        const msg = buildOnboardingNewsMessage(h, { posterUrl });
        await pushRecentKeys([k, `text:${normalizeKey(msg.text || '')}`]);
        return msg;
      }
    }

    // 2) TMDB variety pool (trending + upcoming + now playing + top rated + TV)
    const candidates = await fetchOnboardingCandidates(signal);
    if (!candidates.length) return null;

    // Try a bunch of times to avoid repeating the same title / same message text.
    for (let attempt = 0; attempt < 18; attempt++) {
      const item = candidates[Math.floor(Math.random() * candidates.length)];
      if (!item?.id) continue;
      const mediaType = item?.media_type || 'movie';
      const mediaKey = `tmdb:${mediaType}:${item.id}`;
      if (recentSet.has(mediaKey)) continue;

      const details = await fetchMovieDetails(item.id, mediaType, signal);

      // Re-roll the fact text a few times to avoid repeats.
      for (let reroll = 0; reroll < 6; reroll++) {
        const msg = buildOnboardingBotMessage(item, details);
        const textKey = `text:${normalizeKey(msg.text || '')}`;
        if (msg.text && !recentSet.has(textKey)) {
          await pushRecentKeys([mediaKey, textKey]);
          return msg;
        }
      }

      // If we couldn't get a new text, still return something for a new title.
      const fallbackMsg = buildOnboardingBotMessage(item, details);
      await pushRecentKeys([mediaKey, `text:${normalizeKey(fallbackMsg.text || '')}`]);
      return fallbackMsg;
    }

    // Worst-case fallback: just return something.
    const item = candidates[Math.floor(Math.random() * candidates.length)];
    const mediaType = item?.media_type || 'movie';
    const details = await fetchMovieDetails(item.id, mediaType, signal);
    const msg = buildOnboardingBotMessage(item, details);
    await pushRecentKeys([
      `tmdb:${mediaType}:${item.id}`,
      `text:${normalizeKey(msg.text || '')}`,
    ]);
    return msg;
  } catch {
    return null;
  }
}
