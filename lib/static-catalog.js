// Static catalog loader for the curated Lisbon venue data in /data/lisbon/.
// Used as the always-available baseline for itinerary generation so that a
// Pinecone outage or empty result set never leaves the builder venue-starved.
// Entries are reshaped to match the flat metadata shape that the retrieval
// layer returns (flat lat/lng, no nested coordinates), so the rest of the
// pipeline can treat both sources interchangeably.
//
// JSON files are imported statically so that Next.js bundles them into the
// serverless function — a runtime fs.readdir against /data/lisbon does not
// work on Vercel because the directory is not part of the function payload.

import restaurants from '@/data/lisbon/restaurants.json';
import galleries from '@/data/lisbon/galleries.json';
import landmarks from '@/data/lisbon/landmarks.json';
import nightlife from '@/data/lisbon/nightlife.json';
import neighbourhoods from '@/data/lisbon/neighbourhoods.json';

let cache = null;

function flatten(entry) {
  return {
    id: entry.id,
    type: entry.type,
    name: entry.name,
    description: entry.description,
    address: entry.address,
    neighbourhood: entry.neighbourhood,
    priceRange: entry.priceRange,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    nfcRelevant: Boolean(entry.nfcRelevant),
    lat: entry.coordinates?.lat ?? 0,
    lng: entry.coordinates?.lng ?? 0,
    openingHours: entry.openingHours,
    score: 0,
  };
}

export async function loadStaticCatalog() {
  if (cache) return cache;
  const all = [
    ...restaurants,
    ...galleries,
    ...landmarks,
    ...nightlife,
    ...neighbourhoods,
  ];
  cache = all.map(flatten);
  return cache;
}

// Merge Pinecone matches on top of the static catalog. Pinecone results win
// (they carry similarity scores and any Google Places enrichment); static
// entries that weren't in the Pinecone result set are kept with score 0 so
// the builder can still fall back to them when retrieval is sparse.
export function mergeWithStatic(staticEntries, pineconeResults) {
  const byId = new Map();
  for (const e of staticEntries) byId.set(e.id, e);
  for (const r of pineconeResults ?? []) {
    if (!r?.id) continue;
    const existing = byId.get(r.id);
    byId.set(r.id, existing ? { ...existing, ...r } : r);
  }
  return [...byId.values()];
}
