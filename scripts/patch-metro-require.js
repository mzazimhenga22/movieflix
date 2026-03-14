/**
 * patch-metro-require.js
 * Injects a check into Metro's require.js polyfill to trace when a module
 * exports undefined, or when its default export is undefined.
 */
const fs = require('fs');
const path = require('path');

const metroRequirePath = path.join(__dirname, '..', 'node_modules/metro-runtime/src/polyfills/require.js');
let src = fs.readFileSync(metroRequirePath, 'utf8');

if (src.includes('// [METRO-DBG]')) {
    console.log('Metro require is already patched.');
    process.exit(0);
}

// target in metroRequire
const targetFn = 'function metroRequire(moduleId) {';
if (!src.includes(targetFn)) {
    console.error('Could not find metroRequire in ' + metroRequirePath);
    process.exit(1);
}

const patchStr = `
  // [METRO-DBG] START
  var _res = originalRequire ? originalRequire(moduleId) : module.exports;
  if (_res && typeof _res === 'object' && ('default' in _res) && _res.default === undefined) {
    console.error("\\n\\n🔥🔥🔥 CRITICAL ERROR: Module " + moduleId + " has an explicit default export that is undefined!\\n" +
      "This often happens due to circular dependencies or missing imports in that file.\\n" +
      "Stack:\\n" + new Error().stack + "\\n\\n");
  }
  return _res;
  // [METRO-DBG] END
`;

// Replace the return module.exports at the end of metroRequire
// Function ends roughly with:
// if (hasura && ...) return module.exports;
// return module.exports;

let patched = src.replace(/return module\.exports;\s*\}\s*metroRequire\.ImportBegin/, patchStr + '\n} metroRequire.ImportBegin');

if (patched === src) {
    // Try another common pattern
    patched = src.replace(/return module\.exports;\s*\}/, patchStr + '\n}');
}

if (patched !== src) {
    fs.writeFileSync(metroRequirePath, patched, 'utf8');
    console.log('✅ Patched metroRequire to catch undefined exports');
} else {
    console.error('❌ Could not patch metroRequire');
}
