const { ok, json, CORS_HEADERS } = require('./_shared/http');
const { getDb, requireAuth, admin } = require('./_shared/firebaseAdmin');
const { createPaymentLink } = require('./_shared/flutterwave');

const PLAN_AMOUNTS_KES = {
  plus: 100,
  premium: 200,
};

const PROMO_CREDITS_KES_PER_CREDIT = Number(process.env.PROMO_CREDITS_KES_PER_CREDIT || '10');
const PROMO_CREDITS_MIN_TOPUP_KSH = 50;
const PROMO_CREDITS_MAX_TOPUP_KSH = 50_000;

const getOrigin = (event) => {
  const proto = event.headers?.['x-forwarded-proto'] || event.headers?.['X-Forwarded-Proto'] || 'https';
  const host = event.headers?.['x-forwarded-host'] || event.headers?.['X-Forwarded-Host'] || event.headers?.host;
  if (host) return `${proto}://${host}`;
  return process.env.PAYMENTS_PUBLIC_ORIGIN || '';
};

const parseJsonBody = (event) => {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch {
    const err = new Error('Invalid JSON body');
    err.statusCode = 400;
    throw err;
  }
};

const normalizeEmail = (raw, fallbackUid) => {
  const v = String(raw || '').trim();
  if (v && v.includes('@')) return v;
  // Flutterwave Standard requires email; fall back to a deterministic placeholder.
  return `noemail+${String(fallbackUid).slice(0, 24)}@example.com`;
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const auth = await requireAuth(event);
    const body = parseJsonBody(event);
    const kind = String(body?.kind || '').toLowerCase().trim();
    if (!kind) return json(400, { error: 'kind is required' });

    const db = getDb();
    const intentRef = db.collection('payment_intents').doc();
    const tx_ref = intentRef.id;

    const origin = getOrigin(event);
    const redirect_url = origin ? `${origin}/payment-complete` : 'https://example.com/payment-complete';

    const customerEmail = normalizeEmail(body?.customer?.email || auth.email, auth.uid);
    const customerName = String(body?.customer?.name || auth.name || '').trim() || null;
    const customerPhone = String(body?.customer?.phone || '').trim() || null;

    let currency = 'KES';
    let amount = 0;
    const meta = { kind, uid: auth.uid };

    if (kind === 'plan') {
      const tier = String(body?.tier || '').toLowerCase().trim();
      if (!(tier in PLAN_AMOUNTS_KES)) return json(400, { error: 'Invalid tier' });
      amount = PLAN_AMOUNTS_KES[tier];

      await intentRef.set({
        kind,
        uid: auth.uid,
        tier,
        currency,
        amount,
        status: 'created',
        provider: 'flutterwave',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      meta.tier = tier;
    } else if (kind === 'marketplace') {
      const orderDocId = String(body?.orderDocId || '').trim();
      if (!orderDocId) return json(400, { error: 'orderDocId is required' });

      const orderSnap = await db.collection('marketplace_orders').doc(orderDocId).get();
      if (!orderSnap.exists) return json(404, { error: 'Order not found' });
      const order = orderSnap.data() || {};

      if (String(order?.buyerId || '').trim() !== auth.uid) return json(403, { error: 'Forbidden' });
      const status = String(order?.status || '').toLowerCase();
      if (status === 'paid') {
        return ok({ ok: true, alreadyPaid: true, orderDocId, tx_ref: null, link: null });
      }

      amount = Math.max(0, Math.round(Number(order?.total || 0)));
      currency = String(order?.currency || 'KES').toUpperCase();
      if (!amount) return json(500, { error: 'Invalid order total' });

      await intentRef.set({
        kind,
        uid: auth.uid,
        orderDocId,
        orderId: order?.orderId || null,
        currency,
        amount,
        status: 'created',
        provider: 'flutterwave',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      meta.orderDocId = orderDocId;
      if (order?.orderId) meta.orderId = String(order.orderId);
    } else if (kind === 'promo_credits') {
      const amountKsh = Math.round(Number(body?.amountKsh));
      if (!Number.isFinite(amountKsh) || amountKsh <= 0) return json(400, { error: 'amountKsh must be a number' });
      if (amountKsh < PROMO_CREDITS_MIN_TOPUP_KSH) return json(400, { error: `Minimum top up is ${PROMO_CREDITS_MIN_TOPUP_KSH} KSh` });
      if (amountKsh > PROMO_CREDITS_MAX_TOPUP_KSH) return json(400, { error: `Maximum top up is ${PROMO_CREDITS_MAX_TOPUP_KSH} KSh` });
      if (!Number.isFinite(PROMO_CREDITS_KES_PER_CREDIT) || PROMO_CREDITS_KES_PER_CREDIT <= 0) {
        return json(500, { error: 'Server misconfigured: PROMO_CREDITS_KES_PER_CREDIT must be positive' });
      }
      if (amountKsh % PROMO_CREDITS_KES_PER_CREDIT !== 0) {
        return json(400, { error: `Amount must be a multiple of ${PROMO_CREDITS_KES_PER_CREDIT} KSh` });
      }

      amount = amountKsh;
      currency = 'KES';
      const credits = Math.round(amountKsh / PROMO_CREDITS_KES_PER_CREDIT);

      await intentRef.set({
        kind,
        uid: auth.uid,
        currency,
        amount,
        amountKsh,
        credits,
        status: 'created',
        provider: 'flutterwave',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      meta.credits = credits;
      meta.amountKsh = amountKsh;
    } else {
      return json(400, { error: 'Unsupported kind' });
    }

    const flwPayload = {
      tx_ref,
      amount,
      currency,
      redirect_url,
      customer: {
        email: customerEmail,
        ...(customerName ? { name: customerName } : null),
        ...(customerPhone ? { phonenumber: customerPhone } : null),
      },
      customizations: {
        title: 'MovieFlix',
        description: kind === 'marketplace' ? 'Marketplace purchase' : kind === 'promo_credits' ? 'Promo credits top up' : 'Plan upgrade',
      },
      meta,
    };

    const flwRes = await createPaymentLink(flwPayload);
    const link = flwRes?.data?.link || flwRes?.data?.checkout_url || null;
    if (!link) {
      await intentRef.set(
        { status: 'failed', error: 'Missing Flutterwave payment link', updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      return json(502, { error: 'Unable to create payment link' });
    }

    await intentRef.set(
      {
        status: 'pending',
        tx_ref,
        flutterwave: {
          createPaymentResponse: {
            status: flwRes?.status || null,
            message: flwRes?.message || null,
          },
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return ok({ ok: true, tx_ref, link });
  } catch (err) {
    const status = err?.statusCode || 500;
    const message = err instanceof Error ? err.message : String(err);
    return json(status, { error: message });
  }
};
