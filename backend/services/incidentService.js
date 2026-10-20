/**
 * Incident state machine - the single source of truth for the workflow
 *
 *   SECURE/MONITORING --alert--> BREACH_DETECTED/FIX   (Hack)
 *   FIX --all steps confirmed--> CONTAINED/LEARN       (Fix)
 *   LEARN --acknowledged-------> CONTAINED/PREVENT     (Learn)
 *   PREVENT --all applied------> SECURE/RESOLVED       (Prevent)
 *
 * Human-in-the-loop: the ONLY way to advance is an explicit human action
 * (confirmStep / acknowledgeLearn / applyMitigation). The AI chat can read
 * this state but has no code path to change it.
 */
const crypto = require('crypto');
const firebase = require('./firebaseService');
const playbooks = require('./playbookService');
const mitigations = require('./mitigationService');

const STATUS = { SECURE: 'SECURE', BREACH: 'BREACH_DETECTED', CONTAINED: 'CONTAINED' };
const PHASE = { MONITORING: 'MONITORING', FIX: 'FIX', LEARN: 'LEARN', PREVENT: 'PREVENT', RESOLVED: 'RESOLVED' };

const SEVERITY_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
const MAX_TIMELINE = 50;
const MAX_RELATED = 20;

let state = baseline();
let queue = Promise.resolve();

function baseline() {
  return {
    status: STATUS.SECURE,
    phase: PHASE.MONITORING,
    incident: null,
    updatedAt: new Date().toISOString(),
  };
}

class WorkflowError extends Error {
  constructor(message, status = 409) {
    super(message);
    this.status = status;
  }
}

/**
 * Serialise mutations so double-clicks and concurrent alerts cannot race.
 * In Firebase mode the latest state is read first, because on Vercel another
 * instance may have changed it since this one last looked.
 */
function mutate(fn) {
  const run = queue.then(async () => {
    await refresh();
    const draft = structuredClone(state);
    const result = await fn(draft);
    draft.updatedAt = new Date().toISOString();
    state = draft;
    await firebase.writeState(state);
    return result === undefined ? state : result;
  });
  queue = run.catch(() => {});
  return run;
}

/**
 * `text` is the English record (logs, history); `params` lets the dashboard
 * re-render the entry in the viewer's language.
 */
function addTimeline(draft, type, text, params) {
  const timeline = draft.incident.timeline || (draft.incident.timeline = []);
  timeline.push({ at: new Date().toISOString(), type, text, ...(params ? { params } : {}) });
  if (timeline.length > MAX_TIMELINE) timeline.shift();
}

function requireIncident(draft, phase) {
  if (!draft.incident) throw new WorkflowError('There is no active incident.');
  if (phase && draft.phase !== phase) {
    throw new WorkflowError(`This action belongs to the ${phase} phase; the incident is in ${draft.phase}.`);
  }
}

// --- Queries ----------------------------------------------------------------

/** Last known state of this instance (always current in local mode). */
function getState() {
  return structuredClone(state);
}

/** Pull the shared state from Firebase (no-op in local mode). */
async function refresh() {
  if (firebase.getMode() !== 'firebase') return;
  const saved = await firebase.readState();
  state = saved && saved.status ? normalize(saved) : baseline();
  // An incident saved by an older version has no translations: add them and
  // save, so the dashboard (which reads Firebase directly) shows them too.
  if (upgradeLegacy(state)) await firebase.writeState(state);
}

/** Current state, re-read from Firebase when it is the source of truth. Use in routes. */
async function loadState() {
  await refresh();
  return getState();
}

function currentStep(s = state) {
  if (!s.incident || s.phase !== PHASE.FIX) return null;
  return s.incident.playbook.containment[s.incident.currentStepIndex] || null;
}

// --- Commands ---------------------------------------------------------------

/** Phase 1 (Hack): called by the webhook when the sensor reports a threat. */
function openIncident(alert) {
  return mutate((draft) => {
    const receivedAt = new Date().toISOString();
    const active = draft.incident && draft.phase !== PHASE.RESOLVED;

    if (active) {
      // Already responding: attach the alert, never reset the user's progress.
      const related = draft.incident.relatedAlerts || (draft.incident.relatedAlerts = []);
      related.push({ ...alert, receivedAt });
      if (related.length > MAX_RELATED) related.shift();
      if ((SEVERITY_RANK[alert.severity] || 0) > (SEVERITY_RANK[draft.incident.severity] || 0)) {
        draft.incident.severity = alert.severity;
      }
      addTimeline(draft, 'alert', `Additional alert: ${alert.summary || alert.threatType}`, {
        threatType: alert.threatType,
      });
      return { created: false, state: draft };
    }

    const playbook = playbooks.resolvePlaybook(alert.threatType, alert);
    draft.status = STATUS.BREACH;
    draft.phase = PHASE.FIX;
    draft.incident = {
      id: `INC-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
      threatType: alert.threatType,
      severity: alert.severity,
      deviceId: alert.deviceId,
      sourceIp: alert.sourceIp || null,
      summary: alert.summary || playbook.plainName,
      evidence: alert.evidence || null,
      signatureId: alert.signatureId || null,
      source: alert.source || 'agent',
      detectedAt: alert.timestamp,
      receivedAt,
      playbook,
      currentStepIndex: 0,
      completedSteps: [],
      learnAcknowledged: false,
      completedMitigations: [],
      escalation: null,
      relatedAlerts: [],
      timeline: [],
    };
    addTimeline(draft, 'detected', `${playbook.name} detected on ${alert.deviceId}`, { device: alert.deviceId });
    if (playbook.isFallback) {
      addTimeline(draft, 'fallback', 'Unrecognised threat - universal containment playbook loaded');
    }
    return { created: true, state: draft };
  });
}

/** Phase 2 (Fix): the human confirms they physically did the current step. */
function confirmStep(stepId) {
  return mutate((draft) => {
    requireIncident(draft, PHASE.FIX);
    const step = currentStep(draft);
    if (!step || step.id !== stepId) {
      throw new WorkflowError(`Step "${stepId}" is not the current step${step ? ` ("${step.id}")` : ''}.`);
    }
    draft.incident.completedSteps.push({ stepId, title: step.title, confirmedAt: new Date().toISOString() });
    draft.incident.currentStepIndex += 1;
    addTimeline(draft, 'confirmed', `Owner confirmed: ${step.confirmLabel}`, { stepId });

    if (draft.incident.currentStepIndex >= draft.incident.playbook.containment.length) {
      draft.status = STATUS.CONTAINED;
      draft.phase = PHASE.LEARN;
      draft.incident.containedAt = new Date().toISOString();
      addTimeline(draft, 'contained', 'Threat contained - moving to post-mortem');
    }
  });
}

/** Phase 3 (Learn): the human has read the explanation. */
function acknowledgeLearn() {
  return mutate((draft) => {
    requireIncident(draft, PHASE.LEARN);
    draft.incident.learnAcknowledged = true;
    draft.phase = PHASE.PREVENT;
    addTimeline(draft, 'learned', 'Owner reviewed how the attack worked');
  });
}

/** Phase 4 (Prevent): run a 1-click hardening action the human chose. */
function applyMitigation(actionId) {
  return mutate(async (draft) => {
    requireIncident(draft, PHASE.PREVENT);
    const { incident } = draft;
    const action = incident.playbook.prevent.find((item) => item.id === actionId);
    if (!action) throw new WorkflowError(`"${actionId}" is not part of this incident's plan.`, 400);
    if (incident.completedMitigations.some((m) => m.actionId === actionId)) return draft; // idempotent

    const receipt = await mitigations.apply(actionId, incident);
    incident.completedMitigations.push({ ...receipt, title: action.title });
    addTimeline(draft, 'hardened', `${action.title}: ${receipt.detail}`, { actionId });

    if (incident.completedMitigations.length >= incident.playbook.prevent.length) {
      draft.status = STATUS.SECURE;
      draft.phase = PHASE.RESOLVED;
      incident.resolvedAt = new Date().toISOString();
      addTimeline(draft, 'resolved', 'All hardening complete - system secure');
      await firebase.appendHistory({
        id: incident.id,
        threatType: incident.threatType,
        severity: incident.severity,
        deviceId: incident.deviceId,
        detectedAt: incident.detectedAt,
        containedAt: incident.containedAt,
        resolvedAt: incident.resolvedAt,
        escalated: Boolean(incident.escalation),
        mitigations: incident.completedMitigations.map((m) => m.actionId),
      });
    }
  });
}

/** Available at any point during an incident; never blocks the workflow. */
function escalate(note = '') {
  return mutate((draft) => {
    if (!draft.incident || draft.phase === PHASE.RESOLVED) {
      throw new WorkflowError('There is no active incident to escalate.');
    }
    if (!draft.incident.escalation) {
      draft.incident.escalation = {
        requestedAt: new Date().toISOString(),
        note: String(note).slice(0, 500),
        ...playbooks.getEscalation(),
      };
      addTimeline(draft, 'escalated', 'Escalated to a human expert');
    }
  });
}

function reset() {
  return mutate((draft) => {
    Object.keys(draft).forEach((key) => delete draft[key]);
    Object.assign(draft, baseline());
  });
}

/** Restore persisted state on boot (Firebase mode) so a restart keeps progress. */
async function hydrate() {
  const saved = await firebase.readState();
  if (saved && saved.status) {
    state = normalize(saved);
    if (upgradeLegacy(state)) await firebase.writeState(state);
  } else await firebase.writeState(state);
  return getState();
}

/** Firebase RTDB drops empty arrays; put them back after reading. */
function normalize(saved) {
  const incident = saved.incident;
  if (incident) {
    for (const key of ['completedSteps', 'completedMitigations', 'relatedAlerts', 'timeline']) {
      incident[key] = incident[key] || [];
    }
  }
  return saved;
}

/**
 * Bring an incident saved before multi-language support up to date: attach
 * playbook/escalation translations and the timeline parameters the dashboard
 * uses to show each entry in the viewer's language. Returns true if changed.
 */
function upgradeLegacy(current) {
  const incident = current?.incident;
  if (!incident?.playbook) return false;
  let changed = false;

  if (!incident.playbook.translations) {
    const fresh = playbooks.resolvePlaybook(incident.threatType, incident);
    incident.playbook.translations = fresh.translations;
    changed = true;
  }
  if (incident.escalation && !incident.escalation.translations) {
    incident.escalation.translations = playbooks.getEscalation().translations;
    changed = true;
  }

  for (const entry of incident.timeline) {
    if (entry.params) continue;
    if (entry.type === 'detected') {
      entry.params = { device: incident.deviceId };
      changed = true;
    } else if (entry.type === 'confirmed') {
      const step = incident.playbook.containment.find((s) => entry.text === `Owner confirmed: ${s.confirmLabel}`);
      if (step) {
        entry.params = { stepId: step.id };
        changed = true;
      }
    } else if (entry.type === 'hardened') {
      const action = incident.playbook.prevent.find((a) => entry.text.startsWith(`${a.title}:`));
      if (action) {
        entry.params = { actionId: action.id };
        changed = true;
      }
    }
  }
  return changed;
}

module.exports = {
  STATUS,
  PHASE,
  WorkflowError,
  getState,
  loadState,
  currentStep,
  openIncident,
  confirmStep,
  acknowledgeLearn,
  applyMitigation,
  escalate,
  reset,
  hydrate,
  upgradeLegacy,
};
