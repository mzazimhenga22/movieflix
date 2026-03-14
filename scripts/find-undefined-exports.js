/**
 * find-undefined-exports-v2.js — Deep scan
 *
 * Checks for:
 * 1. Route files (.tsx AND .ts) with no default export
 * 2. Default imports whose source has NO default export
 * 3. JSX components used in render that are imported but potentially undefined
 *    (wrong named vs default import)
 * 4. `export default X` where X is not declared locally or imported
 * 5. Files in app/ whose name looks like a layout/route but has no export default
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const APP_DIR = path.join(PROJECT_ROOT, 'app');
const COMPONENTS_DIR = path.join(PROJECT_ROOT, 'components');
const PROVIDERS_DIR = path.join(PROJECT_ROOT, 'providers');
const HOOKS_DIR = path.join(PROJECT_ROOT, 'hooks');

// ── utils ─────────────────────────────────────────────────────────────────────

const cache = new Map();
function readFile(p) {
    if (cache.has(p)) return cache.get(p);
    try { const v = fs.readFileSync(p, 'utf8'); cache.set(p, v); return v; }
    catch { cache.set(p, null); return null; }
}

function resolve(src, fromFile) {
    if (!src.startsWith('.') && !src.startsWith('/')) return null;
    const base = path.resolve(path.dirname(fromFile), src);
    for (const ext of ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.js']) {
        const c = base + ext;
        if (fs.existsSync(c)) return c;
    }
    return null;
}

function hasDefaultExport(content) {
    return (
        /export\s+default\s+(?:function|class|const|let|var|async|\(|[A-Z_a-z$])/.test(content) ||
        /export\s*\{[^}]*\bas\s+default\b/.test(content)
    );
}

function walkDir(dir, exts = ['.tsx', '.ts']) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (['node_modules', '.expo', 'android', 'ios', '.git', 'scripts'].includes(e.name)) continue;
            out.push(...walkDir(full, exts));
        } else if (exts.some(x => e.name.endsWith(x))) {
            out.push(full);
        }
    }
    return out;
}

// ── parse imports ─────────────────────────────────────────────────────────────

// Returns [ { kind: 'default'|'named'|'star', name, source } ]
function parseImports(content) {
    const result = [];

    // import Foo from '...'
    const defRe = /import\s+([A-Za-z_$][A-Za-z0-9_$]*)\s+from\s+['"]([^'"]+)['"]/g;
    let m;
    while ((m = defRe.exec(content)) !== null) {
        result.push({ kind: 'default', name: m[1], source: m[2] });
    }

    // import { Foo, Bar as Baz } from '...'
    const namedRe = /import\s*(?:type\s*)?\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
    while ((m = namedRe.exec(content)) !== null) {
        const src = m[2];
        for (const part of m[1].split(',')) {
            const alias = part.trim().split(/\s+as\s+/).pop().trim();
            if (alias) result.push({ kind: 'named', name: alias, source: src });
        }
    }

    // import * as Foo from '...'
    const starRe = /import\s*\*\s*as\s+([A-Za-z_$][A-Za-z0-9_$]*)\s+from\s*['"]([^'"]+)['"]/g;
    while ((m = starRe.exec(content)) !== null) {
        result.push({ kind: 'star', name: m[1], source: m[2] });
    }

    return result;
}

// Named exports from a file
function getNamedExports(content) {
    const names = new Set();
    // export function Foo / export const Foo / export class Foo
    const decl = /export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
    let m;
    while ((m = decl.exec(content)) !== null) names.add(m[1]);
    // export { Foo, Bar as Baz }
    const braceRe = /export\s*\{([^}]+)\}/g;
    while ((m = braceRe.exec(content)) !== null) {
        for (const part of m[1].split(',')) {
            const alias = part.trim().split(/\s+as\s+/).pop().trim();
            if (alias && alias !== 'default') names.add(alias);
        }
    }
    return names;
}

// JSX components used: <Foo ... or <Foo>
function getJsxComponents(content) {
    const s = new Set();
    const re = /<([A-Z][A-Za-z0-9_$]*)\s*[\s/>]/g;
    let m;
    while ((m = re.exec(content)) !== null) s.add(m[1]);
    return s;
}

// ── run checks ────────────────────────────────────────────────────────────────

const issues = [];
function report(file, sev, msg) {
    const rel = path.relative(PROJECT_ROOT, file).replace(/\\/g, '/');
    issues.push({ rel, severity: sev, msg });
}

// Build fast lookup: filePath -> namedExports Set
const namedExportsCache = new Map();
function namedExportsOf(filePath) {
    if (namedExportsCache.has(filePath)) return namedExportsCache.get(filePath);
    const c = readFile(filePath);
    const s = c ? getNamedExports(c) : new Set();
    namedExportsCache.set(filePath, s);
    return s;
}

const appFiles = walkDir(APP_DIR);

// ── CHECK 1: route files must have a default export ──────────────────────────
console.log('\n► CHECK 1: Route files missing default export...');
for (const f of appFiles) {
    const c = readFile(f);
    if (!c) continue;
    if (!hasDefaultExport(c)) {
        report(f, '🔴 CRITICAL', 'Route file has NO default export');
    }
}

// ── CHECK 2: default imports where source has no default export ───────────────
console.log('► CHECK 2: Default imports from sources without default export...');
const allFiles = [
    ...appFiles,
    ...walkDir(COMPONENTS_DIR),
    ...walkDir(PROVIDERS_DIR),
    ...walkDir(HOOKS_DIR),
];

for (const f of allFiles) {
    const c = readFile(f);
    if (!c) continue;
    for (const imp of parseImports(c)) {
        if (imp.kind !== 'default') continue;
        const srcPath = resolve(imp.source, f);
        if (!srcPath) continue;
        const srcContent = readFile(srcPath);
        if (!srcContent) continue;
        if (!hasDefaultExport(srcContent)) {
            report(f, '🔴 CRITICAL',
                `import ${imp.name} from '${imp.source}' — source has NO default export → ${imp.name} will be undefined`);
        }
    }
}

// ── CHECK 3: JSX component names that are imported as default  ────────────────
// but the source only has named exports (common mix-up)
console.log('► CHECK 3: JSX components used that might be undefined (named vs default mismatch)...');
for (const f of allFiles) {
    const c = readFile(f);
    if (!c) continue;
    const imports = parseImports(c);
    const defaultImports = new Map(imports.filter(i => i.kind === 'default').map(i => [i.name, i]));
    const jsxComponents = getJsxComponents(c);

    for (const comp of jsxComponents) {
        const imp = defaultImports.get(comp);
        if (!imp) continue; // not a default import – skip
        const srcPath = resolve(imp.source, f);
        if (!srcPath) continue;
        const srcContent = readFile(srcPath);
        if (!srcContent) continue;
        if (!hasDefaultExport(srcContent)) {
            report(f, '🔴 CRITICAL',
                `<${comp} /> is rendered but imported as default — source '${imp.source}' has no default export. Did you mean: import { ${comp} } from '${imp.source}'?`);
        }
    }
}

// ── CHECK 4: `export default SomeId` where SomeId isn't declared/imported ────
console.log('► CHECK 4: export default references undefined identifier...');
for (const f of allFiles) {
    const c = readFile(f);
    if (!c) continue;
    const m = c.match(/^export\s+default\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[;\n]/m);
    if (!m) continue;
    const id = m[1];
    if (/^(?:null|undefined|true|false|NaN|Infinity)$/.test(id)) {
        report(f, '🔴 CRITICAL', `export default ${id} — exporting a nullish primitive`);
        continue;
    }
    const isLocal = new RegExp(`(?:function|class|const|let|var)\\s+${id}\\b`).test(c);
    const isImported = new RegExp(`import[^'"]+\\b${id}\\b`).test(c);
    if (!isLocal && !isImported) {
        report(f, '🟡 WARNING', `export default ${id} — "${id}" not found locally or in imports`);
    }
}

// ── CHECK 5: named imports where the named export doesn't exist in source ─────
console.log('► CHECK 5: Named imports that don\'t exist in source file...\n');
for (const f of appFiles) { // only route files for brevity
    const c = readFile(f);
    if (!c) continue;
    for (const imp of parseImports(c)) {
        if (imp.kind !== 'named') continue;
        const srcPath = resolve(imp.source, f);
        if (!srcPath) continue;
        const srcContent = readFile(srcPath);
        if (!srcContent) continue;
        const named = namedExportsOf(srcPath);
        // only flag if the component is actually used in JSX
        const jsxUsed = new RegExp(`<${imp.name}[\\s/>]`).test(c);
        if (jsxUsed && !named.has(imp.name) && !hasDefaultExport(srcContent)) {
            report(f, '� CRITICAL',
                `<${imp.name} /> rendered, but '${imp.source}' exports neither named "${imp.name}" nor a default`);
        }
    }
}

// ── report ────────────────────────────────────────────────────────────────────
const critical = issues.filter(i => i.severity.startsWith('🔴'));
const warnings = issues.filter(i => i.severity.startsWith('🟡'));

console.log('═══════════════════════════════════════════════════════');
console.log(' Undefined Component Diagnostic v2 — MovieFlix');
console.log('═══════════════════════════════════════════════════════\n');

if (critical.length === 0 && warnings.length === 0) {
    console.log('✅ No issues found!\n');
} else {
    if (critical.length > 0) {
        console.log(`🔴 CRITICAL (${critical.length}):\n`);
        for (const { rel, msg } of critical) {
            console.log(`  ❌ ${rel}`);
            console.log(`     → ${msg}\n`);
        }
    }
    if (warnings.length > 0) {
        console.log(`🟡 WARNINGS (${warnings.length}):\n`);
        for (const { rel, msg } of warnings) {
            console.log(`  ⚠️  ${rel}`);
            console.log(`     → ${msg}\n`);
        }
    }
}
console.log(`Scanned ${allFiles.length} files.\n`);
console.log('═══════════════════════════════════════════════════════\n');
