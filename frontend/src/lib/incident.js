/**
 * Pure helpers that turn raw incident state into what the UI needs.
 * Keeping them here means components stay presentational.
 */
import { localize } from './i18n';

/** Phase ids in order; labels come from i18n (phases.<ID>.label). */
export const PHASES = ['HACK', 'FIX', 'LEARN', 'PREVENT'];

const EMPTY_STATE = { status: 'SECURE', phase: 'MONITORING', incident: null };

function normalizePlaybook(playbook = {}) {
  return {
    ...playbook,
    containment: playbook.containment || [],
    prevent: playbook.prevent || [],
    doNot: playbook.doNot || [],
  };
}

/** Firebase drops empty arrays; restore them so components can map safely. */
export function normalizeState(raw) {
  if (!raw || !raw.status) return EMPTY_STATE;
  const state = { ...raw };
  if (state.incident) {
    const incident = { ...state.incident };
    for (const key of ['completedSteps', 'completedMitigations', 'relatedAlerts', 'timeline']) {
      incident[key] = incident[key] || [];
    }
    const translations = Object.fromEntries(
      Object.entries(incident.playbook?.translations || {}).map(([lang, pb]) => [lang, normalizePlaybook(pb)]),
    );
    incident.playbook = { ...normalizePlaybook(incident.playbook), translations };
    state.incident = incident;
  }
  return state;
}

/** The incident's playbook in the viewer's language (English if no translation). */
export function playbookFor(incident, lang) {
  return incident ? localize(incident.playbook, lang) : null;
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

export function currentStep(state, lang) {
  if (state.phase !== 'FIX' || !state.incident) return null;
  const { containment } = playbookFor(state.incident, lang);
  const index = state.incident.currentStepIndex;
  return containment[index] ? { ...containment[index], index, total: containment.length } : null;
}

export function isActiveIncident(state) {
  return Boolean(state.incident) && state.phase !== 'RESOLVED' && state.phase !== 'MONITORING';
}

export function formatTime(iso, locale) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(locale || [], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** { key: 'seconds' | 'minutes', n } for the i18n strings card.seconds / card.minutes. */
export function durationBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const ms = new Date(toIso) - new Date(fromIso);
  if (ms < 60_000) return { key: 'seconds', n: Math.max(1, Math.round(ms / 1000)) };
  return { key: 'minutes', n: Math.round(ms / 60_000) };
}
