import renderMarkdown from '@/lib/renderMarkdown';

const SOURCE_LABEL = {
  gemini: 'AI guidance, based on the vetted playbook',
  playbook: 'Vetted playbook',
  error: 'Connection problem',
};

/** One chat bubble. `source` tells the owner where the advice came from. */
export default function ChatMessage({ message }) {
  const { role, content, source } = message;
  const label = role === 'assistant' ? SOURCE_LABEL[source] : null;

  return (
    <li className={`msg msg--${role} ${source === 'error' ? 'msg--error' : ''}`}>
      <span className="visually-hidden">{role === 'user' ? 'You said:' : 'Responder said:'}</span>
      <div className="msg__body">{renderMarkdown(content)}</div>
      {label && <span className="msg__source">{label}</span>}
    </li>
  );
}
