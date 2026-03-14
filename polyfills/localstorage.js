/**
 * Global localStorage no-op polyfill for React Native
 * Prevents crashes in third-party libraries that expect a browser-like environment.
 * For actual persistence, use @react-native-async-storage/async-storage.
 */

const noop = () => null;

const localStorageMock = {
    getItem: noop,
    setItem: noop,
    removeItem: noop,
    clear: noop,
    length: 0,
    key: noop,
};

if (typeof globalThis !== 'undefined') {
    if (typeof globalThis.localStorage === 'undefined') {
        globalThis.localStorage = localStorageMock;
    }
}

if (typeof window !== 'undefined') {
    if (typeof window.localStorage === 'undefined') {
        window.localStorage = localStorageMock;
    }
}

export default localStorageMock;
