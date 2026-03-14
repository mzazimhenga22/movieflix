/**
 * find-jsx-undefined.js
 * Checks every route file in app/ for JSX usage of a named-imported component
 * that doesn't actually exist as an export in its source file.
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

const appDir = path.join(__dirname, '..', 'app');
const appFiles = walk(appDir);

const issues = [];

for (const f of appFiles) {
    const c = fs.readFileSync(f, 'utf8');
    const rel = f.replace(/\\/g, '/').replace(/.*\/movieflixnative\//, '');

    // Find named imports from relative paths
    const namedRe = /import\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/g;
    let m;
    while ((m = namedRe.exec(c)) !== null) {
        const names = m[1]
            .split(',')
            .map(s => s.trim().replace(/\s+as\s+\w+$/, '').trim())
            .filter(n => n && !n.startsWith('type ') && !/^[a-z]/.test(n)); // only PascalCase (components)

        const src = m[2];
        const srcBase = path.resolve(path.dirname(f), src);

        let resolved = null;
        for (const ext of ['', '.tsx', '.ts', '/index.tsx', '/index.ts']) {
            if (fs.existsSync(srcBase + ext)) { resolved = srcBase + ext; break; }
        }
        if (!resolved) continue;
        if (fs.statSync(resolved).isDirectory()) continue;

        const srcC = fs.readFileSync(resolved, 'utf8');

        for (const name of names) {
            if (!name) continue;

            // Check if used in JSX
            const usedInJSX = new RegExp('<' + name + '[\\s/>]').test(c);
            if (!usedInJSX) continue;

            // Check if actually exported from source
            const isExported =
                new RegExp('export\\s+(?:function|class|const|let|var)\\s+' + name + '\\b').test(srcC) ||
                new RegExp('export\\s*\\{[^}]*\\b' + name + '\\b[^}]*\\}').test(srcC) ||
                new RegExp('export\\s+default\\s+' + name + '\\b').test(srcC) ||
                // barrel file: export { default as Name }
                new RegExp('export\\s*\\{[^}]*default\\s+as\\s+' + name + '[^}]*\\}').test(srcC) ||
                // re-export everything: export * from ...
                /export\s+\*\s+from/.test(srcC);

            if (!isExported) {
                issues.push({ file: rel, name, src: resolved.replace(/\\/g, '/').replace(/.*\/movieflixnative\//, '') });
            }
        }
    }
}

if (issues.length === 0) {
    console.log('✅ No JSX/undefined named import issues found across', appFiles.length, 'files');
} else {
    console.log(issues.length + ' potential undefined JSX component issues:\n');
    for (const { file, name, src } of issues) {
        console.log('FILE: ' + file);
        console.log('  <' + name + '> not found as export in: ' + src);
        console.log('');
    }
}
