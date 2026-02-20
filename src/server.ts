import 'dotenv/config';

import bodyParser from 'body-parser';
import express from 'express';
import morgan from 'morgan';

type MediaPayload =
  | {
      type: 'movie';
      title: string;
      tmdbId: string;
      imdbId?: string;
      releaseYear: number;
    }
  | {
      type: 'show';
      title: string;
      tmdbId: string;
      imdbId?: string;
      releaseYear: number;
      season: { number: number; tmdbId: string; title: string; episodeCount?: number };
      episode: { number: number; tmdbId: string };
    };

type ScrapeOptions = {
  sourceOrder?: string[];
  debugTag?: string;
};

type ScrapeRequestBody = {
  payload: MediaPayload;
  options?: ScrapeOptions;
};

let cachedProviders: any | null = null;

async function getFetchImpl(): Promise<any> {
  if (typeof (globalThis as any).fetch === 'function') return (globalThis as any).fetch;
  const mod = await import('node-fetch');
  return (mod as any).default ?? mod;
}

async function getProviders() {
  if (cachedProviders) return cachedProviders;

  const {
    makeProviders,
    makeStandardFetcher,
    targets,
  } = await import('../providers-temp/lib/index.js');

  const fetchImpl = await getFetchImpl();

  const standardFetcher = makeStandardFetcher(fetchImpl);
  const proxiedFetcher = standardFetcher;

  cachedProviders = makeProviders({
    fetcher: standardFetcher,
    proxiedFetcher,
    target: targets.ANY,
    externalSources: 'all',
    proxyStreams: false,
    consistentIpForRequests: true,
  });

  return cachedProviders;
}

function pickBestFileUrl(qualities: Record<string, any> | undefined): string | null {
  if (!qualities) return null;
  const order = ['4k', '1080', '720', '480', '360', 'unknown'];
  for (const key of order) {
    const entry = qualities[key];
    if (entry?.url) return entry.url;
  }
  const firstKey = Object.keys(qualities).find((k) => qualities[k]?.url);
  return firstKey ? qualities[firstKey]?.url ?? null : null;
}

const app = express();
app.disable('x-powered-by');
app.use(morgan('dev'));
app.use(bodyParser.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/scrape', async (req, res) => {
  const body = (req.body || {}) as ScrapeRequestBody;
  const payload = body.payload;
  const options = body.options || {};

  if (!payload?.type || !payload?.title || !payload?.tmdbId || !payload?.releaseYear) {
    res.status(400).json({ error: 'Missing payload fields' });
    return;
  }

  if (options.debugTag) {
    console.log(`[usePStream] ${options.debugTag} ${payload.title} scraping...`);
  }

  try {
    const providers = await getProviders();
    const result = await providers.runAll({
      media: payload,
      sourceOrder: options.sourceOrder,
      events: {
        init: (e: any) => console.log('[p-stream] init', e?.sourceIds?.length ?? 0),
        start: (id: string) => console.log('[p-stream] start', id),
        update: (u: any) => {
          if (u?.status === 'failure') {
            console.log('[p-stream] update failure', u.id, u.reason ?? '');
          } else if (u?.status === 'notfound') {
            // keep quiet to reduce noise
          }
        },
      },
    });

    if (!result) {
      res.status(404).json({ error: 'No streams found' });
      return;
    }

    const stream = result.stream as any;
    let uri: string | null = null;
    if (stream.type === 'hls') uri = stream.playlist;
    if (stream.type === 'file') uri = pickBestFileUrl(stream.qualities);
    if (!uri) {
      res.status(500).json({ error: 'Stream URL missing' });
      return;
    }

    res.json({
      uri,
      headers: { ...(stream.headers || {}), ...(stream.preferredHeaders || {}) },
      stream,
      sourceId: result.sourceId,
      embedId: result.embedId,
    });
  } catch (err: any) {
    console.error('[p-stream] scrape error', err);
    res.status(500).json({ error: err?.message || 'Scrape failed' });
  }
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log(`[server] listening on http://127.0.0.1:${port}`);
});
