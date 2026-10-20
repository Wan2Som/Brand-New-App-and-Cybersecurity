/**
 * Incident workflow endpoints - every one of them is a HUMAN action.
 *
 *   GET  /api/incident/state      current state snapshot
 *   GET  /api/incident/stream     Server-Sent Events (live updates in local mode; on Vercel the
 *                                 dashboard listens to Firebase instead)
 *   POST /api/incident/confirm    { stepId }            Fix: "I unplugged it"
 *   POST /api/incident/learn      {}                    Learn: "Got it"
 *   POST /api/incident/mitigate   { actionId, confirmed: true }  Prevent
 *   POST /api/incident/escalate   { note? }             Any phase
 *   GET  /api/incident/history    recently resolved incidents
 */
const express = require('express');
const incidents = require('../services/incidentService');
const firebase = require('../services/firebaseService');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.get(
  '/state',
  asyncHandler(async (req, res) => {
    res.json({ ...(await incidents.loadState()), transport: firebase.getMode() });
  }),
);

router.get('/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const send = (state) => res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
  send(incidents.getState());

  const unsubscribe = firebase.subscribe(send);
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

router.post(
  '/confirm',
  asyncHandler(async (req, res) => {
    const { stepId } = req.body || {};
    if (typeof stepId !== 'string' || !stepId) return res.status(400).json({ error: 'stepId is required' });
    res.json(await incidents.confirmStep(stepId));
  }),
);

router.post(
  '/learn',
  asyncHandler(async (req, res) => {
    res.json(await incidents.acknowledgeLearn());
  }),
);

router.post(
  '/mitigate',
  asyncHandler(async (req, res) => {
    const { actionId, confirmed } = req.body || {};
    if (typeof actionId !== 'string' || !actionId) return res.status(400).json({ error: 'actionId is required' });
    // HITL: the client must assert that a person clicked the button.
    if (confirmed !== true) return res.status(400).json({ error: 'Human confirmation (confirmed: true) is required' });
    res.json(await incidents.applyMitigation(actionId));
  }),
);

router.post(
  '/escalate',
  asyncHandler(async (req, res) => {
    res.json(await incidents.escalate(req.body?.note));
  }),
);

router.get(
  '/history',
  asyncHandler(async (req, res) => {
    res.json({ history: await firebase.getHistory() });
  }),
);

module.exports = router;
