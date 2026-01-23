import type { Media } from '../types';

export const KIDS_GENRE_IDS = [10751, 16, 10762] as const;

export const filterForKidsMedia = (items: Media[] | undefined | null, isKidsProfile: boolean): Media[] => {
  if (!items || items.length === 0) return [];
  if (!isKidsProfile) return items;
  return items.filter((item) => {
    const ids = (item.genre_ids || []) as number[];
    const hasKidsGenre = ids.some((id) => (KIDS_GENRE_IDS as readonly number[]).includes(id));
    return !item.adult && hasKidsGenre;
  });
};

// Keep URL building simple and RN-safe (avoid new URL()).
export const buildKidsTmdbUrl = (
  input: string,
  options: { isKidsProfile: boolean; type?: 'movie' | 'tv' | 'all' | 'discover' } = { isKidsProfile: false },
): string => {
  const { isKidsProfile, type = 'movie' } = options;
  if (!isKidsProfile) return input;

  const upsertQueryParams = (url: string, updates: Record<string, string>) => {
    const hashIndex = url.indexOf('#');
    const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
    const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;

    const qIndex = withoutHash.indexOf('?');
    const base = qIndex >= 0 ? withoutHash.slice(0, qIndex) : withoutHash;
    const query = qIndex >= 0 ? withoutHash.slice(qIndex + 1) : '';

    const params: Record<string, string> = {};
    if (query) {
      for (const part of query.split('&')) {
        if (!part) continue;
        const eq = part.indexOf('=');
        const rawKey = eq >= 0 ? part.slice(0, eq) : part;
        const rawVal = eq >= 0 ? part.slice(eq + 1) : '';
        let key = rawKey;
        let val = rawVal;
        try {
          key = decodeURIComponent(rawKey);
        } catch {}
        try {
          val = decodeURIComponent(rawVal);
        } catch {}
        if (key) params[key] = val;
      }
    }

    for (const [k, v] of Object.entries(updates)) {
      params[k] = v;
    }

    const qs = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return `${base}${qs ? `?${qs}` : ''}${hash}`;
  };

  const updates: Record<string, string> = {
    include_adult: 'false',
    with_genres: '10751',
  };

  if (type === 'movie' || type === 'discover') {
    updates.certification_country = 'US';
    updates['certification.lte'] = 'G';
  } else if (type === 'tv') {
    updates.certification_country = 'US';
    updates['certification.lte'] = 'TV-Y';
  } else if (type === 'all') {
    updates.certification_country = 'US';
    updates['certification.lte'] = 'TV-Y';
  }

  return upsertQueryParams(input, updates);
};
