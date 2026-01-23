const https = require('https');

function slugify(text) {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-');
}

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                resolve(fetchUrl(res.headers.location));
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function verifySearch(title, year) {
    if (!year) year = '';
    const slug = slugify(title) + (year ? `-${year}` : '');
    const movieUrl = `https://clip.cafe/${slug}/`;

    console.log(`Searching for: ${title} (${year}) -> ${movieUrl}`);

    try {
        const html = await fetchUrl(movieUrl);
        console.log('HTML Preview:');
        console.log(html.substring(0, 2000));

        console.log('Total HTML length:', html.length);

        // Check for any href
        const veryLooseRegex = /href=["']([^"']+)["']/gi;
        const potentialLinks = html.match(veryLooseRegex);

        if (potentialLinks) {
            console.log('Total hrefs found:', potentialLinks.length);
            console.log('First 10 hrefs:', potentialLinks.slice(0, 10));

            // Check for our slug
            const slugLinks = potentialLinks.filter(l => l.toLowerCase().includes(slug));
            console.log(`Hrefs containing '${slug}':`, slugLinks.length);
            if (slugLinks.length > 0) {
                console.log('Sample slug links (first 10):', slugLinks.slice(0, 10));
            }
        }

        if (html.toLowerCase().includes('dodge')) {
            console.log('KEYWORD FOUND: "dodge" is in the HTML');
        } else {
            console.log('KEYWORD MISSING: "dodge" not found');
        }

        if (!html.includes('clip.cafe')) {
            console.log('Use different UA?');
        }

        const clipRegex = new RegExp(`href=["']/?${slug}\\/[^"']+["']`, 'gi');
        const matches = html.match(clipRegex);

        if (matches && matches.length > 0) {
            console.log(`FOUND ${matches.length} clips.`);
            const firstClip = matches[0].split('"')[1];
            console.log(`First clip: https://clip.cafe${firstClip}`);

            // Go deeper
            const clipUrl = `https://clip.cafe${firstClip}`;
            const clipHtml = await fetchUrl(clipUrl);
            const embedMatch = clipHtml.match(/clip\.cafe\/e\/([a-zA-Z0-9_-]+)/);
            if (embedMatch) {
                console.log('SUCCESS: Found Embed ID:', embedMatch[1]);
            } else {
                console.log('FAILURE: Could not find embed ID on clip page');
            }

        } else {
            console.log('FAILURE: No clips found on movie page.');
        }

    } catch (e) {
        console.error('Error:', e.message);
    }
}

verifySearch('The Matrix', '1999');
