/**
 * patch-native-stack-view.js
 * Temporarily adds debug logging to NativeStackView.native.js to identify 
 * which route's component is undefined at render time.
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(
    __dirname, '..',
    'node_modules/@react-navigation/native-stack/lib/module/views/NativeStackView.native.js'
);

let src = fs.readFileSync(filePath, 'utf8');

const target = 'const descriptor = descriptors[route.key] ?? preloadedDescriptors[route.key];';

if (!src.includes(target)) {
    console.error('❌ Target pattern not found in NativeStackView.native.js');
    process.exit(1);
}

// Only patch once
if (src.includes('[NativeStackView-DBG]')) {
    console.log('Already patched. No changes made.');
    process.exit(0);
}

const injection = `
        // [NativeStackView-DBG] START
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          const _d = descriptors[route.key] ?? preloadedDescriptors[route.key];
          if (!_d) {
            console.error('[NativeStackView-DBG] MISSING DESCRIPTOR for route:', route.name, route.key);
          } else {
            try {
              const _rendered = _d.render();
              if (_rendered && !_rendered.type) {
                console.error('[NativeStackView-DBG] NULL TYPE for route:', route.name, 'type:', _rendered.type);
              } else {
                console.log('[NativeStackView-DBG] route OK:', route.name, 'type:', typeof (_rendered && _rendered.type));
              }
            } catch (e) {
              console.error('[NativeStackView-DBG] RENDER ERROR for route:', route.name, String(e));
            }
          }
        }
        // [NativeStackView-DBG] END
`;

const patched = src.replace(target, injection + '\n        ' + target);
fs.writeFileSync(filePath, patched, 'utf8');
console.log('✅ Patched NativeStackView.native.js');
