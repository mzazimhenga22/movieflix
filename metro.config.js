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
  // Fix for react-native-webrtc importing "event-target-shim/index"
  if (moduleName === 'event-target-shim/index') {
    return context.resolveRequest(context, 'event-target-shim', platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

config.resolver = {
  ...config.resolver,
  unstable_enablePackageExports: true,
  resolveRequest: customResolveRequest,
  extraNodeModules: {
    ...config.resolver?.extraNodeModules,
    'form-data': path.resolve(__dirname, 'polyfills/form-data.js'),
    'url': path.resolve(__dirname, 'polyfills/url.js'),
    'stream': path.resolve(__dirname, 'node_modules/readable-stream'),
    'node:stream': path.resolve(__dirname, 'node_modules/readable-stream'),
  },
};

module.exports = config;
