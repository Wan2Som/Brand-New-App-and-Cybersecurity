/**
 * Chat state + AI calls.
 *
 * Listens to incident state transitions and asks the backend for the matching
 * guidance automatically (breach opened, step confirmed, contained, ...), so
 * the owner never has to know what to ask. Requests are queued so replies
 * always arrive in order.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

const WELCOME = {
  id: 'welcome',
  role: 'assistant',
  source: 'system',
  content: "I'm watching your business systems. If anything suspicious happens I'll take you through exactly what to do, one step at a time.",
};

let counter = 0;
const newId = () => `m${Date.now().toString(36)}${(counter += 1)}`;

/** Which automatic event (if any) a state change should trigger. */
function eventFor(prev, next) {
  const inc = next.incident;
  if (!inc || next.phase === 'MONITORING') return null;

  const isNewIncident = !prev || prev.incidentId !== inc.id;
  if (isNewIncident) {
    // Also covers a page reload in the middle of an incident.
    return { FIX: 'BREACH_OPENED', LEARN: 'ENTER_LEARN', PREVENT: 'ENTER_PREVENT', RESOLVED: 'RESOLVED' }[next.phase] || null;
  }
  if (inc.escalation && !prev.escalated) return 'ESCALATED';
  if (next.phase !== prev.phase) {
    return { LEARN: 'ENTER_LEARN', PREVENT: 'ENTER_PREVENT', RESOLVED: 'RESOLVED' }[next.phase] || null;
  }
  if (next.phase === 'FIX' && inc.currentStepIndex > prev.stepIndex) return 'STEP_CONFIRMED';
  return null;
}

export default function useChat(state) {
  const [messages, setMessages] = useState([WELCOME]);
  const [isLoading, setIsLoading] = useState(false);
  const [aiSource, setAiSource] = useState(null);

  const messagesRef = useRef(messages);
  const queueRef = useRef(Promise.resolve());
  const pendingRef = useRef(0);
  const seenRef = useRef(null);

  messagesRef.current = messages;

  const append = useCallback((message) => setMessages((list) => [...list, { id: newId(), ...message }]), []);

  const ask = useCallback(
    ({ event, message }) => {
      pendingRef.current += 1;
      setIsLoading(true);
      queueRef.current = queueRef.current.then(async () => {
        const history = messagesRef.current
          .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.source !== 'system'))
          .map(({ role, content }) => ({ role, content }));
        try {
          const result = await api.chat({ event, message, history });
          setAiSource(result.source);
          append({ role: 'assistant', content: result.reply, source: result.source });
        } catch (err) {
          append({
            role: 'assistant',
            source: 'error',
            content: `I couldn't reach the guidance service (${err.message}). Follow the step card on screen, or press "Escalate to a human expert".`,
          });
        } finally {
          pendingRef.current -= 1;
          if (pendingRef.current === 0) setIsLoading(false);
        }
      });
    },
    [append],
  );

  // React to workflow transitions.
  useEffect(() => {
    const prev = seenRef.current;
    const inc = state.incident;

    if (!inc || state.phase === 'MONITORING') {
      if (prev?.incidentId) setMessages([WELCOME]); // incident cleared / demo reset
      seenRef.current = { incidentId: null };
      return;
    }

    if (!prev || prev.incidentId !== inc.id) setMessages([]); // fresh conversation per incident

    const event = eventFor(prev, state);
    seenRef.current = {
      incidentId: inc.id,
      phase: state.phase,
      stepIndex: inc.currentStepIndex,
      escalated: Boolean(inc.escalation),
    };
    if (event) ask({ event });
  }, [state, ask]);

  const send = useCallback(
    (text) => {
      const message = text.trim();
      if (!message) return;
      append({ role: 'user', content: message });
      ask({ event: 'USER_MESSAGE', message });
    },
    [append, ask],
  );

  return { messages, send, isLoading, aiSource };
}
