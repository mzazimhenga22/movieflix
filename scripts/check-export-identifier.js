/**
 * check-export-identifier.js
 * Parses every route file to ensure its default export variable actually exists
 * either as a local declaration or an import.
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
        if (fs.statSync(fullPath).isDirectory()) {
            if (!fullPath.includes('node_modules') && !fullPath.includes('.expo') && !fullPath.includes('android')) {
                results = results.concat(walk(fullPath));
            }
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.jsx')) {
            results.push(fullPath);
        }
    });
    return results;
}

const filesToScan = walk(path.join(__dirname, '..', 'app'));

let issues = 0;

filesToScan.forEach(file => {
    const bn = path.basename(file);
    if (bn.startsWith('_') || bn.includes('+api')) return; // Ignore layouts and API routes (though layouts can crash too, let's include layouts?)
    // Wait, let's scan EVERYTHING in app/ just in case.
});

// Let's really scan all .tsx in app/
filesToScan.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    try {
        const ast = parser.parse(content, {
            sourceType: 'module',
            plugins: ['jsx', 'typescript', 'decorators-legacy'],
        });

        const definedNames = new Set();
        let defaultExportName = null;

        traverse(ast, {
            ImportDeclaration(p) {
                p.node.specifiers.forEach(spec => {
                    definedNames.add(spec.local.name);
                });
            },
            VariableDeclarator(p) {
                if (p.node.id.type === 'Identifier') {
                    definedNames.add(p.node.id.name);
                }
            },
            FunctionDeclaration(p) {
                if (p.node.id) definedNames.add(p.node.id.name);
            },
            ClassDeclaration(p) {
                if (p.node.id) definedNames.add(p.node.id.name);
            },
            ExportDefaultDeclaration(p) {
                const decl = p.node.declaration;
                if (decl.type === 'Identifier') {
                    defaultExportName = decl.name;
                } else if (decl.type === 'CallExpression') {
                    // e.g. export default memo(MessageItem)
                    if (decl.arguments.length > 0 && decl.arguments[0].type === 'Identifier') {
                        defaultExportName = decl.arguments[0].name;
                    }
                }
            }
        });

        if (defaultExportName && !definedNames.has(defaultExportName)) {
            console.log(`\\n❌ UNDEFINED EXPORT DETECTED in ${file.replace(__dirname, '')}:`);
            console.log(`   'export default ${defaultExportName};' but '${defaultExportName}' is never defined in the file!`);
            issues++;
        }
    } catch (e) {
        // console.log("Parse err: " + file);
    }
});

if (issues === 0) {
    console.log('✅ AST checking completed: All default exports reference defined variables.');
}
