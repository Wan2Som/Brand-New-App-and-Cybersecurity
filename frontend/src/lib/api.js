/**
 * Thin fetch wrappers for the backend. Components never call fetch directly.
 */
import { API_URL } from './config';

// Errors carry `status` (HTTP code, or 0 when the server couldn't be reached).
// The UI shows its own translated text for them (errorText in lib/i18n);
// `message` keeps the backend's English detail for debugging.
async function request(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    const error = new Error(err.message || 'Network error');
    error.status = 0;
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export const api = {
  health: () => request('/api/health'),
  history: () => request('/api/incident/history'),
  getState: () => request('/api/incident/state'),
  streamUrl: () => `${API_URL}/api/incident/stream`,

  chat: ({ event, message, history, language }) =>
    request('/api/chat', { method: 'POST', body: { event, message, history, language } }),

  confirmStep: (stepId) => request('/api/incident/confirm', { method: 'POST', body: { stepId } }),
  acknowledgeLearn: () => request('/api/incident/learn', { method: 'POST', body: {} }),
  // `confirmed: true` records that a person clicked the button (HITL).
  applyMitigation: (actionId) => request('/api/incident/mitigate', { method: 'POST', body: { actionId, confirmed: true } }),
  escalate: (note) => request('/api/incident/escalate', { method: 'POST', body: { note } }),

  listScenarios: () => request('/api/demo/scenarios'),
  simulate: (scenario) => request('/api/demo/simulate', { method: 'POST', body: { scenario } }),
  reset: () => request('/api/demo/reset', { method: 'POST', body: {} }),
};
