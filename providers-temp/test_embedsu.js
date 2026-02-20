import fetch from 'node-fetch';

const tmdbId = '533535'; // Deadpool & Wolverine
const embedUrl = `https://embed.su/embed/movie/${tmdbId}`;

async function stringAtob(input) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    const str = input.replace(/=+$/, '');
    let output = '';
    if (str.length % 4 === 1) {
        throw new Error('The string to be decoded is not correctly encoded.');
    }
    for (let bc = 0, bs = 0, i = 0; i < str.length; i++) {
        const buffer = str.charAt(i);
        const charIndex = chars.indexOf(buffer);
        if (charIndex === -1) continue;
        bs = bc % 4 ? bs * 64 + charIndex : charIndex;
        if (bc++ % 4) {
            output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
        }
    }
    return output;
}

async function testEmbedsu() {
    try {
        console.log(`Fetching ${embedUrl}...`);
        const res = await fetch(embedUrl, {
            headers: {
                'Referer': 'https://embed.su/',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            }
        });
        console.log(`Status: ${res.status}`);
        if (!res.ok) return;

        const html = await res.text();
        // console.log("HTML snippet:", html.substring(0, 500));

        const vConfigMatch = html.match(/window\.vConfig\s*=\s*JSON\.parse\(atob\(`([^`]+)/i);
        if (!vConfigMatch || !vConfigMatch[1]) {
            console.log("vConfig NOT found.");
            return;
        }
        const encodedConfig = vConfigMatch[1];
        console.log("Found encoded config (length):", encodedConfig.length);

        const decodedConfig = JSON.parse(await stringAtob(encodedConfig));
        console.log("Decoded Config Hash:", decodedConfig.hash);

        if (!decodedConfig.hash) {
            console.log("No hash in config");
            return;
        }

        const firstDecode = (await stringAtob(decodedConfig.hash))
            .split('.')
            .map((item) => item.split('').reverse().join(''));

        const secondDecodeStr = await stringAtob(firstDecode.join('').split('').reverse().join(''));
        const secondDecode = JSON.parse(secondDecodeStr);

        console.log("Servers found:", secondDecode.length);
        console.log(JSON.stringify(secondDecode, null, 2));

    } catch (e) {
        console.error(e);
    }
}

testEmbedsu();
