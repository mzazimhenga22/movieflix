import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.9.6';
import { cert, getApps, initializeApp } from 'npm:firebase-admin/app';
import { getAuth } from 'npm:firebase-admin/auth';
import { getFirestore } from 'npm:firebase-admin/firestore';

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

function randomCode(len: number) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < len; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

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

function initAdminApp() {
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
    throw new HttpError(500, 'Invalid Firebase service account JSON (expected Admin SDK service account key)');
  }

  // firebase-admin expects a service account key JSON with top-level `project_id`, `client_email`, `private_key`, etc.
  // If you accidentally paste google-services.json, it will not work here.
  if (!credentials || typeof credentials.project_id !== 'string' || !credentials.project_id.trim()) {
    const maybeGoogleServicesProjectId =
      credentials?.project_info && typeof credentials.project_info.project_id === 'string'
        ? String(credentials.project_info.project_id)
        : '';

    throw new HttpError(
      500,
      maybeGoogleServicesProjectId
        ? 'Invalid Firebase Admin credentials: looks like google-services.json was provided. Use a Firebase Admin SDK service account key JSON (must include top-level "project_id").'
        : 'Invalid Firebase Admin credentials: missing top-level "project_id". Use a Firebase Admin SDK service account key JSON.',
    );
  }

  return getApps()[0] ?? initializeApp({ credential: cert(credentials as Record<string, unknown>) });
}

const COLLECTION = 'tvLoginSessions';
const SESSION_TTL_MS = 5 * 60 * 1000;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'POST,OPTIONS' });

  try {
    const body = await req.json().catch(() => ({} as any));
    const action = String(body?.action ?? '').trim();

    const code = String(body?.code ?? '').trim().toUpperCase();
    const nonce = String(body?.nonce ?? '').trim();

    const app = initAdminApp();
    const db = getFirestore(app);
    const adminAuth = getAuth(app);

    if (action === 'create') {
      const createdAt = Date.now();
      const expiresAt = createdAt + SESSION_TTL_MS;

      const sessionCode = randomCode(8);
      const sessionNonce = crypto.randomUUID();

      await db.collection(COLLECTION).doc(sessionCode).set({
        code: sessionCode,
        nonce: sessionNonce,
        createdAt,
        expiresAt,
        status: 'pending',
        approvedUid: null,
        approvedAt: null,
        claimedAt: null,
      });

      return jsonResponse({
        code: sessionCode,
        nonce: sessionNonce,
        expiresAt,
      });
    }

    if (!code || !nonce) throw new HttpError(400, 'Missing code/nonce');
    const ref = db.collection(COLLECTION).doc(code);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, 'Session not found');
    const data = snap.data() as any;
    if (!data || data.nonce !== nonce) throw new HttpError(401, 'Invalid session');
    if (typeof data.expiresAt === 'number' && Date.now() > data.expiresAt) throw new HttpError(410, 'Session expired');

    if (action === 'approve') {
      const decoded = await requireFirebaseAuth(req);

      if (data.status === 'claimed') return jsonResponse({ ok: true, status: 'claimed' });

      await ref.set(
        {
          status: 'approved',
          approvedUid: decoded.uid,
          approvedAt: Date.now(),
        },
        { merge: true },
      );

      return jsonResponse({ ok: true, status: 'approved' });
    }

    if (action === 'claim') {
      if (data.status !== 'approved' || !data.approvedUid) {
        return jsonResponse({ ok: true, status: data.status ?? 'pending' });
      }
      if (data.claimedAt) return jsonResponse({ ok: true, status: 'claimed' });

      const customToken = await adminAuth.createCustomToken(String(data.approvedUid));
      await ref.set({ status: 'claimed', claimedAt: Date.now() }, { merge: true });

      return jsonResponse({ ok: true, status: 'claimed', customToken });
    }

    throw new HttpError(400, 'Unknown action');
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 500;
    const message = err?.message ? String(err.message) : 'Server error';
    return jsonResponse({ error: message }, status);
  }
});
