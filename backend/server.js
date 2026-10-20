/**
 * Backend entry point - works in two ways:
 *
 *   Local:   `npm start` runs this file, which boots services and listens on PORT.
 *   Vercel:  Vercel imports this file and uses the exported Express app as a
 *            serverless function (zero-config Express support). No listen().
 */
const config = require('./config');
const firebase = require('./services/firebaseService');
const playbooks = require('./services/playbookService');
const incidents = require('./services/incidentService');
const gemini = require('./services/geminiService');
const { createApp } = require('./appFactory');

async function boot() {
  playbooks.load(); // fail fast on a broken playbook file
  firebase.init();
  await firebase.verifyConnection(); // on failure: falls back to local mode and records why
  try {
    await incidents.hydrate();
  } catch (err) {
    // Keep serving (with a fresh state) rather than failing every request.
    console.error('[server] Could not restore saved state:', err.message);
  }
}

const ready = boot();
ready.catch((err) => console.error('[server] Boot failed:', err));

const app = createApp({ ready });

if (require.main === module) {
  ready
    .then(() => {
      const server = app.listen(config.port, () => {
        console.log(`[server] SME Cyber Responder API on http://localhost:${config.port}`);
        console.log(
          `[server] Realtime transport: ${firebase.getMode()} | AI: ${gemini.isConfigured() ? config.gemini.model : 'playbook-only (no GEMINI_API_KEY)'}`,
        );
        console.log(
          `[server] Demo controls: ${config.demoMode ? 'ENABLED' : 'disabled'} | Agent auth: ${config.agent.sharedSecret ? 'shared secret' : 'OPEN (set AGENT_SHARED_SECRET)'}`,
        );
      });
      const shutdown = () => server.close(() => process.exit(0));
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    })
    .catch(() => process.exit(1));
}

module.exports = app;
