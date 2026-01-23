import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  createRemoteJWKSet,
  importPKCS8,
  jwtVerify,
  SignJWT,
} from 'npm:jose@5.9.6';

import { corsHeaders } from '../_shared/cors.ts';

type PlanTier = 'plus' | 'premium';

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

const PAYBILL_NUMBER = (Deno.env.get('EQUITY_PAYBILL_NUMBER') ?? Deno.env.get('PAYBILL_NUMBER') ?? '247247').trim();
const PAYBILL_ACCOUNT = (Deno.env.get('EQUITY_PAYBILL_ACCOUNT') ?? Deno.env.get('PAYBILL_ACCOUNT') ?? '480755').trim();
const PAYBILL_PROVIDER = (Deno.env.get('PAYBILL_PROVIDER') ?? 'equity').trim() || 'equity';

const AMOUNTS_KSH: Record<PlanTier, number> = {
  plus: 100,
  premium: 200,
};

function jsonResponse(payload: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function okResponse(payload: unknown) {
  return jsonResponse(payload, 200);
}

function extractBearerValue(header: string | null): string {
  const raw = String(header ?? '').trim();
  if (!raw) return '';
  if (raw.toLowerCase().startsWith('bearer ')) return raw.slice('bearer '.length).trim();
  return raw;
}

function parseFirebaseBearer(req: Request) {
  // Prefer a dedicated header so callers can still use Authorization for Supabase gateway auth.
  const firebaseHeader = req.headers.get('x-firebase-authorization');
  const firebaseToken = extractBearerValue(firebaseHeader);
  if (firebaseToken) return firebaseToken;

  return extractBearerValue(req.headers.get('authorization'));
}

async function requireFirebaseAuth(req: Request) {
  const token = parseFirebaseBearer(req);
  if (!token) throw new HttpError(401, 'Missing Firebase auth token');

  const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
    issuer: FIREBASE_ISSUER,
    audience: FIREBASE_PROJECT_ID,
  });

  const uid = (payload as any)?.user_id ?? (payload as any)?.sub;
  if (!uid) throw new HttpError(401, 'Invalid Firebase token (missing uid)');

  return { uid: String(uid) };
}

function normalizeReceiptCode(raw: unknown): string {
  const v = String(raw ?? '').trim().toUpperCase();
  if (!v) throw new HttpError(400, 'receiptCode is required');
  if (!/^[A-Z0-9]{10}$/.test(v)) {
    throw new HttpError(400, 'Invalid receiptCode. Expected 10 characters (letters/numbers), e.g. QRTSITS25S');
  }
  return v;
}

function normalizeTier(raw: unknown): PlanTier {
  const v = String(raw ?? '').toLowerCase().trim();
  if (v === 'plus' || v === 'premium') return v;
  throw new HttpError(400, 'Invalid tier. Expected plus or premium.');
}

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function readServiceAccount(): ServiceAccount {
  const json = (
    Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') ??
    Deno.env.get('FIREBASE_SERVICE_ACCOUNT') ??
    ''
  ).trim();
  const b64 = (Deno.env.get('FIREBASE_SERVICE_ACCOUNT_BASE64') ?? '').trim();

  const raw = json || (b64 ? atob(b64) : '');
  if (!raw) {
    throw new HttpError(
      500,
      'Server misconfigured: set FIREBASE_SERVICE_ACCOUNT_JSON/FIREBASE_SERVICE_ACCOUNT_BASE64 to write receipts',
    );
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(500, 'Invalid Firebase service account JSON');
  }

  const project_id = String(parsed?.project_id ?? '').trim();
  const client_email = String(parsed?.client_email ?? '').trim();
  const private_key = String(parsed?.private_key ?? '').trim();
  if (!project_id || !client_email || !private_key) {
    throw new HttpError(500, 'Invalid Firebase service account JSON (missing project_id/client_email/private_key)');
  }

  return { project_id, client_email, private_key };
}

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
let cachedAccess:
  | {
      token: string;
      expiresAtMs: number;
    }
  | null = null;

async function getGoogleAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Date.now();
  if (cachedAccess && now < cachedAccess.expiresAtMs - 60_000) return cachedAccess.token;

  const key = await importPKCS8(sa.private_key, 'RS256');
  const iat = Math.floor(now / 1000);
  const exp = iat + 3600;

  const assertion = await new SignJWT({
    scope: FIRESTORE_SCOPE,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(OAUTH_TOKEN_URL)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(key);

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const raw = await res.text().catch(() => '');
  if (!res.ok) {
    throw new HttpError(502, `Google OAuth token request failed (HTTP ${res.status}): ${raw.slice(0, 200)}`);
  }

  let json: any;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = {};
  }

  const token = String(json?.access_token ?? '').trim();
  const expiresInSec = Number(json?.expires_in ?? 3600);
  if (!token) throw new HttpError(502, 'Google OAuth token response missing access_token');

  cachedAccess = {
    token,
    expiresAtMs: now + Math.max(60, Math.min(3600, Number.isFinite(expiresInSec) ? expiresInSec : 3600)) * 1000,
  };
  return token;
}

function firestoreDocName(projectId: string, collection: string, docId: string) {
  const cleanCollection = String(collection).trim().replace(/^\/+|\/+$/g, '');
  const cleanDocId = encodeURIComponent(String(docId).trim());
  return `projects/${projectId}/databases/(default)/documents/${cleanCollection}/${cleanDocId}`;
}

function fsString(v: string) {
  return { stringValue: v };
}

function fsInt(v: number) {
  return { integerValue: String(Math.trunc(v)) };
}

function fsBool(v: boolean) {
  return { booleanValue: v };
}

async function firestoreCommit(projectId: string, accessToken: string, body: any) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text().catch(() => '');
  if (res.ok) {
    return raw ? JSON.parse(raw) : {};
  }

  // Surface common conflict/precondition errors as 409.
  if (res.status === 409) {
    throw new HttpError(409, 'This receipt code has already been used');
  }

  throw new HttpError(502, `Firestore commit failed (HTTP ${res.status}): ${raw.slice(0, 200)}`);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    if (!PAYBILL_NUMBER || !PAYBILL_ACCOUNT) {
      throw new HttpError(500, 'Server misconfigured: PAYBILL_NUMBER/PAYBILL_ACCOUNT missing');
    }

    const auth = await requireFirebaseAuth(req);
    const body = await req.json().catch(() => ({} as any));

    const tier = normalizeTier(body?.tier);
    const receiptCode = normalizeReceiptCode(body?.receiptCode);
    const amount = AMOUNTS_KSH[tier];

    const sa = readServiceAccount();
    const accessToken = await getGoogleAccessToken(sa);
    const projectId = sa.project_id;

    const receiptDoc = firestoreDocName(projectId, 'payment_receipts', receiptCode);
    const userDoc = firestoreDocName(projectId, 'users', auth.uid);

    await firestoreCommit(projectId, accessToken, {
      writes: [
        {
          update: {
            name: receiptDoc,
            fields: {
              receiptCode: fsString(receiptCode),
              type: fsString('plan'),
              status: fsString('submitted'),
              provider: fsString(PAYBILL_PROVIDER),
              paybill: fsString(PAYBILL_NUMBER),
              account: fsString(PAYBILL_ACCOUNT),
              userId: fsString(auth.uid),
              tier: fsString(tier),
              currency: fsString('KES'),
              amount: fsInt(amount),
            },
          },
          currentDocument: { exists: false },
          updateTransforms: [
            { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
            { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
            { fieldPath: 'submittedAt', setToServerValue: 'REQUEST_TIME' },
          ],
        },
        {
          update: {
            name: userDoc,
            fields: {
              subscription: {
                mapValue: {
                  fields: {
                    pending: fsBool(true),
                    tier: fsString(tier),
                    amountKSH: fsInt(amount),
                    currency: fsString('KES'),
                    source: fsString('paybill'),
                    provider: fsString(PAYBILL_PROVIDER),
                    paybill: fsString(PAYBILL_NUMBER),
                    account: fsString(PAYBILL_ACCOUNT),
                    receiptCode: fsString(receiptCode),
                    status: fsString('pending_verification'),
                  },
                },
              },
            },
          },
          updateMask: {
            fieldPaths: [
              'subscription.pending',
              'subscription.tier',
              'subscription.amountKSH',
              'subscription.currency',
              'subscription.source',
              'subscription.provider',
              'subscription.paybill',
              'subscription.account',
              'subscription.receiptCode',
              'subscription.status',
              'subscription.updatedAt',
            ],
          },
          updateTransforms: [{ fieldPath: 'subscription.updatedAt', setToServerValue: 'REQUEST_TIME' }],
        },
      ],
    });

    return okResponse({ ok: true, tier, amount, receiptCode, alreadySubmitted: false });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : String(err);
    console.error('[paybill-lite] error', err);
    return jsonResponse({ error: message }, status);
  }
});
