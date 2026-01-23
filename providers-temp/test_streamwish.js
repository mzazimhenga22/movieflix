import fetch from 'node-fetch';

// Example Streamwish URL (might be dead, but checking response)
const testUrl = 'https://streamwish.to/e/st850029';

async function testStreamwish() {
    try {
        console.log(`Fetching ${testUrl}...`);
        const res = await fetch(testUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        console.log(`Status: ${res.status}`);
        const html = await res.text();
        console.log(`Body length: ${html.length}`);

        //Check for obfuscated script
        const obfuscated = html.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);
        if (obfuscated) {
            console.log("Found obfuscated script!");
        } else {
            console.log("Obfuscated script NOT found.");
            // console.log("Snippet:", html.slice(0, 500));
        }

    } catch (e) {
        console.error(e);
    }
}

testStreamwish();
