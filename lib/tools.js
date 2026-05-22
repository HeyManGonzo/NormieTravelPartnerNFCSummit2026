// Agent tool registry. Each tool follows Anthropic's tool-use schema and
// is dispatched at runtime by the chat route's tool loop.
//
// Tools are intentionally small and composable: searchKnowledge surfaces
// venues, getWeather and getTravelTime add live context on demand. Keep
// inputs lean — every parameter is a token cost on every call site.

import { searchKnowledgeBase } from '@/lib/retrieval.js';
import { fetchLisbonForecast } from '@/lib/apis/weather.js';
import { travelTimeBetween } from '@/lib/apis/maps.js';
import { searchTripadvisor, getTripadvisorRating } from '@/lib/apis/tripadvisor.js';
import { getNormieDetails, getNormiePersona } from '@/lib/apis/normies.js';
import { fetchLisbonEvents } from '@/lib/apis/events.js';
import { searchPlaces } from '@/lib/apis/places.js';
import { loadStaticCatalog } from '@/lib/static-catalog.js';

export const TOOL_DEFINITIONS = [
  {
    name: 'searchKnowledge',
    description:
      'Search the curated Lisbon knowledge base (restaurants, galleries, bars, landmarks, neighbourhoods, NFC Summit venues). Use whenever you need to recommend a specific place. Returns up to 8 matches with id, name, neighbourhood, description, tags, and price range. Prefer this over guessing.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Natural-language description of what to find, e.g. "vegan dinner in Chiado" or "rooftop bar with view".',
        },
        type: {
          type: 'string',
          enum: ['restaurant', 'gallery', 'bar', 'landmark', 'neighbourhood', 'event'],
          description: 'Optional. Restrict results to one venue type.',
        },
        neighbourhood: {
          type: 'string',
          description: 'Optional. Restrict to one Lisbon neighbourhood (e.g. "Alfama", "Chiado", "Parque das Nações").',
        },
        nfcRelevant: {
          type: 'boolean',
          description: 'Optional. Set true to bias toward venues flagged as especially relevant to NFC Summit attendees.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'getWeather',
    description:
      'Get the live 5-day Lisbon weather forecast. Use when the visitor asks about weather, what to pack, whether an outdoor plan is wise, or when picking between indoor and outdoor options. Returns a date-keyed map with min/max °C, condition, and rainfall.',
    input_schema: {
      type: 'object',
      properties: {
        dates: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional. ISO dates (YYYY-MM-DD) to filter the response. Omit to get the full 5-day window.',
        },
      },
    },
  },
  {
    name: 'getTravelTime',
    description:
      'Estimate live transit or walking time between two Lisbon venues from the knowledge base. Use when the visitor is comparing options or you are checking whether two stops fit in the same block. Provide venue names exactly as they appear in earlier searchKnowledge results.',
    input_schema: {
      type: 'object',
      properties: {
        fromName: { type: 'string', description: 'Name of the origin venue.' },
        toName: { type: 'string', description: 'Name of the destination venue.' },
        mode: {
          type: 'string',
          enum: ['transit', 'walking', 'driving'],
          description: 'Travel mode. Defaults to transit.',
        },
      },
      required: ['fromName', 'toName'],
    },
  },
  {
    name: 'getTripadvisorRating',
    description:
      'Fetch the independent Tripadvisor rating, review count, ranking, and price tier for a named Lisbon venue. Use this when you want to back a specific recommendation with social proof, or when the visitor asks "is X any good?". Returns null if the venue has no usable Tripadvisor presence — in that case rely on the curated description.',
    input_schema: {
      type: 'object',
      properties: {
        venueName: {
          type: 'string',
          description: 'Venue name exactly as it appears in curated data or in earlier searchKnowledge results.',
        },
      },
      required: ['venueName'],
    },
  },
  {
    name: 'searchTripadvisor',
    description:
      'Discover Lisbon venues on Tripadvisor by free-text query, optionally filtered by minimum rating. Use this when the visitor wants a highly-rated option in a category not well-covered by the curated catalog, or asks for "the best …". Prefer searchKnowledge first; reach for this when the curated catalog comes up short or social proof is the visitor\'s explicit ask.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Free-text query, e.g. "rooftop bar with view" or "pastel de nata bakery".',
        },
        limit: {
          type: 'integer',
          description: 'Optional. Max results to return. Defaults to 5.',
        },
        minRating: {
          type: 'number',
          description: 'Optional. Filter to results with rating >= this value (1–5).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'getNormie',
    description:
      'Fetch on-chain facts for a specific Normie NFT by token ID — traits (Type, Gender, Age, Hair Style, Facial Feature, Eyes, Expression, Accessory), current owner address, canvas state (level, action points, whether the original bitmap has been transformed), and a public image URL. Use whenever the visitor asks about a particular Normie (e.g. "tell me about Normie #5187", "what does #42 look like?", "who owns Normie 1337?"). Returns available:false for token IDs that have not been minted.',
    input_schema: {
      type: 'object',
      properties: {
        tokenId: {
          type: 'integer',
          minimum: 0,
          maximum: 9999,
          description: 'The Normie token ID (integer 0–9999).',
        },
      },
      required: ['tokenId'],
    },
  },
  {
    name: 'getNormiePersona',
    description:
      'Fetch the ERC-8004 agent persona for a Normie — name, tagline, backstory, personality traits, communication style, quirks, greeting. Persona text is generated deterministically from immutable mint traits + current canvas state, so it evolves as the Normie levels up. Use when the visitor asks about a Normie\'s character, personality, or whether it has "awakened". Only a subset of Normies are registered as agents; most aren\'t. Returns available:false when the Normie has not been registered — in that case do not invent a persona, just say so.',
    input_schema: {
      type: 'object',
      properties: {
        tokenId: {
          type: 'integer',
          minimum: 0,
          maximum: 9999,
          description: 'The Normie token ID (integer 0–9999).',
        },
      },
      required: ['tokenId'],
    },
  },
  {
    name: 'searchPlaces',
    description:
      'Discovery fallback for venues that are NOT in the curated knowledge base. Hits Google Places (New) Text Search, biased to Lisbon, and returns name, address, Google rating + review count, opening hours, price level, website, and a Google Maps link. Use when (a) searchKnowledge comes back empty for a cuisine, neighbourhood, or vibe the visitor asked for; (b) the visitor names a specific venue you do not recognise (e.g. "what about Kimbap de Belém in Graça?"); (c) the visitor asks for a place type the catalog does not cover (laundry, pharmacy, supermarket, specialty coffee, bookshop). Always prefer searchKnowledge first — the curated catalog is opinionated and NFC-aware. Reach for searchPlaces only as a fallback or for direct venue lookups. When citing a result, mention the Google rating + review count in passing and link the venue with [name](googleMapsUri).',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Free-text search, e.g. "Korean restaurant Graça Lisbon", "Kimbap de Belém", "specialty coffee Príncipe Real". Include the neighbourhood or "Lisbon" when the query is otherwise generic.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
          description: 'Optional. Max results to return. Defaults to 5.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'findEvents',
    description:
      'Find Lisbon side-events and meet-ups happening during a date window. Pulls from Luma (lu.ma/lisbon, no auth) and Eventbrite (when configured) and returns a unified, deduped list — many NFC-adjacent gatherings live on Luma. Use when the visitor asks "what\'s on?", asks about a specific evening, looks for an after-hours thing tied to the Summit, or wants to know what else is happening in town. Pass the trip window from their profile (or a tighter sub-window if they asked about one night). Optional query filters by name and description text. Returns up to 20 events, ordered by start time.',
    input_schema: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: 'Window start, ISO date YYYY-MM-DD (inclusive). Use the visitor\'s arrival date by default.',
        },
        to: {
          type: 'string',
          description: 'Window end, ISO date YYYY-MM-DD (inclusive). Use the visitor\'s departure date by default.',
        },
        query: {
          type: 'string',
          description: 'Optional free-text filter applied to event name + description (case-insensitive substring match). Use for narrower queries like "nft", "music", "yoga".',
        },
      },
      required: ['from', 'to'],
    },
  },
];

// Map venue name (case-insensitive, trim) to a static-catalog entry so we
// can resolve coordinates without making Claude pass them around. Falls back
// to a one-shot Google Places lookup when the catalog doesn't have it, so
// off-catalog venues surfaced by searchPlaces (and named-but-uncurated
// places like the Summit venue, before it was added) still resolve.
async function findVenueByName(name) {
  if (!name) return null;
  const needle = name.trim().toLowerCase();
  const catalog = await loadStaticCatalog();
  const hit =
    catalog.find((e) => e.name?.toLowerCase() === needle) ||
    catalog.find((e) => e.name?.toLowerCase().includes(needle));
  if (hit) return hit;

  const places = await searchPlaces(`${name} Lisbon`, { limit: 1 });
  const p = places?.[0];
  if (!p?.coordinates) return null;
  return {
    name: p.name || name,
    lat: p.coordinates.lat,
    lng: p.coordinates.lng,
    source: 'places',
  };
}

async function execSearchKnowledge(input) {
  const filter = {};
  if (input.type) filter.type = input.type;
  if (input.neighbourhood) filter.neighbourhood = input.neighbourhood;
  if (typeof input.nfcRelevant === 'boolean') filter.nfcRelevant = input.nfcRelevant;

  const results = await searchKnowledgeBase(input.query, { topK: 8, filter });
  return {
    count: results.length,
    matches: results.map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      neighbourhood: r.neighbourhood,
      description: r.description,
      tags: r.tags,
      priceRange: r.priceRange,
      nfcRelevant: r.nfcRelevant,
    })),
  };
}

async function execGetWeather(input) {
  const forecast = await fetchLisbonForecast();
  if (!forecast) return { available: false, reason: 'weather api unavailable' };
  if (input?.dates?.length) {
    const filtered = {};
    for (const d of input.dates) if (forecast[d]) filtered[d] = forecast[d];
    return { available: true, forecast: filtered };
  }
  return { available: true, forecast };
}

async function execGetTravelTime(input) {
  const from = await findVenueByName(input.fromName);
  const to = await findVenueByName(input.toName);
  if (!from) return { available: false, reason: `unknown venue: ${input.fromName}` };
  if (!to) return { available: false, reason: `unknown venue: ${input.toName}` };
  const hint = await travelTimeBetween(
    { lat: from.lat, lng: from.lng },
    { lat: to.lat, lng: to.lng },
    input.mode || 'transit',
  );
  if (!hint) return { available: false, reason: 'maps api unavailable or no route' };
  return {
    available: true,
    from: from.name,
    to: to.name,
    mode: hint.mode,
    durationText: hint.durationText,
    distanceText: hint.distanceText,
  };
}

async function execGetTripadvisorRating(input) {
  if (!input?.venueName) return { error: 'venueName is required' };
  const result = await getTripadvisorRating(input.venueName);
  if (!result) {
    return { available: false, reason: 'no tripadvisor match for this venue' };
  }
  return { available: true, ...result };
}

async function execSearchTripadvisor(input) {
  if (!input?.query) return { error: 'query is required' };
  const results = await searchTripadvisor({
    query: input.query,
    limit: input.limit ?? 5,
    minRating: input.minRating,
  });
  if (!results) {
    return { available: false, reason: 'tripadvisor api unavailable or no results' };
  }
  return { available: true, count: results.length, matches: results };
}

async function execGetNormie(input) {
  if (input?.tokenId === undefined || input?.tokenId === null) {
    return { error: 'tokenId is required' };
  }
  const result = await getNormieDetails(input.tokenId);
  if (!result) {
    return { available: false, reason: 'token not minted or out of range (0–9999)' };
  }
  return { available: true, ...result };
}

async function execGetNormiePersona(input) {
  if (input?.tokenId === undefined || input?.tokenId === null) {
    return { error: 'tokenId is required' };
  }
  const result = await getNormiePersona(input.tokenId);
  if (!result) {
    return {
      available: false,
      reason: 'this normie has not been registered as an erc-8004 agent',
    };
  }
  return { available: true, ...result };
}

async function execSearchPlaces(input) {
  if (!input?.query) return { error: 'query is required' };
  const results = await searchPlaces(input.query, { limit: input.limit ?? 5 });
  if (!results) {
    return { available: false, reason: 'places api unavailable or no key configured' };
  }
  if (!results.length) {
    return { available: false, reason: 'no places matched that query' };
  }
  return { available: true, count: results.length, matches: results };
}

async function execFindEvents(input) {
  if (!input?.from || !input?.to) {
    return { error: 'from and to (ISO YYYY-MM-DD) are required' };
  }
  const events = await fetchLisbonEvents({ from: input.from, to: input.to });
  const q = input.query?.trim().toLowerCase();
  const filtered = q
    ? events.filter((e) => {
        const hay = `${e.name ?? ''} ${e.description ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
    : events;
  const sorted = filtered
    .slice()
    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))
    .slice(0, 20);
  if (!sorted.length) {
    return {
      available: false,
      reason: 'no events found in that window',
      window: { from: input.from, to: input.to },
    };
  }
  return {
    available: true,
    count: sorted.length,
    window: { from: input.from, to: input.to },
    events: sorted,
  };
}

// Dispatch by name. Returns a JSON-serialisable value to send back to
// Claude in the next tool_result block. Errors are caught and returned
// so the model can keep going instead of the loop crashing.
export async function executeTool(name, input) {
  try {
    switch (name) {
      case 'searchKnowledge':
        return await execSearchKnowledge(input ?? {});
      case 'getWeather':
        return await execGetWeather(input ?? {});
      case 'getTravelTime':
        return await execGetTravelTime(input ?? {});
      case 'getTripadvisorRating':
        return await execGetTripadvisorRating(input ?? {});
      case 'searchTripadvisor':
        return await execSearchTripadvisor(input ?? {});
      case 'getNormie':
        return await execGetNormie(input ?? {});
      case 'getNormiePersona':
        return await execGetNormiePersona(input ?? {});
      case 'searchPlaces':
        return await execSearchPlaces(input ?? {});
      case 'findEvents':
        return await execFindEvents(input ?? {});
      default:
        return { error: `unknown tool: ${name}` };
    }
  } catch (err) {
    console.warn(`[tools] ${name} failed:`, err.message);
    return { error: err.message ?? String(err) };
  }
}
