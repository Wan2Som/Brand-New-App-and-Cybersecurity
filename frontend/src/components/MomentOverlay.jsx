/**
 * Full-screen, click-through effects for the two big moments:
 * a red edge flash on breach, and a green wave + toast when all clear.
 */
import { useI18n } from '@/lib/i18n';

export default function MomentOverlay({ moment }) {
  const { t } = useI18n();
  if (!moment) return null;

  return (
    <div key={moment.key} className={`moment moment--${moment.type}`} aria-hidden={moment.type === 'breach'}>
      <span className="moment__flash" />
      {moment.type === 'resolved' && (
        <>
          <span className="moment__ring" />
          <span className="moment__ring moment__ring--late" />
          <div className="moment__toast" role="status">
            <span className="moment__toast-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            {t('moment.allClear')}
          </div>
        </>
      )}
    </div>
  );
}
