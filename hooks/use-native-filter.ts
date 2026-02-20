import { useEffect, useState } from 'react';
import { Media } from '../types';
import MoviesModule from '../modules/MoviesModule';

export const useNativeFilter = (
  items: Media[],
  genreId: number | null,
  sort: 'TopRated' | 'New' | 'None'
) => {
  const [res, setRes] = useState<Media[]>([]);

  useEffect(() => {
    let active = true;
    if (!items || items.length === 0) {
      if (active && res.length > 0) {
        setRes([]);
      }
      return;
    }
    (async () => {
      try {
        const json = JSON.stringify(items);
        const r = await MoviesModule.filterMovies(json, 'all', genreId ?? -1, sort);

        if (active) {
          const parsed = JSON.parse(r);
          // Robust check against unstable JSON key order (Android JSONObject issue)
          const isSame = res.length === parsed.length && parsed.every((p: any, i: number) => {
            const c = res[i];
            return c && p.id === c.id;
          });

          if (!isSame) {
            setRes(parsed);
          }
        }
      } catch (e) {
        console.warn('Native Filter Failed', e);
        if (active && res.length > 0) setRes(items);
      }
    })();
    return () => { active = false; };
  }, [items, genreId, sort, res]);
  return res;
};
