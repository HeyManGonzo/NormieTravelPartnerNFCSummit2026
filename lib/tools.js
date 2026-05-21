// Agent tool registry. Each tool follows Anthropic's tool-use schema and
// is dispatched at runtime by the chat route's tool loop.
//
// Tools are intentionally small and composable: searchKnowledge surfaces
// venues, getWeather and getTravelTime add live context on demand. Keep
// inputs lean — every parameter is a token cost on every call site.

import { searchKnowledgeBase } from '@/lib/retrieval.js';
import { fetchLisbonForecast } from '@/lib/apis/weather.js';
import { travelTimeBetween } from '@/lib/apis/maps.js';
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
];

// Map venue name (case-insensitive, trim) to a static-catalog entry so we
// can resolve coordinates without making Claude pass them around.
async function findVenueByName(name) {
  if (!name) return null;
  const needle = name.trim().toLowerCase();
  const catalog = await loadStaticCatalog();
  return (
    catalog.find((e) => e.name?.toLowerCase() === needle) ||
    catalog.find((e) => e.name?.toLowerCase().includes(needle)) ||
    null
  );
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
      default:
        return { error: `unknown tool: ${name}` };
    }
  } catch (err) {
    console.warn(`[tools] ${name} failed:`, err.message);
    return { error: err.message ?? String(err) };
  }
}
