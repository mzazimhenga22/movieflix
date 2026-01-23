const FLW_BASE = 'https://api.flutterwave.com/v3';

const requireSecretKey = () => {
  const key = String(process.env.FLUTTERWAVE_SECRET_KEY || '').trim();
  if (!key) throw new Error('Missing FLUTTERWAVE_SECRET_KEY');
  return key;
};

const flwFetch = async (path, opts = {}) => {
  const key = requireSecretKey();
  const res = await fetch(`${FLW_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(opts.headers || {}),
    },
  });

  const text = await res.text().catch(() => '');
  const data = (() => {
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { raw: text };
    }
  })();

  if (!res.ok) {
    const msg =
      data?.message || data?.error || `Flutterwave request failed (HTTP ${res.status})`;
    const err = new Error(msg);
    err.statusCode = 502;
    err.upstream = data;
    throw err;
  }
  return data;
};

const createPaymentLink = async (payload) => {
  return await flwFetch('/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
};

const verifyTransaction = async (id) => {
  const tid = String(id || '').trim();
  if (!tid) throw new Error('Missing transaction id for verification');
  return await flwFetch(`/transactions/${encodeURIComponent(tid)}/verify`, {
    method: 'GET',
  });
};

const verifyWebhook = (event) => {
  const expected = String(process.env.FLUTTERWAVE_WEBHOOK_HASH || '').trim();
  if (!expected) {
    const err = new Error('Missing FLUTTERWAVE_WEBHOOK_HASH');
    err.statusCode = 500;
    throw err;
  }
  const got = String(event.headers?.['verif-hash'] || event.headers?.['Verif-Hash'] || '').trim();
  if (!got || got !== expected) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }
};

module.exports = {
  createPaymentLink,
  verifyTransaction,
  verifyWebhook,
};
