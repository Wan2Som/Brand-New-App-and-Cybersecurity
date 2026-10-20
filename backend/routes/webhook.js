/**
 * POST /api/webhook/agent
 * Receives threat payloads from the local Python sensor, flips the shared
 * state to BREACH_DETECTED and attaches the matching NIST/CISA playbook.
 */
const express = require('express');
const config = require('../config');
const alerts = require('../services/alertService');
const { requireAgentToken, rateLimit } = require('../middleware/security');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.post(
  '/agent',
  rateLimit({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.webhookMax }),
  requireAgentToken,
  asyncHandler(async (req, res) => {
    const result = await alerts.ingest(req.body, { source: 'agent' });
    console.log(
      `[webhook] ${req.body.threatType} from ${req.body.deviceId} -> ${result.incidentId} (${result.created ? 'new' : 'attached'})`,
    );
    res.status(202).json(result);
  }),
);

module.exports = router;
