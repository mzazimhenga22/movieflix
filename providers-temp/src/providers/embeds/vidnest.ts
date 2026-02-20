import { flags } from '@/entrypoint/utils/targets';
import { makeEmbed } from '@/providers/base';
import { HlsBasedStream } from '@/providers/streams';
import { NotFoundError } from '@/utils/errors';
import { Buffer } from 'buffer';
import { gcm } from '@noble/ciphers/aes.js';

const PASSPHRASE = 'T8c8PQlSQVU4mBuW4CbE/g57VBbM5009QHd+ym93aZZ5pEeVpToY6OdpYPvRMVYp';

async function decryptVidnestData(encryptedBase64: string): Promise<any> {
  try {
    const encryptedBytes = Buffer.from(encryptedBase64, 'base64');
    const iv = encryptedBytes.subarray(0, 12);
    const ciphertext = encryptedBytes.subarray(12, -16);
    const tag = encryptedBytes.subarray(-16);

    const payload = new Uint8Array(ciphertext.length + tag.length);
    payload.set(ciphertext, 0);
    payload.set(tag, ciphertext.length);

    const key = Buffer.from(PASSPHRASE, 'base64').subarray(0, 32);
    const cipher = gcm(key, iv);
    const decryptedBytes = cipher.decrypt(payload);
    const decryptedText = Buffer.from(decryptedBytes).toString('utf-8');

    return JSON.parse(decryptedText);
  } catch (error) {
    throw new NotFoundError('Failed to decrypt data');
  }
}

export const vidnestHollymoviehdEmbed = makeEmbed({
  id: 'vidnest-hollymoviehd',
  name: 'Vidnest HollyMovie',
  rank: 104,
  flags: [],
  disabled: false,
  async scrape(ctx) {
    const response = await ctx.proxiedFetcher<any>(ctx.url);
    if (!response.data) throw new NotFoundError('No encrypted data found');

    const decryptedData = await decryptVidnestData(response.data);
    if (!decryptedData.success && !decryptedData.sources) throw new NotFoundError('No streams found');

    const sources = decryptedData.sources || decryptedData.streams;
    const streams: HlsBasedStream[] = [];

    const streamHeaders = {
      Origin: 'https://flashstream.cc',
      Referer: 'https://flashstream.cc/',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    for (const source of sources) {
      if (source.file && (source.file.includes('pkaystream.cc') || source.file.includes('flashstream.cc'))) {
        streams.push({
          id: `hollymoviehd-${source.label || 'default'}`,
          type: 'hls',
          playlist: source.file,
          flags: [],
          captions: [],
          headers: streamHeaders,
        } as HlsBasedStream);
      }
    }

    return {
      stream: streams,
    };
  },
});

export const vidnestAllmoviesEmbed = makeEmbed({
  id: 'vidnest-allmovies',
  name: 'Vidnest AllMovies (Hindi)',
  rank: 103,
  flags: [flags.CORS_ALLOWED],
  disabled: false,
  async scrape(ctx) {
    const response = await ctx.proxiedFetcher<any>(ctx.url);
    if (!response.data) throw new NotFoundError('No encrypted data found');

    const decryptedData = await decryptVidnestData(response.data);
    if (!decryptedData.success && !decryptedData.streams) throw new NotFoundError('No streams found');

    const sources = decryptedData.sources || decryptedData.streams;
    const streams = [];

    for (const stream of sources) {
      streams.push({
        id: `allmovies-${stream.language || 'default'}`,
        type: 'hls',
        playlist: stream.url || stream.file,
        flags: [flags.CORS_ALLOWED],
        captions: [],
        preferredHeaders: stream.headers || {},
      } as HlsBasedStream);
    }

    return {
      stream: streams,
    };
  },
});
