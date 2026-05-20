'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';

export default function InputBar({
  onSend,
  disabled = false,
  placeholder = 'Send a message',
  sendLabel = 'Send',
}) {
  const [value, setValue] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex items-end gap-2 rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-2 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] focus-within:border-[color:var(--color-border-strong)]">
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        className="flex-1 resize-none bg-transparent px-3 py-2 text-[15px] leading-relaxed text-[color:var(--color-text)] placeholder:text-[color:var(--color-muted)] focus:outline-none disabled:opacity-60"
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !value.trim()}
        aria-label={sendLabel}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-accent)] text-[color:var(--color-accent-text)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ArrowUp size={18} strokeWidth={2.5} />
      </button>
    </div>
  );
}
