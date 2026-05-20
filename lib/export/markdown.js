// Pure Markdown builder for an itinerary. Produces a portable plain-text
// document suitable for sharing or pasting into note apps.

import { getMessages } from '@/lib/i18n';

const PRICE_LABEL = {
  budget: '€',
  midrange: '€€',
  premium: '€€€',
};

function formatDate(iso, dateLocale) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(dateLocale, {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function renderActivity(block, msgs) {
  const a = block?.activity;
  if (!a) return '';
  const slot = msgs.itinerary.slot[block.timeSlot] ?? block.timeSlot;
  const lines = [];
  lines.push(`### ${slot} — ${a.name}`);
  const meta = [];
  if (a.neighbourhood) meta.push(a.neighbourhood);
  if (a.estimatedDuration) meta.push(a.estimatedDuration);
  if (a.priceRange === 'free') meta.push(msgs.exportDoc.free);
  else if (a.priceRange && PRICE_LABEL[a.priceRange]) meta.push(PRICE_LABEL[a.priceRange]);
  if (meta.length) lines.push(`*${meta.join(' · ')}*`);
  if (a.description) lines.push('', a.description);
  if (a.address) lines.push('', `📍 ${a.address}`);
  if (a.backup?.name) {
    lines.push('', `**${msgs.itinerary.backup}:** ${a.backup.name}${a.backup.neighbourhood ? ` — ${a.backup.neighbourhood}` : ''}`);
  }
  return lines.join('\n');
}

export function buildMarkdown(itinerary, locale = 'en') {
  const msgs = getMessages(locale);
  if (!itinerary?.days) return `# ${msgs.itinerary.title}\n\n_${msgs.itinerary.empty}_\n`;

  const out = [];
  out.push(`# ${msgs.exportDoc.title}`);
  out.push('');
  out.push(`_${msgs.exportDoc.subtitle}_`);
  out.push('');

  if (itinerary.trip) {
    const { arrivalDate, departureDate, durationDays } = itinerary.trip;
    out.push(`**${msgs.exportDoc.tripLabel}:** ${arrivalDate} → ${departureDate} (${durationDays} ${msgs.exportDoc.pdfDays})`);
    out.push('');
  }
  if (itinerary.version) {
    const ts = new Date(itinerary.generatedAt ?? Date.now()).toISOString().slice(0, 10);
    out.push(`_${msgs.exportDoc.versionLabel} ${itinerary.version} · ${msgs.exportDoc.generatedLabel} ${ts}_`);
    out.push('');
  }

  out.push('---');
  out.push('');

  for (const day of itinerary.days) {
    const tag = day.nfcDay ? ` · 🎟 ${msgs.itinerary.nfcDay}` : '';
    out.push(`## ${day.dayLabel}${tag}`);
    out.push(`_${formatDate(day.date, msgs.exportDoc.dateLocale)}_`);
    out.push('');
    for (const block of day.blocks ?? []) {
      out.push(renderActivity(block, msgs));
      out.push('');
    }
    out.push('---');
    out.push('');
  }

  out.push(`_${msgs.exportDoc.footer}_`);
  out.push('');
  return out.join('\n');
}
