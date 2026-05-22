// Embed every entry in /data/ and upsert into Pinecone.
// Run with: npm run seed:kb
//
// Requires .env.local with VOYAGE_API_KEY, PINECONE_API_KEY, PINECONE_INDEX_NAME.

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pinecone } from '@pinecone-database/pinecone';
import { embedTexts } from '../lib/embeddings.js';
import { enrichWithPlaces } from '../lib/apis/places.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const BATCH_SIZE = 16;

async function loadAllEntries() {
  const entries = [];

  // Lisbon venue files — each is a flat array.
  const lisbonDir = join(DATA_DIR, 'lisbon');
  const lisbonFiles = await readdir(lisbonDir);
  for (const file of lisbonFiles) {
    if (!file.endsWith('.json')) continue;
    const raw = await readFile(join(lisbonDir, file), 'utf8');
    const arr = JSON.parse(raw);
    for (const item of arr) entries.push(item);
  }

  // NFC Summit programme — wrap the event itself as a single retrievable entry.
  const programmeRaw = await readFile(
    join(DATA_DIR, 'nfc-summit', 'programme.json'),
    'utf8',
  );
  const programme = JSON.parse(programmeRaw);
  entries.push({
    id: programme.event.id,
    type: 'event',
    name: programme.event.name,
    description: programme.event.summary,
    address: programme.event.address,
    neighbourhood: programme.event.neighbourhood,
    coordinates: programme.event.coordinates,
    priceRange: 'premium',
    tags: ['nfc-summit', 'conference', 'digital-art', 'web3'],
    nfcRelevant: true,
  });

  return entries;
}

function toEmbeddingText(entry) {
  const parts = [
    entry.name,
    entry.type,
    entry.neighbourhood,
    entry.description,
    Array.isArray(entry.tags) ? entry.tags.join(', ') : '',
  ];
  return parts.filter(Boolean).join('. ');
}

function toPineconeMetadata(entry, places) {
  // Pinecone metadata values must be primitive or arrays of strings.
  const base = {
    type: entry.type ?? '',
    name: entry.name ?? '',
    description: entry.description ?? '',
    address: entry.address ?? '',
    neighbourhood: entry.neighbourhood ?? '',
    priceRange: entry.priceRange ?? '',
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    nfcRelevant: Boolean(entry.nfcRelevant),
    lat: entry.coordinates?.lat ?? 0,
    lng: entry.coordinates?.lng ?? 0,
  };
  if (!places) return base;
  return {
    ...base,
    googlePlaceId: places.googlePlaceId ?? '',
    googleRating: places.googleRating ?? 0,
    googleRatingCount: places.googleRatingCount ?? 0,
    googleWebsite: places.googleWebsite ?? '',
    googleOpeningHours: places.googleOpeningHours ?? [],
    googlePriceLevel: String(places.googlePriceLevel ?? ''),
    googleAddress: places.googleAddress ?? '',
  };
}

async function main() {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX_NAME;
  if (!apiKey || !indexName) {
    throw new Error('Set PINECONE_API_KEY and PINECONE_INDEX_NAME in .env.local');
  }

  const entries = await loadAllEntries();
  console.log(`Loaded ${entries.length} entries from /data`);

  const placesEnabled = Boolean(process.env.GOOGLE_PLACES_API_KEY);
  if (placesEnabled) {
    console.log('Google Places enrichment: ENABLED');
  } else {
    console.log('Google Places enrichment: skipped (no GOOGLE_PLACES_API_KEY)');
  }

  const pinecone = new Pinecone({ apiKey });
  const index = pinecone.index(indexName);

  // Wipe the default namespace before seeding so removed entries (e.g. the
  // old generic restaurants/galleries/nightlife sets) don't linger as stale
  // matches once they're gone from /data/lisbon/.
  try {
    await index.deleteAll();
    console.log('Cleared existing vectors in the default namespace.');
  } catch (err) {
    // 404 means the namespace was empty — safe to ignore. Anything else
    // bubbles up so the operator notices.
    if (err?.status !== 404) throw err;
    console.log('Default namespace was empty; nothing to clear.');
  }

  let upserted = 0;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const texts = batch.map(toEmbeddingText);
    console.log(`  batch ${i / BATCH_SIZE + 1}: embedding ${texts.length} texts...`);
    const vectors = await embedTexts(texts, 'document');
    console.log(`    voyage returned ${vectors.length} vectors (dim ${vectors[0]?.length ?? 'n/a'})`);

    // Opportunistically enrich each entry with Places data in parallel.
    // Returns null (no-op) when the key is absent or no match is found.
    const enriched = placesEnabled
      ? await Promise.all(
          batch.map((entry) => enrichWithPlaces(entry).catch(() => null)),
        )
      : batch.map(() => null);

    const records = batch
      .map((entry, idx) => ({
        id: entry.id,
        values: vectors[idx],
        metadata: toPineconeMetadata(entry, enriched[idx]),
      }))
      .filter((r) => Array.isArray(r.values) && r.values.length > 0);

    if (records.length === 0) {
      console.warn('    skipping upsert: no valid vectors in this batch');
      continue;
    }

    // Pinecone SDK v7 changed the upsert signature: it now takes an options
    // object with a `records` property instead of a bare array.
    await index.upsert({ records });
    upserted += records.length;
    console.log(`  upserted ${upserted}/${entries.length}`);
  }

  console.log('✓ Knowledge base seeded.');
}

main().catch((err) => {
  console.error('✗ Seeding failed:', err);
  process.exit(1);
});
