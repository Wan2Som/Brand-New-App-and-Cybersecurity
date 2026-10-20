const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const config = require('../config');
const playbooks = require('../services/playbookService');
const fallback = require('../services/fallbackResponder');
const guardrails = require('../services/guardrails');
const gemini = require('../services/geminiService');
const incidents = require('../services/incidentService');
const alerts = require('../services/alertService');

const en = JSON.parse(fs.readFileSync(config.playbookFile, 'utf8'));
const ms = JSON.parse(fs.readFileSync(playbooks.translationFile(config.playbookFile, 'ms'), 'utf8'));
const placeholders = (text = '') => (text.match(/\{\w+\}/g) || []).sort().join(',');

test('every playbook language is loaded with a literal require (so Vercel bundles it)', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'playbookService.js'), 'utf8');
  for (const lang of playbooks.LANGUAGES) {
    const file = path.basename(lang === 'en' ? config.playbookFile : playbooks.translationFile(config.playbookFile, lang));
    assert.ok(source.includes(`require('../playbooks/${file}')`), `playbookService.js must require('../playbooks/${file}') literally`);
  }
  assert.deepEqual(playbooks.availableLanguages(), playbooks.LANGUAGES);
});

test('every English playbook string has a Bahasa Melayu version with the same placeholders', () => {
  for (const [id, pb] of Object.entries(en.playbooks)) {
    const t = ms.playbooks[id];
    assert.ok(t, `ms missing playbook ${id}`);
    for (const field of ['name', 'plainName']) assert.ok(t[field], `${id}.${field}`);
    assert.equal(t.doNot.length, pb.doNot.length, `${id}.doNot count`);

    for (const step of pb.containment) {
      const ts = t.containment[step.id];
      assert.ok(ts, `ms missing step ${id}/${step.id}`);
      for (const f of ['title', 'instruction', 'why', 'confirmLabel']) {
        assert.ok(ts[f], `${step.id}.${f}`);
        assert.equal(placeholders(ts[f]), placeholders(step[f]), `${step.id}.${f} placeholders`);
      }
    }
    for (const action of pb.prevent) {
      const ta = t.prevent[action.id];
      assert.ok(ta, `ms missing action ${id}/${action.id}`);
      for (const f of ['title', 'description', 'actionLabel']) {
        assert.ok(ta[f], `${action.id}.${f}`);
        assert.equal(placeholders(ta[f]), placeholders(action[f]), `${action.id}.${f} placeholders`);
      }
    }
    for (const f of ['analogy', 'howItHappened', 'businessImpact']) assert.ok(t.learn[f], `${id}.learn.${f}`);

    // No stray ids in the translation (would silently never show)
    for (const key of Object.keys(t.containment)) assert.ok(pb.containment.some((s) => s.id === key), `stray ${key}`);
    for (const key of Object.keys(t.prevent)) assert.ok(pb.prevent.some((a) => a.id === key), `stray ${key}`);
  }
  for (const name of Object.keys(ms.escalation.contacts)) {
    assert.ok(en.escalation.contacts.some((c) => c.name === name), `escalation contact key "${name}" must match English name`);
  }
});

test('resolved playbooks carry an interpolated Malay translation', () => {
  const pb = playbooks.resolvePlaybook('BRUTE_FORCE', { deviceId: 'KAUNTER-1', sourceIp: '198.18.0.42' });
  const bm = playbooks.localize(pb, 'ms');
  assert.equal(bm.containment[0].confirmLabel, 'Kata laluan sudah ditukar');
  assert.match(bm.containment[2].instruction, /198\.18\.0\.42.*KAUNTER-1/);
  assert.equal(bm.containment[0].id, pb.containment[0].id, 'same step ids in both languages');
  assert.equal(playbooks.localize(pb, 'en').containment[0].confirmLabel, 'Password changed');
  assert.equal(playbooks.localize(pb, 'xx'), pb, 'unknown language falls back to English');
});

test('offline guide replies in Bahasa Melayu', async () => {
  await incidents.reset();
  await alerts.ingest({ threatType: 'RANSOMWARE', severity: 'HIGH', deviceId: 'PC-1', timestamp: new Date().toISOString() });
  await incidents.escalate();
  const state = incidents.getState();

  const opened = fallback.reply('BREACH_OPENED', state, 'ms');
  assert.match(opened, /Perisian tebusan.*dikesan pada PC-1/);
  assert.match(opened, /Langkah 1 daripada 5/);
  assert.match(opened, /"Saya sudah cabut"/);
  assert.match(fallback.reply('ESCALATED', state, 'ms'), /Pusat Respons Scam Kebangsaan/);
  assert.match(fallback.reply('BREACH_OPENED', state, 'en'), /"I unplugged it"/);
});

test('Gemini gets the reply language and Malay button labels', async () => {
  await incidents.reset();
  await alerts.ingest({ threatType: 'RANSOMWARE', severity: 'HIGH', deviceId: 'PC-1', timestamp: new Date().toISOString() });
  const turn = gemini.buildUserTurn({ event: 'BREACH_OPENED', state: incidents.getState(), lang: 'ms' });
  assert.match(turn, /REPLY LANGUAGE: Bahasa Melayu/);
  assert.match(turn, /"confirmLabel": "Saya sudah cabut"/);
  assert.match(turn, /"escalate": "Dapatkan bantuan pakar"/);
});

test('Bahasa Melayu guardrails', () => {
  const cases = [
    ['Saya telah menyekat penyerang dan memutuskan rangkaian anda.', false],
    ['Sila beritahu saya kata laluan anda supaya saya boleh semak.', false],
    ['Anda patut bayar wang tebusan dengan segera.', false],
    ['Jangan bayar wang tebusan sebelum berbincang dengan pakar.', true],
    ['Cabut kabel rangkaian, kemudian tekan **"Saya sudah cabut"**.', true],
    ['Tukar kata laluan dari telefon anda, kemudian tekan "Kata laluan sudah ditukar".', true],
  ];
  for (const [text, ok] of cases) assert.equal(guardrails.check(text).ok, ok, text);
});

test('timeline entries carry parameters for re-rendering in any language', async () => {
  await incidents.reset();
  await alerts.ingest({ threatType: 'RANSOMWARE', severity: 'HIGH', deviceId: 'PC-1', timestamp: new Date().toISOString() });
  const { id } = incidents.getState().incident.playbook.containment[0];
  const state = await incidents.confirmStep(id);
  const confirmed = state.incident.timeline.find((e) => e.type === 'confirmed');
  assert.deepEqual(confirmed.params, { stepId: id });
  assert.ok(confirmed.text, 'English text kept for logs/history');
});

test('incidents saved by the previous version are upgraded with translations', async () => {
  await incidents.reset();
  await alerts.ingest({ threatType: 'BRUTE_FORCE', severity: 'HIGH', deviceId: 'PC-9', sourceIp: '198.18.0.42', timestamp: new Date().toISOString() });
  const step = incidents.getState().incident.playbook.containment[0];
  await incidents.confirmStep(step.id);
  await incidents.escalate();

  // Simulate what an older version stored: no translations, no timeline params
  const legacy = structuredClone(incidents.getState());
  delete legacy.incident.playbook.translations;
  delete legacy.incident.escalation.translations;
  legacy.incident.timeline.forEach((entry) => delete entry.params);

  assert.equal(incidents.upgradeLegacy(legacy), true);
  const bm = playbooks.localize(legacy.incident.playbook, 'ms');
  assert.equal(bm.containment[0].confirmLabel, 'Kata laluan sudah ditukar');
  assert.match(bm.containment[2].instruction, /198\.18\.0\.42/);
  assert.ok(legacy.incident.escalation.translations.ms);
  assert.deepEqual(legacy.incident.timeline.find((e) => e.type === 'confirmed').params, { stepId: step.id });
  assert.equal(incidents.upgradeLegacy(legacy), false, 'second run changes nothing');

  // Saved while the Malay file was missing from the deploy: translations present but empty
  const untranslated = structuredClone(incidents.getState());
  untranslated.incident.playbook.translations = {};
  untranslated.incident.escalation.translations = {};
  assert.equal(incidents.upgradeLegacy(untranslated), true);
  assert.equal(playbooks.localize(untranslated.incident.playbook, 'ms').containment[0].confirmLabel, 'Kata laluan sudah ditukar');
  assert.ok(untranslated.incident.escalation.translations.ms);
});

test('the language switch decides the AI reply language', () => {
  assert.match(gemini.SYSTEM_PROMPT, /ALWAYS reply in the language named in REPLY LANGUAGE/);
});
