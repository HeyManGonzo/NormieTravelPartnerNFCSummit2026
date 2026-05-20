// Voyage AI embeddings client.
// Docs: https://docs.voyageai.com/reference/embeddings-api
//
// We deliberately use fetch directly (instead of the voyageai SDK) so this
// runs in any JS runtime — Node, edge, or in seed scripts — with no extra
// dependency.

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';

function getKey() {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error('VOYAGE_API_KEY is not set');
  return key;
}

function getModel() {
  return process.env.VOYAGE_MODEL || 'voyage-3';
}

// Embed an array of strings. `inputType` should be 'document' for items being
// indexed and 'query' for user queries — Voyage uses this for asymmetric
// retrieval quality.
export async function embedTexts(texts, inputType = 'document') {
  if (!Array.isArray(texts) || texts.length === 0) return [];

  const res = await fetch(VOYAGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getKey()}`,
    },
    body: JSON.stringify({
      input: texts,
      model: getModel(),
      input_type: inputType,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Voyage embeddings failed: ${res.status} ${body}`);
  }

  const json = await res.json();
  if (!Array.isArray(json?.data)) {
    throw new Error(
      `Voyage embeddings: unexpected response shape: ${JSON.stringify(json).slice(0, 300)}`,
    );
  }
  return json.data.map((d) => d.embedding);
}

export async function embedText(text, inputType = 'document') {
  const [v] = await embedTexts([text], inputType);
  return v;
}
