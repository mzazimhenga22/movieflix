const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Range, Accept, Accept-Encoding, Accept-Language, User-Agent, Origin, Referer',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Type, Content-Length, Accept-Ranges, Content-Range',
};

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const jsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: {
    ...CORS_HEADERS,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

const normalizeBase64 = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return raw;

  // Support base64url (RFC 4648) by normalizing to standard base64.
  let normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  if (pad) normalized += '='.repeat(4 - pad);
  return normalized;
};

const decodeBase64 = (value) => {
  try {
    return Buffer.from(normalizeBase64(value), 'base64').toString('utf-8');
  } catch {
    throw new Error('Invalid base64 input');
  }
};

const decodeHeaders = (encoded) => {
  if (!encoded) return {};
  try {
    const parsed = JSON.parse(decodeBase64(encoded));
    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed).reduce((acc, [key, value]) => {
        if (typeof value === 'string') {
          acc[key.toLowerCase()] = value;
        }
        return acc;
      }, {});
    }
  } catch (error) {
    throw new Error('Invalid header payload');
  }
  return {};
};

const pickHeader = (incomingHeaders = {}, name) => {
  if (!incomingHeaders) return undefined;
  const lower = name.toLowerCase();
  return incomingHeaders[name] ?? incomingHeaders[lower] ?? incomingHeaders[lower.toUpperCase()];
};

const looksLikeM3U8 = (contentType, url) => {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('application/vnd.apple.mpegurl')) return true;
  if (ct.includes('application/x-mpegurl')) return true;
  if (ct.includes('audio/mpegurl')) return true;
  if (ct.includes('vnd.apple.mpegurl')) return true;
  const u = (url || '').toLowerCase();
  return u.includes('.m3u8');
};

const looksLikeM3U8Body = (buffer) => {
  try {
    if (!buffer || buffer.length < 7) return false;
    // Trim UTF-8 BOM if present.
    const start = buffer.slice(0, 3).toString('utf8');
    const offset = start === '\uFEFF' ? 3 : 0;
    const head = buffer.slice(offset, offset + 7).toString('utf8');
    return head === '#EXTM3U';
  } catch {
    return false;
  }
};

const buildProxyBase = (event) => {
  const incoming = event?.headers || {};
  const proto = pickHeader(incoming, 'x-forwarded-proto') || 'https';
  const host =
    pickHeader(incoming, 'x-forwarded-host') ||
    pickHeader(incoming, 'host') ||
    pickHeader(incoming, 'Host');
  const path = event?.path || '/.netlify/functions/m3u8-proxy';
  if (host) return `${proto}://${host}${path}`;
  return path;
};

const isAlreadyProxied = (value) => {
  if (!value) return false;
  return String(value).includes('/m3u8-proxy?url=');
};

const resolveAgainst = (raw, baseUrl) => {
  const value = String(raw || '').trim();
  if (!value) return value;

  // Leave non-http(s) URIs intact (data:, skd:, etc)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) && !/^https?:/i.test(value)) {
    return value;
  }

  if (/^https?:\/\//i.test(value)) return value;

  try {
    if (value.startsWith('//')) {
      const base = new URL(baseUrl);
      return `${base.protocol}${value}`;
    }
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
};

const makeProxyUrl = (proxyBase, absoluteUrl, rawH) => {
  if (!absoluteUrl) return absoluteUrl;
  if (isAlreadyProxied(absoluteUrl)) return absoluteUrl;

  // Use base64url to keep rewritten playlist URLs short (avoids %2F/%2B inflation).
  const b64Url = Buffer.from(absoluteUrl).toString('base64url');
  const hPart = rawH ? `&h=${encodeURIComponent(rawH)}` : '';
  return `${proxyBase}?url=${b64Url}${hPart}`;
};

const rewriteM3U8 = (m3u8Text, baseUrl, proxifyAbsoluteUrl) => {
  const lines = String(m3u8Text || '').split(/\r?\n/);

  const rewriteUriValue = (raw) => {
    const absolute = resolveAgainst(raw, baseUrl);
    if (!/^https?:/i.test(absolute)) return raw;
    return proxifyAbsoluteUrl(absolute);
  };

  const rewriteUriAttributes = (line) => {
    // Covers EXT-X-MEDIA, EXT-X-KEY, EXT-X-MAP, EXT-X-I-FRAME-STREAM-INF, etc
    return line.replace(/\bURI=("[^"]+"|'[^']+')/g, (match, quoted) => {
      const q = quoted[0];
      const inner = quoted.slice(1, -1);
      const next = rewriteUriValue(inner);
      return `URI=${q}${next}${q}`;
    });
  };

  return lines
    .map((line) => {
      const trimmed = String(line || '').trim();
      if (!trimmed) return line;

      if (trimmed.startsWith('#')) {
        if (trimmed.includes('URI=')) return rewriteUriAttributes(line);
        return line;
      }

      // Plain URI line (segment / variant playlist)
      return rewriteUriValue(trimmed);
    })
    .join('\n');
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  const method = (event.httpMethod || 'GET').toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    return {
      statusCode: 405,
      headers: {
        ...CORS_HEADERS,
        Allow: 'GET,HEAD,OPTIONS',
      },
      body: '',
    };
  }

  const encodedUrl = event.queryStringParameters?.url;
  if (!encodedUrl) {
    return jsonResponse(400, { error: 'Missing url parameter' });
  }

  let targetUrl;
  try {
    const decodedUrl = decodeBase64(encodedUrl);
    const parsed = new URL(decodedUrl);
    if (!/^https?:/.test(parsed.protocol)) {
      return jsonResponse(400, { error: 'Only http/https protocols are supported' });
    }
    targetUrl = parsed.toString();
  } catch (error) {
    return jsonResponse(400, { error: 'Invalid url parameter' });
  }

  let forwardedHeaders;
  try {
    forwardedHeaders = decodeHeaders(event.queryStringParameters?.h);
  } catch (error) {
    return jsonResponse(400, { error: 'Invalid h parameter' });
  }

  const incomingHeaders = event.headers || {};
  const headerWhitelist = ['range', 'accept', 'accept-encoding', 'accept-language', 'referer', 'origin', 'user-agent'];
  headerWhitelist.forEach((headerName) => {
    if (forwardedHeaders[headerName]) return;
    const value = pickHeader(incomingHeaders, headerName);
    if (value) {
      forwardedHeaders[headerName] = value;
    }
  });

  if (!forwardedHeaders['user-agent']) {
    forwardedHeaders['user-agent'] = DEFAULT_USER_AGENT;
  }

  let requestBody;
  if (method !== 'GET' && method !== 'HEAD' && event.body) {
    requestBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;
  }

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(targetUrl, {
      method,
      headers: forwardedHeaders,
      body: method === 'GET' || method === 'HEAD' ? undefined : requestBody,
      redirect: 'follow',
    });
  } catch (error) {
    return jsonResponse(502, { error: `Upstream request failed: ${(error && error.message) || 'unknown'}` });
  }

  const responseHeaders = { ...CORS_HEADERS };
  const passthroughHeaders = [
    'content-type',
    'content-length',
    'accept-ranges',
    'content-range',
    'cache-control',
    'etag',
    'last-modified',
    'expires',
  ];
  passthroughHeaders.forEach((headerName) => {
    const value = upstreamResponse.headers.get(headerName);
    if (value) {
      const formattedName = headerName
        .split('-')
        .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
        .join('-');
      responseHeaders[formattedName] = value;
    }
  });
  responseHeaders['X-Final-Url'] = upstreamResponse.url || targetUrl;

  if (!responseHeaders['Content-Type']) {
    responseHeaders['Content-Type'] = 'application/octet-stream';
  }

  if (method === 'HEAD') {
    return {
      statusCode: upstreamResponse.status,
      headers: responseHeaders,
      body: '',
    };
  }

  const finalUrl = upstreamResponse.url || targetUrl;
  const contentType = upstreamResponse.headers.get('content-type') || responseHeaders['Content-Type'] || '';
  const shouldRewriteByHeaders = method === 'GET' && upstreamResponse.ok && looksLikeM3U8(contentType, finalUrl);

  const buffer = Buffer.from(await upstreamResponse.arrayBuffer());
  const shouldRewriteByBody = method === 'GET' && upstreamResponse.ok && looksLikeM3U8Body(buffer);

  if (shouldRewriteByHeaders || shouldRewriteByBody) {
    const proxyBase = buildProxyBase(event);
    const rawH = event.queryStringParameters?.h;

    const text = buffer.toString('utf-8');
    const rewritten = rewriteM3U8(text, finalUrl, (absolute) => makeProxyUrl(proxyBase, absolute, rawH));
    const out = Buffer.from(rewritten, 'utf-8');

    delete responseHeaders['Content-Length'];
    responseHeaders['Content-Type'] = responseHeaders['Content-Type'] || 'application/vnd.apple.mpegurl';
    responseHeaders['Content-Length'] = String(out.length);

    return {
      statusCode: upstreamResponse.status,
      headers: responseHeaders,
      body: out.toString('base64'),
      isBase64Encoded: true,
    };
  }

  responseHeaders['Content-Length'] = responseHeaders['Content-Length'] || String(buffer.length);

  return {
    statusCode: upstreamResponse.status,
    headers: responseHeaders,
    body: buffer.toString('base64'),
    isBase64Encoded: true,
  };
};
