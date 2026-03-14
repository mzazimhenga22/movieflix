require('@babel/register')({
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    '@babel/preset-react',
    ['@babel/preset-typescript', { isTSX: true, allExtensions: true }]
  ],
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
});

const ignoreModules = ['react-native', 'expo', 'expo-router', 'react-native-reanimated', 'react-native-safe-area-context', '@react-native-async-storage/async-storage', 'expo-splash-screen', 'expo-linear-gradient', '@expo/vector-icons'];
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function() {
    if (ignoreModules.includes(arguments[0]) || arguments[0].includes('expo-') || arguments[0].startsWith('react-native')) {
        return {}; 
    }
    try {
        return originalRequire.apply(this, arguments);
    } catch (e) {
        if (e.code === 'MODULE_NOT_FOUND' || e.message.includes('Unexpected token')) return {};
        throw e;
    }
};

try {
  const index = require('../app/index.tsx');
  console.log('app/index.tsx export default type:', typeof index.default);
} catch (e) {
  console.log('error app/index.tsx:', e.message);
}

try {
  const layout = require('../app/_layout.tsx');
  console.log('app/_layout.tsx export default type:', typeof layout.default);
} catch (e) {
  console.log('error app/_layout.tsx:', e.message);
}

try {
  const tabs = require('../app/(tabs)/_layout.tsx');
  console.log('app/(tabs)/_layout.tsx export default type:', typeof tabs.default);
} catch (e) {
  console.log('error app/(tabs)/_layout.tsx:', e.message);
}

try {
  const movies = require('../app/(tabs)/movies.tsx');
  console.log('app/(tabs)/movies.tsx export default type:', typeof movies.default);
} catch (e) {
  console.log('error app/(tabs)/movies.tsx:', e.message);
}
