/**
 * Firebase Realtime Database adapter.
 *
 * Two modes, same interface:
 *  - "firebase": writes to RTDB via firebase-admin. The dashboard listens with
 *    the Firebase client SDK (onValue) for sub-second updates.
 *  - "local":    no credentials configured. State lives in memory and changes
 *    are pushed to the dashboard over Server-Sent Events (/api/incident/stream).
 *    This keeps the demo working offline / on stage Wi-Fi with zero setup.
 *
 * Every write is mirrored to local subscribers in BOTH modes, so the SSE
 * stream is always available as a fallback channel.
 */
const { EventEmitter } = require('events');
const config = require('../config');
const { loadServiceAccount, checkDatabaseUrl, CredentialError } = require('./firebaseCredentials');

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

const HISTORY_LIMIT = 20;
const CONNECT_TIMEOUT_MS = 8000;

let mode = 'local';
let db = null;
let localState = null;
let problem = null; // human-readable reason Firebase isn't in use (safe to show publicly)
const localHistory = [];

function fail(message) {
  problem = message;
  mode = 'local';
  db = null;
  console.error(`[firebase] ${message} Falling back to LOCAL mode.`);
}

function init() {
  const { databaseURL } = config.firebase;
  if (!databaseURL) {
    if (config.isServerless) {
      fail('FIREBASE_DATABASE_URL is not set on Vercel, so state will not persist and the dashboard gets no live updates.');
    } else {
      console.warn('[firebase] FIREBASE_DATABASE_URL not set - running in LOCAL mode (SSE only).');
    }
    return mode;
  }

  try {
    const url = checkDatabaseUrl(databaseURL);
    const credentials = loadServiceAccount();
    if (!credentials && config.isServerless) {
      throw new CredentialError(
        'No service-account key found. Set FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL ' +
          'and FIREBASE_PRIVATE_KEY).',
      );
    }

    // Required lazily so the backend runs without the package in local mode.
    const admin = require('firebase-admin');
    const credential = credentials ? admin.credential.cert(credentials.account) : admin.credential.applicationDefault();
    if (!admin.apps.length) admin.initializeApp({ credential, databaseURL: url });
    db = admin.database();
    mode = 'firebase';
    problem = null;
    console.log(`[firebase] Using ${url} (key from ${credentials ? credentials.source : 'default credentials'})`);
  } catch (err) {
    // Credential errors are already safe to show; anything else is summarised without details.
    fail(err instanceof CredentialError ? err.message : `Firebase could not start (${err.code || err.name}).`);
  }
  return mode;
}

/**
 * Prove the database is reachable and the key is accepted. Without this, a
 * wrong key or URL only shows up later as hanging requests.
 */
async function verifyConnection() {
  if (mode !== 'firebase') return false;
  let timer;
  try {
    await Promise.race([
      db.ref(config.firebase.statePath).once('value'),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'timeout' })), CONNECT_TIMEOUT_MS);
      }),
    ]);
    return true;
  } catch (err) {
    const text = `${err.code || ''} ${err.message || ''}`;
    if (/timeout/i.test(text)) {
      fail('Could not reach the database within 8 seconds. Check FIREBASE_DATABASE_URL is the exact link from Realtime Database > Data.');
    } else if (/permission|denied/i.test(text)) {
      fail('The database refused access. Check the key belongs to the SAME Firebase project as FIREBASE_DATABASE_URL.');
    } else if (/invalid_grant|credential|token|jwt|signature/i.test(text)) {
      fail('Google rejected the service-account key. It may have been deleted or regenerated; create a new key and paste it again.');
    } else {
      fail(`Could not connect to the database (${err.code || 'unknown error'}).`);
    }
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function getMode() {
  return mode;
}

/** Why Firebase isn't active, or null when it is (or isn't configured locally). */
function getProblem() {
  return problem;
}

/** Firebase rejects `undefined`; strip it so writes never fail on optional fields. */
function sanitize(value) {
  return JSON.parse(JSON.stringify(value));
}

async function writeState(state) {
  const clean = sanitize(state);
  localState = clean;
  emitter.emit('state', clean);
  if (mode === 'firebase') {
    await db.ref(config.firebase.statePath).set(clean);
  }
  return clean;
}

async function readState() {
  if (mode === 'firebase') {
    const snapshot = await db.ref(config.firebase.statePath).once('value');
    return snapshot.val();
  }
  return localState;
}

async function appendHistory(record) {
  const clean = sanitize(record);
  localHistory.unshift(clean);
  localHistory.length = Math.min(localHistory.length, HISTORY_LIMIT);
  if (mode === 'firebase') {
    await db.ref(config.firebase.historyPath).push(clean);
  }
}

/** Most recent resolved incidents, newest first. */
async function getHistory(limit = HISTORY_LIMIT) {
  if (mode === 'firebase') {
    const snapshot = await db.ref(config.firebase.historyPath).limitToLast(limit).once('value');
    return Object.values(snapshot.val() || {}).reverse();
  }
  return localHistory.slice(0, limit);
}

/** Subscribe to state changes. Returns an unsubscribe function. */
function subscribe(listener) {
  emitter.on('state', listener);
  return () => emitter.off('state', listener);
}

module.exports = {
  init,
  verifyConnection,
  getMode,
  getProblem,
  writeState,
  readState,
  appendHistory,
  getHistory,
  subscribe,
};
