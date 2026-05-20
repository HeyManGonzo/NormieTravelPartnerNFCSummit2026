'use client';

import { X } from 'lucide-react';
import DayBlock from './DayBlock';
import { getMessages } from '@/lib/i18n';

export default function ItineraryView({
  itinerary,
  locale = 'en',
  onClose,
  loading = false,
}) {
  const msgs = getMessages(locale).itinerary;

  return (
    <aside className="flex h-full flex-col bg-[color:var(--color-bg)]">
      <header className="flex items-center justify-between gap-4 border-b border-[color:var(--color-border)] px-5 py-4">
        <div>
          <div className="font-display text-[10px] uppercase tracking-[0.24em] text-[color:var(--color-accent)]">
            {msgs.title}
          </div>
          {itinerary?.trip && (
            <div className="mt-1 text-xs text-[color:var(--color-muted)]">
              {itinerary.trip.arrivalDate} → {itinerary.trip.departureDate}
              {itinerary.version ? ` · ${msgs.version} ${itinerary.version}` : ''}
            </div>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={msgs.close}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[color:var(--color-muted)] hover:text-[color:var(--color-text)]"
          >
            <X size={16} />
          </button>
        )}
      </header>

      <div className="scroll-area flex-1 overflow-y-auto px-5 py-6">
        {loading && (
          <div className="text-sm text-[color:var(--color-muted)]">
            {msgs.empty}
          </div>
        )}
        {!loading && (!itinerary?.days || itinerary.days.length === 0) && (
          <div className="text-sm text-[color:var(--color-muted)]">
            {msgs.empty}
          </div>
        )}
        {!loading && itinerary?.days && (
          <div className="space-y-10">
            {itinerary.days.map((day) => (
              <DayBlock
                key={day.date}
                day={day}
                slotLabels={msgs.slot}
                nfcLabel={msgs.nfcDay}
                backupLabel={msgs.backup}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
