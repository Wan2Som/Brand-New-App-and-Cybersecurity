import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';

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
  const { t, lang } = useI18n();
  const now = useTicker();
  const { health, resolvedCount, watchingSince } = stats;

  let guideDetail = t('protection.checking');
  if (health) guideDetail = health.ai === 'playbook-only' ? t('protection.guideOffline') : t('protection.guideAi', { model: health.ai });

  const checks = [
    { id: 'sensor', label: t('protection.sensor'), ok: connected, detail: connected ? t('protection.sensorOn') : t('protection.sensorOff') },
    {
      id: 'playbooks',
      label: t('protection.playbooks'),
      ok: Boolean(health),
      detail: health ? t('protection.playbooksDetail') : t('protection.checking'),
    },
    { id: 'guide', label: t('protection.guide'), ok: Boolean(health), detail: guideDetail },
  ];

  return (
    <section className="card card--idle" aria-labelledby="card-title" data-spotlight>
      <div key={lang} className="swap-in">
        <p className="card__kicker">{t('protection.kicker')}</p>
        <h2 id="card-title" className="card__title">
          {t('protection.title')}
        </h2>
        <p className="card__lead">{t('protection.lead')}</p>

        <dl className="stats">
          <div>
            <dt>{t('protection.watching')}</dt>
            <dd className="tabular">{formatDuration(now - watchingSince)}</dd>
          </div>
          <div>
            <dt>{t('protection.threatTypes')}</dt>
            <dd>{health ? health.threatTypes : '–'}</dd>
            <span className="stats__note">{t('protection.threatTypesNote')}</span>
          </div>
          <div>
            <dt>{t('protection.resolved')}</dt>
            <dd>{resolvedCount ?? '–'}</dd>
          </div>
        </dl>

        <ul className="checks">
          {checks.map((check) => (
            <li key={check.id} className={check.ok ? 'is-ok' : 'is-pending'}>
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
