/**
 * Universal Node.js Stub for React Native
 * Bypasses all property access and method calls to prevent bundling/runtime crashes
 * for Node-specific modules that are not actually used in the mobile environment.
 */

const noop = () => { };
const emptyObj = {};
const emptyArr = [];

const handler = {
    get: function (target, prop) {
        if (prop === 'Symbol(Symbol.asyncIterator)') return undefined;
        if (prop === 'Symbol(Symbol.iterator)') return undefined;
        if (prop === '__esModule') return true;
        if (prop === 'default') return proxy;

        // Return the proxy itself for any property access (chainable)
        return proxy;
    },
    apply: function () {
        // Return empty values for function calls
        return undefined;
    },
    construct: function () {
        return proxy;
    }
};

const proxy = new Proxy(noop, handler);

module.exports = proxy;
module.exports.default = proxy;
