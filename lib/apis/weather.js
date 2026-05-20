// OpenWeatherMap wrapper. Free-tier 5-day/3-hour forecast endpoint.
// Fails soft if OPENWEATHERMAP_API_KEY is missing — caller just gets null.
//
// Note: OpenWeather's free forecast only reaches ~5 days out, so this is
// designed for use *during* the visitor's stay, not weeks in advance.

const LISBON = { lat: 38.7223, lng: -9.1393 };
const ENDPOINT = 'https://api.openweathermap.org/data/2.5/forecast';

let cache = null;
let cacheAt = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function summariseDay(buckets) {
  let tmin = Infinity;
  let tmax = -Infinity;
  const conditions = new Map();
  let rainTotal = 0;
  for (const b of buckets) {
    tmin = Math.min(tmin, b.main?.temp_min ?? b.main?.temp ?? tmin);
    tmax = Math.max(tmax, b.main?.temp_max ?? b.main?.temp ?? tmax);
    const cond = b.weather?.[0]?.main ?? 'Clear';
    conditions.set(cond, (conditions.get(cond) ?? 0) + 1);
    rainTotal += b.rain?.['3h'] ?? 0;
  }
  const sortedConditions = [...conditions.entries()].sort((a, b) => b[1] - a[1]);
  return {
    minC: Math.round(tmin),
    maxC: Math.round(tmax),
    condition: sortedConditions[0]?.[0] ?? 'Clear',
    rainMm: Math.round(rainTotal * 10) / 10,
  };
}

// Returns a map keyed by ISO date → { minC, maxC, condition, rainMm } or null.
export async function fetchLisbonForecast() {
  const key = process.env.OPENWEATHERMAP_API_KEY;
  if (!key) return null;

  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL_MS) return cache;

  try {
    const url = `${ENDPOINT}?lat=${LISBON.lat}&lon=${LISBON.lng}&units=metric&appid=${key}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn('[weather] fetch failed:', res.status);
      return null;
    }
    const json = await res.json();
    const byDate = new Map();
    for (const item of json.list ?? []) {
      const date = item.dt_txt?.slice(0, 10);
      if (!date) continue;
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(item);
    }
    const summary = {};
    for (const [date, buckets] of byDate) summary[date] = summariseDay(buckets);
    cache = summary;
    cacheAt = now;
    return summary;
  } catch (err) {
    console.warn('[weather] error:', err.message);
    return null;
  }
}

// Compact text block for system-prompt injection, scoped to a date range.
export function formatForecastBlock(forecast, dateRange) {
  if (!forecast || !dateRange?.length) return null;
  const rows = [];
  for (const date of dateRange) {
    const d = forecast[date];
    if (!d) continue;
    rows.push(`  ${date}: ${d.condition}, ${d.minC}–${d.maxC}°C${d.rainMm ? `, rain ~${d.rainMm}mm` : ''}`);
  }
  if (rows.length === 0) return null;
  return `LISBON WEATHER FORECAST (live, next 5 days):\n${rows.join('\n')}`;
}
