import { formatTime, playbookFor } from '@/lib/incident';
import { useI18n } from '@/lib/i18n';
import { receiptText } from './ActionCard';

/**
 * Running record of what happened and what the owner confirmed (post-mortem
 * evidence). Entries are re-rendered in the viewer's language from their
 * parameters; the backend's English `text` is the fallback.
 */
function entryText(entry, incident, playbook, t) {
  const p = entry.params || {};
  switch (entry.type) {
    case 'detected':
      return t('timeline.detected', { threat: playbook.name, device: p.device || incident.deviceId });
    case 'confirmed': {
      const step = playbook.containment.find((s) => s.id === p.stepId);
      return step ? t('timeline.confirmed', { step: step.confirmLabel }) : entry.text;
    }
    case 'hardened': {
      const action = playbook.prevent.find((a) => a.id === p.actionId);
      const receipt = incident.completedMitigations.find((m) => m.actionId === p.actionId);
      return action && receipt ? t('timeline.hardened', { action: action.title, detail: receiptText(t, receipt) }) : entry.text;
    }
    case 'alert':
    case 'fallback':
    case 'contained':
    case 'learned':
    case 'resolved':
    case 'escalated':
      return t(`timeline.${entry.type}`);
    default:
      return entry.text;
  }
}

export default function IncidentTimeline({ incident }) {
  const { t, lang, locale } = useI18n();
  if (!incident?.timeline?.length) return null;
  const playbook = playbookFor(incident, lang);
  const entries = [...incident.timeline].reverse();

  return (
    <section className="timeline" aria-labelledby="timeline-title" data-spotlight>
      <h2 id="timeline-title">{t('timeline.title')}</h2>
      <ol>
        {entries.map((entry, i) => (
          <li key={`${entry.at}-${i}`} className={`timeline__item timeline__item--${entry.type}`}>
            <time dateTime={entry.at}>{formatTime(entry.at, locale)}</time>
            <span>{entryText(entry, incident, playbook, t)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
