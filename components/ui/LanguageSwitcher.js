'use client';

import { useState } from 'react';
import { Globe } from 'lucide-react';
import { SUPPORTED_LOCALES, getMessages } from '@/lib/i18n';

export default function LanguageSwitcher({ value = 'en', onChange }) {
  const [open, setOpen] = useState(false);
  const current = value;
  const labels = getMessages(current).languages;

  async function pick(loc) {
    setOpen(false);
    if (loc === current) return;
    onChange?.(loc);
    try {
      await fetch('/api/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: loc }),
      });
    } catch {
      // Non-blocking: UI language still updates locally via parent state.
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-text)] hover:border-[color:var(--color-border-strong)]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Globe size={14} aria-hidden />
        {current}
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-20 mt-2 min-w-[160px] overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] py-1 shadow-xl"
        >
          {SUPPORTED_LOCALES.map((loc) => (
            <li key={loc}>
              <button
                type="button"
                onClick={() => pick(loc)}
                role="option"
                aria-selected={loc === current}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm transition hover:bg-[color:var(--color-surface-2)] ${
                  loc === current ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text)]'
                }`}
              >
                <span>{labels[loc]}</span>
                <span className="font-display text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-muted)]">
                  {loc}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
