/**
 * Single intake path for alerts. The real sensor webhook and the demo
 * "Simulate Attack" button both go through here, so the demo exercises
 * exactly the same validation, playbook mapping and Firebase update.
 */
const { validateAlert } = require('../utils/validateAlert');
const incidents = require('./incidentService');

async function ingest(payload, { source = 'agent' } = {}) {
  const result = validateAlert(payload);
  if (!result.ok) {
    const error = new Error(`Invalid alert: ${result.errors.join('; ')}`);
    error.status = 400;
    throw error;
  }
  const { created, state } = await incidents.openIncident({ ...result.value, source });
  return {
    created,
    incidentId: state.incident.id,
    playbookId: state.incident.playbook.id,
    status: state.status,
  };
}

module.exports = { ingest };
