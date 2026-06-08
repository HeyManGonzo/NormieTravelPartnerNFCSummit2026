export default function TypingIndicator({ label, avatar = '/gemel.svg' }) {
  return (
    <div className="flex items-center gap-3 px-1 py-2 text-[color:var(--color-muted)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatar}
        alt=""
        aria-hidden
        className="h-8 w-8 shrink-0 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-0.5"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="flex gap-1">
        <span className="nfc-dot block h-1.5 w-1.5 rounded-full bg-[color:var(--color-accent)]" />
        <span className="nfc-dot block h-1.5 w-1.5 rounded-full bg-[color:var(--color-accent)]" />
        <span className="nfc-dot block h-1.5 w-1.5 rounded-full bg-[color:var(--color-accent)]" />
      </div>
      {label && (
        <span className="font-display text-[11px] uppercase tracking-[0.18em]">
          {label}
        </span>
      )}
    </div>
  );
}
