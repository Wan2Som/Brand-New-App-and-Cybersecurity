/**
 * Live incident state.
 *
 * Firebase Realtime Database when configured (onValue, sub-second), otherwise
 * the backend's Server-Sent Events stream. Either way the component tree just
 * receives `state` and re-renders, which is how the banner turns red < 2 s.
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { USE_FIREBASE } from '@/lib/config';
import { subscribeToState } from '@/lib/firebaseClient';
import { normalizeState } from '@/lib/incident';

export default function useRealtimeAlert() {
  const [state, setState] = useState(() => normalizeState(null));
  const [connected, setConnected] = useState(false);
  const [deliveredMs, setDeliveredMs] = useState(null);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false); // true once real state has arrived
  const lastIncidentId = useRef(null);

  useEffect(() => {
    const receive = (raw) => {
      const next = normalizeState(raw);
      const id = next.incident?.id || null;
      // Measure server-receive -> screen latency once per new incident (pitch proof of < 2 s).
      if (id && id !== lastIncidentId.current && next.incident.receivedAt) {
        const ms = Date.now() - Date.parse(next.incident.receivedAt);
        setDeliveredMs(ms >= 0 && ms < 60_000 ? ms : null);
      }
      lastIncidentId.current = id;
      setState(next);
      setLoaded(true);
      setError(null);
    };

    if (USE_FIREBASE) {
      return subscribeToState(receive, setConnected, (err) => setError(err.message));
    }

    // SSE: EventSource reconnects automatically after drops.
    let source;
    let cancelled = false;
    api.getState().then((s) => !cancelled && receive(s)).catch((err) => setError(err.message));

    source = new EventSource(api.streamUrl());
    source.addEventListener('open', () => setConnected(true));
    source.addEventListener('state', (event) => receive(JSON.parse(event.data)));
    source.addEventListener('error', () => {
      setConnected(false);
      setError('Lost connection to the monitoring service. Reconnecting…');
    });

    return () => {
      cancelled = true;
      source?.close();
    };
  }, []);

  return { state, loaded, connected, deliveredMs, error, transport: USE_FIREBASE ? 'firebase' : 'sse' };
}
