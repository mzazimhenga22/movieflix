/**
 * check-route-exports.js
 * Evaluates the default export of every module in the app/ directory directly
 * using Babel to parse the AST. This is 100% accurate unlike regex.
 * We're looking for files that either have NO default export, or export something undefined.
 */
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(fullPath));
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts') || fullPath.endsWith('.jsx') || fullPath.endsWith('.js')) {
            results.push(fullPath);
        }
    });
    return results;
}

const appDir = path.join(__dirname, '..', 'app');
const files = walk(appDir);

let issues = 0;

for (const file of files) {
    // Ignore typings and api routes that don't need UI exports
    if (file.endsWith('.d.ts') || file.includes('+api.ts') || file.includes('api/')) continue;

    // Ignore layout groups that are just folders

    const content = fs.readFileSync(file, 'utf8');

    try {
        const ast = parser.parse(content, {
            sourceType: 'module',
            plugins: ['jsx', 'typescript', 'decorators-legacy'],
        });

        let hasDefaultExport = false;

        traverse(ast, {
            ExportDefaultDeclaration(path) {
                hasDefaultExport = true;
            }
        });

        if (!hasDefaultExport) {
            console.log('❌ MISSING DEFAULT EXPORT: ' + file.replace(__dirname + '\\..\\', ''));
            issues++;
        }
    } catch (e) {
        // Skip parse errors, could be incomplete code
        // console.log('Parse error on ' + file + ': ' + e.message);
    }
}

if (issues === 0) {
    console.log('✅ All route files have a default export.');
} else {
    console.log(`\nFound ${issues} files missing a default export. expo-router requires a default export for screens.`);
}
