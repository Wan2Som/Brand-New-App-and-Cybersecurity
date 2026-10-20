/**
 * Claude (Anthropic API) client for the read-only advisor.
 *
 * Same contract as the Gemini call: system prompt + one user turn in, plain
 * text out, errors carry a short `status` for the chat's diagnostic note.
 * The model never gets tools, so it can only write text; geminiService runs
 * the guardrails and falls back to playbook text on any failure.
 */
const Anthropic = require('@anthropic-ai/sdk').default;
const config = require('../config');

let client = null;
let clientKey = null;

function getClient() {
  if (!client || clientKey !== config.claude.apiKey) {
    clientKey = config.claude.apiKey;
    client = new Anthropic({
      apiKey: config.claude.apiKey,
      maxRetries: 1, // one SDK retry on 429/5xx/connection errors; the playbook covers the rest
      // Resolve fetch per call so tests can stub global.fetch.
      fetch: (...args) => globalThis.fetch(...args),
    });
  }
  return client;
}

function isConfigured() {
  return Boolean(config.claude.apiKey);
}

async function callClaude(systemPrompt, userTurn) {
  const { model, effort, maxTokens, timeoutMs } = config.claude;
  let response;
  try {
    response = await getClient().beta.messages.create(
      {
        model,
        max_tokens: maxTokens,
        // Thinking is always on for Claude Opus 5.5; effort sets how much it thinks.
        output_config: { effort },
        // If a safety classifier declines (cyber topics can trigger it), re-run on
        // Anthropic's recommended fallback model inside the same request.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: systemPrompt,
        messages: [{ role: 'user', content: userTurn }],
      },
      { timeout: timeoutMs },
    );
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
      throw Object.assign(new Error('Claude request timed out'), { status: 'timeout' });
    }
    if (err instanceof Anthropic.APIError && err.status) {
      throw Object.assign(new Error(`Claude HTTP ${err.status}: ${err.message}`), { status: err.status });
    }
    throw err;
  }

  // The whole fallback chain declined: let the caller use playbook text.
  if (response.stop_reason === 'refusal') {
    const category = response.stop_details?.category || 'unknown';
    throw Object.assign(new Error(`Claude declined (category: ${category})`), { status: 'refusal' });
  }

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
  if (!text) throw Object.assign(new Error(`Claude returned no text (stop_reason: ${response.stop_reason})`), { status: 'empty' });
  return text;
}

module.exports = { callClaude, isConfigured };
