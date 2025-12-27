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
  let lastId = '';

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
      ops.events?.update?.({
        id: lastId,
        percentage: val,
        status: 'pending',
      });
    },
  };

  ops.events?.init?.({
    sourceIds: sources.map((v) => v.id),
  });

  for (const source of sources) {
    ops.events?.start?.(source.id);
    lastId = source.id;

    // run source scrapers
    let output: SourcererOutput | null = null;
    try {
      if (ops.media.type === 'movie' && source.scrapeMovie)
        output = await source.scrapeMovie({
          ...contextBase,
          media: ops.media,
        });
      else if (ops.media.type === 'show' && source.scrapeShow)
        output = await source.scrapeShow({
          ...contextBase,
          media: ops.media,
        });
      if (output) {
        output.stream = (output.stream ?? [])
          .filter(isValidStream)
          .filter((stream) => flagsAllowedInFeatures(ops.features, stream.flags));

        output.stream = output.stream.map((stream) =>
          requiresProxy(stream) && ops.proxyStreams ? setupProxy(stream) : stream,
        );
      }
      if (!output || (!output.stream?.length && !output.embeds.length)) {
        throw new NotFoundError('No streams found');
      }
    } catch (error) {
      const updateParams: UpdateEvent = {
        id: source.id,
        percentage: 100,
        status: error instanceof NotFoundError ? 'notfound' : 'failure',
        reason: error instanceof NotFoundError ? error.message : undefined,
        error: error instanceof NotFoundError ? undefined : error,
      };

      ops.events?.update?.(updateParams);
      continue;
    }
    if (!output) throw new Error('Invalid media type');

    // return stream is there are any
    if (output.stream?.[0]) {
      try {
        const playableStream = await validatePlayableStream(output.stream[0], ops, source.id);
        if (!playableStream) throw new NotFoundError('No streams found');

        return {
          sourceId: source.id,
          stream: playableStream,
        };
      } catch (error) {
        const updateParams: UpdateEvent = {
          id: source.id,
          percentage: 100,
          status: error instanceof NotFoundError ? 'notfound' : 'failure',
          reason: error instanceof NotFoundError ? error.message : undefined,
          error: error instanceof NotFoundError ? undefined : error,
        };

        ops.events?.update?.(updateParams);
        continue;
      }
    }

    // filter disabled and run embed scrapers on listed embeds
    const sortedEmbeds = output.embeds
      .filter((embed) => {
        const e = list.embeds.find((v) => v.id === embed.embedId);
        return e && !e.disabled;
      })
      .sort((a, b) => embedIds.indexOf(a.embedId) - embedIds.indexOf(b.embedId));

    if (sortedEmbeds.length > 0) {
      ops.events?.discoverEmbeds?.({
        embeds: sortedEmbeds.map((embed, i) => ({
          id: [source.id, i].join('-'),
          embedScraperId: embed.embedId,
        })),
        sourceId: source.id,
      });
    }

    // Defer embed scraping until after we've tried all sources.
    for (const [ind, embed] of sortedEmbeds.entries()) {
      deferredEmbeds.push({
        sourceId: source.id,
        id: [source.id, ind].join('-'),
        embedId: embed.embedId,
        url: embed.url,
      });
    }
  }

  // Second pass: try embed scrapers in discovered order.
  for (const embed of deferredEmbeds) {
    const scraper = embeds.find((v) => v.id === embed.embedId);
    if (!scraper) continue;

    ops.events?.start?.(embed.id);
    lastId = embed.id;

    let embedOutput: EmbedOutput;
    try {
      embedOutput = await scraper.scrape({
        ...contextBase,
        url: embed.url,
      });
      embedOutput.stream = embedOutput.stream
        .filter(isValidStream)
        .filter((stream) => flagsAllowedInFeatures(ops.features, stream.flags));
      embedOutput.stream = embedOutput.stream.map((stream) =>
        requiresProxy(stream) && ops.proxyStreams ? setupProxy(stream) : stream,
      );
      if (embedOutput.stream.length === 0) {
        throw new NotFoundError('No streams found');
      }

      const playableStream = await validatePlayableStream(embedOutput.stream[0], ops, embed.embedId);
      if (!playableStream) throw new NotFoundError('No streams found');

      embedOutput.stream = [playableStream];
    } catch (error) {
      const updateParams: UpdateEvent = {
        id: embed.id,
        percentage: 100,
        status: error instanceof NotFoundError ? 'notfound' : 'failure',
        reason: error instanceof NotFoundError ? error.message : undefined,
        error: error instanceof NotFoundError ? undefined : error,
      };

      ops.events?.update?.(updateParams);
      continue;
    }

    return {
      sourceId: embed.sourceId,
      embedId: scraper.id,
      stream: embedOutput.stream[0],
    };
  }

  // no providers or embeds returns streams
  return null;
}
