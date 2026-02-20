import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.9.6';

import { corsHeaders } from '../_shared/cors.ts';

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const FIREBASE_PROJECT_ID = (Deno.env.get('FIREBASE_PROJECT_ID') ?? 'movieflixreactnative').trim();
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

const jsonResponse = (payload: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

function parseBearer(req: Request) {
  const header = req.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return '';
  return header.slice('Bearer '.length).trim();
}

async function requireFirebaseAuth(req: Request) {
  const token = parseBearer(req);
  if (!token) throw new HttpError(401, 'Missing Authorization Bearer token');

  const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
    issuer: FIREBASE_ISSUER,
    audience: FIREBASE_PROJECT_ID,
  });

  const uid = (payload as any)?.user_id ?? (payload as any)?.sub;
  if (!uid) throw new HttpError(401, 'Invalid Firebase token (missing uid)');
  return { uid: String(uid) };
}

const CLOUDFLARE_ACCOUNT_ID = (Deno.env.get('CLOUDFLARE_ACCOUNT_ID') ?? '').trim();
const CLOUDFLARE_STREAM_TOKEN =
  (Deno.env.get('CLOUDFLARE_STREAM_TOKEN') ?? Deno.env.get('CLOUDFLARE_API_TOKEN') ?? '').trim();

function requireCloudflareEnv() {
  if (!CLOUDFLARE_ACCOUNT_ID) throw new HttpError(500, 'Missing CLOUDFLARE_ACCOUNT_ID env');
  if (!CLOUDFLARE_STREAM_TOKEN) throw new HttpError(500, 'Missing CLOUDFLARE_STREAM_TOKEN env');
}

type CloudflareLiveInput = {
  uid?: string;
  rtmps?: { url?: string; streamKey?: string };
  playback?: { hls?: string | { url?: string } };
};

async function cloudflareRequest(path: string, init: RequestInit) {
  requireCloudflareEnv();
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_STREAM_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    const msg =
      (json?.errors && Array.isArray(json.errors) && json.errors[0]?.message) ||
      json?.message ||
      `Cloudflare request failed (HTTP ${res.status})`;
    throw new HttpError(502, String(msg));
  }
  return json;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'POST,OPTIONS' });

  try {
    const decoded = await requireFirebaseAuth(req);
    const body = await req.json().catch(() => ({} as any));
    const action = String(body?.action ?? '').trim();

    if (action === 'create') {
      const hostId = String(body?.hostId ?? '').trim();
      if (!hostId) throw new HttpError(400, 'Missing hostId');
      if (hostId !== decoded.uid) throw new HttpError(403, 'hostId does not match auth user');

      const name = String(body?.name ?? body?.title ?? 'MovieFlix Live').trim();

      const cf = await cloudflareRequest('/stream/live_inputs', {
        method: 'POST',
        body: JSON.stringify({
          meta: {
            name,
            hostId,
            app: 'movieflixnative',
          },
        }),
      });

      const result = (cf?.result ?? {}) as CloudflareLiveInput;
      const liveInputId = result?.uid ? String(result.uid) : '';
      if (!liveInputId) throw new HttpError(502, 'Cloudflare did not return live input id');

      const rtmpsUrl = result?.rtmps?.url ? String(result.rtmps.url) : null;
      const streamKey = result?.rtmps?.streamKey ? String(result.rtmps.streamKey) : null;

      const hlsRaw = (result as any)?.playback?.hls;
      const playbackHlsUrl = typeof hlsRaw === 'string' ? hlsRaw : hlsRaw?.url ? String(hlsRaw.url) : null;

      return jsonResponse({
        ok: true,
        liveInputId,
        rtmpsUrl,
        streamKey,
        playbackHlsUrl,
      });
    }

    if (action === 'end') {
      const hostId = String(body?.hostId ?? '').trim();
      if (!hostId) throw new HttpError(400, 'Missing hostId');
      if (hostId !== decoded.uid) throw new HttpError(403, 'hostId does not match auth user');

      const liveInputId = String(body?.liveInputId ?? '').trim();
      if (!liveInputId) throw new HttpError(400, 'Missing liveInputId');

      await cloudflareRequest(`/stream/live_inputs/${encodeURIComponent(liveInputId)}`, { method: 'DELETE' });
      return jsonResponse({ ok: true });
    }

    throw new HttpError(400, 'Unknown action');
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 500;
    const message = err?.message ? String(err.message) : 'Server error';
    return jsonResponse({ error: message }, status);
  }
});
