/**
 * patch-react-create-element.js
 * Injects a check into React to catch 'undefined' types exactly when they
 * are created via JSX or createElement, logging a stack trace.
 */
const fs = require('fs');
const path = require('path');

const reactPath = path.join(__dirname, '..', 'node_modules/react/cjs/react.development.js');
let src = fs.readFileSync(reactPath, 'utf8');

if (src.includes('// [JSX-DBG]')) {
    console.log('React is already patched.');
    process.exit(0);
}

// We want to patch the start of createElement and jsxWithValidation
const patchStr = `
  // [JSX-DBG] START
  if (type === undefined) {
    console.error("\\n\\n🔥🔥🔥 CRITICAL ERROR: React element created with undefined type!\\n" +
      "Props: " + JSON.stringify(Object.keys(props || Object.keys(config || {}))) + "\\n" +
      "Stack trace:\\n" + new Error().stack + "\\n\\n");
  }
  // [JSX-DBG] END
`;

let patched = src;

// Patch createElement
const ceTarget = 'function createElement(type, config, children) {';
if (patched.includes(ceTarget)) {
    patched = patched.replace(ceTarget, ceTarget + patchStr);
}

// Patch jsx DEV builder
const jsxTarget = 'function jsxWithValidation(type, props, key, isStaticChildren, source, self) {';
if (patched.includes(jsxTarget)) {
    patched = patched.replace(jsxTarget, jsxTarget + patchStr);
}

// Patch jsx PROD builder just in case
const jsxProdTarget = 'function jsx(type, config, maybeKey) {';
if (patched.includes(jsxProdTarget)) {
    patched = patched.replace(jsxProdTarget, jsxProdTarget + patchStr);
}

if (patched !== src) {
    fs.writeFileSync(reactPath, patched, 'utf8');
    console.log('✅ Patched React to catch undefined elements at creation time');
} else {
    console.error('❌ Could not find target functions in react.development.js');
}
