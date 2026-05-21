import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db.js';
import DayBlock from '@/components/itinerary/DayBlock';
import { getMessages } from '@/lib/i18n';
import ShareExportBar from '@/components/itinerary/ShareExportBar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function loadByToken(token) {
  if (!token) return null;
  const [row] = await db
    .select()
    .from(schema.itineraries)
    .where(eq(schema.itineraries.shareToken, token))
    .limit(1);
  if (!row) return null;
  const [owner] = await db
    .select({ language: schema.sessions.language })
    .from(schema.sessions)
    .where(eq(schema.sessions.id, row.sessionId))
    .limit(1);
  return { ...row, ownerLanguage: owner?.language ?? 'en' };
}

const OPENSEA_URL =
  'https://opensea.io/item/ethereum/0x9eb6e2025b64f340691e424b7fe7022ffde12438/6832';

export async function generateMetadata({ params }) {
  const row = await loadByToken(params.shareToken);
  if (!row) return { title: 'Itinerary not found · Gemel' };
  return {
    title: 'Lisbon itinerary · NFC Summit 2026',
    description: 'A Lisbon itinerary anchored around NFC Summit 2026, planned by Gemel — Normie #6832.',
  };
}

export default async function PublicItineraryPage({ params }) {
  const row = await loadByToken(params.shareToken);
  if (!row) notFound();

  const itinerary = row.content;
  const locale = row.ownerLanguage ?? 'en';
  const all = getMessages(locale);
  const msgs = all.itinerary;
  const doc = all.exportDoc;
  const token = row.shareToken;

  return (
    <main className="min-h-screen bg-[color:var(--color-bg)]">
      <header className="border-b border-[color:var(--color-border)] bg-[color:var(--color-bg)]">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/gemel.svg"
              alt=""
              aria-hidden
              className="h-10 w-10 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-1"
              style={{ imageRendering: 'pixelated' }}
            />
            <div>
              <div className="font-display text-sm font-semibold uppercase tracking-[0.18em]">
                Gemel<span className="text-[color:var(--color-accent)]">.</span>
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-muted)]">
                {doc.subtitle}
              </div>
            </div>
          </div>
          <ShareExportBar token={token} locale={locale} />
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8">
          <div className="font-display text-[11px] uppercase tracking-[0.24em] text-[color:var(--color-accent)]">
            {msgs.title}
          </div>
          <h1 className="mt-2 font-display text-4xl font-semibold leading-tight">
            {doc.title}
          </h1>
          {itinerary?.trip && (
            <p className="mt-3 text-sm text-[color:var(--color-muted)]">
              {itinerary.trip.arrivalDate} → {itinerary.trip.departureDate}
              {' · '}
              {itinerary.trip.durationDays} {doc.pdfDays}
              {row.version ? ` · ${msgs.version} ${row.version}` : ''}
            </p>
          )}
          <a
            href={OPENSEA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-[color:var(--color-accent)]/40 bg-[color:var(--color-surface)] px-4 py-2 font-display text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-accent)] transition hover:bg-[color:var(--color-accent)]/10"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-accent)]" aria-hidden />
            Planned by Gemel · Normie #6832
            <span aria-hidden>↗</span>
          </a>
        </div>

        <div className="space-y-12">
          {(itinerary?.days ?? []).map((day) => (
            <DayBlock
              key={day.date}
              day={day}
              slotLabels={msgs.slot}
              nfcLabel={msgs.nfcDay}
              backupLabel={msgs.backup}
            />
          ))}
        </div>
      </section>

      <footer className="border-t border-[color:var(--color-border)] px-6 py-8 text-center text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-muted)]">
        {doc.footer}
      </footer>
    </main>
  );
}
