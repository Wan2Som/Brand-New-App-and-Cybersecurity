/**
 * Loads the pre-vetted NIST/CISA playbooks and resolves the right one for a
 * threat type. Unknown threat types always fall back to the universal
 * containment playbook - the platform never leaves a user without guidance.
 *
 * Languages: English is the source of truth (ids, order, workflow). Each
 * extra language file (e.g. nistPlaybooks.ms.json) only overrides the text.
 * A resolved playbook carries every language under `translations`, so the
 * dashboard can switch language at any time, even mid-incident.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');

const FALLBACK_ID = 'universal';
const LANGUAGES = ['en', 'ms'];
const DEFAULT_LANGUAGE = 'en';

let cache = null;

function translationFile(base, lang) {
  return base.replace(/\.json$/, `.${lang}.json`);
}

function load(file = config.playbookFile) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const byThreatType = new Map();

  for (const playbook of Object.values(data.playbooks)) {
    for (const type of playbook.threatTypes || []) byThreatType.set(type, playbook.id);
  }
  if (!data.playbooks[FALLBACK_ID]) {
    throw new Error(`Playbook file must define a "${FALLBACK_ID}" fallback playbook`);
  }

  const translations = {};
  for (const lang of LANGUAGES.filter((l) => l !== DEFAULT_LANGUAGE)) {
    const langFile = translationFile(file, lang);
    if (fs.existsSync(langFile)) translations[lang] = JSON.parse(fs.readFileSync(langFile, 'utf8'));
  }

  cache = { data, byThreatType, translations };
  return cache;
}

function store() {
  return cache || load();
}

/** Replace {placeholders} in every string of a JSON-like value. */
function interpolate(value, vars) {
  if (typeof value === 'string') {
    return value.replace(/\{(\w+)\}/g, (match, key) => (vars[key] != null ? String(vars[key]) : match));
  }
  if (Array.isArray(value)) return value.map((item) => interpolate(item, vars));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, interpolate(v, vars)]));
  }
  return value;
}

/** Overlay translated text onto the English playbook; anything missing stays English. */
function translatePlaybook(base, t = {}) {
  return {
    ...base,
    name: t.name || base.name,
    plainName: t.plainName || base.plainName,
    doNot: Array.isArray(t.doNot) && t.doNot.length ? t.doNot : base.doNot,
    containment: base.containment.map((step) => ({ ...step, ...(t.containment?.[step.id] || {}) })),
    learn: { ...base.learn, ...(t.learn || {}) },
    prevent: base.prevent.map((action) => ({ ...action, ...(t.prevent?.[action.id] || {}) })),
  };
}

function translateEscalation(base, t = {}) {
  return {
    ...base,
    title: t.title || base.title,
    preserveEvidence: t.preserveEvidence || base.preserveEvidence,
    contacts: base.contacts.map((contact) => ({ ...contact, ...(t.contacts?.[contact.name] || {}) })),
  };
}

const VARS = {
  en: { deviceId: 'the affected computer', sourceIp: "the attacker's address" },
  ms: { deviceId: 'komputer yang terjejas', sourceIp: 'alamat penyerang' },
};

/**
 * Returns a ready-to-display copy of the playbook for this threat, with
 * device and attacker details filled in, plus every translation.
 */
function resolvePlaybook(threatType, { deviceId, sourceIp } = {}) {
  const { data, byThreatType, translations } = store();
  const id = byThreatType.get(threatType) || FALLBACK_ID;
  const varsFor = (lang) => ({
    deviceId: deviceId || VARS[lang].deviceId,
    sourceIp: sourceIp || VARS[lang].sourceIp,
  });

  const base = data.playbooks[id];
  const localized = {};
  for (const [lang, file] of Object.entries(translations)) {
    localized[lang] = interpolate(translatePlaybook(base, file.playbooks?.[id]), varsFor(lang));
  }
  return { ...interpolate(base, varsFor('en')), isFallback: id === FALLBACK_ID, translations: localized };
}

function getEscalation() {
  const { data, translations } = store();
  const localized = {};
  for (const [lang, file] of Object.entries(translations)) {
    localized[lang] = translateEscalation(data.escalation, file.escalation);
  }
  return { ...data.escalation, translations: localized };
}

/** Pick one language view of a playbook or escalation object (English if missing). */
function localize(item, lang = DEFAULT_LANGUAGE) {
  if (!item) return item;
  return (lang !== DEFAULT_LANGUAGE && item.translations?.[lang]) || item;
}

function normalizeLanguage(lang) {
  return LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE;
}

function knownThreatTypes() {
  return [...store().byThreatType.keys()];
}

/** Threat types with a dedicated playbook (excludes the universal fallback). */
function recognisedThreatTypes() {
  const { byThreatType } = store();
  return [...byThreatType.entries()].filter(([, id]) => id !== FALLBACK_ID).map(([type]) => type);
}

module.exports = {
  load,
  resolvePlaybook,
  getEscalation,
  localize,
  normalizeLanguage,
  knownThreatTypes,
  recognisedThreatTypes,
  interpolate,
  translationFile,
  FALLBACK_ID,
  LANGUAGES,
};
