/**
 * Loads the pre-vetted NIST/CISA playbooks and resolves the right one for a
 * threat type. Unknown threat types always fall back to the universal
 * containment playbook - the platform never leaves a user without guidance.
 */
const fs = require('fs');
const config = require('../config');

const FALLBACK_ID = 'universal';

let cache = null;

function load(file = config.playbookFile) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const byThreatType = new Map();

  for (const playbook of Object.values(data.playbooks)) {
    for (const type of playbook.threatTypes || []) byThreatType.set(type, playbook.id);
  }
  if (!data.playbooks[FALLBACK_ID]) {
    throw new Error(`Playbook file must define a "${FALLBACK_ID}" fallback playbook`);
  }
  cache = { data, byThreatType };
  return cache;
}

function store() {
  return cache || load();
}

/** Replace {placeholders} in every string of a JSON-like value. */
function interpolate(value, vars) {
  if (typeof value === 'string') {
    return value.replace(/\{(\w+)\}/g, (match, key) => (vars[key] != null ? String(vars[key]) : match));
  }
  if (Array.isArray(value)) return value.map((item) => interpolate(item, vars));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, interpolate(v, vars)]));
  }
  return value;
}

/**
 * Returns a ready-to-display copy of the playbook for this threat, with
 * device and attacker details filled in.
 */
function resolvePlaybook(threatType, { deviceId, sourceIp } = {}) {
  const { data, byThreatType } = store();
  const id = byThreatType.get(threatType) || FALLBACK_ID;
  const vars = {
    deviceId: deviceId || 'the affected computer',
    sourceIp: sourceIp || "the attacker's address",
  };
  const playbook = interpolate(data.playbooks[id], vars);
  return { ...playbook, isFallback: id === FALLBACK_ID };
}

function getEscalation() {
  return store().data.escalation;
}

function knownThreatTypes() {
  return [...store().byThreatType.keys()];
}

/** Threat types with a dedicated playbook (excludes the universal fallback). */
function recognisedThreatTypes() {
  const { byThreatType } = store();
  return [...byThreatType.entries()].filter(([, id]) => id !== FALLBACK_ID).map(([type]) => type);
}

module.exports = { load, resolvePlaybook, getEscalation, knownThreatTypes, recognisedThreatTypes, interpolate, FALLBACK_ID };
