import fetch from 'node-fetch';

const baseUrl = 'https://lmscript.xyz';

async function testLookMovieApi() {
    try {
        console.log(`Checking API ${baseUrl}...`);
        const res = await fetch(`${baseUrl}/v1/movies?page=1`);
        console.log(`Status: ${res.status}`);
        if (res.ok) {
            const json = await res.json();
            console.log(`Items found: ${json.items?.length}`);
            if (json.items?.length > 0) {
                console.log("First item:", json.items[0].title);
            }
        } else {
            console.log("API failed");
        }
    } catch (e) { console.error(e); }
}

testLookMovieApi();
