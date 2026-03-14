/**
 * check-layout-providers.js
 * Checks every component/provider imported in _layout.tsx for broken import chains.
 */
const fs = require('fs');
const path = require('path');

function tryResolve(base) {
    for (const ext of ['', '.tsx', '.ts', '/index.tsx', '/index.ts']) {
        const p = base + ext;
        try {
            if (fs.existsSync(p) && !fs.statSync(p).isDirectory()) return p;
        } catch (_) { }
    }
    return null;
}

const ROOT = path.join(__dirname, '..');
const APP_DIR = path.join(ROOT, 'app');

// All imports from _layout.tsx (relative paths resolved from app/)
const layoutRelImports = [
    '../components/app-components/GlobalCommsOverlay',
    '../components/app-components/GlobalMusicPlayer',
    '../components/app-components/GlobalRealtimeNotifications',
    '../components/app-components/StartupVideoSplash',
    '../components/app-components/UpdateGate',
    '../components/app-components/FlixySettingsProvider',
    '../components/app-components/AccentContext',
    '../components/app-components/FlixyVoice',
    '../hooks/use-theme',
    '../providers/SubscriptionProvider',
    '../constants/firebase',
    '../constants/supabase',
    '../lib/downloadBackgroundTasks',
    '../lib/downloadManager',
    '../lib/profileStorage',
    '../lib/pushNotifications',
    '../lib/trackPlayerShim',
];

console.log('=== Checking _layout.tsx provider imports ===\n');

for (const relImp of layoutRelImports) {
    const base = path.resolve(APP_DIR, relImp);
    const resolved = tryResolve(base);

    if (!resolved) {
        console.log('❌ UNRESOLVED: ' + relImp);
        continue;
    }

    const c = fs.readFileSync(resolved, 'utf8');
    const name = relImp.split('/').pop();

    // Check own default export
    const hasDefault = /export\s+default\b/.test(c);

    // Check its own relative imports for broken chains
    const relImportRe = /from\s+'(\.[^']+)'/g;
    let m;
    const subIssues = [];

    while ((m = relImportRe.exec(c)) !== null) {
        const subSrc = m[1];
        const subBase = path.resolve(path.dirname(resolved), subSrc);
        const subResolved = tryResolve(subBase);

        if (!subResolved) {
            subIssues.push('MISSING: ' + subSrc);
            continue;
        }

        // Check if it's a default import that maps to a no-default-export file
        const isDefaultImport = new RegExp('import\\s+\\w+\\s+from\\s+[\'"' + subSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\'"]').test(c);
        if (isDefaultImport) {
            const subC = fs.readFileSync(subResolved, 'utf8');
            if (!/export\s+default\b/.test(subC)) {
                subIssues.push('NO DEFAULT: ' + subSrc + ' (used as default import)');
            }
        }
    }

    if (!hasDefault || subIssues.length) {
        console.log('⚠️  ' + name + ' (' + resolved.replace(ROOT.replace(/\\/g, '/'), '').replace(/\\/g, '/') + ')');
        if (!hasDefault) console.log('   ❌ No default export');
        subIssues.forEach(i => console.log('   ❌ ' + i));
    } else {
        console.log('✅ ' + name);
    }
}

console.log('\nDone.');
