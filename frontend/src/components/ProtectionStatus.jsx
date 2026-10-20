import { useEffect, useState } from 'react';

/**
 * Idle-state panel: what is protecting the business right now.
 * Every number comes from the backend or this session, nothing is invented.
 */
function useTicker(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export default function ProtectionStatus({ connected, stats }) {
  const now = useTicker();
  const { health, resolvedCount, watchingSince } = stats;

  const checks = [
    { label: 'Sensor connected', ok: connected, detail: connected ? 'Live alerts are switched on' : 'Reconnecting…' },
    {
      label: 'Vetted response playbooks',
      ok: Boolean(health),
      detail: health ? 'NIST and CISA steps, written for business owners' : 'Checking…',
    },
    {
      label: 'Emergency guide',
      ok: Boolean(health),
      detail: !health ? 'Checking…' : health.ai === 'playbook-only' ? 'Playbook mode (works offline)' : `AI guide on (${health.ai})`,
    },
  ];

  return (
    <section className="card card--idle" aria-labelledby="card-title" data-spotlight>
      <div className="swap-in">
        <p className="card__kicker">Protection status</p>
        <h2 id="card-title" className="card__title">
          All quiet. You're covered.
        </h2>
        <p className="card__lead">
          If an attack starts, this panel turns into a step-by-step guide with one button to press after each step.
        </p>

        <dl className="stats">
          <div>
            <dt>Watching for</dt>
            <dd className="tabular">{formatDuration(now - watchingSince)}</dd>
          </div>
          <div>
            <dt>Attack types recognised</dt>
            <dd>{health ? health.threatTypes : '–'}</dd>
            <span className="stats__note">plus a safe plan for unknown ones</span>
          </div>
          <div>
            <dt>Incidents resolved</dt>
            <dd>{resolvedCount ?? '–'}</dd>
          </div>
        </dl>

        <ul className="checks">
          {checks.map((check) => (
            <li key={check.label} className={check.ok ? 'is-ok' : 'is-pending'}>
              <span className="checks__dot" aria-hidden="true" />
              <span>
                <strong>{check.label}</strong>
                <span className="checks__detail">{check.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
