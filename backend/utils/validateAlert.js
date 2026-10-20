/**
 * Validates and normalises the sensor payload:
 *   { threatType, timestamp, severity, deviceId, ...optional extras }
 * Unknown threat types are accepted and mapped to UNKNOWN_ANOMALY so the
 * universal playbook takes over instead of the alert being dropped.
 */
const { knownThreatTypes } = require('../services/playbookService');

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

const clip = (value, max) => (typeof value === 'string' ? value.slice(0, max) : undefined);

function validateAlert(body) {
  const errors = [];
  if (!body || typeof body !== 'object') return { ok: false, errors: ['Body must be a JSON object'] };

  const rawType = typeof body.threatType === 'string' ? body.threatType.trim().toUpperCase() : '';
  if (!rawType) errors.push('threatType is required');

  const deviceId = clip(body.deviceId, 64)?.trim();
  if (!deviceId) errors.push('deviceId is required');

  const severity = String(body.severity || '').toUpperCase();
  if (!SEVERITIES.includes(severity)) errors.push(`severity must be one of ${SEVERITIES.join(', ')}`);

  const parsed = body.timestamp ? new Date(body.timestamp) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) errors.push('timestamp must be an ISO-8601 date');

  if (errors.length) return { ok: false, errors };

  const known = knownThreatTypes().includes(rawType);
  return {
    ok: true,
    value: {
      threatType: known ? rawType : 'UNKNOWN_ANOMALY',
      reportedThreatType: known ? undefined : rawType,
      severity,
      deviceId,
      timestamp: parsed.toISOString(),
      signatureId: clip(body.signatureId, 32),
      summary: clip(body.summary, 300),
      sourceIp: typeof body.sourceIp === 'string' && IPV4.test(body.sourceIp) ? body.sourceIp : undefined,
      evidence: clip(body.evidence, 500),
    },
  };
}

module.exports = { validateAlert, SEVERITIES };
