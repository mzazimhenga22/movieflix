import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SignJWT, createRemoteJWKSet, jwtVerify, importPKCS8 } from 'npm:jose@5.9.6';

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

const CUSTOM_TOKEN_AUD = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
const SESSION_TTL_MS = 5 * 60 * 1000;

const jsonResponse = (payload: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

function randomCode(len: number) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < len; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function parseBearer(req: Request) {
  // On the client we may need to use `authorization: Bearer <supabase anon key>` to pass Supabase gateway,
  // so the Firebase ID token can be sent via `x-firebase-authorization`.
  const header = req.headers.get('x-firebase-authorization') ?? req.headers.get('authorization') ?? '';
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

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

let cachedServiceAccount: ServiceAccount | null = null;
let cachedPrivateKey: CryptoKey | null = null;

async function getServiceAccount(): Promise<{ account: ServiceAccount; key: CryptoKey }> {
  if (cachedServiceAccount && cachedPrivateKey) return { account: cachedServiceAccount, key: cachedPrivateKey };

  const json = (
    Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON_TV') ??
    Deno.env.get('FIREBASE_SERVICE_ACCOUNT_TV') ??
    Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') ??
    Deno.env.get('FIREBASE_SERVICE_ACCOUNT') ??
    ''
  ).trim();

  const b64 = (
    Deno.env.get('FIREBASE_SERVICE_ACCOUNT_BASE64_TV') ??
    Deno.env.get('FIREBASE_SERVICE_ACCOUNT_BASE64') ??
    ''
  ).trim();

  if (!json && !b64) {
    throw new HttpError(
      500,
      'Missing Firebase service account env (FIREBASE_SERVICE_ACCOUNT_JSON_TV/BASE64_TV or FIREBASE_SERVICE_ACCOUNT_JSON/BASE64)',
    );
  }

  const raw = json || atob(b64);
  let credentials: any;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new HttpError(500, 'Invalid Firebase service account JSON');
  }

  if (!credentials?.project_id || !credentials?.client_email || !credentials?.private_key) {
    throw new HttpError(500, 'Invalid Firebase service account JSON: missing project_id/client_email/private_key');
  }

  const account: ServiceAccount = {
    project_id: String(credentials.project_id),
    client_email: String(credentials.client_email),
    private_key: String(credentials.private_key),
  };

  // firebase private_key is PKCS8 PEM
  const key = await importPKCS8(account.private_key, 'RS256');

  cachedServiceAccount = account;
  cachedPrivateKey = key;
  return { account, key };
}

function getSupabaseAdmin() {
  const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').trim();
  const SUPABASE_SERVICE_ROLE_KEY = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new HttpError(500, 'Server misconfigured: missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function createFirebaseCustomToken(uid: string) {
  const { account, key } = await getServiceAccount();
  const now = Math.floor(Date.now() / 1000);

  return await new SignJWT({ uid })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + 60 * 60)
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience(CUSTOM_TOKEN_AUD)
    .sign(key);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'POST,OPTIONS' });

  try {
    const body = await req.json().catch(() => ({} as any));
    const action = String(body?.action ?? '').trim();

    const code = String(body?.code ?? '').trim().toUpperCase();
    const nonce = String(body?.nonce ?? '').trim();

    const supabaseAdmin = getSupabaseAdmin();

    if (action === 'create') {
      const createdAtMs = Date.now();
      const expiresAtMs = createdAtMs + SESSION_TTL_MS;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const sessionCode = randomCode(8);
        const sessionNonce = crypto.randomUUID();

        const { error } = await supabaseAdmin.from('tv_login_sessions').insert({
          code: sessionCode,
          nonce: sessionNonce,
          created_at_ms: createdAtMs,
          expires_at_ms: expiresAtMs,
          status: 'pending',
          approved_uid: null,
          approved_at_ms: null,
          claimed_at_ms: null,
        });

        if (!error) {
          return jsonResponse({ code: sessionCode, nonce: sessionNonce, expiresAt: expiresAtMs });
        }

        // 23505 = unique_violation (code collision) → retry
        const pg = (error as any)?.code;
        if (pg !== '23505') {
          if (pg === '42P01') {
            throw new HttpError(
              500,
              'Missing tv_login_sessions table. Create it using supabase/functions/tv-login/schema.sql',
            );
          }
          throw new HttpError(500, `Failed to create session: ${error.message}`);
        }
      }

      throw new HttpError(503, 'Failed to allocate a unique session code. Try again.');
    }

    if (!code || !nonce) throw new HttpError(400, 'Missing code/nonce');

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('tv_login_sessions')
      .select('*')
      .eq('code', code)
      .maybeSingle();

    if (sessionError) {
      const pg = (sessionError as any)?.code;
      if (pg === '42P01') {
        throw new HttpError(500, 'Missing tv_login_sessions table. Create it using supabase/functions/tv-login/schema.sql');
      }
      throw new HttpError(500, `Failed to load session: ${sessionError.message}`);
    }
    if (!session) throw new HttpError(404, 'Session not found');
    if (String((session as any).nonce) !== nonce) throw new HttpError(401, 'Invalid session');
    if (typeof (session as any).expires_at_ms === 'number' && Date.now() > Number((session as any).expires_at_ms)) {
      throw new HttpError(410, 'Session expired');
    }

    const status = String((session as any).status ?? 'pending');

    if (action === 'approve') {
      const decoded = await requireFirebaseAuth(req);

      if (status === 'claimed') return jsonResponse({ ok: true, status: 'claimed' });

      const { error } = await supabaseAdmin
        .from('tv_login_sessions')
        .update({ status: 'approved', approved_uid: decoded.uid, approved_at_ms: Date.now() })
        .eq('code', code)
        .eq('nonce', nonce);

      if (error) throw new HttpError(500, `Failed to approve: ${error.message}`);
      return jsonResponse({ ok: true, status: 'approved' });
    }

    if (action === 'claim') {
      if (status !== 'approved' || !(session as any).approved_uid) {
        return jsonResponse({ ok: true, status });
      }
      if ((session as any).claimed_at_ms) return jsonResponse({ ok: true, status: 'claimed' });

      const customToken = await createFirebaseCustomToken(String((session as any).approved_uid));

      const { error } = await supabaseAdmin
        .from('tv_login_sessions')
        .update({ status: 'claimed', claimed_at_ms: Date.now() })
        .eq('code', code)
        .eq('nonce', nonce)
        .is('claimed_at_ms', null);

      if (error) throw new HttpError(500, `Failed to claim: ${error.message}`);
      return jsonResponse({ ok: true, status: 'claimed', customToken });
    }

    throw new HttpError(400, 'Unknown action');
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 500;
    const message = err?.message ? String(err.message) : 'Server error';
    return jsonResponse({ error: message }, status);
  }
});
