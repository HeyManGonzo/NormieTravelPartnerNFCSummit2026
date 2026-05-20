// Live-events integrations. Luma uses public city discovery pages (no key
// required, as Luma's API is host-only behind Luma Plus). Eventbrite uses
// the public search endpoint authenticated with a personal OAuth token.

const LUMA_URL = 'https://lu.ma/lisbon';
const LUMA_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let lumaCache = null;
let lumaCacheAt = 0;

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
  if (!lumaCache || now - lumaCacheAt > LUMA_CACHE_TTL_MS) {
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

// Eventbrite public search. Personal OAuth token in EVENTBRITE_API_KEY.
async function fetchEventbriteEvents({ from, to } = {}) {
  const key = process.env.EVENTBRITE_API_KEY;
  if (!key) return [];
  try {
    const params = new URLSearchParams({
      'location.address': 'Lisbon, Portugal',
      'location.within': '15km',
      expand: 'venue',
      sort_by: 'date',
    });
    if (from) params.set('start_date.range_start', `${from}T00:00:00Z`);
    if (to) params.set('start_date.range_end', `${to}T23:59:59Z`);
    const res = await fetch(
      `https://www.eventbriteapi.com/v3/events/search/?${params.toString()}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) {
      console.warn('[events/eventbrite] fetch failed:', res.status);
      return [];
    }
    const json = await res.json();
    return (json.events ?? []).map((e) => ({
      source: 'eventbrite',
      id: e.id,
      name: e.name?.text ?? '',
      url: e.url ?? '',
      start: e.start?.utc ?? null,
      end: e.end?.utc ?? null,
      venue: e.venue?.name ?? '',
      neighbourhood: e.venue?.address?.city ?? '',
      description: e.description?.text?.slice(0, 280) ?? '',
      tags: [],
    }));
  } catch (err) {
    console.warn('[events/eventbrite] error:', err.message);
    return [];
  }
}

function filterByWindow(events, from, to) {
  if (!from && !to) return events;
  const fromMs = from ? Date.parse(`${from}T00:00:00Z`) : -Infinity;
  const toMs = to ? Date.parse(`${to}T23:59:59Z`) : Infinity;
  return events.filter((e) => {
    if (!e.start) return false;
    const t = Date.parse(e.start);
    return Number.isFinite(t) && t >= fromMs && t <= toMs;
  });
}

// Public entry point — returns a unified list of normalized events.
// Each event: { source, id, name, url, start, end, venue, neighbourhood, description, tags }.
export async function fetchLisbonEvents({ from, to } = {}) {
  const [luma, eventbrite] = await Promise.all([
    fetchLumaEvents({ from, to }).catch(() => []),
    fetchEventbriteEvents({ from, to }).catch(() => []),
  ]);
  return [...luma, ...eventbrite];
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
