import { formatTime } from '@/lib/incident';

/** Running record of what happened and what the owner confirmed (post-mortem evidence). */
export default function IncidentTimeline({ incident }) {
  if (!incident?.timeline?.length) return null;
  const entries = [...incident.timeline].reverse();

  return (
    <section className="timeline" aria-labelledby="timeline-title" data-spotlight>
      <h2 id="timeline-title">Incident record</h2>
      <ol>
        {entries.map((entry, i) => (
          <li key={`${entry.at}-${i}`} className={`timeline__item timeline__item--${entry.type}`}>
            <time dateTime={entry.at}>{formatTime(entry.at)}</time>
            <span>{entry.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
