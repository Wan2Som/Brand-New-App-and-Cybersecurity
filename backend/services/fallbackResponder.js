/**
 * Deterministic replies built straight from the pre-vetted playbook, in
 * English or Bahasa Melayu.
 *
 * Used when Gemini is not configured, times out, errors, or produces a reply
 * that fails the guardrails. The demo therefore never depends on the network.
 */
const { localize, normalizeLanguage, resolvePlaybook, getEscalation } = require('./playbookService');

// Universal first steps shown when the owner asks a question with no incident open.
// The last universal step points at the escalate button, which only exists during an incident.
const IDLE_STEPS = 3;

const TEXT = {
  en: {
    step: (i, total, title) => `**Step ${i} of ${total}: ${title}**`,
    why: 'Why:',
    press: (label) => `When you've done it, press **"${label}"**.`,
    breachKnown: (name, device, plain) =>
      `⚠️ **${name} detected on ${device}.** ${plain}. Stay calm, I'll guide you one step at a time.`,
    breachUnknown: (device) =>
      `⚠️ **Something serious happened on ${device} that I don't recognise.** Stay calm. We'll use the safe, universal steps that work for every kind of attack, and get an expert involved.`,
    mostImportant: 'Most important:',
    confirmed: '✅ Got it, well done.',
    containedIntro: "🛡️ **The threat is contained.** You did the hard part. Here's what actually happened:",
    inPlainWords: 'In plain words:',
    howItGotIn: 'How it got in:',
    whyItMatters: 'Why it matters:',
    learnAck: 'When you\'re ready, press **"Got it, show me how to prevent this"**.',
    preventIntro:
      "🔒 **Let's make sure this can't happen again.** Each fix below is one click, and nothing changes until you press the button:",
    preventOutro: 'Complete all of them to return to green.',
    resolved: (id) =>
      `🟢 **All clear.** Incident ${id} is closed and your business is better protected than before. Keep the affected computer checked by your IT vendor before using it for banking or payroll.`,
    escalating: '**Getting you a human expert.**',
    monitoring:
      "All systems look normal right now. I'll alert you the moment the sensor sees something suspicious.",
    offlineFocus: (stepText) =>
      `I'm in offline playbook mode, so I'll keep it simple. Right now, focus on this:\n\n${stepText}\n\nIf you're unsure or things look worse, press **"Escalate to a human expert"**.`,
    idleIntro:
      "I'm **Siaga**, your cyber-emergency guide. A sensor watches this business's computers. If it spots an attack, this screen turns red and I take you through what to do, one step at a time.",
    idleIfHacked: "**If you think you've been hacked right now:**",
    idleWhoToCall: '**Who to call:**',
    idleOffline: "_I'm answering from the vetted playbook at the moment, so I can't go into other questions in detail._",
  },
  ms: {
    step: (i, total, title) => `**Langkah ${i} daripada ${total}: ${title}**`,
    why: 'Sebab:',
    press: (label) => `Selepas selesai, tekan **"${label}"**.`,
    breachKnown: (name, device, plain) =>
      `⚠️ **${name} dikesan pada ${device}.** ${plain}. Bertenang, saya akan bimbing anda satu langkah demi satu langkah.`,
    breachUnknown: (device) =>
      `⚠️ **Sesuatu yang serius berlaku pada ${device} dan saya tidak mengenalinya.** Bertenang. Kita akan guna langkah selamat yang sesuai untuk semua jenis serangan, dan dapatkan bantuan pakar.`,
    mostImportant: 'Paling penting:',
    confirmed: '✅ Baik, syabas.',
    containedIntro: '🛡️ **Ancaman sudah dibendung.** Bahagian paling sukar sudah selesai. Inilah yang sebenarnya berlaku:',
    inPlainWords: 'Secara mudah:',
    howItGotIn: 'Bagaimana ia masuk:',
    whyItMatters: 'Kenapa ia penting:',
    learnAck: 'Apabila sudah bersedia, tekan **"Faham, tunjuk cara mencegahnya"**.',
    preventIntro:
      '🔒 **Mari pastikan ini tidak berulang.** Setiap langkah di bawah hanya satu klik, dan tiada apa yang berubah sehingga anda menekan butang:',
    preventOutro: 'Lengkapkan semuanya untuk kembali ke status hijau.',
    resolved: (id) =>
      `🟢 **Semuanya selamat.** Insiden ${id} sudah ditutup dan perniagaan anda kini lebih terlindung. Minta vendor IT anda memeriksa komputer yang terjejas sebelum ia digunakan untuk perbankan atau gaji.`,
    escalating: '**Kami sedang dapatkan pakar untuk anda.**',
    monitoring:
      'Semua sistem kelihatan normal sekarang. Saya akan beri amaran sebaik sahaja sensor mengesan sesuatu yang mencurigakan.',
    offlineFocus: (stepText) =>
      `Saya dalam mod buku panduan luar talian, jadi saya ringkaskan. Sekarang, fokus pada ini:\n\n${stepText}\n\nJika tidak pasti atau keadaan bertambah teruk, tekan **"Dapatkan bantuan pakar"**.`,
    idleIntro:
      'Saya **Siaga**, panduan kecemasan siber anda. Sensor memantau komputer perniagaan ini. Jika ia mengesan serangan, skrin ini bertukar merah dan saya akan bimbing anda tentang apa yang perlu dibuat, satu langkah demi satu langkah.',
    idleIfHacked: '**Jika anda rasa anda sudah digodam sekarang:**',
    idleWhoToCall: '**Siapa yang perlu dihubungi:**',
    idleOffline: '_Saya sedang menjawab daripada buku panduan yang disemak, jadi saya tidak dapat menjawab soalan lain dengan terperinci._',
  },
};

function currentStepText(incident, lang = 'en') {
  const T = TEXT[normalizeLanguage(lang)];
  const playbook = localize(incident.playbook, lang);
  const steps = playbook.containment;
  const index = incident.currentStepIndex;
  const step = steps[index];
  if (!step) return '';
  return [T.step(index + 1, steps.length, step.title), step.instruction, `_${T.why}_ ${step.why}`, T.press(step.confirmLabel)].join(
    '\n\n',
  );
}

/** A question asked while nothing is happening: what Siaga is, the vetted first steps, who to call. */
function idleHelp(lang) {
  const T = TEXT[lang];
  const universal = localize(resolvePlaybook('UNKNOWN_ANOMALY'), lang);
  const steps = universal.containment
    .slice(0, IDLE_STEPS)
    .map((s, i) => `${i + 1}. **${s.title}**: ${s.instruction}`)
    .join('\n');
  const contacts = localize(getEscalation(), lang)
    .contacts.map((c) => `- **${c.name}**: ${c.detail}${c.purpose ? ` (${c.purpose})` : ''}`)
    .join('\n');
  return [T.idleIntro, T.idleIfHacked, steps, T.idleWhoToCall, contacts, T.idleOffline].join('\n\n');
}

function build(event, { incident, phase }, lang) {
  const T = TEXT[lang];
  const playbook = incident && localize(incident.playbook, lang);

  switch (event) {
    case 'BREACH_OPENED': {
      const intro = playbook.isFallback
        ? T.breachUnknown(incident.deviceId)
        : T.breachKnown(playbook.name, incident.deviceId, playbook.plainName);
      const doNot = playbook.doNot?.length ? `**${T.mostImportant}** ${playbook.doNot[0]}` : '';
      return [intro, doNot, currentStepText(incident, lang)].filter(Boolean).join('\n\n');
    }
    case 'STEP_CONFIRMED':
      return `${T.confirmed}\n\n${currentStepText(incident, lang)}`;
    case 'ENTER_LEARN': {
      const { learn } = playbook;
      return [
        T.containedIntro,
        `**${T.inPlainWords}** ${learn.analogy}`,
        `**${T.howItGotIn}** ${learn.howItHappened}`,
        `**${T.whyItMatters}** ${learn.businessImpact}`,
        T.learnAck,
      ].join('\n\n');
    }
    case 'ENTER_PREVENT': {
      const list = playbook.prevent.map((p) => `- **${p.title}**: ${p.description}`).join('\n');
      return `${T.preventIntro}\n\n${list}\n\n${T.preventOutro}`;
    }
    case 'RESOLVED':
      return T.resolved(incident.id);
    case 'RESUME':
      if (phase === 'FIX') return currentStepText(incident, lang);
      if (phase === 'LEARN') return build('ENTER_LEARN', { incident, phase }, lang);
      if (phase === 'PREVENT') return build('ENTER_PREVENT', { incident, phase }, lang);
      if (phase === 'RESOLVED') return T.resolved(incident.id);
      return T.monitoring;
    case 'ESCALATED': {
      const escalation = localize(incident.escalation, lang);
      const contacts = (escalation?.contacts || [])
        .map((c) => `- **${c.name}**: ${c.detail}${c.purpose ? ` (${c.purpose})` : ''}`)
        .join('\n');
      return [T.escalating, contacts, escalation?.preserveEvidence || ''].filter(Boolean).join('\n\n');
    }
    default:
      if (!incident || phase === 'MONITORING') return event === 'USER_MESSAGE' ? idleHelp(lang) : T.monitoring;
      if (phase === 'FIX') return T.offlineFocus(currentStepText(incident, lang));
      if (phase === 'LEARN') return build('ENTER_LEARN', { incident, phase }, lang);
      if (phase === 'PREVENT') return build('ENTER_PREVENT', { incident, phase }, lang);
      return T.resolved(incident.id);
  }
}

function reply(event, state, lang = 'en') {
  return build(event, { incident: state.incident, phase: state.phase }, normalizeLanguage(lang));
}

module.exports = { reply, currentStepText };
