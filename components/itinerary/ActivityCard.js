import {
  Palette,
  Utensils,
  Wine,
  Landmark,
  CalendarDays,
  MapPin,
  Clock,
} from 'lucide-react';
import Badge from '@/components/ui/Badge';

const ICONS = {
  restaurant: Utensils,
  gallery: Palette,
  bar: Wine,
  landmark: Landmark,
  event: CalendarDays,
};

const PRICE_LABEL = {
  free: 'Free',
  budget: '€',
  midrange: '€€',
  premium: '€€€',
};

export default function ActivityCard({ activity, slot, backupLabel = 'Backup' }) {
  if (!activity) return null;
  const Icon = ICONS[activity.type] ?? MapPin;

  return (
    <article className="group flex gap-4 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 transition hover:border-[color:var(--color-border-strong)]">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-surface-2)] text-[color:var(--color-accent)]">
        <Icon size={18} strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {slot && (
            <span className="font-display text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-muted)]">
              {slot}
            </span>
          )}
          {activity.priceRange && PRICE_LABEL[activity.priceRange] && (
            <Badge variant="muted">{PRICE_LABEL[activity.priceRange]}</Badge>
          )}
        </div>
        <h4 className="mt-1 font-display text-lg font-semibold leading-snug text-[color:var(--color-text)]">
          {activity.name}
        </h4>
        {activity.description && (
          <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--color-muted)]">
            {activity.description}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[color:var(--color-muted)]">
          {activity.neighbourhood && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} aria-hidden />
              {activity.neighbourhood}
            </span>
          )}
          {activity.estimatedDuration && (
            <span className="inline-flex items-center gap-1">
              <Clock size={12} aria-hidden />
              {activity.estimatedDuration}
            </span>
          )}
        </div>
        {activity.backup && (
          <div className="mt-3 rounded-xl border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3">
            <div className="font-display text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-accent)]">
              {backupLabel}
            </div>
            <div className="mt-1 text-sm text-[color:var(--color-text)]">
              {activity.backup.name}
              {activity.backup.neighbourhood && (
                <span className="text-[color:var(--color-muted)]">
                  {' '}· {activity.backup.neighbourhood}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
