// Static catalog loader for the curated Lisbon venue data in /data/lisbon/.
// Used as the always-available baseline for itinerary generation so that a
// Pinecone outage or empty result set never leaves the builder venue-starved.
// Entries are reshaped to match the flat metadata shape that the retrieval
// layer returns (flat lat/lng, no nested coordinates), so the rest of the
// pipeline can treat both sources interchangeably.

import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LISBON_DIR = join(__dirname, '..', 'data', 'lisbon');

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
  const out = [];
  const files = await readdir(LISBON_DIR);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const raw = await readFile(join(LISBON_DIR, file), 'utf8');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) continue;
    for (const item of arr) out.push(flatten(item));
  }
  cache = out;
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
