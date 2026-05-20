// Pure scheduling logic for the visitor itinerary.
// Given a trip profile and pools of candidate venues, produces the structured
// itinerary object described in CLAUDE.md §5. No LLM calls live here — the
// LLM only narrates the result downstream.

const TIME_SLOTS = ['morning', 'afternoon', 'evening'];

const PRICE_RANK = { budget: 0, midrange: 1, premium: 2 };

// How wide we cast the price net depending on the visitor's stated budget.
const PRICE_ALLOWLIST = {
  budget: ['budget', 'midrange'],
  midrange: ['budget', 'midrange', 'premium'],
  premium: ['midrange', 'premium'],
};

const INTEREST_TAGS = {
  art: ['art', 'gallery', 'street-art', 'contemporary', 'urban', 'digital-art'],
  food: ['food', 'tasting-menu', 'seafood', 'natural-wine', 'market'],
  nightlife: ['nightlife', 'bar', 'cocktails', 'club', 'fado'],
  architecture: ['architecture', 'historic', 'monument', 'tile'],
  nature: ['nature', 'park', 'viewpoint', 'river'],
  shopping: ['shopping', 'design', 'concept-store'],
  music: ['music', 'fado', 'live', 'club'],
};

function isoDateRange(start, end) {
  const out = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const stop = new Date(`${end}T00:00:00Z`);
  while (cur.getTime() <= stop.getTime()) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function pricePool(budgetLevel) {
  return PRICE_ALLOWLIST[budgetLevel] ?? PRICE_ALLOWLIST.midrange;
}

function interestTagPool(interests = []) {
  const set = new Set();
  for (const i of interests) {
    for (const t of INTEREST_TAGS[i] ?? []) set.add(t);
  }
  return set;
}

// Score a candidate against the trip profile. Higher is better.
function scoreCandidate(c, profile, interestPool) {
  let score = typeof c.score === 'number' ? c.score : 0;
  if (c.nfcRelevant) score += 0.25;
  const tags = Array.isArray(c.tags) ? c.tags : [];
  for (const t of tags) if (interestPool.has(t)) score += 0.15;
  const allowed = pricePool(profile.budgetLevel);
  if (c.priceRange && !allowed.includes(c.priceRange)) score -= 0.5;
  return score;
}

function partitionByType(candidates = []) {
  const by = { restaurant: [], gallery: [], landmark: [], bar: [], event: [] };
  for (const c of candidates) {
    const t = c.type;
    if (by[t]) by[t].push(c);
  }
  return by;
}

function pickBest(pool, used, prefNeighbourhood) {
  if (!pool?.length) return null;
  let bestIdx = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < pool.length; i++) {
    const c = pool[i];
    if (used.has(c.id)) continue;
    let s = c.__score ?? 0;
    if (prefNeighbourhood && c.neighbourhood === prefNeighbourhood) s += 0.4;
    if (s > bestScore) {
      bestScore = s;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return null;
  const chosen = pool[bestIdx];
  used.add(chosen.id);
  return chosen;
}

function toActivity(c, opts = {}) {
  if (!c) return null;
  return {
    id: c.id,
    type: c.type,
    name: c.name,
    description: c.description,
    address: c.address,
    neighbourhood: c.neighbourhood,
    coordinates: c.lat && c.lng ? { lat: c.lat, lng: c.lng } : undefined,
    priceRange: c.priceRange,
    tags: c.tags,
    estimatedDuration: opts.estimatedDuration,
  };
}

function blockFor(timeSlot, activity, backup) {
  if (!activity) return null;
  const block = { timeSlot, activity };
  if (backup) block.activity.backup = toActivity(backup);
  return block;
}


function nfcDayActivity(programme, date) {
  const day = programme?.days?.find((d) => d.date === date);
  const evt = programme?.event ?? {};
  return {
    id: `${evt.id ?? 'nfc-summit'}--${date}`,
    type: 'event',
    name: day?.label ? `${evt.name ?? 'NFC Summit'} — ${day.label}` : evt.name ?? 'NFC Summit',
    description:
      day?.themes?.length
        ? `Focus: ${day.themes.join(', ')}. Doors ${day.doorsOpen ?? ''}–${day.doorsClose ?? ''}.`.trim()
        : evt.summary,
    address: evt.address,
    neighbourhood: evt.neighbourhood,
    coordinates: evt.coordinates,
    estimatedDuration: 'full day',
    tags: ['nfc-summit', 'conference'],
  };
}

function dayLabel(index, total, isNfc) {
  if (isNfc) return `Day ${index + 1} — NFC Summit`;
  if (index === 0) return `Day ${index + 1} — Arrival`;
  if (index === total - 1) return `Day ${index + 1} — Departure`;
  return `Day ${index + 1}`;
}

// Main entry point. Returns the itinerary object described in CLAUDE.md §5.
export function buildItinerary({ tripProfile, candidates = [], nfcProgramme }) {
  if (!tripProfile?.arrivalDate || !tripProfile?.departureDate) {
    throw new Error('tripProfile.arrivalDate and departureDate are required');
  }

  const interestPool = interestTagPool(tripProfile.interests);
  const byType = partitionByType(candidates);

  for (const list of Object.values(byType)) {
    for (const c of list) c.__score = scoreCandidate(c, tripProfile, interestPool);
    list.sort((a, b) => b.__score - a.__score);
  }

  const dates = isoDateRange(tripProfile.arrivalDate, tripProfile.departureDate);
  const nfcDays = new Set(tripProfile.nfcDays ?? []);
  const used = new Set();

  const days = dates.map((date, idx) => {
    const isNfc = nfcDays.has(date);
    const blocks = [];

    if (isNfc) {
      blocks.push({ timeSlot: 'morning', activity: nfcDayActivity(nfcProgramme, date) });
      blocks.push({ timeSlot: 'afternoon', activity: nfcDayActivity(nfcProgramme, date) });
      const dinner = pickBest(byType.restaurant, used, nfcProgramme?.event?.neighbourhood);
      const dinnerBlock = blockFor('evening', toActivity(dinner, { estimatedDuration: '2 hours' }));
      if (dinnerBlock) blocks.push(dinnerBlock);
    } else {
      const morningCandidate =
        idx === 0
          ? pickBest(byType.landmark, used)
          : pickBest(byType.landmark, used) ?? pickBest(byType.gallery, used);
      const hood = morningCandidate?.neighbourhood;
      const morningBlock = blockFor(
        'morning',
        toActivity(morningCandidate, { estimatedDuration: '2 hours' }),
      );
      if (morningBlock) blocks.push(morningBlock);

      const afternoonCandidate =
        pickBest(byType.gallery, used, hood) ?? pickBest(byType.landmark, used, hood);
      const afternoonBlock = blockFor(
        'afternoon',
        toActivity(afternoonCandidate, { estimatedDuration: '2 hours' }),
      );
      if (afternoonBlock) blocks.push(afternoonBlock);

      const dinner = pickBest(byType.restaurant, used, hood);
      const dinnerBlock = blockFor('evening', toActivity(dinner, { estimatedDuration: '2 hours' }));
      if (dinnerBlock) {
        const wantsNight = (tripProfile.interests ?? []).some((i) =>
          ['nightlife', 'music'].includes(i),
        );
        if (wantsNight) {
          const bar = pickBest(byType.bar, used, hood);
          if (bar) dinnerBlock.activity.backup = toActivity(bar);
        }
        blocks.push(dinnerBlock);
      }
    }

    return {
      date,
      dayLabel: dayLabel(idx, dates.length, isNfc),
      nfcDay: isNfc,
      blocks: blocks.filter(Boolean),
    };
  });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    trip: {
      arrivalDate: tripProfile.arrivalDate,
      departureDate: tripProfile.departureDate,
      durationDays: dates.length,
    },
    profileSummary: {
      groupType: tripProfile.groupType,
      budgetLevel: tripProfile.budgetLevel,
      interests: tripProfile.interests,
      pace: tripProfile.pace,
      nfcDays: tripProfile.nfcDays,
    },
    days,
  };
}
