import { Buffer } from 'buffer';

declare global {
  var Buffer: typeof Buffer;
}

if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
} else {
  globalThis.Buffer = Buffer;
}

if (typeof globalThis.atob === 'undefined') {
  globalThis.atob = (data: string) => Buffer.from(data, 'base64').toString('binary');
}

if (typeof globalThis.btoa === 'undefined') {
  globalThis.btoa = (data: string) => Buffer.from(data, 'binary').toString('base64');
}

export {};
