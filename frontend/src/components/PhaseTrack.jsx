import { PHASES } from '@/lib/incident';

/**
 * Hack -> Fix -> Learn -> Prevent progress track.
 * @param {{ activeIndex: number }} props  -1 = monitoring, 4 = all done
 */
export default function PhaseTrack({ activeIndex }) {
  return (
    <ol className="phase-track" aria-label="Response progress">
      {PHASES.map((phase, i) => {
        const status = activeIndex < 0 ? 'idle' : i < activeIndex ? 'done' : i === activeIndex ? 'current' : 'todo';
        return (
          <li key={phase.id} className={`phase phase--${status}`} aria-current={status === 'current' ? 'step' : undefined}>
            <span className="phase__num" aria-hidden="true">
              {status === 'done' ? '✓' : i + 1}
            </span>
            <span className="phase__text">
              <span className="phase__label">{phase.label}</span>
              <span className="phase__hint">{phase.hint}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
