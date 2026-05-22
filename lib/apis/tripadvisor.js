// SearchApi.io Tripadvisor wrapper. Provides independent ratings, review
// counts, and rankings for Lisbon venues. Fails soft when SEARCHAPI_KEY is
// missing, the endpoint errors, or no Lisbon-shaped result is found.

const ENDPOINT = 'https://www.searchapi.io/api/v1/search';

// 24h cache. Tripadvisor data shifts slowly and the free tier is metered
// per successful request, so caching aggressively is the right default.
const searchCache = new Map();
const placeCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function isLisbonResult(r) {
  const loc = (r?.location || '').toLowerCase();
  return loc.includes('lisbon') || loc.includes('portugal');
}

// Normalise Tripadvisor's dollar-sign price tier into the catalog enum
// (budget | midrange | premium) so downstream code that already understands
// our enum (itinerary builder, retrieval filter, PDF label map) can consume
// the same vocabulary. Uses the longest run of consecutive `$` in the
// string so a hybrid like "$$ - $$$" maps to midrange rather than budget.
export function normalisePriceTier(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let max = 0;
  let run = 0;
  for (const ch of raw) {
    if (ch === '$') {
      run += 1;
      if (run > max) max = run;
    } else {
      run = 0;
    }
  }
  if (max === 0) return null;
  if (max <= 2) return 'budget';
  if (max === 3) return 'midrange';
  return 'premium';
}

// Loose token-overlap match. We use this because Tripadvisor often
// normalises venue names ("Ao 26 Vegan Food Project" → "26 Vegan Food
// Project") and we don't want a single missing word to drop the hit.
function nameMatchScore(needle, candidate) {
  if (!needle || !candidate) return 0;
  const norm = (s) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !['the', 'de', 'da', 'do', 'das', 'dos', 'la', 'le'].includes(w));
  const a = new Set(norm(needle));
  const b = new Set(norm(candidate));
  if (a.size === 0 || b.size === 0) return 0;
  let hits = 0;
  for (const w of a) if (b.has(w)) hits += 1;
  return hits / a.size;
}

async function callSearchApi(params) {
  const key = process.env.SEARCHAPI_KEY;
  if (!key) return null;
  try {
    const url = new URL(ENDPOINT);
    url.searchParams.set('api_key', key);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    const res = await fetch(url);
    if (!res.ok) {
      console.warn('[tripadvisor] http', res.status);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn('[tripadvisor] fetch error:', err.message);
    return null;
  }
}

// Search Tripadvisor for Lisbon venues matching a free-text query. Returns
// up to `limit` results, each carrying enough to use as social proof
// without a follow-up call. Best for discovery ("highly-rated rooftop bar").
export async function searchTripadvisor({ query, limit = 5, minRating } = {}) {
  if (!query) return null;
  const ck = `${query.toLowerCase()}|${limit}|${minRating ?? ''}`;
  const cached = searchCache.get(ck);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const json = await callSearchApi({ engine: 'tripadvisor', q: `${query} Lisbon` });
  if (!json?.place_results?.length) return null;

  const lisbon = json.place_results.filter(isLisbonResult);
  const filtered = minRating
    ? lisbon.filter((r) => typeof r.rating === 'number' && r.rating >= minRating)
    : lisbon;
  const value = filtered.slice(0, limit).map((r) => ({
    placeId: r.place_id,
    title: r.title,
    rating: r.rating ?? null,
    reviews: r.reviews ?? null,
    type: r.type ?? null,
    location: r.location ?? null,
    snippet: r.review_snippet ?? null,
    link: r.link ?? null,
  }));
  searchCache.set(ck, { at: Date.now(), value });
  return value;
}

// Find the Tripadvisor entry that best matches a specific venue name and
// return its key social-proof fields. Used to back named recommendations
// from the curated catalog with independent ratings. Returns null if no
// reasonable match exists (e.g. the venue is too niche for Tripadvisor).
export async function getTripadvisorRating(venueName) {
  if (!venueName) return null;
  const ck = venueName.toLowerCase().trim();
  const cached = placeCache.get(ck);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const json = await callSearchApi({ engine: 'tripadvisor', q: `${venueName} Lisbon` });
  const results = json?.place_results ?? [];
  if (!results.length) {
    placeCache.set(ck, { at: Date.now(), value: null });
    return null;
  }

  // Score each Lisbon result by name overlap; require >=0.7 to accept.
  // Lower thresholds let through neighbourhood-name overlap false positives
  // (e.g. "Sao Lazaro Apartments" for "Carpintarias de São Lázaro").
  let best = null;
  let bestScore = 0;
  for (const r of results) {
    if (!isLisbonResult(r)) continue;
    const score = nameMatchScore(venueName, r.title || '');
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  if (!best || bestScore < 0.7) {
    placeCache.set(ck, { at: Date.now(), value: null });
    return null;
  }

  // Fetch the place record so we can return ranking + price_range too.
  const detail = await callSearchApi({ engine: 'tripadvisor_place', place_id: best.place_id });
  const place = detail?.place ?? null;

  const rawPrice = place?.price_range ?? null;
  const value = {
    name: best.title,
    rating: best.rating ?? place?.rating ?? null,
    reviews: best.reviews ?? place?.reviews ?? null,
    rankingText: place?.ranking?.text ?? null,
    priceRange: rawPrice,
    priceTier: normalisePriceTier(rawPrice),
    snippet: best.review_snippet ?? null,
    link: best.link ?? place?.link ?? null,
    matchScore: Number(bestScore.toFixed(2)),
  };
  placeCache.set(ck, { at: Date.now(), value });
  return value;
}
