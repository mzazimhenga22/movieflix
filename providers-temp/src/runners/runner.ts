import { FullScraperEvents, UpdateEvent } from '@/entrypoint/utils/events';
import { ScrapeMedia } from '@/entrypoint/utils/media';
import { FeatureMap, flagsAllowedInFeatures } from '@/entrypoint/utils/targets';
import { UseableFetcher } from '@/fetchers/types';
import { EmbedOutput, SourcererOutput } from '@/providers/base';
import { ProviderList } from '@/providers/get';
import { Stream } from '@/providers/streams';
import { ScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';
import { reorderOnIdList } from '@/utils/list';
import { requiresProxy, setupProxy } from '@/utils/proxy';
import { isValidStream, validatePlayableStream } from '@/utils/valid';

export type RunOutput = {
  sourceId: string;
  embedId?: string;
  stream: Stream;
};

export type SourceRunOutput = {
  sourceId: string;
  stream: Stream[];
  embeds: [];
};

export type EmbedRunOutput = {
  embedId: string;
  stream: Stream[];
};

export type ProviderRunnerOptions = {
  fetcher: UseableFetcher;
  proxiedFetcher: UseableFetcher;
  features: FeatureMap;
  sourceOrder?: string[];
  embedOrder?: string[];
  events?: FullScraperEvents;
  media: ScrapeMedia;
  proxyStreams?: boolean; // temporary
};

export async function runAllProviders(list: ProviderList, ops: ProviderRunnerOptions): Promise<RunOutput | null> {
  const sources = reorderOnIdList(ops.sourceOrder ?? [], list.sources).filter((source) => {
    if (ops.media.type === 'movie') return !!source.scrapeMovie;
    if (ops.media.type === 'show') return !!source.scrapeShow;
    return false;
  });
  const embeds = reorderOnIdList(ops.embedOrder ?? [], list.embeds);
  const embedIds = embeds.map((embed) => embed.id);

  // To reduce time-to-first-playback, do a fast pass over all sources first.
  // Many sources return direct streams quickly; embed scraping is slower and is deferred
  // until we've given all sources a chance.
  const deferredEmbeds: Array<{
    sourceId: string;
    id: string;
    embedId: string;
    url: string;
  }> = [];

  const contextBase: ScrapeContext = {
    fetcher: ops.fetcher,
    proxiedFetcher: ops.proxiedFetcher,
    features: ops.features,
    progress(val) {
      // In parallel mode, individual progress is less meaningful for the global UI,
      // but we can still emit it for the last started source.
    },
  };

  ops.events?.init?.({
    sourceIds: sources.map((v) => v.id),
  });

  // Racing Strategy: Run sources in batches. First valid stream in a batch wins.
  const BATCH_SIZE = 4;
  for (let i = 0; i < sources.length; i += BATCH_SIZE) {
    const batch = sources.slice(i, i + BATCH_SIZE);
    
    const batchResult = await new Promise<RunOutput | null>((resolve) => {
      let resolved = false;
      let finishedCount = 0;

      batch.forEach(async (source) => {
        try {
          ops.events?.start?.(source.id);
          let output: SourcererOutput | null = null;
          
          if (ops.media.type === 'movie' && source.scrapeMovie)
            output = await source.scrapeMovie({ ...contextBase, media: ops.media });
          else if (ops.media.type === 'show' && source.scrapeShow)
            output = await source.scrapeShow({ ...contextBase, media: ops.media });

          if (resolved) return;

          if (output) {
            output.stream = (output.stream ?? [])
              .filter(isValidStream)
              .filter((stream) => flagsAllowedInFeatures(ops.features, stream.flags));

            output.stream = output.stream.map((stream) =>
              requiresProxy(stream) && ops.proxyStreams ? setupProxy(stream) : stream,
            );

            if (output.stream?.[0]) {
              const playableStream = await validatePlayableStream(output.stream[0], ops, source.id);
              if (playableStream && !resolved) {
                resolved = true;
                resolve({ sourceId: source.id, stream: playableStream });
                return;
              }
            }

            // If no stream but has embeds, add them to deferred
            const sortedEmbeds = output.embeds
              .filter((embed) => {
                const e = list.embeds.find((v) => v.id === embed.embedId);
                return e && !e.disabled;
              })
              .sort((a, b) => embedIds.indexOf(a.embedId) - embedIds.indexOf(b.embedId));

            if (sortedEmbeds.length > 0) {
              ops.events?.discoverEmbeds?.({
                embeds: sortedEmbeds.map((embed, ind) => ({
                  id: [source.id, ind].join('-'),
                  embedScraperId: embed.embedId,
                })),
                sourceId: source.id,
              });
              
              for (const [ind, embed] of sortedEmbeds.entries()) {
                deferredEmbeds.push({
                  sourceId: source.id,
                  id: [source.id, ind].join('-'),
                  embedId: embed.embedId,
                  url: embed.url,
                });
              }
            }
          }
        } catch (error) {
          if (!resolved) {
            ops.events?.update?.({
              id: source.id,
              percentage: 100,
              status: error instanceof NotFoundError ? 'notfound' : 'failure',
            });
          }
        } finally {
          finishedCount++;
          if (finishedCount === batch.length && !resolved) {
            resolve(null);
          }
        }
      });
    });

    if (batchResult) return batchResult;
  }

  // Second pass: try embed scrapers in parallel batches.
  const EMBED_BATCH_SIZE = 3;
  for (let i = 0; i < deferredEmbeds.length; i += EMBED_BATCH_SIZE) {
    const batch = deferredEmbeds.slice(i, i + EMBED_BATCH_SIZE);
    
    const batchResult = await new Promise<RunOutput | null>((resolve) => {
      let resolved = false;
      let finishedCount = 0;

      batch.forEach(async (embed) => {
        const scraper = embeds.find((v) => v.id === embed.embedId);
        if (!scraper) {
          finishedCount++;
          if (finishedCount === batch.length && !resolved) resolve(null);
          return;
        }

        try {
          ops.events?.start?.(embed.id);
          let embedOutput = await scraper.scrape({ ...contextBase, url: embed.url });
          
          if (resolved) return;

          embedOutput.stream = embedOutput.stream
            .filter(isValidStream)
            .filter((stream) => flagsAllowedInFeatures(ops.features, stream.flags));
            
          embedOutput.stream = embedOutput.stream.map((stream) =>
            requiresProxy(stream) && ops.proxyStreams ? setupProxy(stream) : stream,
          );

          if (embedOutput.stream?.[0]) {
            const playableStream = await validatePlayableStream(embedOutput.stream[0], ops, embed.embedId);
            if (playableStream && !resolved) {
              resolved = true;
              resolve({ sourceId: embed.sourceId, embedId: scraper.id, stream: playableStream });
              return;
            }
          }
        } catch (error) {
          if (!resolved) {
            ops.events?.update?.({
              id: embed.id,
              percentage: 100,
              status: 'failure',
            });
          }
        } finally {
          finishedCount++;
          if (finishedCount === batch.length && !resolved) {
            resolve(null);
          }
        }
      });
    });

    if (batchResult) return batchResult;
  }

  return null;
}
