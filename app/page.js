import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <p className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-muted)]">
        NFC Summit 2026 · Lisbon · 4–6 June
      </p>
      <h1 className="mt-4 text-4xl font-bold sm:text-5xl">
        Your Lisbon, planned around the Summit.
      </h1>
      <p className="mt-6 text-lg text-[color:var(--color-muted)]">
        Tell me when you arrive, what you love, and how you like to travel.
        I&apos;ll build a day-by-day plan around your NFC Summit days — galleries,
        restaurants, viewpoints, late-night spots, all dialled in.
      </p>
      <div className="mt-10">
        <Link
          href="/chat"
          className="inline-flex items-center rounded-full bg-[color:var(--color-accent)] px-6 py-3 text-base font-medium text-white transition hover:opacity-90"
        >
          Start planning →
        </Link>
      </div>
    </main>
  );
}
