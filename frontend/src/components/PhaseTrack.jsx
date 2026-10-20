import { PHASES } from '@/lib/incident';
import { useI18n } from '@/lib/i18n';

/**
 * Hack -> Fix -> Learn -> Prevent progress track.
 * @param {{ activeIndex: number }} props  -1 = monitoring, 4 = all done
 */
export default function PhaseTrack({ activeIndex }) {
  const { t } = useI18n();

  return (
    <ol className="phase-track" aria-label={t('phases.aria')}>
      {PHASES.map((id, i) => {
        const status = activeIndex < 0 ? 'idle' : i < activeIndex ? 'done' : i === activeIndex ? 'current' : 'todo';
        return (
          <li key={id} className={`phase phase--${status}`} aria-current={status === 'current' ? 'step' : undefined}>
            <span className="phase__num" aria-hidden="true">
              {status === 'done' ? '✓' : i + 1}
            </span>
            <span className="phase__text">
              <span className="phase__label">{t(`phases.${id}.label`)}</span>
              <span className="phase__hint">{t(`phases.${id}.hint`)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
