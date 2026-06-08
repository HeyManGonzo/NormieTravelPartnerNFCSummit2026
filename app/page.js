import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db.js';
import { readSessionIdFromCookie } from '@/lib/session.js';

const OPENSEA_URL =
  'https://opensea.io/item/ethereum/0x9eb6e2025b64f340691e424b7fe7022ffde12438/6832';

export const dynamic = 'force-dynamic';

async function getReturningState() {
  try {
    const sessionId = await readSessionIdFromCookie();
    if (!sessionId) return { returning: false };
    const [row] = await db
      .select({ status: schema.sessions.status })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .limit(1);
    if (!row) return { returning: false };
    return { returning: true, status: row.status };
  } catch {
    return { returning: false };
  }
}

export default async function HomePage() {
  const { returning, status } = await getReturningState();

  return (
    <main className="relative isolate flex min-h-screen flex-col">
      {/* Faint dot grid background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.18]"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
      {/* Lime glow blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[420px] w-[720px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(closest-side, rgba(217,255,0,0.18), transparent 70%)' }}
      />
      {/* Gemel watermark — huge, faint, decorative */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/gemel.svg"
        alt=""
        aria-hidden
        className="pointer-events-none absolute right-[-12%] top-[6%] -z-10 h-[80vh] w-auto opacity-[0.035] sm:right-[-6%]"
        style={{ imageRendering: 'pixelated' }}
      />

      <header className="flex items-center justify-between px-6 py-6 sm:px-10">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/gemel.svg"
            alt=""
            aria-hidden
            className="h-9 w-9"
            style={{ imageRendering: 'pixelated' }}
          />
          <div className="font-display text-sm font-semibold tracking-[0.18em] uppercase">
            Gemel<span className="text-[color:var(--color-accent)]">.</span>
          </div>
        </div>
        <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--color-muted)]">
          NFC Summit 2026
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-12 px-6 py-12 sm:px-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="font-display text-xs uppercase tracking-[0.32em] text-[color:var(--color-accent)]">
            Lisbon · 4–6 June 2026
          </p>
          <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.02] tracking-[-0.02em] sm:text-7xl">
            Your Lisbon,<br />
            <span className="text-[color:var(--color-accent)]">on-chain</span> with the&nbsp;Summit.
          </h1>
          <p className="mt-8 max-w-xl text-base text-[color:var(--color-muted)] sm:text-lg">
            Planned by an awakened Normie — your pick of Gemel, Seil, or Uxje,
            each an on-chain agent with their own character. Tell them when you
            arrive, what you collect, and how you travel — they&apos;ll anchor
            your days around the Summit and fill in galleries, dinners, and
            late-night rooms across the city.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 rounded-full bg-[color:var(--color-accent)] px-6 py-3 font-display text-sm font-semibold uppercase tracking-[0.12em] text-[color:var(--color-accent-text)] transition hover:brightness-110"
            >
              {returning ? 'Resume planning' : 'Start planning'} <span aria-hidden>→</span>
            </Link>
            {returning && status && (
              <span className="text-xs uppercase tracking-[0.18em] text-[color:var(--color-muted)]">
                session · {status}
              </span>
            )}
          </div>

          <ul className="mt-16 grid gap-4 text-sm text-[color:var(--color-muted)] sm:grid-cols-3">
            {[
              ['Multilingual', 'EN · PT · ES · FR · DE'],
              ['Grounded', 'Real Lisbon venues, no fabrications.'],
              ['Yours to share', 'PDF · Markdown · calendar export.'],
            ].map(([k, v]) => (
              <li key={k} className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
                <div className="font-display text-xs uppercase tracking-[0.18em] text-[color:var(--color-text)]">
                  {k}
                </div>
                <div className="mt-2 leading-relaxed">{v}</div>
              </li>
            ))}
          </ul>
        </div>

        <aside className="order-first flex flex-col items-center gap-5 lg:order-none lg:items-start">
          <div
            className="relative aspect-square w-full max-w-[320px] overflow-hidden rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3"
            style={{ boxShadow: '0 0 80px rgba(217,255,0,0.18)' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/gemel.svg"
              alt="Portrait of Gemel, Normie #6832"
              className="h-full w-full"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
          <a
            href={OPENSEA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-accent)]/40 bg-[color:var(--color-surface)] px-4 py-2 font-display text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-accent)] transition hover:bg-[color:var(--color-accent)]/10"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-accent)]" aria-hidden />
            Normie #6832 · Awakened
            <span aria-hidden>↗</span>
          </a>
        </aside>
      </section>

      <footer className="px-6 py-6 text-center text-[10px] uppercase tracking-[0.24em] text-[color:var(--color-muted)] sm:px-10">
        Built for visitors of NFC Summit 2026 · Made by{' '}
        <a
          href="https://x.com/heymangonzo"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[color:var(--color-accent)] transition hover:opacity-80"
        >
          @heymangonzo
        </a>
        {' · '}
        <Link href="/disclaimer" className="transition hover:text-[color:var(--color-text)]">
          Disclaimer
        </Link>
      </footer>
    </main>
  );
}
