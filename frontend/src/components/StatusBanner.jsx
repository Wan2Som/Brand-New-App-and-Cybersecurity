import PhaseTrack from './PhaseTrack';
import StatusOrb from './StatusOrb';
import { activePhaseIndex, bannerTone, formatTime } from '@/lib/incident';

const WORDS = {
  secure: 'Secure',
  alarm: 'Under attack',
  contained: 'Contained',
};

/**
 * The primary status signal: red and pulsing on breach, amber once contained,
 * green when secure. Purely presentational: all values come in as props.
 * `shake` is set for a moment when a breach first lands.
 */
export default function StatusBanner({ state, shake = false }) {
  const tone = bannerTone(state);
  const { incident, phase } = state;

  let detail = 'No threats detected. The sensor is watching your systems.';
  if (incident && tone === 'alarm') detail = incident.playbook.plainName;
  if (incident && tone === 'contained') detail = 'The threat is cut off. Finish the remaining steps to close the incident.';
  if (incident && phase === 'RESOLVED') detail = `Incident closed at ${formatTime(incident.resolvedAt)}. Protection has been strengthened.`;

  return (
    <header className={`banner banner--${tone} ${shake ? 'banner--shake' : ''}`} role="status" aria-live="assertive">
      <div className="banner__inner">
        <div className="banner__main">
          <StatusOrb tone={tone} />
          {/* Keyed on tone so the words re-enter with a blur-in when the status changes */}
          <div key={tone} className="swap-in">
            <h1 className="banner__word">{WORDS[tone]}</h1>
            <p className="banner__detail">{detail}</p>
          </div>
        </div>

        {incident && phase !== 'RESOLVED' && (
          <dl className="banner__facts">
            <div>
              <dt>Device</dt>
              <dd>{incident.deviceId}</dd>
            </div>
            <div>
              <dt>Severity</dt>
              <dd>{incident.severity.charAt(0) + incident.severity.slice(1).toLowerCase()}</dd>
            </div>
            <div>
              <dt>Detected</dt>
              <dd>{formatTime(incident.receivedAt)}</dd>
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
