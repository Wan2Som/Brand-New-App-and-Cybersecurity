import { useEffect, useState } from 'react';
import { errorText, useI18n } from '@/lib/i18n';

/**
 * Presenter panel for live judging: fire a canned attack through the real
 * alert pipeline, show how fast it reached the screen, and reset.
 */
export default function DemoControl({ loadScenarios, onSimulate, onReset, busy, deliveredMs, hasIncident }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!open || scenarios.length) return;
    loadScenarios()
      .then((data) => setScenarios(data.scenarios))
      .catch((err) => setLoadError(err));
  }, [open, scenarios.length, loadScenarios]);

  // Scenario names come from the backend in English; show ours when we have a translation.
  const scenarioText = (s, field) => {
    const key = `demo.scenarios.${s.id}.${field}`;
    const text = t(key);
    return text === key ? s[field] : text;
  };

  return (
    <aside className={`demo ${open ? 'demo--open' : ''}`} aria-label={t('demo.panelAria')}>
      <button
        type="button"
        className="demo__toggle"
        aria-expanded={open}
        aria-label={open ? t('demo.closeAria') : t('demo.openAria')}
        title={t('demo.openAria')}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? t('demo.close') : t('demo.open')}
      </button>

      {open && (
        <div className="demo__panel">
          <h2>{t('demo.title')}</h2>
          {loadError && <p className="demo__error">{t('demo.loadError', { message: errorText(t, loadError) })}</p>}
          <ul className="demo__list">
            {scenarios.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSimulate(s.id)}
                  disabled={Boolean(busy) || hasIncident}
                  title={hasIncident ? t('demo.resetFirst') : scenarioText(s, 'description')}
                >
                  <span className="demo__name">{scenarioText(s, 'label')}</span>
                  <span className="demo__desc">{scenarioText(s, 'description')}</span>
                </button>
              </li>
            ))}
          </ul>

          {deliveredMs != null && (
            <p className="demo__latency">{t('demo.latency', { seconds: (deliveredMs / 1000).toFixed(2) })}</p>
          )}

          <button type="button" className="demo__reset" onClick={onReset} disabled={Boolean(busy)}>
            {busy === 'reset' ? t('demo.resetting') : t('demo.reset')}
          </button>
        </div>
      )}
    </aside>
  );
}
