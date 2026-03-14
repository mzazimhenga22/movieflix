const fs = require('fs');
const path = require('path');

const reactPath = path.join(__dirname, '..', 'node_modules/react/cjs/react.development.js');
let src = fs.readFileSync(reactPath, 'utf8');

if (src.includes('// [JSX-DBG]')) {
    console.log('React is already patched.');
    process.exit(0);
}

const patchStr = `
    // [JSX-DBG] START
    if (type === undefined) {
      console.error("\\n\\n🔥🔥🔥 CRITICAL ERROR: React element created with undefined type!\\n" +
        "Props: " + JSON.stringify(Object.keys(config || {})) + "\\n" +
        "Stack trace:\\n" + new Error().stack + "\\n\\n");
    }
    // [JSX-DBG] END
`;

let patched = src.replace(
    'exports.createElement = function (type, config, children) {',
    'exports.createElement = function (type, config, children) {' + patchStr
);

if (patched !== src) {
    fs.writeFileSync(reactPath, patched, 'utf8');
    console.log('✅ Patched react.development.js');
} else {
    console.error('❌ Could not patch react.development.js');
}

// jsx-runtime
const jsxPath = path.join(__dirname, '..', 'node_modules/react/cjs/react-jsx-runtime.development.js');
if (fs.existsSync(jsxPath)) {
    let jsxSrc = fs.readFileSync(jsxPath, 'utf8');
    let patchedJsx = jsxSrc.replace(
        'function jsxDEV(type, config, maybeKey, source, self) {',
        'function jsxDEV(type, config, maybeKey, source, self) {' + patchStr
    );
    if (patchedJsx !== jsxSrc) {
        fs.writeFileSync(jsxPath, patchedJsx, 'utf8');
        console.log('✅ Patched react-jsx-runtime.development.js');
    }
}
