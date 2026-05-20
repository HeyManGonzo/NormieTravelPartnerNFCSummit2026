import { createEvents } from 'ics';
import { getMessages } from '@/lib/i18n';

// Default Lisbon-local windows per time slot. The `ics` package emits these
// as "floating" local times — calendar apps render them at the user's local
// clock, which is what we want when the visitor arrives in Lisbon.
const SLOT_WINDOWS = {
  morning: { startH: 10, startM: 0, hours: 2 },
  afternoon: { startH: 14, startM: 0, hours: 3 },
  evening: { startH: 19, startM: 0, hours: 3 },
};

function parseHHMM(s) {
  if (!s || typeof s !== 'string') return null;
  const [h, m] = s.split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return { h, m };
}

function diffHours(a, b) {
  const total = (b.h * 60 + b.m) - (a.h * 60 + a.m);
  return Math.max(1, Math.round((total / 60) * 100) / 100);
}

// Map an itinerary block to ics-friendly { start[], duration }.
function blockTiming(date, block, nfcDay, programme) {
  const [y, mo, d] = date.split('-').map((n) => parseInt(n, 10));

  if (nfcDay && programme?.event) {
    const day = programme.days?.find((p) => p.date === date);
    const open = parseHHMM(day?.doorsOpen ?? programme.event.doorsOpen);
    const close = parseHHMM(day?.doorsClose ?? programme.event.doorsClose);
    if (open && close && block.timeSlot !== 'evening') {
      // For NFC-day morning/afternoon slots, fall back to a 4-hour split
      // around the open–close window so morning and afternoon don't overlap.
      const half =
        block.timeSlot === 'morning'
          ? { startH: open.h, startM: open.m, hours: Math.min(4, diffHours(open, close) / 2) }
          : {
              startH: Math.min(close.h - 4, open.h + Math.floor(diffHours(open, close) / 2)),
              startM: 0,
              hours: 4,
            };
      return {
        start: [y, mo, d, half.startH, half.startM],
        duration: { hours: Math.floor(half.hours), minutes: Math.round((half.hours % 1) * 60) },
      };
    }
  }

  const win = SLOT_WINDOWS[block.timeSlot] ?? SLOT_WINDOWS.morning;
  return {
    start: [y, mo, d, win.startH, win.startM],
    duration: { hours: win.hours, minutes: 0 },
  };
}

function eventFromBlock(date, block, nfcDay, programme, msgs) {
  const a = block?.activity;
  if (!a) return null;
  const timing = blockTiming(date, block, nfcDay, programme);
  const slot = msgs.itinerary.slot[block.timeSlot] ?? block.timeSlot;

  const lines = [];
  if (a.description) lines.push(a.description);
  if (a.neighbourhood) lines.push(`${msgs.exportDoc.neighbourhoodLabel}: ${a.neighbourhood}`);
  if (a.estimatedDuration) lines.push(`${msgs.exportDoc.durationLabel}: ${a.estimatedDuration}`);
  if (a.backup?.name) lines.push(`${msgs.itinerary.backup}: ${a.backup.name}`);
  lines.push('');
  lines.push(msgs.exportDoc.calendarCredit);

  const evt = {
    title: `${slot} · ${a.name}`,
    start: timing.start,
    startInputType: 'local',
    startOutputType: 'local',
    duration: timing.duration,
    description: lines.join('\n'),
    location: a.address || a.neighbourhood || 'Lisbon',
    categories: [a.type, nfcDay ? 'nfc-summit' : null].filter(Boolean),
    productId: 'norma/nfc-summit-2026',
    calName: msgs.exportDoc.calendarName,
  };
  if (a.coordinates?.lat && a.coordinates?.lng) {
    evt.geo = { lat: a.coordinates.lat, lon: a.coordinates.lng };
  }
  return evt;
}

export function buildIcs(itinerary, programme, locale = 'en') {
  if (!itinerary?.days) {
    throw new Error('Itinerary has no days');
  }
  const msgs = getMessages(locale);
  const events = [];
  for (const day of itinerary.days) {
    for (const block of day.blocks ?? []) {
      const evt = eventFromBlock(day.date, block, day.nfcDay, programme, msgs);
      if (evt) events.push(evt);
    }
  }
  return new Promise((resolve, reject) => {
    createEvents(events, (err, value) => {
      if (err) reject(err);
      else resolve(value);
    });
  });
}
