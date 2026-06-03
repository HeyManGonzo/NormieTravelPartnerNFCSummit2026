import Link from 'next/link';

export const metadata = {
  title: 'Disclaimer — Gemel',
  description:
    'Disclaimer for Gemel, an independent, non-commercial visitor concierge for NFC Summit 2026.',
};

// Static legal page. English only by design — the app's runtime translation is
// for Gemel's conversational voice, not its static chrome or legal text.
const LAST_UPDATED = '3 June 2026';

function Section({ title, children }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--color-text)]">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-[color:var(--color-muted)]">
        {children}
      </div>
    </section>
  );
}

export default function DisclaimerPage() {
  return (
    <main className="relative isolate flex min-h-screen flex-col">
      {/* Faint dot grid background — matches the landing page. */}
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

      <header className="flex items-center justify-between px-6 py-6 sm:px-10">
        <Link href="/" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/gemel.svg"
            alt=""
            aria-hidden
            className="h-9 w-9"
            style={{ imageRendering: 'pixelated' }}
          />
          <span className="font-display text-sm font-semibold tracking-[0.18em] uppercase">
            Gemel<span className="text-[color:var(--color-accent)]">.</span>
          </span>
        </Link>
        <Link
          href="/"
          className="text-[10px] uppercase tracking-[0.24em] text-[color:var(--color-muted)] transition hover:text-[color:var(--color-text)]"
        >
          ← Back
        </Link>
      </header>

      <article className="mx-auto w-full max-w-2xl flex-1 px-6 py-8 sm:px-10">
        <p className="font-display text-xs uppercase tracking-[0.32em] text-[color:var(--color-accent)]">
          Disclaimer
        </p>
        <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.05] tracking-[-0.02em] sm:text-5xl">
          Please read before relying on Gemel.
        </h1>
        <p className="mt-6 text-sm leading-relaxed text-[color:var(--color-muted)]">
          Gemel is an AI concierge that helps visitors plan their stay around NFC Summit 2026 in
          Lisbon. It is a personal side project, offered freely and in good faith. The notes below
          set out what it is — and what it isn&apos;t.
        </p>

        <Section title="Independent & unofficial">
          <p>
            This app is an independent, non-commercial project. It is{' '}
            <strong className="text-[color:var(--color-text)]">not affiliated with, endorsed by,
            or operated by</strong>{' '}
            the organizers of NFC Summit, its venues, speakers, or partners. References to
            &quot;NFC Summit 2026&quot; and to specific venues, events, or names are used only to
            identify the event Gemel helps visitors navigate.
          </p>
        </Section>

        <Section title="AI-generated guidance">
          <p>
            Gemel is an AI assistant. Its answers are generated automatically and may be
            inaccurate, incomplete, or out of date — including opening hours, prices, addresses,
            travel times, routes, availability, and which events are happening. Treat everything as
            a starting point, not a guarantee.
          </p>
          <p>
            Always confirm anything that matters — bookings, tickets, transport, accessibility,
            dietary needs — with the official or primary source before you rely on it. Gemel does
            not provide professional travel, legal, medical, or financial advice.
          </p>
        </Section>

        <Section title="No warranty & no liability">
          <p>
            The app and Gemel&apos;s output are provided &quot;as is&quot;, without warranties of
            any kind, express or implied. To the fullest extent permitted by law, the creator
            accepts no liability for any loss, cost, inconvenience, or damage arising from your use
            of, or reliance on, this app or anything Gemel says. You use it at your own discretion
            and risk.
          </p>
        </Section>

        <Section title="Non-commercial">
          <p>
            Gemel is free to use. The creator earns nothing from it and does not sell your data.
            If a recommendation is ever shown as a partner or sponsored mention, it will be
            clearly labelled as such — and visitors are never charged for it.
          </p>
        </Section>

        <Section title="Third-party data & links">
          <p>
            To answer questions, Gemel draws on third-party services — for maps, places, web
            search, and weather — and may link out to external sites such as Google Maps. That
            information and those destinations belong to their respective providers, who are
            responsible for their own accuracy, content, and terms.
          </p>
        </Section>

        <Section title="Sessions & data">
          <p>
            No account is required. To provide the service, the app stores an anonymous session
            (a cookie) along with your conversation and any itinerary you create, so you can pick
            up where you left off. That data is used only to run Gemel — nothing more.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions or corrections? Reach out to{' '}
            <a
              href="https://x.com/heymangonzo"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[color:var(--color-accent)] transition hover:opacity-80"
            >
              @heymangonzo
            </a>
            .
          </p>
        </Section>

        <p className="mt-12 text-[10px] uppercase tracking-[0.24em] text-[color:var(--color-muted)]">
          Last updated · {LAST_UPDATED}
        </p>
      </article>

      <footer className="px-6 py-6 text-center text-[10px] uppercase tracking-[0.24em] text-[color:var(--color-muted)] sm:px-10">
        <Link href="/" className="transition hover:text-[color:var(--color-text)]">
          Back to Gemel
        </Link>
      </footer>
    </main>
  );
}
