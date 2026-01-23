import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL, API_KEY, IMAGE_BASE_URL } from '../constants/api';
import { scrapeImdbTrailer } from '../lib/scrapeImdbTrailer';

// Types adapted from existing codebase
export type TrailerReel = {
    id: string;
    title: string;
    videoUrl: string;
    avatar?: string | null;
    music?: string | null;
    movieId?: number;
    mediaType?: string;
    overview?: string;
    year?: string;
};

export function useTvTrailers() {
    const [reels, setReels] = useState<TrailerReel[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const fetchedRef = useRef(false);

    useEffect(() => {
        if (fetchedRef.current) return;
        fetchedRef.current = true;

        const fetchTrailers = async () => {
            try {
                // 1. Fetch Trending/Popular Movies
                const url = `${API_BASE_URL}/movie/popular?api_key=${API_KEY}&language=en-US&page=1`;
                const res = await fetch(url);
                if (!res.ok) throw new Error('Failed to fetch movies');

                const data = await res.json();
                const movies = (data.results || []).slice(0, 8); // Top 8 movies

                const reelItems: TrailerReel[] = [];

                // 2. Fetch Trailers for each movie
                // We run this sequentially or with limited concurrency to be nice to APIs
                for (const movie of movies) {
                    try {
                        let imdbId = null;

                        // Get external IDs to find IMDB ID if not present
                        const externalUrl = `${API_BASE_URL}/movie/${movie.id}/external_ids?api_key=${API_KEY}`;
                        const extRes = await fetch(externalUrl);
                        if (extRes.ok) {
                            const extData = await extRes.json();
                            imdbId = extData.imdb_id;
                        }

                        if (imdbId) {
                            const trailer = await scrapeImdbTrailer({ imdb_id: imdbId });
                            if (trailer?.url) {
                                reelItems.push({
                                    id: String(movie.id),
                                    title: movie.title,
                                    videoUrl: trailer.url,
                                    avatar: movie.poster_path ? `${IMAGE_BASE_URL}${movie.poster_path}` : null,
                                    music: `${movie.title} - Official Soundtrack`,
                                    movieId: movie.id,
                                    mediaType: 'movie',
                                    overview: movie.overview,
                                    year: movie.release_date ? movie.release_date.substring(0, 4) : undefined,
                                });
                            }
                        }
                    } catch (err) {
                        console.warn('Failed to fetch trailer for', movie.title, err);
                    }
                }

                setReels(reelItems);
                setLoading(false);
            } catch (err) {
                console.error('Error in useTvTrailers:', err);
                setError('Failed to load trailers');
                setLoading(false);
            }
        };

        fetchTrailers();
    }, []);

    return { reels, loading, error };
}
