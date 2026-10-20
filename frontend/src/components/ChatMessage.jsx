import renderMarkdown from '@/lib/renderMarkdown';
import { errorText, useI18n } from '@/lib/i18n';

const SOURCE_KEYS = {
  ai: 'chat.sourceAi',
  playbook: 'chat.sourcePlaybook',
  error: 'chat.sourceError',
};

/**
 * One chat bubble. `source` tells the owner where the advice came from.
 * App-generated messages (welcome, connection errors) carry an `i18nKey`
 * so they follow the language switch; AI/playbook replies are shown as sent.
 */
export default function ChatMessage({ message }) {
  const { t } = useI18n();
  const { role, source, i18nKey, vars, error } = message;
  const content = i18nKey ? t(i18nKey, error ? { ...vars, message: errorText(t, error) } : vars) : message.content;
  const labelKey = role === 'assistant' ? SOURCE_KEYS[source] : null;

  return (
    <li className={`msg msg--${role} ${source === 'error' ? 'msg--error' : ''}`}>
      <span className="visually-hidden">{role === 'user' ? t('chat.youSaid') : t('chat.responderSaid')}</span>
      <div className="msg__body">{renderMarkdown(content)}</div>
      {labelKey && <span className="msg__source">{t(labelKey)}</span>}
    </li>
  );
}
