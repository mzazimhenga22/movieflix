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

const testMediaMovie = {
  type: 'movie',
  title: 'Inception',
  releaseYear: 2010,
  tmdbId: '27205',
  imdbId: 'tt1375666',
};

const testMediaShow = {
  type: 'show',
  title: 'Breaking Bad',
  releaseYear: 2008,
  tmdbId: '1396',
  imdbId: 'tt0903747',
  season: { number: 1, tmdbId: '3572' },
  episode: { number: 1, tmdbId: '62085' },
};

async function testSource(source, media) {
  const start = Date.now();
  try {
    const result = await providers.runSourceScraper({
      id: source.id,
      media,
    });
    const time = ((Date.now() - start) / 1000).toFixed(2);
    if (result && (result.stream?.length > 0 || result.embeds?.length > 0)) {
      console.log(`✅ [${source.id}] (${time}s) -> ${result.stream?.length || 0} streams, ${result.embeds?.length || 0} embeds`);
      return true;
    } else {
      console.log(`❌ [${source.id}] (${time}s) -> No streams or embeds found`);
      return false;
    }
  } catch (err) {
    const time = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`❌ [${source.id}] (${time}s) -> Error: ${err.message}`);
    return false;
  }
}

async function runAll() {
  console.log("=== Testing Movie (Inception) ===");
  for (const source of sources) {
    if (source.mediaTypes?.includes('movie')) {
      await testSource(source, testMediaMovie);
    }
  }

  console.log("\n=== Testing TV Show (Breaking Bad S1E1) ===");
  for (const source of sources) {
    if (source.mediaTypes?.includes('show')) {
      await testSource(source, testMediaShow);
    }
  }
}

runAll();