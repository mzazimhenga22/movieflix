const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver = {
  ...config.resolver,
  unstable_enablePackageExports: true,
  extraNodeModules: {
    ...config.resolver?.extraNodeModules,
    'form-data': path.resolve(__dirname, 'polyfills/form-data.js'),
    url: path.resolve(__dirname, 'polyfills/url.js'),
    stream: path.resolve(__dirname, 'node_modules/readable-stream'),
    'node:stream': path.resolve(__dirname, 'node_modules/readable-stream'),
    // Cheerio's default entry imports undici (Node-only). Slim build avoids that.
    cheerio: path.resolve(__dirname, 'node_modules/cheerio/dist/esm/slim.js'),
    // Provide common Node core polyfills for libraries that use node: specifiers.
    events: path.resolve(__dirname, 'node_modules/events'),
    'node:events': path.resolve(__dirname, 'node_modules/events'),
    buffer: path.resolve(__dirname, 'node_modules/buffer'),
    'node:buffer': path.resolve(__dirname, 'node_modules/buffer'),
    process: path.resolve(__dirname, 'node_modules/process'),
    'node:process': path.resolve(__dirname, 'node_modules/process'),
    util: path.resolve(__dirname, 'node_modules/util'),
    'node:util': path.resolve(__dirname, 'node_modules/util'),
    'node:url': path.resolve(__dirname, 'polyfills/url.js'),
    assert: path.resolve(__dirname, 'node_modules/assert'),
    'node:assert': path.resolve(__dirname, 'node_modules/assert'),
  },
};

module.exports = config;
