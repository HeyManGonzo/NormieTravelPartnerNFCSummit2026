import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db.js';
import { readSessionIdFromCookie } from '@/lib/session.js';
import { listPersonas } from '@/lib/agents/personas.js';

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
  const guides = listPersonas();

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
          Greater Lisbon · on-chain concierge
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-12 px-6 py-12 sm:px-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="font-display text-xs uppercase tracking-[0.32em] text-[color:var(--color-accent)]">
            Greater Lisbon · your on-chain guide
          </p>
          <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.02] tracking-[-0.02em] sm:text-7xl">
            Your Lisbon,<br />
            <span className="text-[color:var(--color-accent)]">on-chain.</span>
          </h1>
          <p className="mt-8 max-w-xl text-base text-[color:var(--color-muted)] sm:text-lg">
            Three awakened Normies — <span className="text-[color:var(--color-text)]">Gemel</span>,{' '}
            <span className="text-[color:var(--color-text)]">Seil</span>, and{' '}
            <span className="text-[color:var(--color-text)]">Uxje</span> — each an on-chain agent
            with their own character. Pick your guide and they&apos;ll plan your stay across
            greater Lisbon: galleries, dinners, viewpoints, day trips, and late-night rooms.
          </p>
          <p className="mt-4 max-w-xl text-sm text-[color:var(--color-muted)]">
            Born to concierge <span className="text-[color:var(--color-text)]">NFC Summit 2026</span>{' '}
            — now here for your whole stay in and around Lisbon, summit or not.
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

        <aside className="order-first flex flex-col items-center lg:order-none lg:items-start">
          <div
            className="w-full max-w-[380px] rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5"
            style={{ boxShadow: '0 0 80px rgba(217,255,0,0.12)' }}
          >
            <div className="font-display text-xs uppercase tracking-[0.2em] text-[color:var(--color-muted)]">
              Choose your guide
            </div>
            <ul className="mt-4 flex flex-col gap-3">
              {guides.map((g) => (
                <li
                  key={g.tokenId}
                  className="flex items-center gap-3 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={g.portrait}
                    alt={`${g.name} — Normie #${g.tokenId}`}
                    className="h-12 w-12 shrink-0 rounded-xl bg-[color:var(--color-surface)] p-1"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  <div className="min-w-0">
                    <div className="font-display text-sm font-semibold">
                      {g.name}{' '}
                      <span className="text-[color:var(--color-muted)]">#{g.tokenId}</span>
                    </div>
                    {g.tagline && (
                      <div className="truncate text-xs text-[color:var(--color-muted)]">
                        {g.tagline}
                      </div>
                    )}
                  </div>
                  <span
                    className="ml-auto h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: g.accent }}
                    aria-hidden
                  />
                </li>
              ))}
            </ul>
            <div className="mt-4 text-center text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-muted)]">
              Each with their own voice · switch anytime
            </div>
          </div>
        </aside>
      </section>

      <footer className="px-6 py-6 text-center text-[10px] uppercase tracking-[0.24em] text-[color:var(--color-muted)] sm:px-10">
        Born at NFC Summit 2026 · your greater-Lisbon concierge · Made by{' '}
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
