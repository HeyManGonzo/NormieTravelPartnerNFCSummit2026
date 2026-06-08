'use client';

// Header control to switch which Normie identity the visitor is talking to.
// Mirrors LanguageSwitcher: optimistic local update + a PATCH /api/session so
// the choice is remembered across visits. The parent handles the in-chat
// hand-over message.

import { useState } from 'react';

export default function AgentSwitcher({ agents = [], value, onChange, label = 'Guide' }) {
  const [open, setOpen] = useState(false);
  const current = agents.find((a) => a.tokenId === value) ?? agents[0];
  if (!current) return null;

  async function pick(a) {
    setOpen(false);
    if (a.tokenId === value) return;
    onChange?.(a);
    try {
      await fetch('/api/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentTokenId: a.tokenId }),
      });
    } catch {
      // Non-blocking: identity still updates locally via parent state.
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] py-1 pl-1 pr-3 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-text)] hover:border-[color:var(--color-border-strong)]"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={label}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.portrait}
          alt=""
          aria-hidden
          className="h-6 w-6 rounded-full bg-[color:var(--color-bg)]"
          style={{ imageRendering: 'pixelated' }}
        />
        {current.name}
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-20 mt-2 min-w-[220px] overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] py-1 shadow-xl"
        >
          {agents.map((a) => (
            <li key={a.tokenId}>
              <button
                type="button"
                onClick={() => pick(a)}
                role="option"
                aria-selected={a.tokenId === value}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-[color:var(--color-surface-2)] ${
                  a.tokenId === value ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text)]'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.portrait}
                  alt=""
                  aria-hidden
                  className="h-8 w-8 rounded-full bg-[color:var(--color-bg)]"
                  style={{ imageRendering: 'pixelated' }}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-tight">
                    {a.name} <span className="text-[color:var(--color-muted)]">#{a.tokenId}</span>
                  </span>
                  {a.tagline && (
                    <span className="block truncate text-[11px] text-[color:var(--color-muted)]">
                      {a.tagline}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
