import { useI18n } from '@/lib/i18n';

/**
 * EN / BM segmented switch. Changes every label, the playbook steps and the
 * chat guide's replies; the choice is remembered on this device.
 */
export default function LanguageToggle() {
  const { lang, setLang, t } = useI18n();

  return (
    <div className="segmented" role="group" aria-label={t('language.group')}>
      {['en', 'ms'].map((code) => (
        <button
          key={code}
          type="button"
          className="segmented__btn segmented__btn--text"
          aria-pressed={lang === code}
          lang={code === 'ms' ? 'ms' : 'en'}
          title={t(`language.${code}Title`)}
          onClick={() => setLang(code)}
        >
          {t(`language.${code}`)}
        </button>
      ))}
    </div>
  );
}
