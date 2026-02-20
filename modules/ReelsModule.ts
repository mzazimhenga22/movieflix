import { NativeModules, Platform } from 'react-native';

const Native = Platform.OS === 'android' ? NativeModules.ReelsModule : null;

interface ReelsModuleInterface {
    browseGenreMoviesLazy(genre: string, limit: number): Promise<string>;
    searchClipCafe(title: string, year: string): Promise<string | null>;
    resolveMovieReelsFromTmdb(apiKey: string, baseUrl: string, candidatesJson: string, limit: number): Promise<string>;
}

/**
 * High-performance Reels logic offloaded to Kotlin.
 * Rebuild required after Kotlin changes: npx expo run:android
 */
const ReelsModule: ReelsModuleInterface = {
    browseGenreMoviesLazy: (genre, limit) => {
        if (!Native?.browseGenreMoviesLazy) return Promise.resolve("[]");
        return Native.browseGenreMoviesLazy(genre, limit);
    },
    searchClipCafe: (title, year) => {
        if (!Native?.searchClipCafe) return Promise.resolve(null);
        return Native.searchClipCafe(title, year);
    },
    resolveMovieReelsFromTmdb: (apiKey, baseUrl, candidatesJson, limit) => {
        if (!Native?.resolveMovieReelsFromTmdb) return Promise.resolve('[]');
        return Native.resolveMovieReelsFromTmdb(apiKey, baseUrl, candidatesJson, limit);
    },
};

export { ReelsModule };
