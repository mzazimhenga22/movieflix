import { NativeModules } from 'react-native';

const { MoviesModule } = NativeModules;

interface MoviesModuleInterface {
    filterMovies(itemsJson: string, type: string, genreId: number, sortMode: 'TopRated' | 'New' | 'None'): Promise<string>;
    filterByGenreList(itemsJson: string, genreIds: number[]): Promise<string>;
    fetchImdbTrailer(imdbId: string): Promise<{ url: string; type: string } | null>;
    resolveHeroTrailer(
        apiKey: string,
        baseUrl: string,
        tmdbId: string,
        mediaType: string,
        imdbId?: string | null,
    ): Promise<{ url: string; type: string } | null>;
    fetchDiscoverMovies(apiKey: string, baseUrl: string, genreId: number, isKids: boolean): Promise<string>;
    fetchGenres(apiKey: string, baseUrl: string, isKids: boolean): Promise<string>;
    searchContent(apiKey: string, baseUrl: string, query: string): Promise<string>;
    aggregateCollections(
        trending: string,
        recommended: string,
        netflix: string,
        amazon: string,
        hbo: string,
        trendingMovies: string,
        trendingTv: string,
        songs: string,
        reels: string,
        genreId: number,
        sortMode: string
    ): Promise<Record<string, string>>;
    getBecauseYouWatched(recommendedJson: string, genreIds: number[]): Promise<string>;
    deriveHomeFeedState(payloadJson: string, isKids: boolean, imageBaseUrl: string): Promise<Record<string, string>>;
}

export default MoviesModule as MoviesModuleInterface;