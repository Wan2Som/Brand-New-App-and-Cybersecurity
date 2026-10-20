/**
 * Real numbers for the idle "protection status" panel: backend health
 * (playbooks loaded, AI mode) and how many incidents have been resolved.
 * Refreshes whenever an incident closes.
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function useProtectionStats(phase) {
  const [health, setHealth] = useState(null);
  const [resolvedCount, setResolvedCount] = useState(null);
  const [watchingSince] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    api.health().then((h) => !cancelled && setHealth(h)).catch(() => {});
    api
      .history()
      .then((h) => !cancelled && setResolvedCount(h.history.length))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [phase === 'RESOLVED']); // eslint-disable-line react-hooks/exhaustive-deps

  return { health, resolvedCount, watchingSince };
}
