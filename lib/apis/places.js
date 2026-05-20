// Google Places (New API v1) wrapper used to enrich curated venues with
// live opening hours, ratings, and a Place ID before indexing into Pinecone.
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
].join(',');

async function searchOne(query, locationBias) {
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
        locationBias: locationBias ?? {
          circle: { center: { latitude: 38.7223, longitude: -9.1393 }, radius: 15000 },
        },
        maxResultCount: 1,
      }),
    });
    if (!res.ok) {
      console.warn('[places] search failed:', res.status, await res.text());
      return null;
    }
    const json = await res.json();
    return json.places?.[0] ?? null;
  } catch (err) {
    console.warn('[places] error:', err.message);
    return null;
  }
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
