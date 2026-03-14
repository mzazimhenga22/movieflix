/**
 * find-default-import-issues.js
 * For every app/ route file, checks that every default-imported component
 * actually has a default export in its source file.
 */
const fs = require('fs');
const path = require('path');

function walk(d) {
    const r = [];
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) {
            if (['node_modules', '.expo', 'android', 'ios', '.git'].includes(e.name)) continue;
            r.push(...walk(f));
        } else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) {
            r.push(f);
        }
    }
    return r;
}

const ROOT = path.join(__dirname, '..');
const scanDirs = ['app', 'components', 'hooks', 'lib', 'providers'].map(d => path.join(ROOT, d));
const appFiles = scanDirs.flatMap(d => fs.existsSync(d) ? walk(d) : []);
const issues = [];

for (const f of appFiles) {
    const c = fs.readFileSync(f, 'utf8');
    const rel = f.replace(/\\/g, '/').replace(/.*movieflixnative\//, '');

    // Default imports: import X from './path' or import X from '../path'
    const re = /import\s+(\w+)\s+from\s+'(\.[^']+)'/g;
    let m;
    while ((m = re.exec(c)) !== null) {
        const name = m[1];
        const src = m[2];
        const base = path.resolve(path.dirname(f), src);

        let resolved = null;
        for (const ext of ['', '.tsx', '.ts', '/index.tsx', '/index.ts']) {
            const p = base + ext;
            try {
                if (fs.existsSync(p) && !fs.statSync(p).isDirectory()) {
                    resolved = p;
                    break;
                }
            } catch (_) { }
        }
        if (!resolved) continue;

        const sc = fs.readFileSync(resolved, 'utf8');
        const hasDefault = /export\s+default\b/.test(sc);
        if (!hasDefault) {
            issues.push(`${rel}: import ${name} from '${src}' -- NO DEFAULT EXPORT in source`);
        }
    }
}

if (issues.length === 0) {
    console.log('✅ All default imports resolve to files with a default export.');
    console.log('Checked', appFiles.length, 'files.');
} else {
    console.log(issues.length + ' issues:\n');
    issues.forEach(i => console.log(i));
}
