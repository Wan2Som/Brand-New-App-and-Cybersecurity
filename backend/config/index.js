/**
 * Central configuration. All environment access happens here so the rest of
 * the backend receives plain values and stays easy to test.
 */
const path = require('path');

try {
  // Optional in tests; installed as a normal dependency for real runs.
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {
  /* dotenv not installed - rely on the real environment */
}

const bool = (value, fallback = false) =>
  value === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());

const int = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const config = {
  port: int(process.env.PORT, 4000),
  // Comma-separated. Supports one "*" wildcard, e.g. https://*-myteam.vercel.app for preview deploys.
  frontendOrigins: (process.env.FRONTEND_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean),

  agent: {
    // Shared secret the Python sensor sends in X-Agent-Token.
    sharedSecret: process.env.AGENT_SHARED_SECRET || '',
  },

  // Exposes /api/demo/* (simulate attack, reset). Turn OFF in production.
  demoMode: bool(process.env.DEMO_MODE, true),

  // Which AI writes the chat replies: "claude" or "gemini". When unset, Claude is
  // used if ANTHROPIC_API_KEY is present, otherwise Gemini.
  aiProvider: (process.env.AI_PROVIDER || (process.env.ANTHROPIC_API_KEY ? 'claude' : 'gemini')).toLowerCase(),

  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.CLAUDE_MODEL || 'claude-opus-5-5',
    // low | medium | high | xhigh | max. Short chat replies need little thinking.
    effort: process.env.CLAUDE_EFFORT || 'low',
    maxTokens: int(process.env.CLAUDE_MAX_TOKENS, 16000),
    timeoutMs: int(process.env.CLAUDE_TIMEOUT_MS, 25000),
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    // Optional: tried once when the main model is overloaded (HTTP 500/503).
    fallbackModel: process.env.GEMINI_FALLBACK_MODEL || '',
    // Gemini 3+ thinking level ("low" | "medium" | "high"). Empty = model default.
    thinkingLevel: process.env.GEMINI_THINKING_LEVEL ?? 'low',
    maxOutputTokens: int(process.env.GEMINI_MAX_OUTPUT_TOKENS, 2048),
    timeoutMs: int(process.env.GEMINI_TIMEOUT_MS, 12000),
    endpoint:
      process.env.GEMINI_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta/models',
  },

  // True on Vercel: each request may hit a fresh instance, so state must live in Firebase.
  isServerless: Boolean(process.env.VERCEL),

  firebase: {
    databaseURL: process.env.FIREBASE_DATABASE_URL || '',
    // The service-account key itself is read by services/firebaseCredentials.js.
    statePath: process.env.FIREBASE_STATE_PATH || 'sme/status',
    historyPath: process.env.FIREBASE_HISTORY_PATH || 'sme/history',
  },

  rateLimit: {
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    webhookMax: int(process.env.RATE_LIMIT_WEBHOOK_MAX, 120),
    chatMax: int(process.env.RATE_LIMIT_CHAT_MAX, 30),
  },

  playbookFile: path.join(__dirname, '..', 'playbooks', 'nistPlaybooks.json'),
};

module.exports = config;
