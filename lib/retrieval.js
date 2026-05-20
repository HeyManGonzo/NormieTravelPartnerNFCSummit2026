import { Pinecone } from '@pinecone-database/pinecone';
import { embedText } from '@/lib/embeddings.js';

const globalForPinecone = globalThis;

function getIndex() {
  if (globalForPinecone.__nfcPineconeIndex) {
    return globalForPinecone.__nfcPineconeIndex;
  }
  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX_NAME;
  if (!apiKey) throw new Error('PINECONE_API_KEY is not set');
  if (!indexName) throw new Error('PINECONE_INDEX_NAME is not set');
  const client = new Pinecone({ apiKey });
  const index = client.index(indexName);
  globalForPinecone.__nfcPineconeIndex = index;
  return index;
}

// Build a Pinecone metadata filter from a structured filter object.
// All criteria are ANDed together; arrays use $in.
function buildFilter({ type, types, neighbourhood, neighbourhoods, priceRange, priceRanges, tags, nfcRelevant } = {}) {
  const filter = {};
  if (type) filter.type = { $eq: type };
  if (types?.length) filter.type = { $in: types };
  if (neighbourhood) filter.neighbourhood = { $eq: neighbourhood };
  if (neighbourhoods?.length) filter.neighbourhood = { $in: neighbourhoods };
  if (priceRange) filter.priceRange = { $eq: priceRange };
  if (priceRanges?.length) filter.priceRange = { $in: priceRanges };
  if (tags?.length) filter.tags = { $in: tags };
  if (typeof nfcRelevant === 'boolean') filter.nfcRelevant = { $eq: nfcRelevant };
  return Object.keys(filter).length ? filter : undefined;
}

// Semantic search over the knowledge base. Returns up to `topK` matches,
// sorted by similarity, each shaped as { id, score, ...metadata }.
export async function searchKnowledgeBase(query, options = {}) {
  const { topK = 8, filter, namespace } = options;
  if (!query || typeof query !== 'string') return [];

  const vector = await embedText(query, 'query');
  const index = namespace ? getIndex().namespace(namespace) : getIndex();

  const res = await index.query({
    vector,
    topK,
    includeMetadata: true,
    filter: buildFilter(filter),
  });

  return (res.matches ?? []).map((m) => ({
    id: m.id,
    score: m.score,
    ...m.metadata,
  }));
}

// Convenience: fetch entries of a specific type without a semantic query
// (e.g. "give me all NFC-relevant restaurants in Alfama"). Implemented as
// a zero-vector-ish query by reusing a generic prompt, then filtering.
export async function listByFilter(filter, topK = 20) {
  return searchKnowledgeBase('Lisbon recommendation', { topK, filter });
}
