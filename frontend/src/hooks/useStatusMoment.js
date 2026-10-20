/**
 * Detects the two moments worth celebrating (or alarming) on screen:
 *   'breach'   - a new incident just opened
 *   'resolved' - the incident just closed and the system is green again
 * Ignores whatever state the page loads into (`loaded` = first real data has
 * arrived), so a refresh in the middle of an incident doesn't replay them.
 */
import { useEffect, useRef, useState } from 'react';

const DURATION_MS = { breach: 1600, resolved: 3200 };

export default function useStatusMoment(state, loaded) {
  const [moment, setMoment] = useState(null);
  const prevRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  useEffect(() => {
    if (!loaded) return undefined;
    const current = { incidentId: state.incident?.id || null, phase: state.phase };
    const prev = prevRef.current;
    prevRef.current = current;
    if (!prev) return undefined; // first observation (page load)

    let type = null;
    if (current.phase === 'FIX' && current.incidentId && current.incidentId !== prev.incidentId) type = 'breach';
    else if (current.phase === 'RESOLVED' && prev.phase !== 'RESOLVED') type = 'resolved';
    if (!type) return undefined;

    setMoment({ type, key: `${type}-${current.incidentId}` });
    // Own timer (not effect cleanup) so a quick follow-up state change can't leave the overlay stuck.
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMoment(null), DURATION_MS[type]);
    return undefined;
  }, [loaded, state.incident?.id, state.phase]);

  return moment;
}
