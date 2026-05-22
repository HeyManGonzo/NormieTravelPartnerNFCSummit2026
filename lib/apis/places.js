// Google Places (New API v1) wrapper.
// Two responsibilities: (1) enrich curated venues at seed time with live
// opening hours, ratings, and a Place ID; (2) act as a runtime discovery
// fallback when the curated catalog can't answer a question.
// Fails soft if GOOGLE_PLACES_API_KEY is missing.

const TEXT_SEARCH = 'https://places.googleapis.com/v1/places:searchText';

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.regularOpeningHours.weekdayDescriptions',
  'places.priceLevel',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.primaryTypeDisplayName',
].join(',');

// Lisbon-centred bias used when callers don't pass their own.
const LISBON_BIAS = {
  circle: { center: { latitude: 38.7223, longitude: -9.1393 }, radius: 15000 },
};

// In-memory cache for runtime searchPlaces calls. Reset on cold start.
const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function searchMany(query, { locationBias, maxResultCount = 1 } = {}) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(TEXT_SEARCH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        locationBias: locationBias ?? LISBON_BIAS,
        maxResultCount,
      }),
    });
    if (!res.ok) {
      console.warn('[places] search failed:', res.status, await res.text());
      return null;
    }
    const json = await res.json();
    return json.places ?? [];
  } catch (err) {
    console.warn('[places] error:', err.message);
    return null;
  }
}

async function searchOne(query, locationBias) {
  const list = await searchMany(query, { locationBias, maxResultCount: 1 });
  return list?.[0] ?? null;
}

// Enrich a single curated entry. Returns a flat object suitable for merging
// into Pinecone metadata. Returns null if no key or no match.
export async function enrichWithPlaces(entry) {
  if (!process.env.GOOGLE_PLACES_API_KEY) return null;
  const query = [entry.name, entry.neighbourhood, 'Lisbon'].filter(Boolean).join(', ');
  const place = await searchOne(query);
  if (!place) return null;
  return {
    googlePlaceId: place.id ?? '',
    googleRating: place.rating ?? 0,
    googleRatingCount: place.userRatingCount ?? 0,
    googleWebsite: place.websiteUri ?? '',
    googleOpeningHours: Array.isArray(place.regularOpeningHours?.weekdayDescriptions)
      ? place.regularOpeningHours.weekdayDescriptions
      : [],
    googlePriceLevel: place.priceLevel ?? '',
    googleAddress: place.formattedAddress ?? '',
    googleLat: place.location?.latitude ?? 0,
    googleLng: place.location?.longitude ?? 0,
  };
}

// Normalise a raw Places result into a chat-friendly shape.
function normalisePlace(p) {
  return {
    placeId: p.id ?? '',
    name: p.displayName?.text ?? '',
    category: p.primaryTypeDisplayName?.text ?? '',
    address: p.formattedAddress ?? '',
    coordinates: p.location
      ? { lat: p.location.latitude, lng: p.location.longitude }
      : null,
    rating: p.rating ?? null,
    ratingCount: p.userRatingCount ?? 0,
    priceLevel: p.priceLevel ?? '',
    openingHours: Array.isArray(p.regularOpeningHours?.weekdayDescriptions)
      ? p.regularOpeningHours.weekdayDescriptions
      : [],
    website: p.websiteUri ?? '',
    googleMapsUri: p.googleMapsUri ?? '',
  };
}

// Runtime discovery: free-text search against Google Places, biased to
// Lisbon. Used as a fallback when the curated catalog can't satisfy a
// request — e.g. a specific venue the visitor names by hand, or a cuisine
// not well-covered in /data/lisbon. Returns up to `limit` normalised
// matches, or null when the key is missing / the API errors.
export async function searchPlaces(query, { limit = 5 } = {}) {
  if (!query?.trim()) return null;
  if (!process.env.GOOGLE_PLACES_API_KEY) return null;
  const max = Math.max(1, Math.min(10, limit));
  const ck = `${query.trim().toLowerCase()}|${max}`;
  const cached = cache.get(ck);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  const list = await searchMany(query, { maxResultCount: max });
  if (!list) return null;
  const value = list.map(normalisePlace);
  cache.set(ck, { at: Date.now(), value });
  return value;
}

