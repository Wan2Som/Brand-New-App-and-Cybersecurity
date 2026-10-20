const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../config');

// Fake firebase-admin: the first read hangs (slow cold start), later reads succeed.
let reads = 0;
const fakeDb = {
  ref: () => ({
    once: () => {
      reads += 1;
      return reads === 1 ? new Promise(() => {}) : Promise.resolve({ val: () => null });
    },
  }),
};
require.cache[require.resolve('firebase-admin')] = {
  exports: {
    apps: [],
    credential: { applicationDefault: () => ({}), cert: () => ({}) },
    initializeApp() {},
    database: () => fakeDb,
  },
};

const firebase = require('../services/firebaseService');

test('on Vercel, a connect timeout is retried on the next request instead of sticking in local mode', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  config.firebase.databaseURL = 'https://demo-default-rtdb.asia-southeast1.firebasedatabase.app';
  config.isServerless = false; // no service-account key needed with default credentials
  assert.equal(firebase.init(), 'firebase');

  config.isServerless = true;
  const first = firebase.verifyConnection();
  t.mock.timers.tick(8000);
  assert.equal(await first, false);
  assert.equal(firebase.getMode(), 'local');
  assert.match(firebase.getProblem(), /Retrying on the next request/);

  await firebase.reconnectIfNeeded();
  assert.equal(firebase.getMode(), 'firebase');
  assert.equal(firebase.getProblem(), null);
  assert.equal(reads, 2);

  await firebase.reconnectIfNeeded(); // connected: no further reads
  assert.equal(reads, 2);
});
