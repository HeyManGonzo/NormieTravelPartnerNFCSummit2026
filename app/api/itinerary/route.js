import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db, schema } from '@/lib/db.js';
import { getOrCreateSession } from '@/lib/session.js';
import { chat } from '@/lib/claude.js';
import { searchKnowledgeBase } from '@/lib/retrieval.js';
import { buildItinerary } from '@/lib/itinerary-builder.js';
import { loadStaticCatalog, mergeWithStatic } from '@/lib/static-catalog.js';
import { loadNfcProgramme } from '@/lib/nfc-programme.js';
import {
  buildItineraryNarrationPrompt,
  buildItineraryNarrationTurn,
} from '@/lib/prompts/itinerary.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PER_TYPE_TOP_K = 12;

// Minimum candidate counts we expect to see per type once the static catalog
// has loaded. If any type drops below its floor, something is wrong (bundler
// regression, accidental data deletion, etc.) and we want it loud in the logs.
const POOL_FLOOR = {
  restaurant: 13,
  gallery: 5,
  landmark: 15, // 9 landmark venues + 6 neighbourhood entries typed as landmark
  bar: 6,
};

// GET /api/itinerary — return the most recent itinerary for the current session.
export async function GET() {
  try {
    const { session } = await getOrCreateSession();
    const [row] = await db
      .select()
      .from(schema.itineraries)
      .where(eq(schema.itineraries.sessionId, session.id))
      .orderBy(desc(schema.itineraries.version))
      .limit(1);
    if (!row) {
      return NextResponse.json({ success: true, data: { itinerary: null } });
    }
    return NextResponse.json({
      success: true,
      data: {
        itinerary: row.content,
        version: row.version,
        shareToken: row.shareToken,
        updatedAt: row.updatedAt,
      },
    });
  } catch (err) {
    console.error('[api/itinerary GET] failed', err);
    return NextResponse.json(
      { success: false, error: err.message ?? 'itinerary fetch failed' },
      { status: 500 },
    );
  }
}

function interestKeywords(profile) {
  return Array.isArray(profile.interests) ? profile.interests.join(' ') : '';
}

async function gatherCandidates(profile) {
  const interests = interestKeywords(profile);
  const queries = [
    { type: 'restaurant', q: `Lisbon restaurants ${interests} ${profile.budgetLevel ?? ''}` },
    { type: 'gallery', q: `Lisbon galleries digital art contemporary ${interests}` },
    { type: 'landmark', q: `Lisbon landmarks viewpoints walks ${interests}` },
    { type: 'bar', q: `Lisbon bars nightlife fado ${interests}` },
  ];

  // Always start from the static catalog so the builder is never venue-starved
  // when the embedding step (Voyage API) is slow or returns malformed output.
  const [staticEntries, ...retrieved] = await Promise.all([
    loadStaticCatalog().catch((err) => {
      console.warn('[api/itinerary] static catalog load failed:', err.message);
      return [];
    }),
    ...queries.map(({ type, q }) =>
      searchKnowledgeBase(q, { topK: PER_TYPE_TOP_K, filter: { type } }).catch((err) => {
        console.warn(`[api/itinerary] retrieval failed for ${type}:`, err.message);
        return [];
      }),
    ),
  ]);

  const merged = mergeWithStatic(staticEntries, retrieved.flat());

  const counts = merged.reduce((acc, c) => {
    acc[c.type] = (acc[c.type] ?? 0) + 1;
    return acc;
  }, {});
  console.log('[api/itinerary] candidate pool:', counts);

  const shortfalls = Object.entries(POOL_FLOOR)
    .filter(([type, floor]) => (counts[type] ?? 0) < floor)
    .map(([type, floor]) => `${type}: ${counts[type] ?? 0}/${floor}`);
  if (shortfalls.length) {
    console.warn(
      '[api/itinerary] candidate pool below floor:',
      shortfalls.join(', '),
      '— static catalog may have failed to load or data files were modified.',
    );
  }

  return merged;
}

// POST /api/itinerary — regenerate the itinerary for the current session.
export async function POST() {
  try {
    const { session } = await getOrCreateSession();

    const [profile] = await db
      .select()
      .from(schema.tripProfiles)
      .where(eq(schema.tripProfiles.sessionId, session.id))
      .limit(1);

    if (!profile?.arrivalDate || !profile?.departureDate) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Trip profile is incomplete. Keep chatting with Gemel until arrival, departure, NFC days, group, budget, interests, and pace are all set.',
        },
        { status: 400 },
      );
    }

    const [candidates, programme] = await Promise.all([
      gatherCandidates(profile),
      loadNfcProgramme(),
    ]);

    const itinerary = buildItinerary({
      tripProfile: {
        arrivalDate: profile.arrivalDate,
        departureDate: profile.departureDate,
        groupType: profile.groupType,
        budgetLevel: profile.budgetLevel,
        interests: profile.interests,
        nfcDays: profile.nfcDays,
        pace: profile.pace,
        dietaryNeeds: profile.dietaryNeeds,
        mobilityNeeds: profile.mobilityNeeds,
      },
      candidates,
      nfcProgramme: programme,
    });

    // Bump the version off whatever's already stored.
    const [previous] = await db
      .select({ version: schema.itineraries.version })
      .from(schema.itineraries)
      .where(eq(schema.itineraries.sessionId, session.id))
      .orderBy(desc(schema.itineraries.version))
      .limit(1);
    itinerary.version = (previous?.version ?? 0) + 1;
    itinerary.sessionId = session.id;

    const [saved] = await db
      .insert(schema.itineraries)
      .values({
        sessionId: session.id,
        version: itinerary.version,
        content: itinerary,
        shareToken: nanoid(24),
      })
      .returning();

    // Narrate the result via Claude. Failures here shouldn't drop the save.
    let narration = '';
    try {
      const { text } = await chat(
        [buildItineraryNarrationTurn(itinerary)],
        buildItineraryNarrationPrompt({ language: session.language }),
        { temperature: 0.5, maxTokens: 700 },
      );
      narration = text;
    } catch (err) {
      console.warn('[api/itinerary] narration failed:', err.message);
    }

    if (narration) {
      await db.insert(schema.conversations).values({
        sessionId: session.id,
        role: 'assistant',
        content: narration,
      });
    }

    await db
      .update(schema.sessions)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(schema.sessions.id, session.id));

    return NextResponse.json({
      success: true,
      data: {
        itinerary,
        version: saved.version,
        shareToken: saved.shareToken,
        reply: narration,
      },
    });
  } catch (err) {
    console.error('[api/itinerary POST] failed', err);
    return NextResponse.json(
      { success: false, error: err.message ?? 'itinerary generation failed' },
      { status: 500 },
    );
  }
}
