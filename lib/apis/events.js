// Live-events integrations. Both Luma and Eventbrite are reached through
// their public city discovery pages: Luma's API is host-only behind Luma
// Plus, and Eventbrite deprecated /v3/events/search/ in 2019. Both pages
// ship structured event data (Luma via __NEXT_DATA__, Eventbrite via
// schema.org JSON-LD), so a single scrape gives us everything we need
// without keys.

import programme from '@/data/nfc-summit/programme.json';

const LUMA_URL = 'https://lu.ma/lisbon';
const EB_URL = 'https://www.eventbrite.com/d/portugal--lisbon/all-events/';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let lumaCache = null;
let lumaCacheAt = 0;
let ebCache = null;
let ebCacheAt = 0;

// Recursively walk a parsed JSON blob and collect objects that look like
// Luma event records. We match by the shape Luma's __NEXT_DATA__ uses:
// api_id + name + start_at fields.
function harvestLumaEvents(node, out = new Map()) {
  if (!node) return out;
  if (Array.isArray(node)) {
    for (const item of node) harvestLumaEvents(item, out);
    return out;
  }
  if (typeof node === 'object') {
    const id = node.api_id ?? node.id;
    if (id && typeof node.name === 'string' && (node.start_at || node.start_time)) {
      if (!out.has(id)) out.set(id, node);
    }
    for (const key of Object.keys(node)) harvestLumaEvents(node[key], out);
  }
  return out;
}

function normaliseLumaEvent(raw) {
  const url = raw.url ?? (raw.slug ? `https://lu.ma/${raw.slug}` : '');
  return {
    source: 'luma',
    id: raw.api_id ?? raw.id ?? '',
    name: raw.name ?? '',
    url,
    start: raw.start_at ?? raw.start_time ?? null,
    end: raw.end_at ?? raw.end_time ?? null,
    venue:
      raw.geo_address_info?.full_address ??
      raw.geo_address_info?.address ??
      raw.location ??
      '',
    neighbourhood: raw.geo_address_info?.city ?? '',
    description: raw.description_short ?? raw.description ?? '',
    tags: Array.isArray(raw.tags) ? raw.tags.map((t) => t.name ?? t).filter(Boolean) : [],
  };
}

async function fetchLumaEvents({ from, to } = {}) {
  const now = Date.now();
  if (!lumaCache || now - lumaCacheAt > CACHE_TTL_MS) {
    try {
      const res = await fetch(LUMA_URL, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; NFCSummitVisitorAgent/1.0; +https://nfc-summit.com)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!res.ok) {
        console.warn('[events/luma] fetch failed:', res.status);
        lumaCache = [];
        lumaCacheAt = now;
      } else {
        const html = await res.text();
        const match = html.match(
          /<script id="__NEXT_DATA__"[^>]*>([\s\S]+?)<\/script>/,
        );
        if (!match) {
          console.warn('[events/luma] __NEXT_DATA__ not found on lu.ma/lisbon');
          lumaCache = [];
        } else {
          const data = JSON.parse(match[1]);
          const events = [...harvestLumaEvents(data).values()].map(normaliseLumaEvent);
          lumaCache = events;
        }
        lumaCacheAt = now;
      }
    } catch (err) {
      console.warn('[events/luma] error:', err.message);
      lumaCache = [];
      lumaCacheAt = now;
    }
  }
  return filterByWindow(lumaCache ?? [], from, to);
}

function normaliseEventbriteEvent(raw) {
  const addr = raw.location?.address ?? {};
  const venue =
    raw.location?.name ||
    [addr.streetAddress, addr.addressLocality].filter(Boolean).join(', ');
  // Eventbrite event URLs end in -tickets-<numericId>; pull that out as id.
  const idMatch = typeof raw.url === 'string' ? raw.url.match(/-(\d+)\/?$/) : null;
  return {
    source: 'eventbrite',
    id: idMatch ? idMatch[1] : raw.url ?? '',
    name: raw.name ?? '',
    url: raw.url ?? '',
    start: raw.startDate ?? null,
    end: raw.endDate ?? null,
    venue,
    neighbourhood: addr.addressLocality ?? '',
    description: (raw.description ?? '').slice(0, 280),
    tags: [],
  };
}

// Eventbrite public discovery scrape. Their /v3/events/search/ API was
// shut down in 2019, but the consumer-facing /d/ page still emits a full
// schema.org ItemList of Event objects in a JSON-LD <script> block.
async function fetchEventbriteEvents({ from, to } = {}) {
  const now = Date.now();
  if (!ebCache || now - ebCacheAt > CACHE_TTL_MS) {
    try {
      const res = await fetch(EB_URL, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; NFCSummitVisitorAgent/1.0; +https://nfc-summit.com)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!res.ok) {
        console.warn('[events/eventbrite] fetch failed:', res.status);
        ebCache = [];
      } else {
        const html = await res.text();
        const blocks =
          html.match(
            /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]+?)<\/script>/g,
          ) ?? [];
        const events = [];
        for (const block of blocks) {
          const inner = block.replace(/<[^>]+>/g, '').trim();
          try {
            const parsed = JSON.parse(inner);
            const list = Array.isArray(parsed) ? parsed[0] : parsed;
            if (
              list?.['@type'] === 'ItemList' &&
              Array.isArray(list.itemListElement)
            ) {
              for (const entry of list.itemListElement) {
                if (entry?.item?.['@type'] === 'Event') {
                  events.push(normaliseEventbriteEvent(entry.item));
                }
              }
            }
          } catch {
            // ignore malformed JSON-LD blocks
          }
        }
        ebCache = events;
      }
      ebCacheAt = now;
    } catch (err) {
      console.warn('[events/eventbrite] error:', err.message);
      ebCache = [];
      ebCacheAt = now;
    }
  }
  return filterByWindow(ebCache ?? [], from, to);
}

function filterByWindow(events, from, to) {
  if (!from && !to) return events;
  const fromMs = from ? Date.parse(`${from}T00:00:00Z`) : -Infinity;
  const toMs = to ? Date.parse(`${to}T23:59:59Z`) : Infinity;
  return events.filter((e) => {
    if (!e.start) return false;
    const startMs = Date.parse(e.start);
    if (!Number.isFinite(startMs)) return false;
    // Multi-day events (e.g. the Summit itself, June 4–6) should match
    // any query day inside their span. Treat single-day events as a
    // zero-length interval anchored at start.
    const endRaw = e.end ? Date.parse(e.end) : NaN;
    const endMs = Number.isFinite(endRaw) ? endRaw : startMs;
    return startMs <= toMs && endMs >= fromMs;
  });
}

// Curated NFC Summit side events from programme.json. These are the
// authoritative source for the Summit's own events (brunches, tours, parties)
// — they live on lu.ma/nfcsummit, NOT the generic lu.ma/lisbon page we scrape,
// so without this merge they'd be invisible to findEvents. Filtered by window
// against each event's dates[] array (multi-day events match any covered day).
function curatedSummitEvents({ from, to } = {}) {
  const sideEvents = Array.isArray(programme.sideEvents) ? programme.sideEvents : [];
  const fromMs = from ? Date.parse(`${from}T00:00:00Z`) : -Infinity;
  const toMs = to ? Date.parse(`${to}T23:59:59Z`) : Infinity;

  const out = [];
  for (const ev of sideEvents) {
    const dates = Array.isArray(ev.dates) ? ev.dates : (ev.dates ? [ev.dates] : []);
    let matchedDate = null;
    if (dates.length) {
      matchedDate = dates.find((d) => {
        const ms = Date.parse(`${d}T12:00:00Z`);
        return Number.isFinite(ms) && ms >= fromMs && ms <= toMs;
      });
      if (!matchedDate) continue; // has dates but none in the requested window
    }

    const day = matchedDate ?? dates[0] ?? null;
    const start = day ? `${day}T${ev.timeStart || '00:00'}:00` : null;
    const end = day && ev.timeEnd ? `${day}T${ev.timeEnd}:00` : null;
    const extra = [
      ev.note ? `(${ev.note})` : '',
      ev.ticketType ? `Ticket: ${ev.ticketType}.` : '',
    ].filter(Boolean).join(' ');

    out.push({
      source: 'nfc-summit',
      id: ev.id,
      name: ev.name,
      url: ev.lumaUrl ?? '',
      start,
      end,
      venue: ev.venue ?? ev.address ?? programme.event?.address ?? '',
      neighbourhood: programme.event?.neighbourhood ?? 'Beato',
      organiser: ev.organiser ?? '',
      description: `${ev.description ?? ''}${extra ? ` ${extra}` : ''}`.trim(),
      tags: ['nfc-summit', 'side-event', ev.type].filter(Boolean),
    });
  }
  return out;
}

const normaliseName = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Public entry point — returns a unified list of normalized events.
// Curated NFC Summit side events come first (authoritative); live luma +
// eventbrite results follow, deduped against curated by normalized name.
// Each event: { source, id, name, url, start, end, venue, neighbourhood, description, tags }.
export async function fetchLisbonEvents({ from, to } = {}) {
  const curated = curatedSummitEvents({ from, to });
  const [luma, eventbrite] = await Promise.all([
    fetchLumaEvents({ from, to }).catch(() => []),
    fetchEventbriteEvents({ from, to }).catch(() => []),
  ]);
  const curatedNames = new Set(curated.map((e) => normaliseName(e.name)));
  const live = [...luma, ...eventbrite].filter((e) => !curatedNames.has(normaliseName(e.name)));
  return [...curated, ...live];
}

// Compact prompt-injection block. Returns null if no events found so the
// prompt assembler can skip the section.
export function formatEventsBlock(events) {
  if (!events?.length) return null;
  const rows = events.slice(0, 12).map((e) => {
    const when = e.start ? new Date(e.start).toISOString().slice(0, 16).replace('T', ' ') : '?';
    const where = [e.venue, e.neighbourhood].filter(Boolean).join(', ');
    return `  ${when} · ${e.name}${where ? ` @ ${where}` : ''} (${e.source})`;
  });
  return `LIVE LISBON EVENTS (within trip window):\n${rows.join('\n')}`;
}
