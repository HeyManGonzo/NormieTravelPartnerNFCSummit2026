'use client';

// First-run "choose your guide" screen. Shows the selectable Normie identities
// as cards — portrait, name, tagline, and a line of their own greeting (their
// own words) — and lets the visitor pick who to talk to. The chosen Normie then
// greets in-character and the chat begins. Reachable again via AgentSwitcher.

export default function AgentSelect({ agents = [], currentId, onPick, t }) {
  const copy = t?.agentSelect ?? {
    title: 'Meet your Normie guide',
    subtitle: 'Pick who shows you around Lisbon. You can switch anytime.',
    cta: 'Chat with',
  };

  return (
    <div className="flex min-h-full w-full flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-3xl">
        <h2 className="text-center font-display text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
          {copy.title}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-sm leading-relaxed text-[color:var(--color-muted)]">
          {copy.subtitle}
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {agents.map((a) => {
            const selected = a.tokenId === currentId;
            return (
              <button
                key={a.tokenId}
                type="button"
                onClick={() => onPick?.(a)}
                className={`group flex flex-col items-center rounded-3xl border p-5 text-center transition ${
                  selected
                    ? 'border-[color:var(--color-accent)] bg-[color:var(--color-surface-2)]'
                    : 'border-[color:var(--color-border)] bg-[color:var(--color-surface)] hover:border-[color:var(--color-border-strong)]'
                }`}
              >
                <div
                  className="aspect-square w-24 overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-2"
                  style={{ boxShadow: selected ? '0 0 50px rgba(217,255,0,0.18)' : 'none' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.portrait}
                    alt={`${a.name} — Normie #${a.tokenId}`}
                    className="h-full w-full"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </div>
                <div className="mt-4 font-display text-lg font-semibold tracking-[-0.01em]">
                  {a.name}
                  <span className="ml-1 text-[color:var(--color-muted)]">#{a.tokenId}</span>
                </div>
                {a.tagline && (
                  <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[color:var(--color-accent)]">
                    {a.tagline}
                  </div>
                )}
                {a.greeting && (
                  <p className="mt-3 line-clamp-4 text-sm italic leading-relaxed text-[color:var(--color-muted)]">
                    “{a.greeting}”
                  </p>
                )}
                <span className="mt-5 inline-flex items-center gap-1 rounded-full bg-[color:var(--color-accent)] px-4 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-accent-text)] transition group-hover:brightness-110">
                  {copy.cta} {a.name} <span aria-hidden>→</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
