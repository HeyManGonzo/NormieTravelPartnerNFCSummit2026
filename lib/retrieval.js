// In-memory semantic search over the curated catalog.
//
// The catalog is tiny (~20 entries) and changes only when we re-run the
// seed script. So instead of paying for a hosted vector DB and a network
// round-trip per query, we ship the entry embeddings as data/embeddings.json
// (id -> vector) and do cosine similarity in-process.
//
// Only the query embedding is computed at runtime (one Voyage call per
// retrieval), which costs fractions of a cent and lets us keep semantic
// quality without any persistent vector infrastructure.

import { embedText } from '@/lib/embeddings.js';
import { loadStaticCatalog } from '@/lib/static-catalog.js';
import embeddingsFile from '@/data/embeddings.json';

// Pre-build the id -> Float32Array lookup once at module load. Float32Array
// keeps memory low (~85 KB for 20 × 1024 dims) and makes cosine tight.
const VECTORS = (() => {
  const out = new Map();
  const raw = embeddingsFile?.vectors ?? {};
  for (const [id, vec] of Object.entries(raw)) {
    if (Array.isArray(vec) && vec.length > 0) out.set(id, Float32Array.from(vec));
  }
  return out;
})();

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// All criteria are ANDed together; array criteria are ORed within themselves
// (e.g. types: ['restaurant','bar'] matches either type).
function matchesFilter(entry, filter) {
  if (!filter) return true;
  const { type, types, neighbourhood, neighbourhoods, priceRange, priceRanges, tags, nfcRelevant } = filter;
  if (type && entry.type !== type) return false;
  if (types?.length && !types.includes(entry.type)) return false;
  if (neighbourhood && entry.neighbourhood !== neighbourhood) return false;
  if (neighbourhoods?.length && !neighbourhoods.includes(entry.neighbourhood)) return false;
  if (priceRange && entry.priceRange !== priceRange) return false;
  if (priceRanges?.length && !priceRanges.includes(entry.priceRange)) return false;
  if (tags?.length) {
    const entryTags = Array.isArray(entry.tags) ? entry.tags : [];
    if (!tags.some((t) => entryTags.includes(t))) return false;
  }
  if (typeof nfcRelevant === 'boolean' && Boolean(entry.nfcRelevant) !== nfcRelevant) return false;
  return true;
}

// Semantic search over the catalog. Returns up to `topK` matches, sorted by
// similarity descending, each shaped as { id, score, ...metadata }.
export async function searchKnowledgeBase(query, options = {}) {
  const { topK = 8, filter } = options;
  if (!query || typeof query !== 'string') return [];

  const catalog = await loadStaticCatalog();
  if (catalog.length === 0) return [];

  const qVec = Float32Array.from(await embedText(query, 'query'));

  const scored = [];
  for (const entry of catalog) {
    if (!matchesFilter(entry, filter)) continue;
    const vec = VECTORS.get(entry.id);
    if (!vec) continue; // No embedding for this entry — re-run npm run seed:kb.
    scored.push({ ...entry, score: cosine(qVec, vec) });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

// Convenience: fetch entries by filter only, without a semantic query.
// Returns catalog entries in stable insertion order; score is 0 throughout
// since no similarity was computed.
export async function listByFilter(filter, topK = 20) {
  const catalog = await loadStaticCatalog();
  const filtered = catalog.filter((e) => matchesFilter(e, filter));
  return filtered.slice(0, topK).map((e) => ({ ...e, score: 0 }));
}
