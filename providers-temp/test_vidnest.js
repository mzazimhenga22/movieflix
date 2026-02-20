import fetch from 'node-fetch';

const backendUrl = 'https://second.vidnest.fun';
const servers = ['hollymoviehd', 'allmovies'];
const tmdbId = '533535';

async function testVidNest() {
    for (const server of servers) {
        try {
            const url = `${backendUrl}/${server}/movie/${tmdbId}`;
            console.log(`Checking ${url}...`);
            const res = await fetch(url, { timeout: 5000 });
            console.log(`${server} status: ${res.status}`);
        } catch (e) { console.log(`${server} failed: ${e.message}`); }
    }
}

testVidNest();
