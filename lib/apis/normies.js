// api.normies.art wrapper. Provides per-token traits, ownership, canvas
// state, and ERC-8004 persona data for the Normies NFT collection on
// Ethereum mainnet. Public API — no key required. Fails soft when the
// endpoint errors, the token isn't minted, or the Normie isn't a
// registered agent.

const BASE_URL = 'https://api.normies.art';
const CONTRACT_ADDRESS = '0x9eb6e2025b64f340691e424b7fe7022ffde12438';

// 24h cache. Mint traits are immutable. Canvas state and persona evolve
// only when an owner burns or transforms — both rare on-chain events.
const detailsCache = new Map();
const personaCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function isValidTokenId(id) {
  const n = Number(id);
  return Number.isInteger(n) && n >= 0 && n <= 9999;
}

async function fetchJson(path) {
  try {
    const res = await fetch(`${BASE_URL}${path}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn(`[normies] fetch ${path}:`, err.message);
    return null;
  }
}

// Get the core on-chain facts for a Normie: traits, owner, canvas
// state, and a public image URL. Returns null for invalid IDs or
// tokens that haven't been minted.
export async function getNormieDetails(tokenId) {
  if (!isValidTokenId(tokenId)) return null;
  const id = Number(tokenId);
  const cached = detailsCache.get(id);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  // Fan out the three reads. /traits is the authoritative existence
  // check — a 404 means the token isn't minted. The other two are
  // best-effort enrichment.
  const [traits, owner, canvas] = await Promise.all([
    fetchJson(`/normie/${id}/traits`),
    fetchJson(`/normie/${id}/owner`),
    fetchJson(`/normie/${id}/canvas/info`),
  ]);
  if (!traits?.attributes?.length) {
    detailsCache.set(id, { at: Date.now(), value: null });
    return null;
  }

  // Flatten the [{trait_type, value}, ...] shape into a flat object so
  // the model doesn't have to re-key it on the other side.
  const attrs = {};
  for (const a of traits.attributes) {
    if (a.trait_type) attrs[a.trait_type] = a.value;
  }

  const value = {
    tokenId: id,
    name: `Normie #${id}`,
    attributes: attrs,
    owner: owner?.owner ?? null,
    canvas: canvas
      ? {
          level: canvas.level ?? 1,
          actionPoints: canvas.actionPoints ?? 0,
          customized: Boolean(canvas.customized),
        }
      : null,
    imageUrl: `${BASE_URL}/normie/${id}/image.svg`,
    openSeaUrl: `https://opensea.io/item/ethereum/${CONTRACT_ADDRESS}/${id}`,
  };
  detailsCache.set(id, { at: Date.now(), value });
  return value;
}

// Get the ERC-8004 agent persona for a Normie. Persona is generated
// deterministically from immutable mint traits + current canvas state,
// so it evolves as the Normie levels up. Returns null when the token
// hasn't been registered as an agent — most haven't.
export async function getNormiePersona(tokenId) {
  if (!isValidTokenId(tokenId)) return null;
  const id = Number(tokenId);
  const cached = personaCache.get(id);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const info = await fetchJson(`/agents/info/${id}`);
  if (!info?.name) {
    personaCache.set(id, { at: Date.now(), value: null });
    return null;
  }

  const value = {
    tokenId: id,
    agentId: info.agentId ?? null,
    name: info.name,
    type: info.type ?? null,
    tagline: info.tagline ?? null,
    backstory: info.backstory ?? null,
    personalityTraits: info.personalityTraits ?? [],
    communicationStyle: info.communicationStyle ?? null,
    quirks: info.quirks ?? [],
    greeting: info.greeting ?? null,
    canvas: info.canvas ?? null,
    registeredAt: info.registeredAt ?? null,
  };
  personaCache.set(id, { at: Date.now(), value });
  return value;
}
