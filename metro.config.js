// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Limit workers for large bundle builds to prevent memory thrashing
config.maxWorkers = 2;

// Optimize transformer for large files
config.transformer = {
  ...config.transformer,
  minifierConfig: {
    keep_classnames: true,
    keep_fnames: true,
    mangle: false,
  },
};

// Custom resolver to handle problematic package imports
const customResolveRequest = (context, moduleName, platform) => {
  // Force cheerio to use slim build (avoids importing undici → node:util/types)
  if (moduleName === 'cheerio') {
    // Find where cheerio would normally resolve, then redirect to its slim build
    try {
      const cheerioDir = require.resolve('cheerio/package.json', {
        paths: [context.originModulePath ? path.dirname(context.originModulePath) : __dirname]
      });
      const cheerioRoot = path.dirname(cheerioDir);
      // Check both possible slim paths (dist/esm for newer, lib/esm for older)
      const fs = require('fs');
      const slimPaths = [
        path.join(cheerioRoot, 'dist', 'esm', 'slim.js'),
        path.join(cheerioRoot, 'lib', 'esm', 'slim.js'),
      ];
      for (const slimPath of slimPaths) {
        if (fs.existsSync(slimPath)) {
          return context.resolveRequest(context, slimPath, platform);
        }
      }
    } catch (e) {
      // Fallback: use root node_modules cheerio slim
    }
    // Fallback to root slim build
    return context.resolveRequest(context, path.resolve(__dirname, 'node_modules/cheerio/dist/esm/slim.js'), platform);
  }

  // Pro-active Node.js built-in bypass
  if (moduleName.startsWith('node:')) {
    const coreName = moduleName.replace('node:', '');
    // If we have an explicit polyfill mapping, use it
    if (config.resolver.extraNodeModules[coreName]) {
      return context.resolveRequest(context, coreName, platform);
    }
    // Otherwise, redirect to our universal stub to prevent bundling failure
    return context.resolveRequest(context, path.resolve(__dirname, 'polyfills/node-stub.js'), platform);
  }

  // Fix for react-native-webrtc importing "event-target-shim/index"
  if (moduleName === 'event-target-shim/index') {
    return context.resolveRequest(context, 'event-target-shim', platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

config.resolver = {
  ...config.resolver,
  // unstable_enablePackageExports: true, // DISABLED — causes some packages to resolve to wrong entry points, resulting in undefined components
  resolveRequest: customResolveRequest,
  extraNodeModules: {
    ...config.resolver?.extraNodeModules,
    'localstorage': path.resolve(__dirname, 'polyfills/localstorage.js'),
    'localStorage': path.resolve(__dirname, 'polyfills/localstorage.js'),
    'firebase/auth': path.resolve(__dirname, 'node_modules/firebase/auth'),
    'firebase/app': path.resolve(__dirname, 'node_modules/firebase/app'),
    'firebase/firestore': path.resolve(__dirname, 'node_modules/firebase/firestore'),
    'form-data': path.resolve(__dirname, 'polyfills/form-data.js'),
    'url': path.resolve(__dirname, 'polyfills/url.js'),
    // Cheerio's default entry imports undici (Node-only). Slim build avoids that.
    'cheerio': path.resolve(__dirname, 'node_modules/cheerio/dist/esm/slim.js'),
    'stream': path.resolve(__dirname, 'node_modules/readable-stream'),
    'node:stream': path.resolve(__dirname, 'node_modules/readable-stream'),
    'events': path.resolve(__dirname, 'node_modules/events'),
    'node:events': path.resolve(__dirname, 'node_modules/events'),
    'path': path.resolve(__dirname, 'node_modules/path-browserify'),
    'node:path': path.resolve(__dirname, 'node_modules/path-browserify'),
    'process': path.resolve(__dirname, 'node_modules/process'),
    'node:process': path.resolve(__dirname, 'node_modules/process'),
    'fs': path.resolve(__dirname, 'polyfills/fs.js'),
    'node:fs': path.resolve(__dirname, 'polyfills/fs.js'),
    'assert': path.resolve(__dirname, 'node_modules/assert'),
    'node:assert': path.resolve(__dirname, 'node_modules/assert'),
    'util': path.resolve(__dirname, 'node_modules/util'),
    'node:util': path.resolve(__dirname, 'node_modules/util'),
    'os': path.resolve(__dirname, 'node_modules/os-browserify'),
    'node:os': path.resolve(__dirname, 'node_modules/os-browserify'),
    'zlib': path.resolve(__dirname, 'node_modules/browserify-zlib'),
    'node:zlib': path.resolve(__dirname, 'node_modules/browserify-zlib'),
    'http': path.resolve(__dirname, 'node_modules/stream-http'),
    'node:http': path.resolve(__dirname, 'node_modules/stream-http'),
    'https': path.resolve(__dirname, 'node_modules/https-browserify'),
    'node:https': path.resolve(__dirname, 'node_modules/https-browserify'),
    'net': path.resolve(__dirname, 'polyfills/fs.js'), // Shim net with dummy
    'node:net': path.resolve(__dirname, 'polyfills/fs.js'),
    'tls': path.resolve(__dirname, 'polyfills/fs.js'), // Shim tls with dummy
    'node:tls': path.resolve(__dirname, 'polyfills/fs.js'),
    'crypto': path.resolve(__dirname, 'node_modules/crypto-js'), // Fallback to crypto-js
    'node:crypto': path.resolve(__dirname, 'node_modules/crypto-js'),
    'querystring': path.resolve(__dirname, 'node_modules/querystring-es3'),
    'node:querystring': path.resolve(__dirname, 'node_modules/querystring-es3'),
    'url': path.resolve(__dirname, 'polyfills/url.js'),
    'node:url': path.resolve(__dirname, 'polyfills/url.js'),
    'buffer': path.resolve(__dirname, 'node_modules/buffer'),
    'node:buffer': path.resolve(__dirname, 'node_modules/buffer'),
    'string_decoder': path.resolve(__dirname, 'node_modules/string_decoder'),
    'node:string_decoder': path.resolve(__dirname, 'node_modules/string_decoder'),
    'tty': path.resolve(__dirname, 'node_modules/tty-browserify'),
    'node:tty': path.resolve(__dirname, 'node_modules/tty-browserify'),
    'vm': path.resolve(__dirname, 'node_modules/vm-browserify'),
    'node:vm': path.resolve(__dirname, 'node_modules/vm-browserify'),
    'dns': path.resolve(__dirname, 'polyfills/fs.js'), // Shim dns with dummy
    'node:dns': path.resolve(__dirname, 'polyfills/fs.js'),
    'child_process': path.resolve(__dirname, 'polyfills/fs.js'), // Shim child_process
    'node:child_process': path.resolve(__dirname, 'polyfills/fs.js'),
    'timers': path.resolve(__dirname, 'node_modules/timers-browserify'),
    'node:timers': path.resolve(__dirname, 'node_modules/timers-browserify'),
    'punycode': path.resolve(__dirname, 'node_modules/punycode'),
    'node:punycode': path.resolve(__dirname, 'node_modules/punycode'),
    'constants': path.resolve(__dirname, 'node_modules/constants-browserify'),
    'node:constants': path.resolve(__dirname, 'node_modules/constants-browserify'),
    'cluster': path.resolve(__dirname, 'polyfills/fs.js'),
    'node:cluster': path.resolve(__dirname, 'polyfills/fs.js'),
    'dgram': path.resolve(__dirname, 'polyfills/fs.js'),
    'node:dgram': path.resolve(__dirname, 'polyfills/fs.js'),
    'diagnostics_channel': path.resolve(__dirname, 'polyfills/fs.js'),
    'node:diagnostics_channel': path.resolve(__dirname, 'polyfills/fs.js'),
    'async_hooks': path.resolve(__dirname, 'polyfills/fs.js'),
    'node:async_hooks': path.resolve(__dirname, 'polyfills/fs.js'),
    'worker_threads': path.resolve(__dirname, 'polyfills/fs.js'),
    'node:worker_threads': path.resolve(__dirname, 'polyfills/fs.js'),
    'perf_hooks': path.resolve(__dirname, 'polyfills/fs.js'),
    'node:perf_hooks': path.resolve(__dirname, 'polyfills/fs.js'),
    'module': path.resolve(__dirname, 'polyfills/fs.js'),
    'node:module': path.resolve(__dirname, 'polyfills/fs.js'),
    'v8': path.resolve(__dirname, 'polyfills/fs.js'),
    'node:v8': path.resolve(__dirname, 'polyfills/fs.js'),
    'readline': path.resolve(__dirname, 'polyfills/fs.js'),
    'node:readline': path.resolve(__dirname, 'polyfills/fs.js'),
    'repl': path.resolve(__dirname, 'polyfills/fs.js'),
    'node:repl': path.resolve(__dirname, 'polyfills/fs.js'),
    'sqlite': path.resolve(__dirname, 'polyfills/fs.js'),
    'node:sqlite': path.resolve(__dirname, 'polyfills/fs.js'),
    'domain': path.resolve(__dirname, 'node_modules/domain-browser'),
    'node:domain': path.resolve(__dirname, 'node_modules/domain-browser'),
    'http2': path.resolve(__dirname, 'polyfills/fs.js'),
    'node:http2': path.resolve(__dirname, 'polyfills/fs.js'),
    'inspector': path.resolve(__dirname, 'polyfills/fs.js'),
    'node:inspector': path.resolve(__dirname, 'polyfills/fs.js'),
    'sys': path.resolve(__dirname, 'node_modules/util'),
    'node:sys': path.resolve(__dirname, 'node_modules/util'),
    'stream/web': path.resolve(__dirname, 'node_modules/readable-stream'),
    'node:stream/web': path.resolve(__dirname, 'node_modules/readable-stream'),
    'fs/promises': path.resolve(__dirname, 'polyfills/fs.js'),
    'node:fs/promises': path.resolve(__dirname, 'polyfills/fs.js'),
    'stream/promises': path.resolve(__dirname, 'node_modules/readable-stream'),
    'node:stream/promises': path.resolve(__dirname, 'node_modules/readable-stream'),
    'stream/consumers': path.resolve(__dirname, 'node_modules/readable-stream'),
    'node:stream/consumers': path.resolve(__dirname, 'node_modules/readable-stream'),
    'timers/promises': path.resolve(__dirname, 'node_modules/timers-browserify'),
    'node:timers/promises': path.resolve(__dirname, 'node_modules/timers-browserify'),
    'util/types': path.resolve(__dirname, 'polyfills/node-stub.js'),
    'node:util/types': path.resolve(__dirname, 'polyfills/node-stub.js'),
  },
};

module.exports = config;
