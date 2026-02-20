/**
 * P-Stream React Native Polyfills (JavaScript)
 * -------------------------------------------
 * Fixes Node-only APIs used by providers:
 *  - Buffer
 *  - base64url encoding
 *  - URL.parse
 *  - FormData
 */

/* ===========================
   Buffer polyfill
=========================== */

const { Buffer } = require('buffer');

if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
}

/* base64url support */
const bufferProto =
  (globalThis.Buffer && globalThis.Buffer.prototype) ||
  Buffer.prototype;

if (bufferProto && !bufferProto.__base64UrlPolyfillApplied) {
  const originalToString = bufferProto.toString;

  bufferProto.toString = function (encoding, start, end) {
    if (encoding === 'base64url') {
      const base64 = originalToString.call(this, 'base64', start, end);
      return base64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    }
    return originalToString.call(this, encoding, start, end);
  };

  bufferProto.__base64UrlPolyfillApplied = true;
}

/* ===========================
   URL + URL.parse polyfill
=========================== */

// Required for React Native URL compatibility
require('react-native-url-polyfill/auto');

if (typeof globalThis.URL !== 'undefined') {
  const URLClass = globalThis.URL;

  if (typeof URLClass.parse !== 'function') {
    URLClass.parse = function (input) {
      const u = new URLClass(input);

      return {
        href: u.href,
        protocol: u.protocol,
        slashes: true,
        auth: null,
        host: u.host,
        port: u.port,
        hostname: u.hostname,
        hash: u.hash,
        search: u.search,
        query: Object.fromEntries(u.searchParams.entries()),
        pathname: u.pathname,
        path: u.pathname + u.search,
        origin: u.origin,
      };
    };
  }
}

/* ===========================
   FormData polyfill
=========================== */

/**
 * Metro shim for Node's `form-data` package.
 * Providers only check `instanceof FormData`.
 */
if (typeof globalThis.FormData === 'undefined') {
  function UnsupportedFormData() {
    throw new Error('FormData is not supported in this environment.');
  }

  globalThis.FormData = UnsupportedFormData;
}

/* ===========================
   Done
=========================== */

module.exports = {};
