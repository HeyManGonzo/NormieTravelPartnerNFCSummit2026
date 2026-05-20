import Badge from '@/components/ui/Badge';
import ActivityCard from './ActivityCard';

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

export default function DayBlock({ day, slotLabels, nfcLabel, backupLabel }) {
  if (!day) return null;
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-baseline gap-3 border-b border-[color:var(--color-border)] pb-3">
        <div>
          <div className="font-display text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-muted)]">
            {formatDate(day.date)}
          </div>
          <h3 className="mt-0.5 font-display text-2xl font-semibold text-[color:var(--color-text)]">
            {day.dayLabel}
          </h3>
        </div>
        {day.nfcDay && (
          <Badge variant="accent" className="ml-auto">
            {nfcLabel}
          </Badge>
        )}
      </header>
      <div className="space-y-3">
        {(day.blocks ?? []).map((block, i) => (
          <ActivityCard
            key={`${day.date}-${block.timeSlot}-${i}`}
            activity={block.activity}
            slot={slotLabels?.[block.timeSlot] ?? block.timeSlot}
            backupLabel={backupLabel}
          />
        ))}
      </div>
    </section>
  );
}
