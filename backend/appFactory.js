/**
 * Express app factory (no network listening here, so tests can mount it).
 * Named appFactory.js rather than app.js on purpose: Vercel treats an app.js
 * file as the entry point, and the real entry is server.js.
 */
const express = require('express');
const cors = require('cors');
const config = require('./config');
const firebase = require('./services/firebaseService');
const gemini = require('./services/geminiService');
const playbooks = require('./services/playbookService');
const webhookRoutes = require('./routes/webhook');
const chatRoutes = require('./routes/chat');
const incidentRoutes = require('./routes/incident');
const demoRoutes = require('./routes/demo');
const { errorHandler, notFound } = require('./middleware/errorHandler');

/** Exact origins, or patterns with "*" (e.g. https://*-myteam.vercel.app). */
function originMatcher(patterns) {
  const rules = patterns.map((pattern) =>
    pattern.includes('*')
      ? new RegExp(`^${pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9-]+')}$`, 'i')
      : pattern.toLowerCase(),
  );
  return (origin, callback) => {
    // Non-browser callers (the Python agent, curl) send no Origin header.
    if (!origin) return callback(null, true);
    const allowed = rules.some((rule) => (typeof rule === 'string' ? rule === origin.toLowerCase() : rule.test(origin)));
    return callback(null, allowed);
  };
}

/**
 * @param {{ ready?: Promise<unknown> | (() => Promise<unknown>) }} options  requests wait for `ready`
 *   (playbooks loaded, Firebase connected) before being handled. A function is called per request.
 */
function createApp({ ready } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(cors({ origin: originMatcher(config.frontendOrigins) }));
  app.use(express.json({ limit: '32kb' }));

  if (ready) {
    const wait = typeof ready === 'function' ? ready : () => ready;
    app.use((req, res, next) => {
      wait().then(() => next(), next);
    });
  }

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      transport: firebase.getMode(),
      // Plain-English reason when Firebase isn't connected (never contains secrets).
      ...(firebase.getProblem() ? { firebaseProblem: firebase.getProblem() } : {}),
      ai: gemini.isConfigured() ? config.gemini.model : 'playbook-only',
      demoMode: config.demoMode,
      threatTypes: playbooks.recognisedThreatTypes().length,
      serverless: config.isServerless,
    });
  });

  app.use('/api/webhook', webhookRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/incident', incidentRoutes);
  app.use('/api/demo', demoRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp, originMatcher };
