// Basic universal Node.js shim for react-native
module.exports = {
    // fs
    readFile: () => { },
    readFileSync: () => { },
    writeFile: () => { },
    writeFileSync: () => { },
    existsSync: () => false,
    lstatSync: () => ({ isDirectory: () => false }),
    statSync: () => ({ isDirectory: () => false }),
    mkdirSync: () => { },
    readdirSync: () => [],
    promises: {
        readFile: async () => { },
        writeFile: async () => { },
    },

    // dns
    lookup: () => { },
    resolve: () => { },

    // net / tls
    connect: () => ({ on: () => { }, once: () => { }, setNoDelay: () => { }, setKeepAlive: () => { }, end: () => { }, destroy: () => { } }),
    createServer: () => ({ listen: () => { }, on: () => { } }),
    createSecureContext: () => { },
    isIP: () => 0,

    // child_process
    spawn: () => ({ on: () => { }, stdout: { on: () => { } }, stderr: { on: () => { } } }),
    exec: () => { },
    execSync: () => { },

    // misc/diagnostics/async_hooks
    createHook: () => ({ enable: () => { }, disable: () => { } }),
    executionAsyncId: () => 0,
    triggerAsyncId: () => 0,
    channel: () => ({ subscribe: () => { }, unsubscribe: () => { } }),

    // sqlite
    DatabaseSync: class {
        constructor() { }
        prepare() { return { all: () => [], run: () => { }, get: () => ({}) }; }
        close() { }
    },

    // stream helpers
    consumers: {
        text: async () => "",
        json: async () => ({}),
        buffer: async () => Buffer.alloc(0),
        arrayBuffer: async () => new ArrayBuffer(0),
    },
};
