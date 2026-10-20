const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { loadServiceAccount, checkDatabaseUrl, CredentialError } = require('../services/firebaseCredentials');

// A throwaway key generated for the test, shaped exactly like a Firebase key file.
const { privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const keyFile = JSON.stringify(
  {
    type: 'service_account',
    project_id: 'siaga-test',
    private_key_id: 'abc123',
    private_key: privateKey,
    client_email: 'firebase-adminsdk-x@siaga-test.iam.gserviceaccount.com',
  },
  null,
  2,
);
const b64 = Buffer.from(keyFile).toString('base64');

const ok = (env) => {
  const result = loadServiceAccount(env);
  assert.equal(result.account.projectId, 'siaga-test');
  assert.match(result.account.privateKey, /^-----BEGIN PRIVATE KEY-----\n/);
  return result;
};
const fails = (env, pattern) => {
  assert.throws(() => loadServiceAccount(env), (err) => {
    assert.ok(err instanceof CredentialError);
    assert.match(err.message, pattern);
    assert.ok(!err.message.includes('MII'), 'error must never contain key material');
    return true;
  });
};

test('accepts the common ways people paste the key', () => {
  ok({ FIREBASE_SERVICE_ACCOUNT_JSON: keyFile }); // raw JSON
  ok({ FIREBASE_SERVICE_ACCOUNT_JSON: b64 }); // base64
  ok({ FIREBASE_SERVICE_ACCOUNT_JSON: `${b64}\r\n` }); // PowerShell clipboard adds CRLF
  ok({ FIREBASE_SERVICE_ACCOUNT_JSON: `"${b64}"` }); // wrapped in quotes
  ok({ FIREBASE_SERVICE_ACCOUNT_JSON: b64.match(/.{1,76}/g).join('\n') }); // wrapped base64 (Mac/Linux base64)
  ok({ FIREBASE_SERVICE_ACCOUNT_JSON: `'${keyFile}'` }); // single-quoted JSON
  ok({ FIREBASE_SERVICE_ACCOUNT_JSON: `\uFEFF${keyFile}` }); // BOM
});

test('three separate variables, private key copied with literal \\n', () => {
  const escaped = privateKey.replace(/\n/g, '\\n');
  const result = ok({
    FIREBASE_PROJECT_ID: 'siaga-test',
    FIREBASE_CLIENT_EMAIL: 'firebase-adminsdk-x@siaga-test.iam.gserviceaccount.com',
    FIREBASE_PRIVATE_KEY: `"${escaped}"`,
  });
  assert.match(result.source, /PRIVATE_KEY/);
});

test('explains the usual mistakes without leaking the key', () => {
  fails({ FIREBASE_SERVICE_ACCOUNT_JSON: '{ apiKey: "AIza...", authDomain: "x.firebaseapp.com" }' }, /WEB APP config/);
  fails({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ apiKey: 'AIza', projectId: 'x' }) }, /WEB APP config/);
  fails({ FIREBASE_SERVICE_ACCOUNT_JSON: b64.slice(0, 400) }, /cut off|not valid JSON/);
  fails({ FIREBASE_SERVICE_ACCOUNT_JSON: 'C:\\Users\\me\\Downloads\\firebase-key.json' }, /neither JSON nor base64/);
  const broken = JSON.parse(keyFile);
  broken.private_key = broken.private_key.slice(0, 300);
  fails({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(broken) }, /damaged/);
  fails({ FIREBASE_PROJECT_ID: 'siaga-test' }, /FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY/);
});

test('nothing configured returns null', () => {
  assert.equal(loadServiceAccount({}), null);
});

test('database URL check', () => {
  assert.equal(
    checkDatabaseUrl('https://siaga-default-rtdb.asia-southeast1.firebasedatabase.app/'),
    'https://siaga-default-rtdb.asia-southeast1.firebasedatabase.app',
  );
  assert.ok(checkDatabaseUrl('https://siaga-default-rtdb.firebaseio.com'));
  assert.throws(() => checkDatabaseUrl('https://console.firebase.google.com/project/siaga/database'), /console page/);
  assert.throws(() => checkDatabaseUrl('siaga-default-rtdb'), /does not look like/);
});
