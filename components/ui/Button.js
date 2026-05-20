'use client';

const VARIANTS = {
  primary:
    'bg-[color:var(--color-accent)] text-[color:var(--color-accent-text)] hover:brightness-110',
  ghost:
    'bg-transparent text-[color:var(--color-text)] border border-[color:var(--color-border)] hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface)]',
  subtle:
    'bg-[color:var(--color-surface)] text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)]',
  danger:
    'bg-[color:var(--color-danger)] text-[color:var(--color-bg)] hover:brightness-110',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-sm',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...rest
}) {
  const cls = [
    'inline-flex items-center justify-center gap-2 rounded-full font-display font-semibold uppercase tracking-[0.12em] transition disabled:opacity-50 disabled:cursor-not-allowed',
    VARIANTS[variant] ?? VARIANTS.primary,
    SIZES[size] ?? SIZES.md,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={cls} {...rest}>
      {children}
    </button>
  );
}
