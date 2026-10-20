/**
 * Deterministic replies built straight from the pre-vetted playbook.
 *
 * Used when Gemini is not configured, times out, errors, or produces a reply
 * that fails the guardrails. The demo therefore never depends on the network.
 */

function stepText(step, index, total) {
  return [
    `**Step ${index + 1} of ${total}: ${step.title}**`,
    step.instruction,
    `_Why:_ ${step.why}`,
    `When you've done it, press **"${step.confirmLabel}"**.`,
  ].join('\n\n');
}

function currentStepText(incident) {
  const steps = incident.playbook.containment;
  const index = incident.currentStepIndex;
  return steps[index] ? stepText(steps[index], index, steps.length) : '';
}

function escalationText(playbook, escalation) {
  const contacts = (escalation?.contacts || [])
    .map((c) => `- **${c.name}**: ${c.detail}${c.purpose ? ` (${c.purpose})` : ''}`)
    .join('\n');
  return [`**Getting you a human expert.**`, contacts, escalation?.preserveEvidence || ''].filter(Boolean).join('\n\n');
}

const builders = {
  BREACH_OPENED: ({ incident }) => {
    const { playbook } = incident;
    const intro = playbook.isFallback
      ? `⚠️ **Something serious happened on ${incident.deviceId} that I don't recognise.** Stay calm. We'll use the safe, universal steps that work for every kind of attack, and get an expert involved.`
      : `⚠️ **${playbook.name} detected on ${incident.deviceId}.** ${playbook.plainName}. Stay calm, I'll guide you one step at a time.`;
    // The full "don't" list is on the step card; the chat repeats only the most important one.
    const doNot = playbook.doNot?.length ? `**Most important:** ${playbook.doNot[0]}` : '';
    return [intro, doNot, currentStepText(incident)].filter(Boolean).join('\n\n');
  },

  STEP_CONFIRMED: ({ incident }) => `✅ Got it, well done.\n\n${currentStepText(incident)}`,

  ENTER_LEARN: ({ incident }) => {
    const { learn } = incident.playbook;
    return [
      `🛡️ **The threat is contained.** You did the hard part. Here's what actually happened:`,
      `**In plain words:** ${learn.analogy}`,
      `**How it got in:** ${learn.howItHappened}`,
      `**Why it matters:** ${learn.businessImpact}`,
      `When you're ready, press **"Got it, show me how to prevent this"**.`,
    ].join('\n\n');
  },

  ENTER_PREVENT: ({ incident }) => {
    const list = incident.playbook.prevent.map((p) => `- **${p.title}**: ${p.description}`).join('\n');
    return `🔒 **Let's make sure this can't happen again.** Each fix below is one click, and nothing changes until you press the button:\n\n${list}\n\nComplete all of them to return to green.`;
  },

  RESOLVED: ({ incident }) =>
    `🟢 **All clear.** Incident ${incident.id} is closed and your business is better protected than before. Keep the affected computer checked by your IT vendor before using it for banking or payroll.`,

  ESCALATED: ({ incident }) => escalationText(incident.playbook, incident.escalation),

  USER_MESSAGE: ({ incident, phase }) => {
    if (!incident || phase === 'MONITORING') {
      return "All systems look normal right now. I'll alert you the moment the sensor sees something suspicious.";
    }
    if (phase === 'FIX') {
      return `I'm in offline playbook mode, so I'll keep it simple. Right now, focus on this:\n\n${currentStepText(incident)}\n\nIf you're unsure or things look worse, press **"Escalate to a human expert"**.`;
    }
    if (phase === 'LEARN') return builders.ENTER_LEARN({ incident });
    if (phase === 'PREVENT') return builders.ENTER_PREVENT({ incident });
    return builders.RESOLVED({ incident });
  },
};

function reply(event, state) {
  const builder = builders[event] || builders.USER_MESSAGE;
  return builder({ incident: state.incident, phase: state.phase });
}

module.exports = { reply, currentStepText };
