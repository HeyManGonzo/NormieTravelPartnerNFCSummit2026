// One-off retrieval probe: runs a handful of representative queries against
// the same data the runtime uses (data/embeddings.json + the curated JSON
// files) and prints the top hits with scores. Used to validate parity
// against the previous Pinecone-backed implementation.
//
// Self-contained — does not import lib/retrieval.js because that module
// uses Next.js @/ path aliases that plain Node can't resolve.
//
// Run with: node scripts/probe-retrieval.js

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { embedText } from '../lib/embeddings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

async function loadJson(rel) {
  return JSON.parse(await readFile(join(DATA_DIR, rel), 'utf8'));
}

async function loadCatalogIndex() {
  const files = [
    'lisbon/restaurants.json',
    'lisbon/galleries.json',
    'lisbon/landmarks.json',
    'lisbon/nightlife.json',
    'lisbon/neighbourhoods.json',
    'lisbon/day-trips.json',
  ];
  const byId = new Map();
  for (const f of files) {
    for (const e of await loadJson(f)) byId.set(e.id, e);
  }
  const programme = await loadJson('nfc-summit/programme.json');
  byId.set(programme.event.id, { id: programme.event.id, name: programme.event.name });
  return byId;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

const QUERIES = [
  'best beach near Lisbon for surfing',
  'quiet residential neighbourhood with viewpoints',
  'vegan dinner in Chiado',
  'NFC Summit venue',
  'day trip to UNESCO palace',
];

const [embeddings, catalog] = await Promise.all([
  loadJson('embeddings.json'),
  loadCatalogIndex(),
]);

for (const q of QUERIES) {
  const qVec = await embedText(q, 'query');
  const scored = [];
  for (const [id, vec] of Object.entries(embeddings.vectors)) {
    scored.push({ id, score: cosine(qVec, vec) });
  }
  scored.sort((a, b) => b.score - a.score);
  console.log(`\n> ${q}`);
  for (const h of scored.slice(0, 3)) {
    const name = catalog.get(h.id)?.name ?? '?';
    console.log(`  ${h.score.toFixed(3)}  ${h.id.padEnd(28)} ${name}`);
  }
}
