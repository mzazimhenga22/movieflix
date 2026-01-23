import fetch from 'node-fetch';

const apiBaseUrl = 'https://borg.rips.cc';
const username = '_sf_';
const password = 'defonotscraping';

async function testEE3() {
    try {
        console.log(`Authenticating with ${username}...`);
        const authUrl = `${apiBaseUrl}/api/collections/users/auth-with-password?expand=lists_liked`;

        const res = await fetch(authUrl, {
            method: 'POST',
            headers: {
                'Origin': 'https://ee3.me',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identity: username,
                password: password
            })
        });

        console.log(`Auth Status: ${res.status}`);
        const json = await res.json();

        if (res.ok && json.token) {
            console.log("SUCCESS: Authentication worked!");
            console.log("Token received.");
        } else {
            console.log("FAILED: Authentication failed.");
            console.log(JSON.stringify(json, null, 2));
        }

    } catch (e) {
        console.error(e);
    }
}

testEE3();
