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
const fs = require('fs');
const { EventEmitter } = require('events');
const config = require('../config');

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

const HISTORY_LIMIT = 20;

let mode = 'local';
let db = null;
let localState = null;
const localHistory = [];

/**
 * Service-account credentials, in order of preference:
 *  1. FIREBASE_SERVICE_ACCOUNT_JSON - raw JSON or base64 (best for Vercel env vars)
 *  2. FIREBASE_SERVICE_ACCOUNT_PATH - path to the downloaded key file (local dev)
 *  3. Application Default Credentials
 */
function loadServiceAccount() {
  const { serviceAccountJson, serviceAccountPath } = config.firebase;
  if (serviceAccountJson) {
    const raw = serviceAccountJson.trim().startsWith('{')
      ? serviceAccountJson
      : Buffer.from(serviceAccountJson, 'base64').toString('utf8');
    return JSON.parse(raw);
  }
  if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
    return JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  }
  return null;
}

function init() {
  const { databaseURL } = config.firebase;
  if (!databaseURL) {
    if (config.isServerless) {
      console.error(
        '[firebase] Running on Vercel WITHOUT Firebase. State will not survive between requests ' +
          'and live updates will not reach the dashboard. Set FIREBASE_DATABASE_URL and FIREBASE_SERVICE_ACCOUNT_JSON.',
      );
    } else {
      console.warn('[firebase] FIREBASE_DATABASE_URL not set - running in LOCAL mode (SSE only).');
    }
    return mode;
  }
  try {
    // Required lazily so the backend runs without the package in local mode.
    const admin = require('firebase-admin');
    const serviceAccount = loadServiceAccount();
    const credential = serviceAccount ? admin.credential.cert(serviceAccount) : admin.credential.applicationDefault();
    if (!admin.apps.length) admin.initializeApp({ credential, databaseURL });
    db = admin.database();
    mode = 'firebase';
    console.log(`[firebase] Connected to ${databaseURL} (path: ${config.firebase.statePath})`);
  } catch (err) {
    console.error(`[firebase] Init failed, falling back to LOCAL mode: ${err.message}`);
    mode = 'local';
  }
  return mode;
}

function getMode() {
  return mode;
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

module.exports = { init, getMode, writeState, readState, appendHistory, getHistory, subscribe };
