export default function TypingIndicator({ label }) {
  return (
    <div className="flex items-center gap-3 px-1 py-2 text-[color:var(--color-muted)]">
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
