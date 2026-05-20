'use client';

import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import InputBar from './InputBar';

export default function ChatWindow({
  messages = [],
  pending = false,
  pendingLabel,
  onSend,
  placeholder,
  sendLabel,
  footer,
}) {
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, pending]);

  return (
    <div className="flex h-full flex-col">
      <div
        ref={scrollRef}
        className="scroll-area flex-1 overflow-y-auto px-4 py-6 sm:px-6"
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          {messages.map((m) => (
            <MessageBubble key={m.id} role={m.role} content={m.content} />
          ))}
          {pending && <TypingIndicator label={pendingLabel} />}
        </div>
      </div>

      <div className="border-t border-[color:var(--color-border)] bg-[color:var(--color-bg)]/80 px-4 pb-5 pt-4 backdrop-blur sm:px-6">
        <div className="mx-auto w-full max-w-2xl">
          <InputBar
            onSend={onSend}
            disabled={pending}
            placeholder={placeholder}
            sendLabel={sendLabel}
          />
          {footer && (
            <div className="mt-2 text-center text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-muted)]">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
