// Google Maps Distance Matrix wrapper. Computes travel times between
// activity blocks for the system prompt and (optionally) the UI later.
// Fails soft if GOOGLE_MAPS_API_KEY is missing.

const ENDPOINT = 'https://maps.googleapis.com/maps/api/distancematrix/json';

// In-memory cache keyed by "lat1,lng1|lat2,lng2|mode" to avoid spamming
// the API on every chat request. Reset on cold start.
const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function cacheKey(a, b, mode) {
  return `${a.lat},${a.lng}|${b.lat},${b.lng}|${mode}`;
}

export async function travelTimeBetween(a, b, mode = 'transit') {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  if (!a?.lat || !a?.lng || !b?.lat || !b?.lng) return null;

  const ck = cacheKey(a, b, mode);
  const cached = cache.get(ck);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  try {
    const url =
      `${ENDPOINT}?origins=${a.lat},${a.lng}` +
      `&destinations=${b.lat},${b.lng}` +
      `&mode=${encodeURIComponent(mode)}` +
      `&units=metric` +
      `&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn('[maps] fetch failed:', res.status);
      return null;
    }
    const json = await res.json();
    const elem = json.rows?.[0]?.elements?.[0];
    if (!elem || elem.status !== 'OK') return null;
    const value = {
      mode,
      durationSec: elem.duration?.value ?? 0,
      durationText: elem.duration?.text ?? '',
      distanceText: elem.distance?.text ?? '',
    };
    cache.set(ck, { at: Date.now(), value });
    return value;
  } catch (err) {
    console.warn('[maps] error:', err.message);
    return null;
  }
}

// Compute travel hints between consecutive blocks per day. Returns a
// structured array of { date, from, to, durationText, mode }.
export async function travelHintsForItinerary(itinerary) {
  if (!itinerary?.days) return [];
  const out = [];
  for (const day of itinerary.days) {
    const blocks = day.blocks ?? [];
    for (let i = 0; i < blocks.length - 1; i += 1) {
      const a = blocks[i]?.activity;
      const b = blocks[i + 1]?.activity;
      if (!a?.coordinates || !b?.coordinates) continue;
      const hint = await travelTimeBetween(a.coordinates, b.coordinates, 'transit');
      if (!hint) continue;
      out.push({
        date: day.date,
        from: a.name,
        to: b.name,
        durationText: hint.durationText,
        distanceText: hint.distanceText,
        mode: hint.mode,
      });
    }
  }
  return out;
}

// Compact prompt-injection block.
export function formatTravelHintsBlock(hints) {
  if (!hints?.length) return null;
  const rows = hints.map(
    (h) => `  ${h.date}: ${h.from} → ${h.to} · ~${h.durationText} ${h.mode}`,
  );
  return `TRAVEL HINTS (live transit estimates):\n${rows.join('\n')}`;
}
