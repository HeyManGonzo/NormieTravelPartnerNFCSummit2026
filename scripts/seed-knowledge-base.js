// Embed every entry in /data/ and write the result to data/embeddings.json.
// retrieval.js reads that file at module load and does cosine similarity
// in-memory — no hosted vector DB required.
//
// Run with: npm run seed:kb
// Requires .env.local with VOYAGE_API_KEY.

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { embedTexts } from '../lib/embeddings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const OUT_FILE = join(DATA_DIR, 'embeddings.json');
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

  // NFC Summit programme — wrap the event itself as a single retrievable
  // entry. lib/static-catalog.js builds the same shape at runtime, so the
  // ids and tags here must stay in sync with programmeEntry() there.
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

async function main() {
  if (!process.env.VOYAGE_API_KEY) {
    throw new Error('Set VOYAGE_API_KEY in .env.local');
  }

  const entries = await loadAllEntries();
  console.log(`Loaded ${entries.length} entries from /data`);

  const vectors = {};
  let dim = 0;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const texts = batch.map(toEmbeddingText);
    console.log(`  batch ${i / BATCH_SIZE + 1}: embedding ${texts.length} texts...`);
    const batchVectors = await embedTexts(texts, 'document');
    if (!dim) dim = batchVectors[0]?.length ?? 0;
    console.log(`    voyage returned ${batchVectors.length} vectors (dim ${dim || 'n/a'})`);
    for (let j = 0; j < batch.length; j++) {
      const v = batchVectors[j];
      if (Array.isArray(v) && v.length > 0) vectors[batch[j].id] = v;
    }
  }

  const out = {
    model: process.env.VOYAGE_MODEL || 'voyage-3',
    dim,
    generatedAt: new Date().toISOString(),
    count: Object.keys(vectors).length,
    vectors,
  };

  await writeFile(OUT_FILE, JSON.stringify(out) + '\n', 'utf8');
  console.log(`✓ Wrote ${out.count} vectors to data/embeddings.json (${out.model}, dim ${dim}).`);
}

main().catch((err) => {
  console.error('✗ Seeding failed:', err);
  process.exit(1);
});
