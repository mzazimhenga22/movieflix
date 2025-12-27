import { pathToFileURL } from 'url';

const libUrl = pathToFileURL('D:\\movieflixnative\\providers-temp\\lib\\index.js').href;
const { makeProviders, makeStandardFetcher, targets } = await import(libUrl);

const payload = {
  type: 'show',
  title: "Tyler Perry's Sistas",
  tmdbId: '94686',
  imdbId: 'tt10752770',
  releaseYear: 2019,
  season: { number: 1, tmdbId: '134372', title: 'Season 1', episodeCount: 25 },
  episode: { number: 1, tmdbId: '1957540' },
};

const fetcher = makeStandardFetcher(fetch);
const proxiedFetcher = fetcher;

const target = process.env.PSTREAM_TARGET === 'any' ? targets.ANY : targets.NATIVE;
const providers = makeProviders({
  fetcher,
  proxiedFetcher,
  target,
  externalSources: 'all',
  proxyStreams: false,
  consistentIpForRequests: true,
});

const preferred = [
  'cuevana3',
  'primesrc',
  'rgshows',
  'tugaflix',
  'movies4f',
  'lookmovie',
  'wecima',
  'pelisplushd',
  'fsonline',
  'hdrezka',
  'cinehdplus',
];

const allSourceIds = (providers.listSources?.() ?? []).map((s) => s?.id).filter(Boolean);
const seen = new Set();
const sourceOrder = [...preferred, ...allSourceIds].filter((id) => {
  if (!id || seen.has(id)) return false;
  seen.add(id);
  return true;
});

const embedOrder = (providers.listEmbeds?.() ?? []).map((e) => e?.id).filter(Boolean);

console.log('proxyUrl:', '(disabled)');
console.log('target:', process.env.PSTREAM_TARGET || 'native');
console.log('payload:', payload);
console.log(
  'sources available (first 50):',
  providers.listSources?.().map((s) => s.id).filter(Boolean).slice(0, 50),
);

const result = await providers.runAll({
  media: payload,
  sourceOrder,
  embedOrder,
  events: {
    init: (e) => console.log('[init]', { sources: e?.sourceIds?.length }),
    start: (id) => console.log('[start]', id),
    update: (u) => {
      const status = u?.status;
      if (!status) return;
      if (status === 'success') console.log('[update]', u.id, status, { embedId: u?.embedId });
      else if (status === 'failure') console.log('[update]', u.id, status, { reason: u?.reason, error: String(u?.error ?? '') });
      else if (status === 'notfound') console.log('[update]', u.id, status, { reason: u?.reason });
      else console.log('[update]', u.id, status);
    },
  },
});

if (!result) {
  console.log('RESULT: null (no streams found)');
  process.exit(0);
}

console.log('RESULT:', {
  sourceId: result.sourceId,
  embedId: result.embedId,
  streamType: result.stream?.type,
  playlist: result.stream?.playlist,
  qualities: result.stream?.qualities ? Object.keys(result.stream.qualities) : undefined,
});

if (result.stream?.type === 'file') {
  const q = result.stream?.qualities?.unknown;
  console.log('DIRECT_FILE_URL:', q?.url);
  console.log('STREAM_HEADERS:', { ...(result.stream?.headers || {}), ...(result.stream?.preferredHeaders || {}) });
}

if (result.stream?.type === 'hls') {
  console.log('DIRECT_HLS_URL:', result.stream?.playlist);
  console.log('STREAM_HEADERS:', { ...(result.stream?.headers || {}), ...(result.stream?.preferredHeaders || {}) });
}
