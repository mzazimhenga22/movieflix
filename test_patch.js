const fs = require('fs');
const path = require('path');

const indexFile = path.join('d:/movieflixnative', 'app', 'index.tsx');
let src = fs.readFileSync(indexFile, 'utf8');

if (!src.includes('// [ROOT-CATCHER]')) {
  const injection = \
// [ROOT-CATCHER] START
if (__DEV__) {
  const originalError = console.error;
  console.error = (...args) => {
    if (args.length > 0 && typeof args[0] === 'string' && args[0].includes('Element type is invalid:')) {
      originalError('\\n\\n?????? CAUGHT INVALID ELEMENT TRACE ??????\\n');
      originalError(new Error('INVALID ELEMENT TRACE').stack);
      originalError('\\n?????? END TRACE ??????\\n\\n');
    }
    originalError(...args);
  };
}
// [ROOT-CATCHER] END
\;

  // Inject after the imports
  const lines = src.split('\\n');
  const lastImportIndex = lines.reduce((acc, line, i) => line.startsWith('import ') ? i : acc, 0);
  
  lines.splice(lastImportIndex + 1, 0, injection);
  fs.writeFileSync(indexFile, lines.join('\\n'), 'utf8');
  console.log('? Injected console.error interceptor into app/index.tsx');
} else {
  console.log('Already injected.');
}
