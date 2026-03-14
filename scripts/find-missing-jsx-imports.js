/**
 * find-missing-jsx-imports.js
 * Scans all app/ route files for PascalCase JSX components that are
 * used in JSX but not actually imported into the file.
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

// Builtin RN components and common globals that don't need imports
const BUILTINS = new Set([
    'View', 'Text', 'ScrollView', 'FlatList', 'SectionList', 'Image', 'TextInput', 'Pressable',
    'TouchableOpacity', 'TouchableHighlight', 'TouchableNativeFeedback', 'TouchableWithoutFeedback',
    'SafeAreaView', 'StatusBar', 'Modal', 'Alert', 'ActivityIndicator', 'Switch', 'Slider',
    'Animated', 'KeyboardAvoidingView', 'VirtualizedList', 'RefreshControl', 'ImageBackground',
    'DrawerLayoutAndroid', 'Button', 'CheckBox', 'ProgressBar', 'ProgressBarAndroid',
    'SegmentedControlIOS', 'SnapshotViewIOS', 'TabBarIOS', 'ToolbarAndroid', 'ViewPagerAndroid',
    'WebView', 'React', 'Children', 'Fragment', 'Suspense', 'StrictMode', 'Profiler', 'FlashList',
]);

const ROOT = path.join(__dirname, '..');
const allFiles = walk(path.join(ROOT, 'app'));
const globalIssues = [];

for (const f of allFiles) {
    // Skip type-only files
    if (f.endsWith('.d.ts')) continue;

    const raw = fs.readFileSync(f, 'utf8');
    const rel = f.replace(/\\/g, '/').replace(/.*movieflixnative\//, '');

    // Collect fully-qualified import names
    const importedNames = new Set();

    // Default imports: import X from '...'
    for (const m of raw.matchAll(/^import\s+(\w+)\s+from\s+['"][^'"]+['"]/gm)) {
        importedNames.add(m[1]);
    }
    // Named imports: import { X, Y as Z } from '...'
    for (const m of raw.matchAll(/^import\s*\{([^}]+)\}\s*from\s+['"][^'"]+['"]/gm)) {
        for (const part of m[1].split(',')) {
            const alias = part.trim().split(/\s+as\s+/).pop().trim();
            if (alias) importedNames.add(alias);
        }
    }
    // Namespace imports: import * as X from '...'
    for (const m of raw.matchAll(/^import\s+\*\s+as\s+(\w+)\s+from/gm)) {
        importedNames.add(m[1]);
    }

    // Find JSX component usages: <PascalCase... (opening tags only)
    const jsxComponents = new Set();
    for (const m of raw.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)) {
        jsxComponents.add(m[1]);
    }

    const missing = [];
    for (const comp of jsxComponents) {
        if (BUILTINS.has(comp)) continue;
        if (importedNames.has(comp)) continue;
        // Check if defined locally in this file
        const definedLocally = new RegExp(
            `(function|const|class|let|var)\\s+${comp}\\b|${comp}\\s*=\\s*(React\\.memo|React\\.forwardRef|memo|forwardRef)\\s*[(<]`
        ).test(raw);
        if (definedLocally) continue;
        missing.push(comp);
    }

    if (missing.length > 0) {
        globalIssues.push({ file: rel, missing });
    }
}

if (globalIssues.length === 0) {
    console.log('✅ No missing JSX imports found across all app/ files.');
} else {
    console.log(`Found ${globalIssues.length} file(s) with missing JSX imports:\n`);
    for (const { file, missing } of globalIssues) {
        console.log(`❌ ${file}`);
        missing.forEach(m => console.log(`   Missing: <${m}>`));
    }
}
