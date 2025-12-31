export const API_KEY = (process.env.EXPO_PUBLIC_TMDB_API_KEY ?? '').trim();
export const API_BASE_URL = 'https://api.themoviedb.org/3';
// TV: keep posters lightweight to avoid memory spikes on low-end devices.
export const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w342';
