
import { browseClipCafeGenreMoviesLazy, searchClipCafe } from '../src/providers/shortclips';

// Mock global fetch if needed (Node 18+ has it built-in)
if (!global.fetch) {
    console.warn('Native fetch not found, this script requires Node 18+');
}

async function test() {
    console.log('--- Testing Browse Genre (Action) ---');
    try {
        const movies = await browseClipCafeGenreMoviesLazy('Action', 5);
        console.log(`Movies found: ${movies.length}`);

        if (movies.length > 0) {
            const sample = movies[0];
            console.log('Sample movie:', sample);

            console.log('\n--- Testing Search & Resolve ---');
            console.log(`Searching for: ${sample.title} (${sample.year})`);

            const stream = await searchClipCafe(sample.title, sample.year);
            if (stream) {
                console.log('Stream resolved successfully:');
                console.log(JSON.stringify(stream, null, 2));
            } else {
                console.error('Stream resolution failed (returned null).');
            }
        } else {
            console.error('Browse returned 0 movies. Scraper likely broken.');
        }
    } catch (e) {
        console.error('Test script crashed:', e);
    }
}

test();
