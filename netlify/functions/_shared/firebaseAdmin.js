const admin = require('firebase-admin');

let _app;

const getServiceAccount = () => {
  const json = String(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      process.env.FIREBASE_SERVICE_ACCOUNT ||
      ''
  ).trim();
  const b64 = String(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '').trim();

  if (!json && !b64) {
    throw new Error(
      'Missing Firebase service account. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_BASE64.'
    );
  }

  const raw = json || Buffer.from(b64, 'base64').toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Invalid Firebase service account JSON');
  }
};

const getAdminApp = () => {
  if (_app) return _app;

  if (admin.apps && admin.apps.length) {
    _app = admin.apps[0];
    return _app;
  }

  const serviceAccount = getServiceAccount();
  _app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  return _app;
};

const getDb = () => {
  getAdminApp();
  return admin.firestore();
};

const requireAuth = async (event) => {
  const authHeader =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    '';
  const token = String(authHeader).startsWith('Bearer ')
    ? String(authHeader).slice('Bearer '.length).trim()
    : '';
  if (!token) {
    const err = new Error('Missing Authorization Bearer token');
    err.statusCode = 401;
    throw err;
  }

  getAdminApp();
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch {
    const err = new Error('Invalid Firebase token');
    err.statusCode = 401;
    throw err;
  }

  return {
    uid: String(decoded.uid),
    email: decoded.email ? String(decoded.email).toLowerCase() : null,
    name: decoded.name ? String(decoded.name) : null,
  };
};

module.exports = {
  admin,
  getAdminApp,
  getDb,
  requireAuth,
};
