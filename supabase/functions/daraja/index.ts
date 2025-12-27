import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.9.6';
import { initializeApp, cert, getApps } from 'npm:firebase-admin/app';
import { getFirestore, FieldValue } from 'npm:firebase-admin/firestore';
import type { Firestore, Transaction, DocumentReference, DocumentData } from 'firebase-admin/firestore';

import { corsHeaders } from '../_shared/cors.ts';

type PlanTier = 'plus' | 'premium';
type DarajaAction = 'stkpush' | 'query' | 'marketplace_stkpush' | 'marketplace_query';

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const FIREBASE_PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID') ?? 'movieflixreactnative';
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

const firebaseServiceAccountJson = (Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') ?? '').trim();
const firebaseServiceAccountBase64 = (Deno.env.get('FIREBASE_SERVICE_ACCOUNT_BASE64') ?? '').trim();
let adminFirestore: Firestore | null = null;

if (firebaseServiceAccountJson || firebaseServiceAccountBase64) {
  try {
    const raw = firebaseServiceAccountJson || atob(firebaseServiceAccountBase64);
    const credentials = JSON.parse(raw);
    const app = getApps()[0] ?? initializeApp({ credential: cert(credentials as Record<string, unknown>) });
    adminFirestore = getFirestore(app);
  } catch (err) {
    console.error('[daraja] failed to initialize Firebase admin SDK', err);
  }
} else {
  console.warn('[daraja] FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_BASE64 not set; secure Daraja handling disabled');
}

const env = (Deno.env.get('DARAJA_ENV') ?? 'live').toLowerCase().trim();
const baseUrl = env === 'sandbox' ? 'https://sandbox.safaricom.co.ke' : 'https://api.safaricom.co.ke';

const CONSUMER_KEY = Deno.env.get('DARAJA_CONSUMER_KEY') ?? '';
const CONSUMER_SECRET = Deno.env.get('DARAJA_CONSUMER_SECRET') ?? '';
const BUSINESS_SHORTCODE = Deno.env.get('DARAJA_BUSINESS_SHORTCODE') ?? '';
const PASSKEY = Deno.env.get('DARAJA_PASSKEY') ?? '';
const TRANSACTION_TYPE =
  (Deno.env.get('DARAJA_TRANSACTION_TYPE') ?? 'CustomerPayBillOnline').trim() || 'CustomerPayBillOnline';

const PLATFORM_WALLET_ID =
  (Deno.env.get('MARKETPLACE_PLATFORM_WALLET_ID') ?? 'movieflix-platform').trim() || 'movieflix-platform';

const WALLET_ACCOUNTS_COLLECTION = 'wallet_accounts';
const WALLET_TRANSACTIONS_COLLECTION = 'wallet_transactions';
const MARKETPLACE_ORDERS_COLLECTION = 'marketplace_orders';

const AMOUNTS_KSH: Record<PlanTier, number> = {
  plus: 100,
  premium: 200,
};

const STK_PUSH_MAX_KSH = 150_000;

const recentStkPushByUid = new Map<string, number[]>();

function rateLimitStkPush(uid: string) {
  const now = Date.now();
  const windowMs = 60_000;
  const maxPerWindow = 4;

  const existing = recentStkPushByUid.get(uid) ?? [];
  const next = existing.filter((t) => now - t < windowMs);
  if (next.length >= maxPerWindow) {
    throw new HttpError(429, 'Too many payment requests. Please wait a moment and try again.');
  }
  next.push(now);
  recentStkPushByUid.set(uid, next);
}

function jsonResponse(payload: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function okResponse(payload: unknown) {
  return jsonResponse(payload, 200);
}

function badRequest(message: string) {
  return jsonResponse({ error: message }, 400);
}

function normalizeTier(raw: unknown): PlanTier {
  const v = String(raw ?? '')
    .toLowerCase()
    .trim();
  if (v === 'plus' || v === 'premium') return v;
  throw new HttpError(400, 'Invalid tier. Expected plus or premium.');
}

function normalizeAmountKsh(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new HttpError(400, 'Amount must be a number');
  const amount = Math.round(n);
  if (amount <= 0) throw new HttpError(400, 'Amount must be greater than zero');
  if (amount > STK_PUSH_MAX_KSH) throw new HttpError(400, `Amount is too high (max ${STK_PUSH_MAX_KSH} KSh)`);
  return amount;
}

function normalizeReference(raw: unknown, fallback: string) {
  const v = (String(raw ?? '').trim() || fallback).slice(0, 64);
  if (!v) throw new HttpError(400, 'accountReference is required');
  return v;
}

function normalizeDesc(raw: unknown, fallback: string) {
  const v = (String(raw ?? '').trim() || fallback).slice(0, 64);
  if (!v) throw new HttpError(400, 'transactionDesc is required');
  return v;
}

function normalizeOrderDocId(raw: unknown) {
  const v = String(raw ?? '').trim();
  if (!v) throw new HttpError(400, 'orderDocId is required');
  return v;
}

function normalizePhone(raw: unknown): string {
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/[\s-]/g, '')
    .replace(/^\+/, '');

  if (!cleaned) throw new HttpError(400, 'Phone number is required');
  if (!/^\d+$/.test(cleaned)) throw new HttpError(400, 'Phone number must be digits only');

  let msisdn = cleaned;
  if (msisdn.startsWith('0')) msisdn = `254${msisdn.slice(1)}`;
  else if (msisdn.startsWith('7') || msisdn.startsWith('1')) msisdn = `254${msisdn}`;

  if (!msisdn.startsWith('254')) throw new HttpError(400, 'Phone number must be a Kenya MSISDN (e.g. 07.. or 2547..)');
  if (msisdn.length !== 12) throw new HttpError(400, 'Phone number must be 12 digits after normalization (2547XXXXXXXX)');
  return msisdn;
}

function timestampNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function mpesaPassword(shortcode: string, passkey: string, timestamp: string) {
  return btoa(`${shortcode}${passkey}${timestamp}`);
}

async function requireFirebaseAuth(req: Request) {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token) throw new HttpError(401, 'Missing Authorization Bearer token');

  const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
    issuer: FIREBASE_ISSUER,
    audience: FIREBASE_PROJECT_ID,
  });

  const uid = (payload as any)?.user_id ?? (payload as any)?.sub;
  if (!uid) throw new HttpError(401, 'Invalid Firebase token (missing uid)');
  return { uid: String(uid) };
}

async function getDarajaAccessToken(): Promise<string> {
  if (!CONSUMER_KEY || !CONSUMER_SECRET) throw new HttpError(500, 'Server misconfigured: missing DARAJA_CONSUMER_KEY/SECRET');

  const basic = btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`);
  const res = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: {
      Authorization: `Basic ${basic}`,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new HttpError(502, `Daraja auth failed: ${data?.errorMessage ?? data?.error ?? res.statusText}`);
  }

  const token = (data as any)?.access_token;
  if (!token) throw new HttpError(502, 'Daraja auth failed: missing access_token');
  return String(token);
}

type WalletAccountRecord = {
  userId: string;
  currency: string;
  availableBalance: number;
  lifetimeIn: number;
  lifetimeOut: number;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type WalletAccountContext = {
  ref: DocumentReference<DocumentData>;
  data: WalletAccountRecord;
  exists: boolean;
};

type SellerSummary = {
  amount: number;
  sellerName?: string | null;
};

type MarketplaceOrderRecord = {
  orderId?: string;
  buyerId?: string;
  currency?: string;
  subtotal?: number;
  platformFee?: number;
  total?: number;
  status?: string;
  payment?: Record<string, unknown> | null;
  wallet?: Record<string, unknown> | null;
  items?: {
    sellerId?: string;
    sellerName?: string;
    lineTotal?: number;
  }[];
};

type MarketplaceFinalizeResult = {
  alreadyProcessed: boolean;
  order: {
    id: string;
    orderId: string;
    status: string;
  };
  wallet: {
    currency: string;
    total: number;
    platformFee: number;
    buyerDepositTxId: string;
    buyerDebitTxId: string;
    sellerTxIds: string[];
    platformFeeTxId: string | null;
    sellerAllocations: { sellerId: string; sellerName?: string | null; amount: number }[];
  } | null;
};

function requireFirestore(): Firestore {
  if (!adminFirestore) {
    throw new HttpError(
      500,
      'Server misconfigured: set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_BASE64 for secure Daraja processing'
    );
  }
  return adminFirestore;
}

function defaultWalletAccount(userId: string, currency: string): WalletAccountRecord {
  const normalizedCurrency = (currency || 'KES').toUpperCase();
  return {
    userId,
    currency: normalizedCurrency,
    availableBalance: 0,
    lifetimeIn: 0,
    lifetimeOut: 0,
  };
}

async function getWalletAccount(tx: Transaction, userId: string, currency: string): Promise<WalletAccountContext> {
  if (!userId.trim()) throw new HttpError(500, 'Wallet account missing userId');
  const firestore = requireFirestore();
  const ref = firestore.collection(WALLET_ACCOUNTS_COLLECTION).doc(userId);
  const snap = await tx.get(ref);
  const base = defaultWalletAccount(userId, currency);
  const data = snap.exists ? { ...base, ...(snap.data() as WalletAccountRecord) } : base;
  return { ref, data, exists: snap.exists };
}

function softNormalizeAmount(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  const rounded = Math.round(n);
  return rounded > 0 ? rounded : 0;
}

async function finalizeMarketplacePayment(args: {
  orderDocId: string;
  buyerUid: string;
  checkoutRequestId: string;
  mpesaResult: any;
}): Promise<MarketplaceFinalizeResult> {
  const firestore = requireFirestore();
  const walletTxCollection = firestore.collection(WALLET_TRANSACTIONS_COLLECTION);

  return await firestore.runTransaction(async (tx) => {
    const orderRef = firestore.collection(MARKETPLACE_ORDERS_COLLECTION).doc(args.orderDocId);
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) throw new HttpError(404, 'Marketplace order not found');

    const orderData = orderSnap.data() as MarketplaceOrderRecord;
    const buyerId = String(orderData?.buyerId ?? '').trim();
    if (!buyerId) throw new HttpError(500, 'Order missing buyerId');
    if (buyerId !== args.buyerUid) throw new HttpError(403, 'You are not allowed to update this order');

    const expectedCheckoutId = String(orderData?.payment?.checkoutRequestId ?? '').trim();
    if (expectedCheckoutId && expectedCheckoutId !== args.checkoutRequestId) {
      throw new HttpError(400, 'Checkout request mismatch');
    }

    const paymentStatus = String(orderData?.payment?.status ?? '').toLowerCase();
    const orderStatus = String(orderData?.status ?? '').toLowerCase();
    if (paymentStatus === 'confirmed' || orderStatus === 'paid') {
      return {
        alreadyProcessed: true,
        order: {
          id: orderRef.id,
          orderId: orderData?.orderId ?? orderRef.id,
          status: (orderData?.status as string) ?? 'paid',
        },
        wallet: (orderData?.wallet as MarketplaceFinalizeResult['wallet']) ?? null,
      };
    }

    if (orderStatus && orderStatus !== 'pending_payment') {
      throw new HttpError(409, 'Order is not pending payment');
    }

    const currency = (orderData?.currency ?? 'KES').toUpperCase();
    const total = softNormalizeAmount(orderData?.total);
    if (total <= 0) throw new HttpError(500, 'Invalid order total');
    const platformFee = softNormalizeAmount(orderData?.platformFee);

    const sellerSummaries = new Map<string, SellerSummary>();
    for (const item of orderData.items ?? []) {
      const sellerId = String(item?.sellerId ?? '').trim();
      if (!sellerId) continue;
      const lineTotal = softNormalizeAmount(item?.lineTotal);
      if (lineTotal <= 0) continue;
      const summary = sellerSummaries.get(sellerId) ?? { amount: 0, sellerName: item?.sellerName ?? null };
      summary.amount += lineTotal;
      if (!summary.sellerName && item?.sellerName) summary.sellerName = item.sellerName;
      sellerSummaries.set(sellerId, summary);
    }

    const sellerAllocationArray = Array.from(sellerSummaries.entries()).map(([sellerId, summary]) => ({
      sellerId,
      sellerName: summary.sellerName ?? null,
      amount: softNormalizeAmount(summary.amount),
    }));

    const buyerWallet = await getWalletAccount(tx, buyerId, currency);
    const buyerBalanceBefore = buyerWallet.data.availableBalance ?? 0;
    const afterDeposit = buyerBalanceBefore + total;
    const afterPurchase = Math.max(0, afterDeposit - total);

    const buyerDepositTxRef = walletTxCollection.doc();
    const buyerDebitTxRef = walletTxCollection.doc();

    tx.set(buyerDepositTxRef, {
      userId: buyerId,
      type: 'deposit',
      direction: 'credit',
      amount: total,
      currency,
      balanceAfter: afterDeposit,
      reference: {
        orderDocId: args.orderDocId,
        orderId: orderData?.orderId ?? null,
        checkoutRequestId: args.checkoutRequestId,
      },
      createdAt: FieldValue.serverTimestamp(),
    });

    tx.set(buyerDebitTxRef, {
      userId: buyerId,
      type: 'purchase',
      direction: 'debit',
      amount: total,
      currency,
      balanceAfter: afterPurchase,
      reference: {
        orderDocId: args.orderDocId,
        orderId: orderData?.orderId ?? null,
        checkoutRequestId: args.checkoutRequestId,
      },
      createdAt: FieldValue.serverTimestamp(),
    });

    tx.set(
      buyerWallet.ref,
      {
        userId: buyerId,
        currency,
        availableBalance: afterPurchase,
        lifetimeIn: (buyerWallet.data.lifetimeIn ?? 0) + total,
        lifetimeOut: (buyerWallet.data.lifetimeOut ?? 0) + total,
        updatedAt: FieldValue.serverTimestamp(),
        ...(buyerWallet.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true }
    );

    const sellerTxIds: string[] = [];
    for (const [sellerId, summary] of sellerSummaries.entries()) {
      const amount = softNormalizeAmount(summary.amount);
      if (amount <= 0) continue;
      const sellerWallet = await getWalletAccount(tx, sellerId, currency);
      const sellerBalanceBefore = sellerWallet.data.availableBalance ?? 0;
      const sellerBalanceAfter = sellerBalanceBefore + amount;
      const sellerTxRef = walletTxCollection.doc();

      tx.set(sellerTxRef, {
        userId: sellerId,
        type: 'sale',
        direction: 'credit',
        amount,
        currency,
        balanceAfter: sellerBalanceAfter,
        reference: {
          orderDocId: args.orderDocId,
          orderId: orderData?.orderId ?? null,
        },
        createdAt: FieldValue.serverTimestamp(),
      });

      tx.set(
        sellerWallet.ref,
        {
          userId: sellerId,
          currency,
          availableBalance: sellerBalanceAfter,
          lifetimeIn: (sellerWallet.data.lifetimeIn ?? 0) + amount,
          lifetimeOut: sellerWallet.data.lifetimeOut ?? 0,
          updatedAt: FieldValue.serverTimestamp(),
          ...(sellerWallet.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        },
        { merge: true }
      );

      sellerTxIds.push(sellerTxRef.id);
    }

    let platformFeeTxId: string | null = null;
    if (platformFee > 0) {
      const platformWallet = await getWalletAccount(tx, PLATFORM_WALLET_ID, currency);
      const platformBalanceBefore = platformWallet.data.availableBalance ?? 0;
      const platformBalanceAfter = platformBalanceBefore + platformFee;
      const platformTxRef = walletTxCollection.doc();

      tx.set(platformTxRef, {
        userId: PLATFORM_WALLET_ID,
        type: 'platform_fee',
        direction: 'credit',
        amount: platformFee,
        currency,
        balanceAfter: platformBalanceAfter,
        reference: {
          orderDocId: args.orderDocId,
          orderId: orderData?.orderId ?? null,
        },
        createdAt: FieldValue.serverTimestamp(),
      });

      tx.set(
        platformWallet.ref,
        {
          userId: PLATFORM_WALLET_ID,
          currency,
          availableBalance: platformBalanceAfter,
          lifetimeIn: (platformWallet.data.lifetimeIn ?? 0) + platformFee,
          lifetimeOut: platformWallet.data.lifetimeOut ?? 0,
          updatedAt: FieldValue.serverTimestamp(),
          ...(platformWallet.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        },
        { merge: true }
      );

      platformFeeTxId = platformTxRef.id;
    }

    tx.set(
      orderRef,
      {
        status: 'paid',
        payment: {
          ...(orderData?.payment ?? {}),
          status: 'confirmed',
          confirmedAt: FieldValue.serverTimestamp(),
          resultCode: args.mpesaResult?.ResultCode ?? null,
          resultDesc: args.mpesaResult?.ResultDesc ?? null,
          raw: args.mpesaResult,
        },
        wallet: {
          currency,
          total,
          platformFee,
          buyerDepositTxId: buyerDepositTxRef.id,
          buyerDebitTxId: buyerDebitTxRef.id,
          sellerTxIds,
          platformFeeTxId,
          sellerAllocations: sellerAllocationArray,
          processedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );

    return {
      alreadyProcessed: false,
      order: {
        id: orderRef.id,
        orderId: orderData?.orderId ?? orderRef.id,
        status: 'paid',
      },
      wallet: {
        currency,
        total,
        platformFee,
        buyerDepositTxId: buyerDepositTxRef.id,
        buyerDebitTxId: buyerDebitTxRef.id,
        sellerTxIds,
        platformFeeTxId,
        sellerAllocations: sellerAllocationArray,
      },
    } as MarketplaceFinalizeResult;
  });
}

async function markMarketplacePaymentFailure(args: {
  orderDocId: string;
  buyerUid: string;
  mpesaResult: any;
}): Promise<void> {
  const firestore = requireFirestore();
  await firestore.runTransaction(async (tx) => {
    const orderRef = firestore.collection(MARKETPLACE_ORDERS_COLLECTION).doc(args.orderDocId);
    const snap = await tx.get(orderRef);
    if (!snap.exists) return;
    const orderData = snap.data() as MarketplaceOrderRecord;
    const buyerId = String(orderData?.buyerId ?? '').trim();
    if (!buyerId) return;
    if (buyerId !== args.buyerUid) throw new HttpError(403, 'You are not allowed to update this order');
    if (String(orderData?.status ?? '').toLowerCase() === 'paid') return;

    tx.set(
      orderRef,
      {
        payment: {
          ...(orderData?.payment ?? {}),
          status: 'failed',
          resultCode: args.mpesaResult?.ResultCode ?? null,
          resultDesc: args.mpesaResult?.ResultDesc ?? null,
          raw: args.mpesaResult,
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );
  });
}

async function persistPlanUpgrade(args: {
  uid: string;
  tier: PlanTier;
  checkoutRequestId: string;
  merchantRequestId: string | null;
  amount: number;
  mpesaResult: any;
}): Promise<void> {
  const firestore = requireFirestore();
  const userUid = String(args.uid).trim();
  if (!userUid) throw new HttpError(500, 'Plan upgrade missing uid');
  const ref = firestore.collection('users').doc(userUid);
  await ref.set(
    {
      planTier: args.tier,
      subscription: {
        tier: args.tier,
        amountKSH: args.amount,
        source: 'daraja',
        updatedAt: FieldValue.serverTimestamp(),
        mpesa: {
          checkoutRequestId: args.checkoutRequestId,
          merchantRequestId: args.merchantRequestId ?? null,
          resultCode: args.mpesaResult?.ResultCode ?? null,
          resultDesc: args.mpesaResult?.ResultDesc ?? null,
        },
      },
    },
    { merge: true }
  );
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

  const url = new URL(req.url);
  const actionFromQuery = (url.searchParams.get('action') ?? '').toLowerCase().trim();

  // Callback from Safaricom (no auth)
  if (req.method === 'POST' && actionFromQuery === 'callback') {
    try {
      const payload = await req.json().catch(() => null);
      console.log('[daraja] callback', JSON.stringify(payload));
    } catch (err) {
      console.error('[daraja] callback parse failed', err);
    }
    return okResponse({ ok: true });
  }

  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const auth = await requireFirebaseAuth(req);
    const body = await req.json().catch(() => ({} as any));
    const action = String(body?.action ?? '').toLowerCase().trim() as DarajaAction;

    if (!BUSINESS_SHORTCODE || !PASSKEY) {
      throw new HttpError(500, 'Server misconfigured: missing DARAJA_BUSINESS_SHORTCODE or DARAJA_PASSKEY');
    }

    if (action === 'stkpush') {
      rateLimitStkPush(auth.uid);
      const tier = normalizeTier(body?.tier);
      const phone = normalizePhone(body?.phone);
      const amount = AMOUNTS_KSH[tier];
      const timestamp = timestampNow();
      const password = mpesaPassword(BUSINESS_SHORTCODE, PASSKEY, timestamp);

      const callbackUrl =
        (Deno.env.get('DARAJA_CALLBACK_URL') ?? '').trim() || `${url.origin}${url.pathname}?action=callback`;
      const accountReference = (String(body?.accountReference ?? '').trim() || `movieflix-${tier}`).slice(0, 64);
      const transactionDesc = (String(body?.transactionDesc ?? '').trim() || `MovieFlix ${tier} plan`).slice(0, 64);

      const accessToken = await getDarajaAccessToken();
      const res = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          BusinessShortCode: BUSINESS_SHORTCODE,
          Password: password,
          Timestamp: timestamp,
          TransactionType: TRANSACTION_TYPE,
          Amount: amount,
          PartyA: phone,
          PartyB: BUSINESS_SHORTCODE,
          PhoneNumber: phone,
          CallBackURL: callbackUrl,
          AccountReference: accountReference,
          TransactionDesc: transactionDesc,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new HttpError(502, `Daraja STK push failed: ${data?.errorMessage ?? data?.error ?? res.statusText}`);
      }

      return okResponse({
        ok: true,
        tier,
        amount,
        uid: auth.uid,
        responseCode: (data as any)?.ResponseCode ?? null,
        responseDescription: (data as any)?.ResponseDescription ?? null,
        merchantRequestId: (data as any)?.MerchantRequestID ?? null,
        checkoutRequestId: (data as any)?.CheckoutRequestID ?? null,
        customerMessage: (data as any)?.CustomerMessage ?? null,
      });
    }

    if (action === 'marketplace_stkpush') {
      rateLimitStkPush(auth.uid);
      const phone = normalizePhone(body?.phone);
      const amount = normalizeAmountKsh(body?.amount);
      const timestamp = timestampNow();
      const password = mpesaPassword(BUSINESS_SHORTCODE, PASSKEY, timestamp);

      const callbackUrl =
        (Deno.env.get('DARAJA_CALLBACK_URL') ?? '').trim() || `${url.origin}${url.pathname}?action=callback`;

      const accountReference = normalizeReference(body?.accountReference, 'movieflix-marketplace');
      const transactionDesc = normalizeDesc(body?.transactionDesc, 'MovieFlix marketplace');

      const accessToken = await getDarajaAccessToken();
      const res = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          BusinessShortCode: BUSINESS_SHORTCODE,
          Password: password,
          Timestamp: timestamp,
          TransactionType: TRANSACTION_TYPE,
          Amount: amount,
          PartyA: phone,
          PartyB: BUSINESS_SHORTCODE,
          PhoneNumber: phone,
          CallBackURL: callbackUrl,
          AccountReference: accountReference,
          TransactionDesc: transactionDesc,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new HttpError(502, `Daraja STK push failed: ${data?.errorMessage ?? data?.error ?? res.statusText}`);
      }

      return okResponse({
        ok: true,
        amount,
        uid: auth.uid,
        responseCode: (data as any)?.ResponseCode ?? null,
        responseDescription: (data as any)?.ResponseDescription ?? null,
        merchantRequestId: (data as any)?.MerchantRequestID ?? null,
        checkoutRequestId: (data as any)?.CheckoutRequestID ?? null,
        customerMessage: (data as any)?.CustomerMessage ?? null,
      });
    }

    if (action === 'query' || action === 'marketplace_query') {
      const checkoutRequestId = String(body?.checkoutRequestId ?? '').trim();
      if (!checkoutRequestId) return badRequest('checkoutRequestId is required');

      const planTierForQuery = action === 'query' ? normalizeTier(body?.tier) : null;
      const merchantRequestId = String(body?.merchantRequestId ?? '').trim() || null;
      const orderDocId = action === 'marketplace_query' ? normalizeOrderDocId(body?.orderDocId) : null;

      const timestamp = timestampNow();
      const password = mpesaPassword(BUSINESS_SHORTCODE, PASSKEY, timestamp);
      const accessToken = await getDarajaAccessToken();

      const res = await fetch(`${baseUrl}/mpesa/stkpushquery/v1/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          BusinessShortCode: BUSINESS_SHORTCODE,
          Password: password,
          Timestamp: timestamp,
          CheckoutRequestID: checkoutRequestId,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new HttpError(502, `Daraja query failed: ${data?.errorMessage ?? data?.error ?? res.statusText}`);
      }

      const resultCode = String((data as any)?.ResultCode ?? (data as any)?.resultCode ?? '').trim();
      const resultDesc = (data as any)?.ResultDesc ?? null;

      let planUpgrade: { tier: PlanTier } | null = null;
      let marketplaceResult: MarketplaceFinalizeResult | null = null;

      if (resultCode === '0') {
        if (action === 'query' && planTierForQuery) {
          await persistPlanUpgrade({
            uid: auth.uid,
            tier: planTierForQuery,
            checkoutRequestId,
            merchantRequestId,
            amount: AMOUNTS_KSH[planTierForQuery],
            mpesaResult: data,
          });
          planUpgrade = { tier: planTierForQuery };
        }

        if (action === 'marketplace_query' && orderDocId) {
          marketplaceResult = await finalizeMarketplacePayment({
            orderDocId,
            buyerUid: auth.uid,
            checkoutRequestId,
            mpesaResult: data,
          });
        }
      } else if (action === 'marketplace_query' && orderDocId) {
        await markMarketplacePaymentFailure({
          orderDocId,
          buyerUid: auth.uid,
          mpesaResult: data,
        });
      }

      return okResponse({
        ok: true,
        uid: auth.uid,
        checkoutRequestId,
        resultCode: resultCode || null,
        resultDesc: resultDesc ? String(resultDesc) : null,
        responseCode: (data as any)?.ResponseCode ?? null,
        responseDescription: (data as any)?.ResponseDescription ?? null,
        planUpgrade,
        order: marketplaceResult?.order ?? null,
        wallet: marketplaceResult?.wallet ?? null,
        raw: data,
      });
    }

    throw new HttpError(400, 'Invalid action. Expected stkpush, query, marketplace_stkpush, or marketplace_query.');
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : String(err);
    console.error('[daraja] error', err);
    return jsonResponse({ error: message }, status);
  }
});
