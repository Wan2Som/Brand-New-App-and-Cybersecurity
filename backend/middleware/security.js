/**
 * Small, dependency-free security middleware.
 */
const crypto = require('crypto');
const config = require('../config');

/** Only the sensor agent (holding the shared secret) may post alerts. */
function requireAgentToken(req, res, next) {
  const secret = config.agent.sharedSecret;
  if (!secret) return next(); // local demo without a secret configured

  const provided = String(req.get('x-agent-token') || '');
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Invalid agent token' });
  }
  return next();
}

/** Fixed-window, per-IP rate limiter (in memory - fine for a single instance). */
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || 'unknown';
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      if (hits.size > 10_000) hits.clear();
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.start + windowMs - now) / 1000)));
      return res.status(429).json({ error: 'Too many requests, slow down.' });
    }
    return next();
  };
}

/** Demo-only routes are hidden unless DEMO_MODE is on. */
function requireDemoMode(req, res, next) {
  if (!config.demoMode) return res.status(404).json({ error: 'Not found' });
  return next();
}

module.exports = { requireAgentToken, rateLimit, requireDemoMode };
