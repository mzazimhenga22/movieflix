const fs = require('fs');
const path = require('path');

const appDir = path.join(__dirname, '..', 'app');

function scan(dir, rel = '') {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
        if (entry.startsWith('_') || entry.startsWith('.') || entry.startsWith('+')) continue;
        const full = path.join(dir, entry);
        const stat = fs.statSync(full);
        const currentRel = rel ? `${rel}/${entry}` : entry;

        if (stat.isDirectory()) {
            scan(full, currentRel);
        } else if (/\.(tsx|jsx|ts|js)$/.test(entry)) {
            const name = currentRel.replace(/\.(tsx|jsx|ts|js)$/, '');
            try {
                // We can't actually 'require' TSX/TS here without babel-register or similar
                // but we can check if the file exists and has a default export string.
                const content = fs.readFileSync(full, 'utf8');
                if (content.includes('export default')) {
                    // console.log(`[OK] ${name}`);
                } else {
                    console.log(`[MISSING DEFAULT EXPORT] ${name} (${full})`);
                }
            } catch (e) {
                console.log(`[ERROR READING] ${name}: ${e.message}`);
            }
        }
    }
}

console.log('Scanning app directory for missing default exports...');
scan(appDir);
console.log('Scan complete.');
