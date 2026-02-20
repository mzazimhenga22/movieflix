import fetch from 'node-fetch';

const baseUrl = 'https://ftmoh345xme.com';
const tmdbId = '533535'; // Deadpool & Wolverine (Movie) or a show ID

async function test8Stream() {
    try {
        console.log(`Checking homepage ${baseUrl}...`);
        const home = await fetch(baseUrl, { timeout: 5000 }).catch(e => ({ ok: false, status: 'Error' }));
        console.log(`Homepage status: ${home.status}`);

        // Code uses /play/{id}
        // It seems ID comes from 'getInfo' which calls another API probably?
        // Let's verify if getInfo logic in source uses an external API or scraping.
        // getInfo.ts: imports getInfo. It seems getInfo is a function in the same file?
        // No, `import getInfo from './getInfo';` inside 8Stream.ts (which I read previously).
        // Wait, I read `8Stream.ts`. It imports `getInfo` from `./getInfo`.
        // Then I read `getInfo.ts`. It has `export default async function getStream(...)` ? 
        // Wait, Step 749 showed 'getInfo.ts' content having 'export default async function getStream'.
        // That's confusing file naming.
        // Let's check `d:\movieflixnative\providers-temp\src\providers\sources\8stream\index.ts` again to see what it imports.
        // And `d:\movieflixnative\providers-temp\src\providers\sources\8stream\getInfo.ts` imports from where?

        // Actually, let's just test the URL `https://ftmoh345xme.com` first.

    } catch (e) { console.error(e.message); }
}

test8Stream();
