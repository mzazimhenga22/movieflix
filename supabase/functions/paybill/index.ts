import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.9.6';
import { cert, getApps, initializeApp } from 'npm:firebase-admin/app';
import { FieldValue, getFirestore } from 'npm:firebase-admin/firestore';
import type { DocumentData, DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';

import { corsHeaders } from '../_shared/cors.ts';

type PlanTier = 'plus' | 'premium';

type PaybillAction =
  | 'marketplace_submit_receipt'
  | 'marketplace_admin_confirm_receipt'
  | 'promo_credits_submit_receipt'
  | 'promo_credits_admin_confirm_receipt'
  | 'plan_submit_receipt'
  | 'plan_admin_confirm_receipt';

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
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

const PAYBILL_NUMBER = (Deno.env.get('EQUITY_PAYBILL_NUMBER') ?? Deno.env.get('PAYBILL_NUMBER') ?? '247247').trim();
const PAYBILL_ACCOUNT = (Deno.env.get('EQUITY_PAYBILL_ACCOUNT') ?? Deno.env.get('PAYBILL_ACCOUNT') ?? '480755').trim();
const PAYBILL_PROVIDER = (Deno.env.get('PAYBILL_PROVIDER') ?? 'equity').trim() || 'equity';
const PAYBILL_ADMIN_SECRET = (Deno.env.get('PAYBILL_ADMIN_SECRET') ?? '').trim();

const MARKETPLACE_ORDERS_COLLECTION = 'marketplace_orders';
const WALLET_ACCOUNTS_COLLECTION = 'wallet_accounts';
const WALLET_TRANSACTIONS_COLLECTION = 'wallet_transactions';
const PLATFORM_WALLET_ID =
  (Deno.env.get('MARKETPLACE_PLATFORM_WALLET_ID') ?? 'movieflix-platform').trim() || 'movieflix-platform';

const USERS_COLLECTION = 'users';

const PROMO_CREDITS_ACCOUNTS_COLLECTION = 'promo_credits_accounts';
const PROMO_CREDITS_TRANSACTIONS_COLLECTION = 'promo_credits_transactions';
const PROMO_CREDITS_KES_PER_CREDIT = Number(Deno.env.get('PROMO_CREDITS_KES_PER_CREDIT') ?? '10');
const PROMO_CREDITS_MIN_TOPUP_KSH = 50;
const PROMO_CREDITS_MAX_TOPUP_KSH = 50_000;

const PAYMENT_RECEIPTS_COLLECTION = 'payment_receipts';

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

function requireAdminSecret(req: Request) {
  if (!PAYBILL_ADMIN_SECRET) throw new HttpError(500, 'Server misconfigured: PAYBILL_ADMIN_SECRET not set');
  const got = (req.headers.get('x-admin-secret') ?? '').trim();
  if (!got || got !== PAYBILL_ADMIN_SECRET) throw new HttpError(403, 'Forbidden');
}

function initFirestore(): Firestore {
  const json = (
    Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') ??
    Deno.env.get('FIREBASE_SERVICE_ACCOUNT') ??
    ''
  ).trim();
  const b64 = (Deno.env.get('FIREBASE_SERVICE_ACCOUNT_BASE64') ?? '').trim();

  if (!json && !b64) {
    throw new HttpError(
      500,
      'Server misconfigured: set FIREBASE_SERVICE_ACCOUNT_JSON/FIREBASE_SERVICE_ACCOUNT_BASE64 to manage Firestore payments'
    );
  }

  const raw = json || atob(b64);
  let credentials: any;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new HttpError(500, 'Invalid Firebase service account JSON');
  }

  if (!credentials || typeof credentials.project_id !== 'string' || !credentials.project_id.trim()) {
    throw new HttpError(500, 'Invalid Firebase Admin credentials: missing top-level "project_id"');
  }

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials as Record<string, unknown>) });
  return getFirestore(app);
}

function normalizeReceiptCode(raw: unknown): string {
  const v = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (!v) throw new HttpError(400, 'receiptCode is required');
  if (!/^[A-Z0-9]{10}$/.test(v)) {
    throw new HttpError(400, 'Invalid receiptCode. Expected 10 characters (letters/numbers), e.g. QRTSITS25S');
  }
  return v;
}

function normalizeOrderDocId(raw: unknown): string {
  const v = String(raw ?? '').trim();
  if (!v) throw new HttpError(400, 'orderDocId is required');
  return v;
}

function normalizeTier(raw: unknown): PlanTier {
  const v = String(raw ?? '')
    .toLowerCase()
    .trim();
  if (v === 'plus' || v === 'premium') return v;
  throw new HttpError(400, 'Invalid tier. Expected plus or premium.');
}

function softNormalizeAmount(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  const rounded = Math.round(n);
  return rounded > 0 ? rounded : 0;
}

function normalizePromoTopupAmountKsh(raw: unknown): number {
  if (!Number.isFinite(PROMO_CREDITS_KES_PER_CREDIT) || PROMO_CREDITS_KES_PER_CREDIT <= 0) {
    throw new HttpError(500, 'Server misconfigured: PROMO_CREDITS_KES_PER_CREDIT must be a positive number');
  }

  const amount = softNormalizeAmount(raw);
  if (amount <= 0) throw new HttpError(400, 'amountKsh must be greater than zero');
  if (amount < PROMO_CREDITS_MIN_TOPUP_KSH) {
    throw new HttpError(400, `Minimum top up is ${PROMO_CREDITS_MIN_TOPUP_KSH} KSh`);
  }
  if (amount > PROMO_CREDITS_MAX_TOPUP_KSH) {
    throw new HttpError(400, `Maximum top up is ${PROMO_CREDITS_MAX_TOPUP_KSH} KSh`);
  }
  if (amount % PROMO_CREDITS_KES_PER_CREDIT !== 0) {
    throw new HttpError(400, `Amount must be a multiple of ${PROMO_CREDITS_KES_PER_CREDIT} KSh`);
  }
  return amount;
}

type PromoCreditsAccountRecord = {
  userId: string;
  availableCredits: number;
  lifetimeIn: number;
  lifetimeOut: number;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type PromoCreditsAccountContext = {
  ref: DocumentReference<DocumentData>;
  data: PromoCreditsAccountRecord;
  exists: boolean;
};

function defaultPromoCreditsAccount(userId: string): PromoCreditsAccountRecord {
  return {
    userId,
    availableCredits: 0,
    lifetimeIn: 0,
    lifetimeOut: 0,
  };
}

async function getPromoCreditsAccount(tx: Transaction, db: Firestore, userId: string): Promise<PromoCreditsAccountContext> {
  if (!userId.trim()) throw new HttpError(500, 'Promo credits account missing userId');
  const ref = db.collection(PROMO_CREDITS_ACCOUNTS_COLLECTION).doc(userId);
  const snap = await tx.get(ref);
  const base = defaultPromoCreditsAccount(userId);
  const data = snap.exists ? { ...base, ...(snap.data() as PromoCreditsAccountRecord) } : base;
  return { ref, data, exists: snap.exists };
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

async function getWalletAccount(tx: Transaction, db: Firestore, userId: string, currency: string): Promise<WalletAccountContext> {
  if (!userId.trim()) throw new HttpError(500, 'Wallet account missing userId');
  const ref = db.collection(WALLET_ACCOUNTS_COLLECTION).doc(userId);
  const snap = await tx.get(ref);
  const base = defaultWalletAccount(userId, currency);
  const data = snap.exists ? { ...base, ...(snap.data() as WalletAccountRecord) } : base;
  return { ref, data, exists: snap.exists };
}

async function finalizeMarketplacePaybillPayment(args: {
  db: Firestore;
  orderDocId: string;
  buyerUid: string;
  receiptCode: string;
}): Promise<{ alreadyProcessed: boolean; order: { id: string; orderId: string; status: string } }>
{
  const { db } = args;
  const walletTxCollection = db.collection(WALLET_TRANSACTIONS_COLLECTION);

  return await db.runTransaction(async (tx) => {
    const orderRef = db.collection(MARKETPLACE_ORDERS_COLLECTION).doc(args.orderDocId);
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) throw new HttpError(404, 'Marketplace order not found');

    const orderData = orderSnap.data() as MarketplaceOrderRecord;
    const buyerId = String(orderData?.buyerId ?? '').trim();
    if (!buyerId) throw new HttpError(500, 'Order missing buyerId');
    if (buyerId !== args.buyerUid) throw new HttpError(403, 'You are not allowed to update this order');

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
      };
    }

    if (orderStatus && orderStatus !== 'pending_payment' && orderStatus !== 'pending_verification') {
      throw new HttpError(409, 'Order is not pending payment');
    }

    const currency = (orderData?.currency ?? 'KES').toUpperCase();
    const total = softNormalizeAmount(orderData?.total);
    if (total <= 0) throw new HttpError(500, 'Invalid order total');
    const platformFee = softNormalizeAmount(orderData?.platformFee);

    const sellerSummaries = new Map<string, { amount: number; sellerName?: string | null }>();
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

    const buyerWallet = await getWalletAccount(tx, db, buyerId, currency);
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
        receiptCode: args.receiptCode,
        provider: PAYBILL_PROVIDER,
        paybill: PAYBILL_NUMBER,
        account: PAYBILL_ACCOUNT,
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
        receiptCode: args.receiptCode,
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
      const sellerWallet = await getWalletAccount(tx, db, sellerId, currency);
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
          receiptCode: args.receiptCode,
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
      const platformWallet = await getWalletAccount(tx, db, PLATFORM_WALLET_ID, currency);
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
          receiptCode: args.receiptCode,
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
          method: 'mpesa_paybill',
          provider: PAYBILL_PROVIDER,
          paybill: PAYBILL_NUMBER,
          account: PAYBILL_ACCOUNT,
          receiptCode: args.receiptCode,
          status: 'confirmed',
          confirmedAt: FieldValue.serverTimestamp(),
          source: 'paybill',
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
    };
  });
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
    const db = initFirestore();
    const body = await req.json().catch(() => ({} as any));
    const action = String(body?.action ?? '').toLowerCase().trim() as PaybillAction;

    if (!PAYBILL_NUMBER || !PAYBILL_ACCOUNT) {
      throw new HttpError(500, 'Server misconfigured: PAYBILL_NUMBER/PAYBILL_ACCOUNT missing');
    }

    if (action === 'marketplace_submit_receipt') {
      const auth = await requireFirebaseAuth(req);
      const orderDocId = normalizeOrderDocId(body?.orderDocId);
      const receiptCode = normalizeReceiptCode(body?.receiptCode);

      const receipts = db.collection(PAYMENT_RECEIPTS_COLLECTION);

      const result = await db.runTransaction(async (tx) => {
        const orderRef = db.collection(MARKETPLACE_ORDERS_COLLECTION).doc(orderDocId);
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists) throw new HttpError(404, 'Marketplace order not found');

        const order = orderSnap.data() as MarketplaceOrderRecord;
        const buyerId = String(order?.buyerId ?? '').trim();
        if (!buyerId) throw new HttpError(500, 'Order missing buyerId');
        if (buyerId !== auth.uid) throw new HttpError(403, 'You are not allowed to submit payment for this order');

        const status = String(order?.status ?? '').toLowerCase();
        if (status === 'paid') {
          return { alreadyPaid: true, orderId: order?.orderId ?? orderRef.id };
        }

        if (status && status !== 'pending_payment' && status !== 'pending_verification') {
          throw new HttpError(409, 'Order is not pending payment');
        }

        const existingReceiptOnOrder = String((order as any)?.payment?.receiptCode ?? '')
          .trim()
          .toUpperCase();
        if (existingReceiptOnOrder && existingReceiptOnOrder !== receiptCode) {
          throw new HttpError(409, 'A receipt has already been submitted for this order');
        }

        const receiptRef = receipts.doc(receiptCode);
        const existing = await tx.get(receiptRef);
        if (existing.exists) {
          const existingData = existing.data() as any;
          const sameOwner = String(existingData?.userId ?? '').trim() === auth.uid;
          const sameType = String(existingData?.type ?? '').trim() === 'marketplace';
          const sameOrder = String(existingData?.orderDocId ?? '').trim() === orderDocId;

          if (sameOwner && sameType && sameOrder) {
            return {
              alreadyPaid: false,
              orderId: order?.orderId ?? orderRef.id,
              status: status === 'paid' ? 'paid' : 'pending_verification',
            };
          }

          throw new HttpError(409, 'This receipt code has already been used');
        }

        const currency = (order?.currency ?? 'KES').toUpperCase();
        const amount = softNormalizeAmount(order?.total);
        if (amount <= 0) throw new HttpError(500, 'Invalid order total');

        tx.set(receiptRef, {
          receiptCode,
          type: 'marketplace',
          status: 'submitted',
          provider: PAYBILL_PROVIDER,
          paybill: PAYBILL_NUMBER,
          account: PAYBILL_ACCOUNT,
          orderDocId,
          orderId: order?.orderId ?? null,
          userId: auth.uid,
          currency,
          amount,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          submittedAt: FieldValue.serverTimestamp(),
        });

        tx.set(
          orderRef,
          {
            status: 'pending_verification',
            payment: {
              ...(order?.payment ?? {}),
              method: 'mpesa_paybill',
              provider: PAYBILL_PROVIDER,
              paybill: PAYBILL_NUMBER,
              account: PAYBILL_ACCOUNT,
              receiptCode,
              status: 'pending_verification',
              amount,
              currency,
              submittedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            },
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        return {
          alreadyPaid: false,
          orderId: order?.orderId ?? orderRef.id,
          status: 'pending_verification',
        };
      });

      return okResponse({ ok: true, ...result });
    }

    if (action === 'marketplace_admin_confirm_receipt') {
      requireAdminSecret(req);
      const receiptCode = normalizeReceiptCode(body?.receiptCode);

      const receiptRef = db.collection(PAYMENT_RECEIPTS_COLLECTION).doc(receiptCode);
      const receiptSnap = await receiptRef.get();
      if (!receiptSnap.exists) throw new HttpError(404, 'Receipt not found');
      const receipt = receiptSnap.data() as any;
      if (String(receipt?.type ?? '') !== 'marketplace') throw new HttpError(400, 'Receipt is not for marketplace');

      const status = String(receipt?.status ?? '').toLowerCase();
      if (status === 'confirmed') {
        return okResponse({ ok: true, alreadyConfirmed: true, receiptCode });
      }
      if (status && status !== 'submitted') throw new HttpError(409, 'Receipt is not in a confirmable state');

      const orderDocId = String(receipt?.orderDocId ?? '').trim();
      const buyerUid = String(receipt?.userId ?? '').trim();
      if (!orderDocId || !buyerUid) throw new HttpError(500, 'Receipt record is missing orderDocId/userId');

      const result = await finalizeMarketplacePaybillPayment({ db, orderDocId, buyerUid, receiptCode });

      await receiptRef.set(
        {
          status: 'confirmed',
          confirmedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          orderDocId,
        },
        { merge: true }
      );

      return okResponse({ ok: true, receiptCode, ...result });
    }

    if (action === 'promo_credits_submit_receipt') {
      const auth = await requireFirebaseAuth(req);
      const receiptCode = normalizeReceiptCode(body?.receiptCode);
      const amountKsh = normalizePromoTopupAmountKsh(body?.amountKsh);
      const credits = Math.round(amountKsh / PROMO_CREDITS_KES_PER_CREDIT);
      if (credits <= 0) throw new HttpError(400, 'Top up amount is too low');

      const receipts = db.collection(PAYMENT_RECEIPTS_COLLECTION);
      const result = await db.runTransaction(async (tx) => {
        const receiptRef = receipts.doc(receiptCode);
        const existing = await tx.get(receiptRef);
        if (existing.exists) {
          const data = existing.data() as any;
          const sameOwner = String(data?.userId ?? '').trim() === auth.uid;
          const sameType = String(data?.type ?? '').trim() === 'promo_credits';
          if (sameOwner && sameType) {
            const existingAmount = softNormalizeAmount(data?.amountKsh ?? data?.amount);
            const existingCredits = Math.max(0, Math.round(Number(data?.credits ?? 0)));
            return {
              alreadySubmitted: true,
              amountKsh: existingAmount,
              credits: existingCredits,
            };
          }

          throw new HttpError(409, 'This receipt code has already been used');
        }

        tx.set(receiptRef, {
          receiptCode,
          type: 'promo_credits',
          status: 'submitted',
          provider: PAYBILL_PROVIDER,
          paybill: PAYBILL_NUMBER,
          account: PAYBILL_ACCOUNT,
          userId: auth.uid,
          currency: 'KES',
          amountKsh,
          credits,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          submittedAt: FieldValue.serverTimestamp(),
        });

        return { alreadySubmitted: false, amountKsh, credits };
      });

      return okResponse({ ok: true, receiptCode, amountKsh: (result as any)?.amountKsh ?? amountKsh, credits: (result as any)?.credits ?? credits });
    }

    if (action === 'promo_credits_admin_confirm_receipt') {
      requireAdminSecret(req);
      const receiptCode = normalizeReceiptCode(body?.receiptCode);

      const result = await db.runTransaction(async (tx) => {
        const receiptRef = db.collection(PAYMENT_RECEIPTS_COLLECTION).doc(receiptCode);
        const receiptSnap = await tx.get(receiptRef);
        if (!receiptSnap.exists) throw new HttpError(404, 'Receipt not found');
        const receipt = receiptSnap.data() as any;
        if (String(receipt?.type ?? '') !== 'promo_credits') throw new HttpError(400, 'Receipt is not for promo credits');

        const status = String(receipt?.status ?? '').toLowerCase();
        const uid = String(receipt?.userId ?? '').trim();
        if (!uid) throw new HttpError(500, 'Receipt record missing userId');

        const account = await getPromoCreditsAccount(tx, db, uid);
        const before = Math.max(0, Math.round(Number(account.data.availableCredits ?? 0)));
        if (status === 'confirmed') {
          return { alreadyConfirmed: true, uid, availableCredits: before };
        }
        if (status && status !== 'submitted') throw new HttpError(409, 'Receipt is not in a confirmable state');

        const amountKsh = normalizePromoTopupAmountKsh(receipt?.amountKsh ?? receipt?.amount);
        const credits = Math.round(amountKsh / PROMO_CREDITS_KES_PER_CREDIT);
        if (credits <= 0) throw new HttpError(500, 'Invalid receipt credits');

        const after = before + credits;
        const promoTxRef = db.collection(PROMO_CREDITS_TRANSACTIONS_COLLECTION).doc();

        tx.set(promoTxRef, {
          userId: uid,
          type: 'topup',
          direction: 'credit',
          credits,
          balanceAfter: after,
          amountKsh,
          reference: {
            receiptCode,
            provider: PAYBILL_PROVIDER,
            paybill: PAYBILL_NUMBER,
            account: PAYBILL_ACCOUNT,
          },
          createdAt: FieldValue.serverTimestamp(),
        });

        tx.set(
          account.ref,
          {
            userId: uid,
            availableCredits: after,
            lifetimeIn: (account.data.lifetimeIn ?? 0) + credits,
            lifetimeOut: account.data.lifetimeOut ?? 0,
            updatedAt: FieldValue.serverTimestamp(),
            ...(account.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
          },
          { merge: true }
        );

        tx.set(
          receiptRef,
          {
            status: 'confirmed',
            confirmedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            amountKsh,
            credits,
            transactionId: promoTxRef.id,
          },
          { merge: true }
        );

        return { alreadyConfirmed: false, uid, availableCredits: after, transactionId: promoTxRef.id, amountKsh, credits };
      });

      return okResponse({ ok: true, receiptCode, ...result });
    }

    if (action === 'plan_submit_receipt') {
      const auth = await requireFirebaseAuth(req);
      const tier = normalizeTier(body?.tier);
      const receiptCode = normalizeReceiptCode(body?.receiptCode);

      const amount = AMOUNTS_KSH[tier];
      const receipts = db.collection(PAYMENT_RECEIPTS_COLLECTION);

      const result = await db.runTransaction(async (tx) => {
        const receiptRef = receipts.doc(receiptCode);
        const existing = await tx.get(receiptRef);
        if (existing.exists) {
          const data = existing.data() as any;
          const sameOwner = String(data?.userId ?? '').trim() === auth.uid;
          const sameType = String(data?.type ?? '').trim() === 'plan';
          const sameTier = normalizeTier(data?.tier) === tier;

          if (sameOwner && sameType && sameTier) {
            return { alreadySubmitted: true };
          }

          throw new HttpError(409, 'This receipt code has already been used');
        }

        tx.set(receiptRef, {
          receiptCode,
          type: 'plan',
          status: 'submitted',
          provider: PAYBILL_PROVIDER,
          paybill: PAYBILL_NUMBER,
          account: PAYBILL_ACCOUNT,
          userId: auth.uid,
          tier,
          currency: 'KES',
          amount,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          submittedAt: FieldValue.serverTimestamp(),
        });

        tx.set(
          db.collection(USERS_COLLECTION).doc(auth.uid),
          {
            subscription: {
              pending: true,
              tier,
              amountKSH: amount,
              currency: 'KES',
              source: 'paybill',
              provider: PAYBILL_PROVIDER,
              paybill: PAYBILL_NUMBER,
              account: PAYBILL_ACCOUNT,
              receiptCode,
              status: 'pending_verification',
              updatedAt: FieldValue.serverTimestamp(),
            },
          },
          { merge: true }
        );

        return { alreadySubmitted: false };
      });

      return okResponse({ ok: true, tier, amount, receiptCode, ...(result as any) });
    }

    if (action === 'plan_admin_confirm_receipt') {
      requireAdminSecret(req);
      const receiptCode = normalizeReceiptCode(body?.receiptCode);

      const receiptRef = db.collection(PAYMENT_RECEIPTS_COLLECTION).doc(receiptCode);
      const receiptSnap = await receiptRef.get();
      if (!receiptSnap.exists) throw new HttpError(404, 'Receipt not found');
      const receipt = receiptSnap.data() as any;
      if (String(receipt?.type ?? '') !== 'plan') throw new HttpError(400, 'Receipt is not for plan');

      const status = String(receipt?.status ?? '').toLowerCase();
      if (status === 'confirmed') return okResponse({ ok: true, alreadyConfirmed: true, receiptCode });
      if (status && status !== 'submitted') throw new HttpError(409, 'Receipt is not in a confirmable state');

      const uid = String(receipt?.userId ?? '').trim();
      const tier = normalizeTier(receipt?.tier);
      const amount = AMOUNTS_KSH[tier];

      await db.collection(USERS_COLLECTION).doc(uid).set(
        {
          planTier: tier,
          subscription: {
            tier,
            amountKSH: amount,
            currency: 'KES',
            source: 'paybill',
            provider: PAYBILL_PROVIDER,
            paybill: PAYBILL_NUMBER,
            account: PAYBILL_ACCOUNT,
            receiptCode,
            status: 'confirmed',
            confirmedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
        },
        { merge: true }
      );

      await receiptRef.set(
        {
          status: 'confirmed',
          confirmedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return okResponse({ ok: true, uid, tier, amount, receiptCode });
    }

    throw new HttpError(400, 'Invalid action');
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : String(err);
    console.error('[paybill] error', err);
    return jsonResponse({ error: message }, status);
  }
});
