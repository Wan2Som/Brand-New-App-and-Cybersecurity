/**
 * Human-in-the-loop commands. Each one is triggered only by a button press;
 * the resulting state change arrives back through useRealtimeAlert.
 */
import { useCallback, useState } from 'react';
import { api } from '@/lib/api';

export default function useIncidentActions() {
  const [busy, setBusy] = useState(null); // id of the action in flight
  const [error, setError] = useState(null);

  const run = useCallback(async (key, fn) => {
    setBusy(key);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      // 409 = someone already advanced this step (e.g. a second screen); state will resync.
      if (err.status !== 409) setError(err.message);
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  return {
    busy,
    error,
    clearError: () => setError(null),
    confirmStep: (stepId) => run(`step:${stepId}`, () => api.confirmStep(stepId)),
    acknowledgeLearn: () => run('learn', () => api.acknowledgeLearn()),
    applyMitigation: (actionId) => run(`fix:${actionId}`, () => api.applyMitigation(actionId)),
    escalate: (note) => run('escalate', () => api.escalate(note)),
    simulate: (scenario) => run(`demo:${scenario}`, () => api.simulate(scenario)),
    reset: () => run('reset', () => api.reset()),
  };
}
