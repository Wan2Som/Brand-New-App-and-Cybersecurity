const test = require('node:test');
const assert = require('node:assert/strict');

const incidents = require('../services/incidentService');
const alerts = require('../services/alertService');
const firebase = require('../services/firebaseService');

const alert = (overrides = {}) => ({
  threatType: 'RANSOMWARE',
  severity: 'HIGH',
  deviceId: 'FRONT-DESK-PC',
  timestamp: new Date().toISOString(),
  ...overrides,
});

test.beforeEach(async () => {
  await incidents.reset();
});

test('full Hack -> Fix -> Learn -> Prevent -> Secure workflow', async () => {
  const seen = [];
  const unsubscribe = firebase.subscribe((s) => seen.push(`${s.status}/${s.phase}`));

  const opened = await alerts.ingest(alert());
  assert.equal(opened.created, true);
  assert.equal(opened.status, 'BREACH_DETECTED');
  assert.equal(opened.playbookId, 'ransomware');

  let state = incidents.getState();
  assert.equal(state.phase, 'FIX');
  assert.match(state.incident.playbook.containment[0].instruction, /FRONT-DESK-PC/, 'deviceId interpolated');

  for (const step of state.incident.playbook.containment) {
    state = await incidents.confirmStep(step.id);
  }
  assert.equal(state.status, 'CONTAINED');
  assert.equal(state.phase, 'LEARN');

  state = await incidents.acknowledgeLearn();
  assert.equal(state.phase, 'PREVENT');

  for (const action of state.incident.playbook.prevent) {
    state = await incidents.applyMitigation(action.id);
  }
  assert.equal(state.status, 'SECURE');
  assert.equal(state.phase, 'RESOLVED');
  assert.ok(state.incident.resolvedAt);
  assert.equal((await firebase.getHistory())[0].id, state.incident.id);

  unsubscribe();
  assert.ok(seen.includes('BREACH_DETECTED/FIX'));
  assert.equal(seen.at(-1), 'SECURE/RESOLVED');
});

test('steps cannot be skipped or confirmed twice (HITL ordering)', async () => {
  await alerts.ingest(alert());
  const [first, second] = incidents.getState().incident.playbook.containment;

  await assert.rejects(incidents.confirmStep(second.id), { status: 409 });
  await incidents.confirmStep(first.id);
  await assert.rejects(incidents.confirmStep(first.id), { status: 409 });
  assert.equal(incidents.getState().incident.currentStepIndex, 1);
});

test('concurrent double-click only advances one step', async () => {
  await alerts.ingest(alert());
  const { id } = incidents.getState().incident.playbook.containment[0];
  const results = await Promise.allSettled([incidents.confirmStep(id), incidents.confirmStep(id)]);
  assert.deepEqual(results.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(incidents.getState().incident.currentStepIndex, 1);
});

test('phase actions are rejected out of order', async () => {
  await alerts.ingest(alert());
  await assert.rejects(incidents.acknowledgeLearn(), { status: 409 });
  await assert.rejects(incidents.applyMitigation('offline-backup'), { status: 409 });
});

test('unknown threat types fall back to the universal playbook', async () => {
  const result = await alerts.ingest(alert({ threatType: 'CRYPTOJACKING', severity: 'MEDIUM' }));
  const { incident } = incidents.getState();
  assert.equal(result.playbookId, 'universal');
  assert.equal(incident.threatType, 'UNKNOWN_ANOMALY');
  assert.equal(incident.playbook.isFallback, true);
  assert.ok(incident.playbook.containment.some((s) => /RAM/.test(s.why)), 'advises preserving RAM');
});

test('a second alert attaches to the open incident without resetting progress', async () => {
  await alerts.ingest(alert({ severity: 'HIGH' }));
  const { id } = incidents.getState().incident.playbook.containment[0];
  await incidents.confirmStep(id);

  const second = await alerts.ingest(alert({ severity: 'CRITICAL' }));
  const { incident } = incidents.getState();
  assert.equal(second.created, false);
  assert.equal(incident.currentStepIndex, 1);
  assert.equal(incident.severity, 'CRITICAL');
  assert.equal(incident.relatedAlerts.length, 1);
});

test('escalation attaches contacts and is idempotent', async () => {
  await alerts.ingest(alert());
  await incidents.escalate('please help');
  const state = await incidents.escalate('again');
  assert.equal(state.incident.escalation.note, 'please help');
  assert.ok(state.incident.escalation.contacts.length >= 1);
});

test('invalid payloads are rejected with 400', async () => {
  await assert.rejects(alerts.ingest({ threatType: 'RANSOMWARE' }), { status: 400 });
  await assert.rejects(alerts.ingest(alert({ severity: 'APOCALYPTIC' })), { status: 400 });
});

test('mitigations outside the playbook are refused', async () => {
  await alerts.ingest(alert());
  for (const s of incidents.getState().incident.playbook.containment) await incidents.confirmStep(s.id);
  await incidents.acknowledgeLearn();
  await assert.rejects(incidents.applyMitigation('format-hard-drive'), { status: 400 });
});
