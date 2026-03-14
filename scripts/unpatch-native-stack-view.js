/**
 * unpatch-native-stack-view.js
 * Removes the debug patch from NativeStackView.native.js.
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(
    __dirname, '..',
    'node_modules/@react-navigation/native-stack/lib/module/views/NativeStackView.native.js'
);

let src = fs.readFileSync(filePath, 'utf8');

if (!src.includes('[NativeStackView-DBG]')) {
    console.log('File is already clean — no patch found.');
    process.exit(0);
}

// Remove the debug injection block
const debugStart = src.indexOf('\n        // [NativeStackView-DBG] START');
const debugEnd = src.indexOf('// [NativeStackView-DBG] END') + '// [NativeStackView-DBG] END'.length;
if (debugStart === -1 || debugEnd === -1) {
    console.error('Could not find debug block boundaries');
    process.exit(1);
}

// Remove the block (include the trailing newline)
const cleaned = src.slice(0, debugStart) + src.slice(debugEnd);
fs.writeFileSync(filePath, cleaned, 'utf8');
console.log('✅ Unpatched NativeStackView.native.js');
