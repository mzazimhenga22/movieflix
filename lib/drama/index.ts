/**
 * Drama & Clip Content Services
 * 
 * Short Dramas (ReelShort-style) + Movie Clips (Clip.Cafe-style)
 */

export * from './types';
export * from './shortDramaScraper';
export * from './clipFinder';

// Re-export main services
export { ShortDramaScraper } from './shortDramaScraper';
export { ClipFinder } from './clipFinder';

// Combined search function
import { searchAllDramas, getTrendingDramas, DramaSearchResult, UnifiedDramaSearchOptions } from './shortDramaScraper';
import { searchAllClips, getPopularQuotes, ClipSearchResult, UnifiedClipSearchOptions } from './clipFinder';

export interface CombinedSearchResult {
  dramas: DramaSearchResult;
  clips: ClipSearchResult;
}

export async function searchContent(
  query: string,
  options?: {
    dramaOptions?: UnifiedDramaSearchOptions;
    clipOptions?: UnifiedClipSearchOptions;
  }
): Promise<CombinedSearchResult> {
  const [dramas, clips] = await Promise.all([
    searchAllDramas(query, options?.dramaOptions),
    searchAllClips(query, options?.clipOptions),
  ]);

  return { dramas, clips };
}

export async function getTrendingContent() {
  const [dramas, clips] = await Promise.all([
    getTrendingDramas(),
    getPopularQuotes(),
  ]);

  return { dramas, clips };
}
