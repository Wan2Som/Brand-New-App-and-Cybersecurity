import PhaseTrack from './PhaseTrack';
import StatusOrb from './StatusOrb';
import { activePhaseIndex, bannerTone, formatTime, playbookFor } from '@/lib/incident';
import { useI18n } from '@/lib/i18n';

/**
 * The primary status signal: red and pulsing on breach, amber once contained,
 * green when secure. Purely presentational: all values come in as props.
 * `shake` is set for a moment when a breach first lands.
 */
export default function StatusBanner({ state, shake = false }) {
  const { t, lang, locale } = useI18n();
  const tone = bannerTone(state);
  const { incident, phase } = state;
  const playbook = playbookFor(incident, lang);

  let detail = t('status.monitoring');
  if (incident && tone === 'alarm') detail = playbook.plainName;
  if (incident && tone === 'contained') detail = t('status.containedDetail');
  if (incident && phase === 'RESOLVED') detail = t('status.resolvedDetail', { time: formatTime(incident.resolvedAt, locale) });

  return (
    <header className={`banner banner--${tone} ${shake ? 'banner--shake' : ''}`} role="status" aria-live="assertive">
      <div className="banner__inner">
        <div className="banner__main">
          <StatusOrb tone={tone} />
          {/* Keyed on tone + language so the words re-enter with a blur-in when either changes */}
          <div key={`${tone}-${lang}`} className="swap-in">
            <h1 className="banner__word">{t(`status.${tone}`)}</h1>
            <p className="banner__detail">{detail}</p>
          </div>
        </div>

        {incident && phase !== 'RESOLVED' && (
          <dl className="banner__facts">
            <div>
              <dt>{t('status.device')}</dt>
              <dd>{incident.deviceId}</dd>
            </div>
            <div>
              <dt>{t('status.severity')}</dt>
              <dd>{t(`severity.${incident.severity}`)}</dd>
            </div>
            <div>
              <dt>{t('status.detected')}</dt>
              <dd>{formatTime(incident.receivedAt, locale)}</dd>
            </div>
          </dl>
        )}
      </div>

      <div className="banner__track">
        <PhaseTrack activeIndex={activePhaseIndex(state)} />
      </div>
    </header>
  );
}
