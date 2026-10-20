/**
 * Pure helpers that turn raw incident state into what the UI needs.
 * Keeping them here means components stay presentational.
 */

export const PHASES = [
  { id: 'HACK', label: 'Hack', hint: 'Threat detected' },
  { id: 'FIX', label: 'Fix', hint: 'Contain it' },
  { id: 'LEARN', label: 'Learn', hint: 'What happened' },
  { id: 'PREVENT', label: 'Prevent', hint: 'Harden' },
];

const EMPTY_STATE = { status: 'SECURE', phase: 'MONITORING', incident: null };

/** Firebase drops empty arrays; restore them so components can map safely. */
export function normalizeState(raw) {
  if (!raw || !raw.status) return EMPTY_STATE;
  const state = { ...raw };
  if (state.incident) {
    const incident = { ...state.incident };
    for (const key of ['completedSteps', 'completedMitigations', 'relatedAlerts', 'timeline']) {
      incident[key] = incident[key] || [];
    }
    incident.playbook = {
      ...incident.playbook,
      containment: incident.playbook?.containment || [],
      prevent: incident.playbook?.prevent || [],
      doNot: incident.playbook?.doNot || [],
    };
    state.incident = incident;
  }
  return state;
}

/** 'alarm' | 'contained' | 'secure' - drives banner colour. */
export function bannerTone(state) {
  if (state.status === 'BREACH_DETECTED') return 'alarm';
  if (state.status === 'CONTAINED') return 'contained';
  return 'secure';
}

/**
 * Index into PHASES of the stage the owner is on, or -1 when monitoring.
 * Hack is done the instant an incident opens, so FIX is the first live stage.
 */
export function activePhaseIndex(state) {
  switch (state.phase) {
    case 'FIX':
      return 1;
    case 'LEARN':
      return 2;
    case 'PREVENT':
      return 3;
    case 'RESOLVED':
      return 4;
    default:
      return -1;
  }
}

export function currentStep(state) {
  if (state.phase !== 'FIX' || !state.incident) return null;
  const { containment } = state.incident.playbook;
  const index = state.incident.currentStepIndex;
  return containment[index] ? { ...containment[index], index, total: containment.length } : null;
}

export function isActiveIncident(state) {
  return Boolean(state.incident) && state.phase !== 'RESOLVED' && state.phase !== 'MONITORING';
}

export function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function minutesBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const ms = new Date(toIso) - new Date(fromIso);
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))} sec`;
  return `${Math.round(ms / 60_000)} min`;
}
