import https from 'https';
import fetch from 'node-fetch';

const agent = new https.Agent({
    rejectUnauthorized: false
});

const doodBase = 'https://dood.li/e/3z9085888t88'; // Example ID

async function testDood() {
    try {
        // Test redirect logic
        let url = doodBase;
        console.log(`Testing ${url}...`);

        const res = await fetch(url, { agent });
        console.log(`Status: ${res.status}`);
        const html = await res.text();
        console.log("Dumping Dood HTML snippet:");
        console.log(html.substring(0, 1000));

        if (html.includes('pass_md5')) {
            console.log("Found 'pass_md5' - Likely working!");
        } else {
            console.log("'pass_md5' NOT found.");
        }

    } catch (e) {
        console.error(e);
    }
}

testDood();
