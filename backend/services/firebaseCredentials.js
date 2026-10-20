/**
 * Reads the Firebase service-account key from environment variables and
 * forgives the usual copy/paste mistakes. Three ways to provide it:
 *
 *   A. FIREBASE_SERVICE_ACCOUNT_JSON  - base64 of the key file, or the raw JSON
 *   B. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 *      (three values copied out of the key file; easiest in the Vercel UI)
 *   C. FIREBASE_SERVICE_ACCOUNT_PATH  - path to the key file (local dev only)
 *
 * Every error message is written for a human and NEVER contains any part of
 * the key, because it is shown on the public /api/health page.
 */
const crypto = require('crypto');
const fs = require('fs');

class CredentialError extends Error {}

/** Remove whitespace and wrapping quotes a paste might have added. */
function unwrap(value) {
  let text = String(value).replace(/^﻿/, '').trim();
  while (/^(['"`]).*\1$/s.test(text) && text.length > 1) text = text.slice(1, -1).trim();
  return text;
}

function decodeKeyText(raw) {
  const text = unwrap(raw);
  if (text.startsWith('{')) return text;

  if (/apiKey\s*:|authDomain/.test(text)) throw webConfigError();

  // Base64 (also tolerates line breaks, spaces and base64url characters)
  const compact = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    throw new CredentialError(
      'FIREBASE_SERVICE_ACCOUNT_JSON is neither JSON nor base64. Paste the base64 text of the service-account ' +
        'key file again, with nothing before or after it.',
    );
  }
  const decoded = Buffer.from(compact, 'base64').toString('utf8').replace(/^﻿/, '').trim();
  if (!decoded.startsWith('{')) {
    throw new CredentialError(
      'FIREBASE_SERVICE_ACCOUNT_JSON decodes to something that is not a key file. The base64 was probably ' +
        'cut off or copied from the wrong file.',
    );
  }
  return decoded;
}

function webConfigError() {
  return new CredentialError(
    'This is the Firebase WEB APP config (apiKey, authDomain...), which belongs in the website project. The backend ' +
      'needs the SERVICE ACCOUNT key: Firebase > Project settings > Service accounts > Generate new private key.',
  );
}

/** Private keys pasted into env vars often arrive with literal "\n" instead of line breaks. */
function normalisePrivateKey(value) {
  let key = unwrap(value).replace(/\\r/g, '').replace(/\\n/g, '\n').replace(/\r/g, '');
  if (!key.includes('-----BEGIN')) {
    throw new CredentialError(
      'The private key does not start with "-----BEGIN PRIVATE KEY-----". Copy the whole private_key value from the ' +
        'key file, from -----BEGIN to -----END PRIVATE KEY-----.',
    );
  }
  if (!key.endsWith('\n')) key += '\n';
  try {
    crypto.createPrivateKey(key);
  } catch {
    throw new CredentialError(
      'The private key is damaged (usually part of it was lost while copying). Generate a new private key in ' +
        'Firebase and paste it again.',
    );
  }
  return key;
}

function fromJsonText(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    if (/apiKey\s*["']?\s*:|authDomain/.test(text)) throw webConfigError();
    throw new CredentialError(
      'The service-account key is not valid JSON. It was probably cut off while copying. Run the encode command ' +
        'again and paste the full result.',
    );
  }
  if (data.apiKey && !data.private_key) throw webConfigError();

  const missing = ['project_id', 'client_email', 'private_key'].filter((field) => !data[field]);
  if (missing.length) {
    throw new CredentialError(
      `The key is missing ${missing.join(', ')}. Make sure it is the service-account key file downloaded from ` +
        'Firebase > Project settings > Service accounts.',
    );
  }
  return {
    projectId: data.project_id,
    clientEmail: data.client_email,
    privateKey: normalisePrivateKey(data.private_key),
  };
}

/**
 * @returns {{ account: {projectId, clientEmail, privateKey}, source: string } | null}
 *   null when no credentials are configured at all.
 * @throws {CredentialError} with a safe, human-readable message.
 */
function loadServiceAccount(env = process.env) {
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON && env.FIREBASE_SERVICE_ACCOUNT_JSON.trim()) {
    return { account: fromJsonText(decodeKeyText(env.FIREBASE_SERVICE_ACCOUNT_JSON)), source: 'FIREBASE_SERVICE_ACCOUNT_JSON' };
  }

  const split = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
  const provided = split.filter((name) => env[name] && env[name].trim());
  if (provided.length === split.length) {
    return {
      account: {
        projectId: unwrap(env.FIREBASE_PROJECT_ID),
        clientEmail: unwrap(env.FIREBASE_CLIENT_EMAIL),
        privateKey: normalisePrivateKey(env.FIREBASE_PRIVATE_KEY),
      },
      source: 'FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY',
    };
  }
  if (provided.length) {
    const missing = split.filter((name) => !provided.includes(name));
    throw new CredentialError(`Also set ${missing.join(' and ')} (all three are needed when not using FIREBASE_SERVICE_ACCOUNT_JSON).`);
  }

  const path = env.FIREBASE_SERVICE_ACCOUNT_PATH || env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path) {
    if (!fs.existsSync(path)) throw new CredentialError(`Key file not found at FIREBASE_SERVICE_ACCOUNT_PATH (${path}).`);
    return { account: fromJsonText(fs.readFileSync(path, 'utf8')), source: 'key file' };
  }
  return null;
}

/** Catch the common "copied the console page link" mistake. */
function checkDatabaseUrl(url) {
  const value = unwrap(url).replace(/\/+$/, '');
  if (/console\.firebase\.google\.com/.test(value)) {
    throw new CredentialError(
      'FIREBASE_DATABASE_URL is the Firebase console page link. Use the database link shown at the top of ' +
        'Realtime Database > Data, ending in firebasedatabase.app or firebaseio.com.',
    );
  }
  if (!/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.(firebasedatabase\.app|firebaseio\.com)$/i.test(value)) {
    throw new CredentialError(
      'FIREBASE_DATABASE_URL does not look like a Realtime Database link. It should look like ' +
        'https://<project>-default-rtdb.asia-southeast1.firebasedatabase.app',
    );
  }
  return value;
}

module.exports = { loadServiceAccount, checkDatabaseUrl, CredentialError };
