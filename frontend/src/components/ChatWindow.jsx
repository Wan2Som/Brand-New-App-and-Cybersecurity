import { useEffect, useRef, useState } from 'react';
import ChatMessage from './ChatMessage';

/**
 * Conversational guide. When `focusKey` changes (a new breach), the window
 * scrolls into view and focuses the input so the owner lands right on it.
 */
export default function ChatWindow({ messages, onSend, isLoading, focusKey, isActive }) {
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const sectionRef = useRef(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, isLoading]);

  useEffect(() => {
    if (!focusKey || !sectionRef.current) return;
    // Never scroll the red banner and step card out of view. On wide screens
    // the chat sits beside the card, so focus it in place. On phones (chat
    // below the card) skip focusing so the keyboard doesn't cover the step.
    const { top } = sectionRef.current.getBoundingClientRect();
    if (top < window.innerHeight * 0.6) inputRef.current?.focus({ preventScroll: true });
  }, [focusKey]);

  const submit = (event) => {
    event.preventDefault();
    if (!draft.trim() || isLoading) return;
    onSend(draft);
    setDraft('');
  };

  return (
    <section ref={sectionRef} className={`chat ${isActive ? 'chat--active' : ''}`} aria-labelledby="chat-title" data-spotlight>
      <div className="chat__head">
        <h2 id="chat-title">Emergency guide</h2>
        <p>Ask anything in English or Bahasa Melayu.</p>
      </div>

      <ol ref={listRef} className="chat__list" aria-live="polite" aria-relevant="additions">
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}
        {isLoading && (
          <li className="msg msg--assistant msg--typing" aria-label="Responder is writing">
            <span />
            <span />
            <span />
          </li>
        )}
      </ol>

      <form className="chat__form" onSubmit={submit}>
        <label htmlFor="chat-input" className="visually-hidden">
          Message the emergency guide
        </label>
        <input
          id="chat-input"
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={isActive ? 'e.g. "Where is the network cable?"' : 'Ask a security question'}
          autoComplete="off"
          maxLength={1000}
        />
        <button type="submit" disabled={!draft.trim() || isLoading}>
          Send
        </button>
      </form>
    </section>
  );
}
