/**
 * Presenter-only controls (enabled when DEMO_MODE=true).
 *
 *   GET  /api/demo/scenarios
 *   POST /api/demo/simulate   { scenario }
 *   POST /api/demo/reset
 */
const express = require('express');
const scenarios = require('../config/demoScenarios');
const alerts = require('../services/alertService');
const incidents = require('../services/incidentService');
const { requireDemoMode } = require('../middleware/security');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(requireDemoMode);

router.get('/scenarios', (req, res) => res.json({ scenarios: scenarios.list() }));

router.post(
  '/simulate',
  asyncHandler(async (req, res) => {
    const payload = scenarios.buildPayload(req.body?.scenario);
    if (!payload) return res.status(400).json({ error: `Unknown scenario "${req.body?.scenario}"` });
    res.status(202).json(await alerts.ingest(payload, { source: 'demo' }));
  }),
);

router.post(
  '/reset',
  asyncHandler(async (req, res) => {
    res.json(await incidents.reset());
  }),
);

module.exports = router;
