/**
 * patch-react-fabric.js
 * Injects a small DEV check into ReactFabric-dev.js to throw a highly detailed
 * error when `createFiberFromTypeAndProps` receives an undefined type, showing
 * EXACTLY where it came from by capturing the error stack there.
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(
    __dirname, '..',
    'node_modules/react-native/Libraries/Renderer/implementations/ReactFabric-dev.js'
);

let src = fs.readFileSync(filePath, 'utf8');

if (src.includes('// [ReactFabric-DBG]')) {
    console.log('ReactFabric already patched.');
    process.exit(0);
}

const targetLine = 'function createFiberFromTypeAndProps(\n      type,\n      key,\n      pendingProps,\n      owner,\n      mode,\n      lanes\n    ) {';
const replacement = targetLine + `
      // [ReactFabric-DBG] START
      if (type === undefined) {
        let errStr = "UNKNOWN_SOURCE";
        try {
          throw new Error("Tracing undefined component");
        } catch(e) {
          errStr = e.stack;
        }
        console.error("\\n\\n🔥🔥🔥 CRITICAL ERROR: Attempted to create a fiber with undefined type!\\n" + 
          "This means you rendered <UndefinedComponent /> somewhere.\\n" + 
          "Props passed were: " + JSON.stringify(Object.keys(pendingProps || {})) + "\\n" +
          "Stack trace:\\n" + errStr + "\\n\\n");
      }
      // [ReactFabric-DBG] END
`;

if (!src.includes(targetLine)) {
    console.error('Could not find target function in ReactFabric-dev.js');
    process.exit(1);
}

const patched = src.replace(targetLine, replacement);
fs.writeFileSync(filePath, patched, 'utf8');
console.log('✅ Patched ReactFabric-dev.js to trace undefined component renders');
