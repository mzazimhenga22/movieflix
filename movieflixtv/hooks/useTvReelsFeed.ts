import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL, API_KEY, IMAGE_BASE_URL } from '../constants/api';
import { firestore } from '../constants/firebase';
import { supabase, supabaseConfigured } from '../constants/supabase';
import { scrapeImdbTrailer } from '../lib/scrapeImdbTrailer';
import { searchClipCafe } from '../src/providers/shortclips';

// Unified type for both trailers and user reels
export type ReelItem = {
    id: string;
    type: 'trailer' | 'feed' | 'clip';
    title: string;
    videoUrl: string;
    avatar?: string | null;
    music?: string | null;
    // Trailer/Clip specific
    movieId?: number;
    overview?: string;
    year?: string;
    // Feed specific
    user?: string;
    username?: string;
    likes?: number;
    description?: string;
};

export function useTvReelsFeed() {
    const [reels, setReels] = useState<ReelItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const fetchedRef = useRef(false);

    const fetchFeed = useCallback(async () => {
        try {
            setLoading(true);
            const allItems: ReelItem[] = [];

            // 1. Fetch Trailers & Clips
            const trailersPromise = (async () => {
                const url = `${API_BASE_URL}/movie/popular?api_key=${API_KEY}&language=en-US&page=1`;
                const res = await fetch(url);
                if (!res.ok) return [];
                const data = await res.json();
                // Filter out movies without posters or release dates in the future (simple check)
                const now = new Date();
                const validMovies = (data.results || []).filter((m: any) => {
                    if (!m.poster_path || !m.release_date) return false;
                    // Optional: only released movies? 
                    // const rel = new Date(m.release_date);
                    // return rel <= now;
                    return true;
                });
                const movies = validMovies.slice(0, 10);

                // FORCE ADD THE MATRIX FOR VERIFICATION (User Request)
                movies.unshift({
                    id: 603,
                    title: 'The Matrix',
                    release_date: '1999-03-30',
                    poster_path: '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
                    overview: 'Set in the 22nd century, The Matrix tells the story of a computer hacker who joins a group of underground insurgents fighting the vast and powerful computers who rule the earth.'
                });

                const trailerItems: ReelItem[] = [];
                for (const movie of movies) {
                    try {
                        const year = movie.release_date ? movie.release_date.substring(0, 4) : undefined;

                        // Try fetching a specific clip first
                        const clip = await searchClipCafe(movie.title, year);

                        if (clip?.url) {
                            trailerItems.push({
                                id: `clip-${movie.id}`,
                                type: 'clip', // Use 'clip' type for specific scenes
                                title: `${movie.title} (Scene)`,
                                videoUrl: clip.url,
                                avatar: movie.poster_path ? `${IMAGE_BASE_URL}${movie.poster_path}` : null,
                                music: `${movie.title} - Movie Scene`,
                                movieId: movie.id,
                                overview: movie.overview,
                                year: year,
                            });
                        }

                        // Also try official trailer via IMDB (or if clip failed)
                        let imdbId = null;
                        const externalUrl = `${API_BASE_URL}/movie/${movie.id}/external_ids?api_key=${API_KEY}`;
                        const extRes = await fetch(externalUrl);
                        if (extRes.ok) {
                            const extData = await extRes.json();
                            imdbId = extData.imdb_id;
                        }

                        if (imdbId) {
                            const trailer = await scrapeImdbTrailer({ imdb_id: imdbId });
                            if (trailer?.url) {
                                trailerItems.push({
                                    id: `trailer-${movie.id}`,
                                    type: 'trailer',
                                    title: movie.title,
                                    videoUrl: trailer.url,
                                    avatar: movie.poster_path ? `${IMAGE_BASE_URL}${movie.poster_path}` : null,
                                    music: `${movie.title} - Official Trailer`,
                                    movieId: movie.id,
                                    overview: movie.overview,
                                    year: year,
                                });
                            }
                        }
                    } catch (e) {
                        console.log('Error processing movie for reels', e);
                    }
                }
                return trailerItems;
            })();

            // 2. Fetch User Reels (Supabase + Firestore)
            const reelsPromise = (async () => {
                const userItems: ReelItem[] = [];

                // Try Supabase first (Video posts)
                if (supabaseConfigured) {
                    const { data: posts } = await supabase
                        .from('posts')
                        .select('*')
                        .eq('media_type', 'video')
                        .order('created_at', { ascending: false })
                        .limit(10);

                    if (posts && posts.length > 0) {
                        posts.forEach((post: any) => {
                            if (post.media_url) {
                                userItems.push({
                                    id: `sb-${post.id}`,
                                    type: 'feed',
                                    title: post.title || post.review || 'User Reel',
                                    videoUrl: post.media_url,
                                    avatar: post.userAvatar || null,
                                    user: post.userDisplayName || post.userName || 'MovieFlix User',
                                    likes: post.likes || 0,
                                    description: post.review || post.content,
                                    music: 'Original Audio'
                                });
                            }
                        });
                    }
                }

                // Fallback/Augment with Firestore reviews that have videos
                // We only fetch a few to keep it fast
                if (userItems.length < 5) {
                    try {
                        // Note: Firestore doesn't support inequality filter on different fields easily 
                        // so we just fetch recent reviews and filter client side for now, 
                        // or assume 'type' field exists if we added it.
                        // Based on hooks.tsx, videoUrl might be in data.
                        const reviewsRef = collection(firestore, 'reviews');
                        const q = query(reviewsRef, orderBy('createdAt', 'desc'), limit(20));
                        const snap = await getDocs(q);

                        snap.forEach(docSnap => {
                            const data = docSnap.data();
                            const videoUrl = data.videoUrl || (data.type === 'video' ? data.mediaUrl : null);

                            // Deduplicate if we already got it from supabase (if IDs match, but here we generate new IDs so simpler to just check uniqueness based on content?)
                            // For now just add if we have videoUrl
                            if (videoUrl) {
                                userItems.push({
                                    id: `fs-${docSnap.id}`,
                                    type: 'feed',
                                    title: data.title || data.movie || data.review || 'User Review',
                                    videoUrl: videoUrl,
                                    avatar: data.userAvatar || null,
                                    user: data.userDisplayName || data.userName || 'Movie Fan',
                                    likes: data.likes || 0,
                                    description: data.review,
                                    music: 'Original Audio'
                                });
                            }
                        });
                    } catch (err) {
                        console.warn('Firestore fetch failed', err);
                    }
                }
                return userItems;
            })();

            const [trailers, userReels] = await Promise.all([trailersPromise, reelsPromise]);

            // 3. Shuffle/Interleave
            allItems.push(...trailers);
            allItems.push(...userReels);

            // Random shuffle
            for (let i = allItems.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allItems[i], allItems[j]] = [allItems[j], allItems[i]];
            }

            setReels(allItems);
            setLoading(false);

        } catch (err) {
            console.error('Error fetching reels feed:', err);
            setError('Failed to load feed');
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!fetchedRef.current) {
            fetchedRef.current = true;
            fetchFeed();
        }
    }, [fetchFeed]);

    return { reels, loading, error, refresh: fetchFeed };
}
