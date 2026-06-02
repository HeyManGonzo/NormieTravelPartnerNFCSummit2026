// Static catalog loader for the curated Lisbon venue data in /data/lisbon/
// plus the NFC Summit event itself (synthesised from data/nfc-summit/
// programme.json so retrieval can match against it just like any other
// catalog entry).
//
// Entries are reshaped to a single flat shape (flat lat/lng, no nested
// coordinates), so the rest of the pipeline — retrieval, the itinerary
// builder, the chat tools — can treat the catalog as a uniform list.
//
// JSON files are imported statically so that Next.js bundles them into the
// serverless function — a runtime fs.readdir against /data/lisbon does not
// work on Vercel because the directory is not part of the function payload.

import restaurants from '@/data/lisbon/restaurants.json';
import galleries from '@/data/lisbon/galleries.json';
import landmarks from '@/data/lisbon/landmarks.json';
import nightlife from '@/data/lisbon/nightlife.json';
import neighbourhoods from '@/data/lisbon/neighbourhoods.json';
import dayTrips from '@/data/lisbon/day-trips.json';
import programme from '@/data/nfc-summit/programme.json';
import sessions from '@/data/nfc-summit/sessions.json';

let cache = null;

// Flatten a catalog entry into the canonical retrieval shape. The optional
// `sponsored` flag is preserved here (default false) so partner placements
// surface through the same path as organic curated entries — disclosure is
// the prompt's responsibility, not the loader's.
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
    sponsored: Boolean(entry.sponsored),
    // Preserved so findVenueByName can resolve a venue by its building name
    // (e.g. "Unicorn Factory Lisboa"), not just its catalog `name`. Only the
    // Summit event entry carries this; everything else stays null.
    venue: entry.venue ?? null,
    lat: entry.coordinates?.lat ?? 0,
    lng: entry.coordinates?.lng ?? 0,
    openingHours: entry.openingHours,
    score: 0,
  };
}

// Synthesise a catalog entry for the NFC Summit itself, sourced from
// programme.json. Kept in one place (here) so retrieval and the seed
// script see the same shape — previously the seed script duplicated this.
function programmeEntry() {
  const e = programme.event;
  return {
    id: e.id,
    type: 'event',
    name: e.name,
    venue: e.venue,
    description: e.summary,
    address: e.address,
    neighbourhood: e.neighbourhood,
    coordinates: e.coordinates,
    priceRange: 'premium',
    tags: ['nfc-summit', 'conference', 'digital-art', 'web3'],
    nfcRelevant: true,
    sponsored: false,
  };
}

const TYPE_TAGS = {
  brunch:         ['brunch', 'food', 'social', 'web3'],
  party:          ['nightlife', 'social', 'web3'],
  meetup:         ['networking', 'web3', 'social'],
  hackathon:      ['tech', 'ai', 'web3', 'creative'],
  workshop:       ['workshop', 'tech', 'ai', 'web3'],
  exhibition:     ['art', 'digital-art', 'exhibition'],
  panel:          ['talks', 'education', 'web3'],
  keynote:        ['talks', 'education', 'web3'],
  talk:           ['talks', 'education', 'web3'],
  break:          ['break', 'lunch'],
  'conference-day': ['talks', 'education', 'finance', 'web3'],
  tour:           ['art', 'education', 'guided-tour'],
};

// Synthesise catalog entries for every side event in programme.sideEvents.
function sideEventEntries() {
  if (!Array.isArray(programme.sideEvents)) return [];
  return programme.sideEvents.map((ev) => {
    const dates = Array.isArray(ev.dates) ? ev.dates.join(' & ') : (ev.dates ?? '');
    const time = ev.timeStart
      ? ` at ${ev.timeStart}${ev.timeEnd ? `–${ev.timeEnd}` : ''}`
      : '';
    return {
      id: ev.id,
      type: 'event',
      name: ev.name,
      description: `${dates}${time}. ${ev.description ?? ''}`.trim(),
      address: ev.address ?? programme.event.address,
      neighbourhood: ev.venue?.includes('Duro De Matar') ? 'Beato' : programme.event.neighbourhood,
      coordinates: programme.event.coordinates,
      priceRange: ev.priceRange ?? 'free',
      tags: ['nfc-summit', 'side-event', ...(TYPE_TAGS[ev.type] ?? ['web3'])],
      nfcRelevant: true,
      sponsored: false,
    };
  });
}

// Synthesise catalog entries for every Summit session (talks, panels,
// keynotes, workshops on Main / Kawaii / Longevity stages). Drives "what's
// happening at 11am on June 5" and "when does Dmitri Cherniak speak" queries.
function sessionEntries() {
  if (!Array.isArray(sessions)) return [];
  return sessions.map((s) => {
    const speakers = Array.isArray(s.speakers) && s.speakers.length
      ? ` Speakers: ${s.speakers.join(', ')}.`
      : '';
    const stage = s.stage ? ` Stage: ${s.stage}.` : '';
    const time = s.timeStart
      ? ` ${s.date} at ${s.timeStart}${s.timeEnd ? `–${s.timeEnd}` : ''}.`
      : '';
    return {
      id: s.id,
      type: 'session',
      name: s.name,
      description: `${time}${stage}${speakers} ${s.description ?? ''}`.trim(),
      address: programme.event.address,
      neighbourhood: programme.event.neighbourhood,
      coordinates: programme.event.coordinates,
      priceRange: 'premium',
      tags: ['nfc-summit', 'session', s.stage?.toLowerCase().replace(/\s+/g, '-') ?? 'unknown-stage', ...(TYPE_TAGS[s.type] ?? [])],
      nfcRelevant: true,
      sponsored: false,
    };
  });
}

export async function loadStaticCatalog() {
  if (cache) return cache;
  const all = [
    ...restaurants,
    ...galleries,
    ...landmarks,
    ...nightlife,
    ...neighbourhoods,
    ...dayTrips,
    programmeEntry(),
    ...sideEventEntries(),
    ...sessionEntries(),
  ];
  cache = all.map(flatten);
  return cache;
}

// Overlay scored retrieval results on top of the full catalog. Retrieval
// returns a ranked subset of the catalog with similarity scores; the rest
// of the catalog is kept at score 0 so the itinerary builder is never
// venue-starved when retrieval is sparse or fails.
export function mergeWithStatic(staticEntries, retrieved) {
  const byId = new Map();
  for (const e of staticEntries) byId.set(e.id, e);
  for (const r of retrieved ?? []) {
    if (!r?.id) continue;
    const existing = byId.get(r.id);
    byId.set(r.id, existing ? { ...existing, ...r } : r);
  }
  return [...byId.values()];
}
