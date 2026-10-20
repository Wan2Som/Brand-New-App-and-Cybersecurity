const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../config');
const advisor = require('../services/geminiService');
const incidents = require('../services/incidentService');
const alerts = require('../services/alertService');

const realFetch = global.fetch;

/** Stub the Anthropic API: `reply` is the JSON body to return, or a function of the call count. */
function mockClaude(reply, { status = 200, headers = {} } = {}) {
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) });
    const body = typeof reply === 'function' ? reply(calls.length) : reply;
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  };
  return calls;
}

const message = (content, stop_reason = 'end_turn', extra = {}) => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content,
  stop_reason,
  usage: { input_tokens: 10, output_tokens: 5 },
  ...extra,
});

async function openRansomware() {
  await incidents.reset();
  await alerts.ingest({ threatType: 'RANSOMWARE', severity: 'CRITICAL', deviceId: 'PC-1', timestamp: new Date().toISOString() });
  return incidents.getState();
}

test.beforeEach(() => {
  config.aiProvider = 'claude';
  config.claude.apiKey = 'test-key';
});

test.afterEach(() => {
  global.fetch = realFetch;
  config.aiProvider = 'gemini';
  config.claude.apiKey = '';
});

test('Claude replies are passed through, with the prompt, effort and fallbacks set', async () => {
  const calls = mockClaude(message([
    { type: 'thinking', thinking: '', signature: 'sig' },
    { type: 'text', text: 'Pull the cable out, then press **"I unplugged it"**.' },
  ]));
  const state = await openRansomware();
  const result = await advisor.generateReply({ event: 'BREACH_OPENED', state });

  assert.equal(result.source, 'ai');
  assert.equal(result.reply, 'Pull the cable out, then press **"I unplugged it"**.');
  assert.equal(calls.length, 1);
  const { body, headers, url } = calls[0];
  assert.match(url, /\/v1\/messages/);
  assert.equal(body.model, 'claude-opus-5-5');
  assert.equal(body.output_config.effort, 'low');
  assert.equal(body.fallbacks, 'default');
  assert.match(headers.get('anthropic-beta'), /server-side-fallback-2026-07-01/);
  assert.equal(body.system, advisor.SYSTEM_PROMPT);
  assert.equal(body.tools, undefined, 'the advisor never gets tools');
  assert.match(body.messages[0].content, /PLAYBOOK CONTEXT/);
});

test('a refusal from Claude falls back to playbook text', async () => {
  mockClaude(message([], 'refusal', { stop_details: { type: 'refusal', category: 'cyber', explanation: '' } }));
  const state = await openRansomware();
  const result = await advisor.generateReply({ event: 'BREACH_OPENED', state });
  assert.equal(result.source, 'playbook');
  assert.equal(result.note, 'claude-error:refusal');
});

test('an API error from Claude falls back to playbook text and names the status', async () => {
  mockClaude({ type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }, { status: 429, headers: { 'retry-after': '0' } });
  const state = await openRansomware();
  const result = await advisor.generateReply({ event: 'BREACH_OPENED', state });
  assert.equal(result.source, 'playbook');
  assert.equal(result.note, 'claude-error:429');
});

test('Claude replies that claim to have acted are replaced (HITL)', async () => {
  mockClaude(message([{ type: 'text', text: "Don't worry, I've isolated the computer for you." }]));
  const state = await openRansomware();
  const result = await advisor.generateReply({ event: 'BREACH_OPENED', state });
  assert.equal(result.source, 'playbook');
  assert.match(result.note, /^guardrail:/);
});

test('without an Anthropic key the playbook text is used and health shows playbook-only', async () => {
  config.claude.apiKey = '';
  const state = await openRansomware();
  const result = await advisor.generateReply({ event: 'BREACH_OPENED', state });
  assert.equal(result.note, 'claude-not-configured');
  assert.equal(advisor.activeModel(), null);
  config.claude.apiKey = 'test-key';
  assert.equal(advisor.activeModel(), 'claude-opus-5-5');
});
