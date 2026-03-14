const fs = require('fs');
const path = require('path');

const appDir = path.join(__dirname, '..', 'app');
const layout = fs.readFileSync(path.join(appDir, '_layout.tsx'), 'utf8');

// Extract registered Stack.Screen names
const registered = [];
const re = /Stack\.Screen\s+name="([^"]+)"/g;
let m;
while ((m = re.exec(layout)) !== null) {
    registered.push(m[1]);
}

// Discover top-level routes from file system
const entries = fs.readdirSync(appDir);
const discovered = [];
entries.forEach(entry => {
    if (entry.startsWith('.')) return;
    const fullPath = path.join(appDir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
        if (!entry.startsWith('_')) discovered.push(entry);
    } else if (/\.(tsx|jsx|ts|js)$/.test(entry) && !entry.startsWith('_') && !entry.startsWith('+')) {
        discovered.push(entry.replace(/\.(tsx|jsx|ts|js)$/, ''));
    }
});

console.log('Registered in _layout.tsx:', registered.sort().join(', '));
console.log('');
console.log('Discovered routes:', discovered.sort().join(', '));
console.log('');

const missing = discovered.filter(d => !registered.includes(d));
if (missing.length > 0) {
    console.log('MISSING from _layout.tsx:', missing.join(', '));
} else {
    console.log('All routes registered!');
}

const extra = registered.filter(r => !discovered.includes(r));
if (extra.length > 0) {
    console.log('Registered but NOT discovered:', extra.join(', '));
}
