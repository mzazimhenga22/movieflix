/**
 * URL and url module polyfill for React Native
 * Required for p-stream providers compatibility
 */

// Polyfill URL.parse on the global URL constructor
if (typeof globalThis.URL !== 'undefined') {
  const URLClass = globalThis.URL;

  if (typeof URLClass.parse !== 'function') {
    URLClass.parse = function (input, base) {
      try {
        const url = base ? new URLClass(input, base) : new URLClass(input);

        return {
          href: url.href,
          protocol: url.protocol,
          slashes: true,
          auth: null,
          host: url.host,
          port: url.port,
          hostname: url.hostname,
          hash: url.hash,
          search: url.search,
          query: Object.fromEntries(url.searchParams.entries()),
          pathname: url.pathname,
          path: url.pathname + url.search,
          origin: url.origin,
        };
      } catch (error) {
        return null;
      }
    };
  }
}

// Polyfill the Node.js url module
const urlModule = {
  parse: function(urlString, parseQueryString, slashesDenoteHost) {
    try {
      const url = new URL(urlString);

      const result = {
        href: url.href,
        protocol: url.protocol,
        slashes: true,
        auth: null,
        host: url.host,
        port: url.port,
        hostname: url.hostname,
        hash: url.hash,
        search: url.search,
        query: parseQueryString ? Object.fromEntries(url.searchParams.entries()) : url.search.slice(1),
        pathname: url.pathname,
        path: url.pathname + url.search,
        origin: url.origin,
      };

      return result;
    } catch (error) {
      // Return a basic object for invalid URLs
      return {
        href: urlString,
        protocol: null,
        slashes: null,
        auth: null,
        host: null,
        port: null,
        hostname: null,
        hash: null,
        search: null,
        query: parseQueryString ? {} : null,
        pathname: urlString,
        path: urlString,
        origin: null,
      };
    }
  },

  format: function(urlObject) {
    try {
      if (typeof urlObject === 'string') {
        return urlObject;
      }

      const url = new URL(urlObject.href || '');

      if (urlObject.protocol) url.protocol = urlObject.protocol;
      if (urlObject.hostname) url.hostname = urlObject.hostname;
      if (urlObject.port) url.port = urlObject.port;
      if (urlObject.pathname) url.pathname = urlObject.pathname;
      if (urlObject.search) url.search = urlObject.search;
      if (urlObject.hash) url.hash = urlObject.hash;

      return url.href;
    } catch (error) {
      return urlObject.href || '';
    }
  },

  resolve: function(from, to) {
    try {
      return new URL(to, from).href;
    } catch (error) {
      return to;
    }
  }
};

module.exports = urlModule;
