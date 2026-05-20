const VARIANTS = {
  default:
    'border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-text)]',
  accent:
    'border-transparent bg-[color:var(--color-accent)] text-[color:var(--color-accent-text)]',
  accentSoft:
    'border-[color:var(--color-accent)]/30 bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent)]',
  muted:
    'border-[color:var(--color-border)] bg-transparent text-[color:var(--color-muted)]',
};

export default function Badge({
  variant = 'default',
  className = '',
  children,
  ...rest
}) {
  const cls = [
    'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-display text-[10px] font-semibold uppercase tracking-[0.16em]',
    VARIANTS[variant] ?? VARIANTS.default,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={cls} {...rest}>
      {children}
    </span>
  );
}
