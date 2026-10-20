import { currentStep, minutesBetween } from '@/lib/incident';

/**
 * The step placard. Shows exactly one thing to do, and the button the owner
 * presses to confirm they did it (Human-in-the-loop). Buttons come from the
 * vetted playbook in state, never from the AI.
 *
 * Callbacks: onConfirm(stepId), onAcknowledge(), onMitigate(actionId), onEscalate()
 */
export default function ActionCard({ state, busy, error, onConfirm, onAcknowledge, onMitigate, onEscalate }) {
  const { incident, phase } = state;

  // Idle (no incident) is rendered by ProtectionStatus instead.
  if (!incident || phase === 'MONITORING') return null;

  // Re-keyed on every step/phase so new content slides in after each confirmation.
  const contentKey = `${phase}-${incident.currentStepIndex}`;

  return (
    <section className={`card card--${phase.toLowerCase()}`} aria-labelledby="card-title" data-spotlight>
      <div key={contentKey} className="swap-in">
        {phase === 'FIX' && <FixStep state={state} busy={busy} onConfirm={onConfirm} />}
        {phase === 'LEARN' && <LearnPanel learn={incident.playbook.learn} busy={busy} onAcknowledge={onAcknowledge} />}
        {phase === 'PREVENT' && <PreventList incident={incident} busy={busy} onMitigate={onMitigate} />}
        {phase === 'RESOLVED' && <Resolved incident={incident} />}
      </div>

      {error && (
        <p className="card__error" role="alert">
          {error}
        </p>
      )}

      {phase !== 'RESOLVED' && <Escalation incident={incident} busy={busy} onEscalate={onEscalate} />}
    </section>
  );
}

function FixStep({ state, busy, onConfirm }) {
  const step = currentStep(state);
  const { playbook } = state.incident;
  if (!step) return null;

  return (
    <>
      <p className="card__kicker">
        Step {step.index + 1} of {step.total}
      </p>
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
        {busy === `step:${step.id}` ? 'Saving…' : step.confirmLabel}
      </button>

      <ol className="steps" aria-label="All containment steps">
        {playbook.containment.map((s, i) => (
          <li key={s.id} className={i < step.index ? 'is-done' : i === step.index ? 'is-current' : ''}>
            {s.title}
          </li>
        ))}
      </ol>

      {playbook.doNot.length > 0 && (
        <div className="donot">
          <h3>Please don't</h3>
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
  return (
    <>
      <p className="card__kicker">Threat contained. Here's what happened.</p>
      <h2 id="card-title" className="card__title card__title--quote">
        {learn.analogy}
      </h2>
      <dl className="learn">
        <div>
          <dt>How it got in</dt>
          <dd>{learn.howItHappened}</dd>
        </div>
        <div>
          <dt>Why it matters</dt>
          <dd>{learn.businessImpact}</dd>
        </div>
      </dl>
      <button type="button" className="btn btn--confirm" onClick={onAcknowledge} disabled={Boolean(busy)}>
        {busy === 'learn' ? 'Saving…' : 'Got it, show me how to prevent this'}
      </button>
    </>
  );
}

function PreventList({ incident, busy, onMitigate }) {
  const { prevent } = incident.playbook;
  const done = new Map(incident.completedMitigations.map((m) => [m.actionId, m]));

  return (
    <>
      <p className="card__kicker">
        {done.size} of {prevent.length} fixes applied
      </p>
      <h2 id="card-title" className="card__title">
        Stop this happening again
      </h2>
      <p className="card__lead">Nothing changes until you press a button. Apply all of them to return to green.</p>

      <ul className="fixes">
        {prevent.map((action) => {
          const receipt = done.get(action.id);
          const pending = busy === `fix:${action.id}`;
          return (
            <li key={action.id} className={receipt ? 'fix is-done' : 'fix'}>
              <div className="fix__text">
                <h3>{action.title}</h3>
                <p>{receipt ? receipt.detail : action.description}</p>
                {receipt?.simulated && <span className="fix__tag">Demo: simulated</span>}
              </div>
              {receipt ? (
                <span className="fix__done" aria-label="Applied">
                  ✓ Applied
                </span>
              ) : (
                <button
                  type="button"
                  className="btn btn--fix"
                  onClick={() => onMitigate(action.id)}
                  disabled={Boolean(busy)}
                  aria-busy={pending}
                >
                  {pending ? 'Applying…' : action.actionLabel}
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
  return (
    <>
      <p className="card__kicker">Incident {incident.id} closed</p>
      <h2 id="card-title" className="card__title">
        You handled it
      </h2>
      <dl className="summary">
        <div>
          <dt>Time to contain</dt>
          <dd>{minutesBetween(incident.receivedAt, incident.containedAt) || 'n/a'}</dd>
        </div>
        <div>
          <dt>Steps confirmed</dt>
          <dd>{incident.completedSteps.length}</dd>
        </div>
        <div>
          <dt>Protections added</dt>
          <dd>{incident.completedMitigations.length}</dd>
        </div>
      </dl>
      <p className="card__lead">
        Have your IT vendor check {incident.deviceId} before it's used for banking or payroll again.
      </p>
    </>
  );
}

function Escalation({ incident, busy, onEscalate }) {
  const { escalation, playbook } = incident;

  if (!escalation) {
    return (
      <div className={`escalate ${playbook.isFallback ? 'escalate--urgent' : ''}`}>
        <p>{playbook.isFallback ? "We don't recognise this threat. An expert should look at it." : 'Unsure, or is it getting worse?'}</p>
        <button type="button" className="btn btn--escalate" onClick={() => onEscalate()} disabled={Boolean(busy)}>
          {busy === 'escalate' ? 'Requesting…' : 'Escalate to a human expert'}
        </button>
      </div>
    );
  }

  return (
    <div className="escalate escalate--open" role="region" aria-label="Expert contacts">
      <h3>Expert help</h3>
      <ul className="contacts">
        {escalation.contacts.map((contact) => (
          <li key={contact.name}>
            <strong>{contact.name}</strong>
            <span>{contact.detail}</span>
            <span className="contacts__purpose">{contact.purpose}</span>
            {contact.phone && (
              <a className="contacts__call" href={`tel:${contact.phone}`}>
                Call now
              </a>
            )}
          </li>
        ))}
      </ul>
      <p className="escalate__evidence">{escalation.preserveEvidence}</p>
    </div>
  );
}
