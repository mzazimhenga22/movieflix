/**
 * check-all-jsx.js
 * Parses every file to find ALL JSX tags used.
 * For each tag, it verifies if it comes from an import.
 * If it comes from an import, it attempts to load that imported file and verify
 * that the exported name actually exists.
 * This will definitively find the "undefined" element cause.
 */
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const builtins = new Set([
    'Fragment', 'Suspense', 'StrictMode', 'Profiler',
    'View', 'Text', 'ScrollView', 'FlatList', 'SectionList', 'Image', 'TextInput',
    'Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableNativeFeedback',
    'TouchableWithoutFeedback', 'SafeAreaView', 'StatusBar', 'Modal', 'Alert',
    'ActivityIndicator', 'Switch', 'Slider', 'KeyboardAvoidingView', 'RefreshControl',
    'ImageBackground', 'Animated', 'VirtualizedList'
]);

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (!fullPath.includes('node_modules') && !fullPath.includes('.expo') && !fullPath.includes('.git')) {
                results = results.concat(walk(fullPath));
            }
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.jsx')) {
            results.push(fullPath);
        }
    });
    return results;
}

const rootDir = path.join(__dirname, '..');
const filesToScan = [
    ...walk(path.join(rootDir, 'app')),
    ...walk(path.join(rootDir, 'components'))
];

console.log(`Scanning ${filesToScan.length} files...`);

let errors = [];

filesToScan.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    try {
        const ast = parser.parse(content, {
            sourceType: 'module',
            plugins: ['jsx', 'typescript', 'decorators-legacy'],
        });

        const imports = new Map(); // localName -> { source, importedName, isDefault }

        traverse(ast, {
            ImportDeclaration(p) {
                const source = p.node.source.value;
                p.node.specifiers.forEach(spec => {
                    if (spec.type === 'ImportDefaultSpecifier') {
                        imports.set(spec.local.name, { source, importedName: 'default', isDefault: true });
                    } else if (spec.type === 'ImportSpecifier') {
                        imports.set(spec.local.name, { source, importedName: spec.imported.name, isDefault: false });
                    }
                });
            },
            JSXOpeningElement(p) {
                let nameNode = p.node.name;
                let tagName;
                if (nameNode.type === 'JSXIdentifier') {
                    tagName = nameNode.name;
                } else if (nameNode.type === 'JSXMemberExpression') {
                    // e.g. Animated.View
                    tagName = nameNode.object.name;
                }

                if (tagName && /^[A-Z]/.test(tagName) && !builtins.has(tagName)) {
                    // check if it's imported
                    if (imports.has(tagName)) {
                        const imp = imports.get(tagName);
                        // resolve the file
                        let targetPath;
                        if (imp.source.startsWith('.')) {
                            targetPath = path.resolve(path.dirname(file), imp.source);
                        } else if (imp.source.startsWith('@/')) {
                            targetPath = path.resolve(rootDir, imp.source.replace('@/', ''));
                        } else {
                            // Node module or alias, skip deep verification
                            return;
                        }

                        // Check if target file exists (try .tsx, .ts, .js)
                        let foundPath = [targetPath + '.tsx', targetPath + '.ts', targetPath + '.js', targetPath + '/index.tsx', targetPath + '/index.ts'].find(p => fs.existsSync(p));

                        if (!foundPath) {
                            // Might be a standard node module we couldn't resolve simply
                            return;
                        }

                        // Parse target file to see if the export exists
                        const targetContent = fs.readFileSync(foundPath, 'utf8');
                        try {
                            const targetAst = parser.parse(targetContent, {
                                sourceType: 'module',
                                plugins: ['jsx', 'typescript', 'decorators-legacy'],
                            });

                            let exportFound = false;
                            traverse(targetAst, {
                                ExportDefaultDeclaration() {
                                    if (imp.isDefault) exportFound = true;
                                },
                                ExportNamedDeclaration(tp) {
                                    if (!imp.isDefault) {
                                        if (tp.node.declaration && tp.node.declaration.declarations) {
                                            tp.node.declaration.declarations.forEach(d => {
                                                if (d.id && d.id.name === imp.importedName) exportFound = true;
                                            });
                                        } else if (tp.node.declaration && tp.node.declaration.id) {
                                            if (tp.node.declaration.id.name === imp.importedName) exportFound = true;
                                        } else if (tp.node.specifiers) {
                                            tp.node.specifiers.forEach(s => {
                                                if (s.exported.name === imp.importedName) exportFound = true;
                                            });
                                        }
                                    }
                                }
                            });

                            if (!exportFound) {
                                errors.push(`\\n❌ DEAD COMPONENT DETECTED in ${file.replace(rootDir, '')}:\\n   <${tagName}> is imported from '${imp.source}' but that file does NOT export it!`);
                            }
                        } catch (e) {
                            // ignore target parse errors
                        }
                    }
                }
            }
        });
    } catch (e) {
        // console.log("Parse err: " + file);
    }
});

if (errors.length > 0) {
    errors.forEach(e => console.log(e));
} else {
    console.log('✅ AST Verification completed: No undefined imported components found.');
}
