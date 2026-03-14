import { makeProviders, makeStandardFetcher, targets } from './providers-temp/lib/index.js';

const fetchLike = async (url, init) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(init?.headers || {}),
      },
    });
    clearTimeout(timeout);
    return res;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
};

const fetcher = makeStandardFetcher(fetchLike);

const providers = makeProviders({
  fetcher,
  target: targets.ANY,
  consistentIpForRequests: true,
});

const sources = providers.listSources();
const embeds = providers.listEmbeds();

console.log(`Testing ${sources.length} sources and ${embeds.length} embeds...\n`);

const tests = [
  {
    name: "Popular Movie (Deadpool & Wolverine)",
    media: { type: 'movie', title: 'Deadpool & Wolverine', releaseYear: 2024, tmdbId: '533535', imdbId: 'tt6263850' }
  },
  {
    name: "Unpopular Movie (The Man from Earth)",
    media: { type: 'movie', title: 'The Man from Earth', releaseYear: 2007, tmdbId: '13363', imdbId: 'tt0765458' }
  },
  {
    name: "Popular TV Show (Stranger Things S4E1)",
    media: { type: 'show', title: 'Stranger Things', releaseYear: 2016, tmdbId: '66732', imdbId: 'tt4574334', season: { number: 4, tmdbId: '115462' }, episode: { number: 1, tmdbId: '1970678' } }
  },
  {
    name: "Unpopular TV Show (Dark Matter S1E1)",
    media: { type: 'show', title: 'Dark Matter', releaseYear: 2015, tmdbId: '62425', imdbId: 'tt4159076', season: { number: 1, tmdbId: '66205' }, episode: { number: 1, tmdbId: '1058253' } }
  }
];

async function testSource(source, media) {
  const start = Date.now();
  try {
    const result = await providers.runSourceScraper({ id: source.id, media });
    const time = ((Date.now() - start) / 1000).toFixed(2);
    if (result && (result.stream?.length > 0 || result.embeds?.length > 0)) {
      console.log(`✅ [${source.id}] (${time}s) -> ${result.stream?.length || 0} streams, ${result.embeds?.length || 0} embeds`);
      return true;
    } else {
      // console.log(`❌ [${source.id}] (${time}s) -> No streams or embeds found`);
      return false;
    }
  } catch (err) {
    // const time = ((Date.now() - start) / 1000).toFixed(2);
    // console.log(`❌ [${source.id}] (${time}s) -> Error: ${err.message}`);
    return false;
  }
}

async function runAll() {
  for (const test of tests) {
    console.log(`\n=== Testing ${test.name} ===`);
    let foundCount = 0;
    for (const source of sources) {
      if (source.mediaTypes?.includes(test.media.type)) {
        const success = await testSource(source, test.media);
        if (success) foundCount++;
      }
    }
    console.log(`Total working sources for ${test.name}: ${foundCount}`);
  }
}

runAll();