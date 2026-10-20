import { currentStep, durationBetween, playbookFor } from '@/lib/incident';
import { errorText, localize, useI18n } from '@/lib/i18n';

/**
 * The step placard. Shows exactly one thing to do, and the button the owner
 * presses to confirm they did it (Human-in-the-loop). Buttons come from the
 * vetted playbook in state, never from the AI.
 *
 * Callbacks: onConfirm(stepId), onAcknowledge(), onMitigate(actionId), onEscalate()
 */
export default function ActionCard({ state, busy, error, onConfirm, onAcknowledge, onMitigate, onEscalate }) {
  const { t, lang } = useI18n();
  const { incident, phase } = state;

  // Idle (no incident) is rendered by ProtectionStatus instead.
  if (!incident || phase === 'MONITORING') return null;

  const playbook = playbookFor(incident, lang);
  // Re-keyed on every step/phase/language so new content slides in after each change.
  const contentKey = `${phase}-${incident.currentStepIndex}-${lang}`;

  return (
    <section className={`card card--${phase.toLowerCase()}`} aria-labelledby="card-title" data-spotlight>
      <div key={contentKey} className="swap-in">
        {phase === 'FIX' && <FixStep state={state} playbook={playbook} busy={busy} onConfirm={onConfirm} />}
        {phase === 'LEARN' && <LearnPanel learn={playbook.learn} busy={busy} onAcknowledge={onAcknowledge} />}
        {phase === 'PREVENT' && <PreventList incident={incident} playbook={playbook} busy={busy} onMitigate={onMitigate} />}
        {phase === 'RESOLVED' && <Resolved incident={incident} />}
      </div>

      {error && (
        <p className="card__error" role="alert">
          {t('card.actionFailed', { message: errorText(t, error) })}
        </p>
      )}

      {phase !== 'RESOLVED' && <Escalation incident={incident} playbook={playbook} busy={busy} onEscalate={onEscalate} />}
    </section>
  );
}

function FixStep({ state, playbook, busy, onConfirm }) {
  const { t, lang } = useI18n();
  const step = currentStep(state, lang);
  if (!step) return null;

  return (
    <>
      <p className="card__kicker">{t('card.stepOf', { n: step.index + 1, total: step.total })}</p>
      <h2 id="card-title" className="card__title">
        {step.title}
      </h2>
      <p className="card__instruction">{step.instruction}</p>
      <p className="card__why">{step.why}</p>

      <button
        type="button"
        className="btn btn--confirm"
        onClick={() => onConfirm(step.id)}
        disabled={Boolean(busy)}
        aria-busy={busy === `step:${step.id}`}
      >
        {busy === `step:${step.id}` ? t('card.saving') : step.confirmLabel}
      </button>

      <ol className="steps" aria-label={t('card.allSteps')}>
        {playbook.containment.map((s, i) => (
          <li key={s.id} className={i < step.index ? 'is-done' : i === step.index ? 'is-current' : ''}>
            {s.title}
          </li>
        ))}
      </ol>

      {playbook.doNot.length > 0 && (
        <div className="donot">
          <h3>{t('card.doNot')}</h3>
          <ul>
            {playbook.doNot.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function LearnPanel({ learn, busy, onAcknowledge }) {
  const { t } = useI18n();
  return (
    <>
      <p className="card__kicker">{t('card.learnKicker')}</p>
      <h2 id="card-title" className="card__title card__title--quote">
        {learn.analogy}
      </h2>
      <dl className="learn">
        <div>
          <dt>{t('card.howItGotIn')}</dt>
          <dd>{learn.howItHappened}</dd>
        </div>
        <div>
          <dt>{t('card.whyItMatters')}</dt>
          <dd>{learn.businessImpact}</dd>
        </div>
      </dl>
      <button type="button" className="btn btn--confirm" onClick={onAcknowledge} disabled={Boolean(busy)}>
        {busy === 'learn' ? t('card.saving') : t('card.learnAck')}
      </button>
    </>
  );
}

/** A mitigation receipt in the viewer's language (falls back to the backend's English text). */
export function receiptText(t, receipt) {
  const key = `receipts.${receipt.actionId}`;
  const sourceIp = receipt.params?.sourceIp || t('receipts.attackerAddress');
  const text = t(key, { sourceIp });
  return text === key ? receipt.detail : text;
}

function PreventList({ incident, playbook, busy, onMitigate }) {
  const { t } = useI18n();
  const { prevent } = playbook;
  const done = new Map(incident.completedMitigations.map((m) => [m.actionId, m]));

  return (
    <>
      <p className="card__kicker">{t('card.fixesApplied', { done: done.size, total: prevent.length })}</p>
      <h2 id="card-title" className="card__title">
        {t('card.preventTitle')}
      </h2>
      <p className="card__lead">{t('card.preventLead')}</p>

      <ul className="fixes">
        {prevent.map((action) => {
          const receipt = done.get(action.id);
          const pending = busy === `fix:${action.id}`;
          return (
            <li key={action.id} className={receipt ? 'fix is-done' : 'fix'}>
              <div className="fix__text">
                <h3>{action.title}</h3>
                <p>{receipt ? receiptText(t, receipt) : action.description}</p>
                {receipt?.simulated && <span className="fix__tag">{t('card.simulated')}</span>}
              </div>
              {receipt ? (
                <span className="fix__done" aria-label={t('card.appliedAria')}>
                  {t('card.applied')}
                </span>
              ) : (
                <button
                  type="button"
                  className="btn btn--fix"
                  onClick={() => onMitigate(action.id)}
                  disabled={Boolean(busy)}
                  aria-busy={pending}
                >
                  {pending ? t('card.applying') : action.actionLabel}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Resolved({ incident }) {
  const { t } = useI18n();
  const duration = durationBetween(incident.receivedAt, incident.containedAt);

  return (
    <>
      <p className="card__kicker">{t('card.closed', { id: incident.id })}</p>
      <h2 id="card-title" className="card__title">
        {t('card.handled')}
      </h2>
      <dl className="summary">
        <div>
          <dt>{t('card.timeToContain')}</dt>
          <dd>{duration ? t(`card.${duration.key}`, { n: duration.n }) : t('card.notAvailable')}</dd>
        </div>
        <div>
          <dt>{t('card.stepsConfirmed')}</dt>
          <dd>{incident.completedSteps.length}</dd>
        </div>
        <div>
          <dt>{t('card.protectionsAdded')}</dt>
          <dd>{incident.completedMitigations.length}</dd>
        </div>
      </dl>
      <p className="card__lead">{t('card.vendorCheck', { device: incident.deviceId })}</p>
    </>
  );
}

function Escalation({ incident, playbook, busy, onEscalate }) {
  const { t, lang } = useI18n();
  const escalation = localize(incident.escalation, lang);

  if (!escalation) {
    return (
      <div className={`escalate ${playbook.isFallback ? 'escalate--urgent' : ''}`}>
        <p>{playbook.isFallback ? t('escalate.unknownPrompt') : t('escalate.prompt')}</p>
        <button type="button" className="btn btn--escalate" onClick={() => onEscalate()} disabled={Boolean(busy)}>
          {busy === 'escalate' ? t('escalate.requesting') : t('escalate.button')}
        </button>
      </div>
    );
  }

  return (
    <div className="escalate escalate--open" role="region" aria-label={t('escalate.aria')}>
      <h3>{t('escalate.heading')}</h3>
      <ul className="contacts">
        {escalation.contacts.map((contact) => (
          <li key={contact.name}>
            <strong>{contact.name}</strong>
            <span>{contact.detail}</span>
            <span className="contacts__purpose">{contact.purpose}</span>
            {contact.phone && (
              <a className="contacts__call" href={`tel:${contact.phone}`}>
                {t('escalate.call')}
              </a>
            )}
          </li>
        ))}
      </ul>
      <p className="escalate__evidence">{escalation.preserveEvidence}</p>
    </div>
  );
}
