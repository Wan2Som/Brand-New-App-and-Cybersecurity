/**
 * Tiny i18n layer: an <I18nProvider> holding the chosen language, and
 * useI18n() giving components { lang, setLang, t, locale }.
 *
 * The choice is saved in localStorage. With no saved choice, a browser set
 * to Malay starts in Bahasa Melayu; everyone else starts in English.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LANGUAGES, LOCALES, MESSAGES } from './messages';

export const LANGUAGE_STORAGE_KEY = 'lang';
const DEFAULT_LANG = 'en';

function lookup(messages, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), messages);
}

function interpolate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (vars[name] != null ? String(vars[name]) : match));
}

/** Pure translator, usable outside React too. Falls back to English, then to the key. */
export function translate(lang, key, vars) {
  const value = lookup(MESSAGES[lang], key) ?? lookup(MESSAGES[DEFAULT_LANG], key);
  return typeof value === 'string' ? interpolate(value, vars) : key;
}

/** Pick the right language view of a backend object that carries `translations`. */
export function localize(item, lang) {
  if (!item) return item;
  return (lang !== DEFAULT_LANG && item.translations?.[lang]) || item;
}

function initialLanguage() {
  try {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (LANGUAGES.includes(saved)) return saved;
  } catch {
    /* storage blocked */
  }
  return /^ms\b|^ms-|^may/i.test(window.navigator.language || '') ? 'ms' : DEFAULT_LANG;
}

const I18nContext = createContext({
  lang: DEFAULT_LANG,
  locale: LOCALES[DEFAULT_LANG],
  setLang: () => {},
  t: (key, vars) => translate(DEFAULT_LANG, key, vars),
});

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(DEFAULT_LANG);

  useEffect(() => {
    setLangState(initialLanguage());
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === 'ms' ? 'ms-MY' : 'en-MY';
  }, [lang]);

  const setLang = useCallback((next) => {
    if (!LANGUAGES.includes(next)) return;
    setLangState(next);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      /* not remembered in private mode */
    }
  }, []);

  const value = useMemo(
    () => ({ lang, setLang, locale: LOCALES[lang], t: (key, vars) => translate(lang, key, vars) }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
