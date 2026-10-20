import { useEffect, useState } from 'react';

/**
 * Presenter panel for live judging: fire a canned attack through the real
 * alert pipeline, show how fast it reached the screen, and reset.
 */
export default function DemoControl({ loadScenarios, onSimulate, onReset, busy, deliveredMs, hasIncident }) {
  const [open, setOpen] = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!open || scenarios.length) return;
    loadScenarios()
      .then((data) => setScenarios(data.scenarios))
      .catch((err) => setLoadError(`Can't load attacks: ${err.message}. Is the backend running with DEMO_MODE=true?`));
  }, [open, scenarios.length, loadScenarios]);

  return (
    <aside className={`demo ${open ? 'demo--open' : ''}`} aria-label="Presenter controls">
      <button
        type="button"
        className="demo__toggle"
        aria-expanded={open}
        aria-label={open ? 'Hide presenter controls' : 'Presenter controls'}
        title="Presenter controls"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Close' : 'Demo'}
      </button>

      {open && (
        <div className="demo__panel">
          <h2>Simulate an attack</h2>
          {loadError && <p className="demo__error">{loadError}</p>}
          <ul className="demo__list">
            {scenarios.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSimulate(s.id)}
                  disabled={Boolean(busy) || hasIncident}
                  title={hasIncident ? 'Reset the current incident first' : s.description}
                >
                  <span className="demo__name">{s.label}</span>
                  <span className="demo__desc">{s.description}</span>
                </button>
              </li>
            ))}
          </ul>

          {deliveredMs != null && (
            <p className="demo__latency">
              Last alert reached this screen in <strong>{(deliveredMs / 1000).toFixed(2)} s</strong>
            </p>
          )}

          <button type="button" className="demo__reset" onClick={onReset} disabled={Boolean(busy)}>
            {busy === 'reset' ? 'Resetting…' : 'Reset to secure'}
          </button>
        </div>
      )}
    </aside>
  );
}
