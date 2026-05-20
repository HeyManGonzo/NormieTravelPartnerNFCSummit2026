import { NextResponse } from 'next/server';
import { asc, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db.js';
import { getOrCreateSession } from '@/lib/session.js';
import { chat } from '@/lib/claude.js';
import { buildSystemPrompt } from '@/lib/prompts/system.js';
import { searchKnowledgeBase } from '@/lib/retrieval.js';
import { extractProfile, mergeProfile } from '@/lib/profile-extractor.js';
import { fetchLisbonForecast, formatForecastBlock } from '@/lib/apis/weather.js';
import { travelHintsForItinerary, formatTravelHintsBlock } from '@/lib/apis/maps.js';
import { fetchLisbonEvents, formatEventsBlock } from '@/lib/apis/events.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HISTORY_LIMIT = 20;
const RETRIEVAL_TOP_K = 6;

// GET /api/chat — return conversation history + session state so the
// frontend can rehydrate after a page reload or returning visit.
export async function GET() {
  try {
    const { session } = await getOrCreateSession();
    const rows = await db
      .select({
        id: schema.conversations.id,
        role: schema.conversations.role,
        content: schema.conversations.content,
        createdAt: schema.conversations.createdAt,
      })
      .from(schema.conversations)
      .where(eq(schema.conversations.sessionId, session.id))
      .orderBy(asc(schema.conversations.createdAt));
    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        status: session.status,
        language: session.language,
        messages: rows,
      },
    });
  } catch (err) {
    console.error('[api/chat GET] failed', err);
    return NextResponse.json(
      { success: false, error: err.message ?? 'history fetch failed' },
      { status: 500 },
    );
  }
}

// POST /api/chat { message: string }
// Returns: { success, data: { reply, sessionId, status } }
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const userMessage = String(body?.message ?? '').trim();
    if (!userMessage) {
      return NextResponse.json(
        { success: false, error: 'message is required' },
        { status: 400 },
      );
    }

    const { session } = await getOrCreateSession();

    // Trip profile, if collected.
    const [tripProfile] = await db
      .select()
      .from(schema.tripProfiles)
      .where(eq(schema.tripProfiles.sessionId, session.id))
      .limit(1);

    // Latest itinerary summary (id, version, timestamps) — full content omitted
    // from the prompt to keep token use sane.
    const [latestItinerary] = await db
      .select({
        id: schema.itineraries.id,
        version: schema.itineraries.version,
        generatedAt: schema.itineraries.updatedAt,
        content: schema.itineraries.content,
      })
      .from(schema.itineraries)
      .where(eq(schema.itineraries.sessionId, session.id))
      .orderBy(desc(schema.itineraries.version))
      .limit(1);

    // Last N conversation turns (oldest → newest).
    const recent = await db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.sessionId, session.id))
      .orderBy(desc(schema.conversations.createdAt))
      .limit(HISTORY_LIMIT);
    const history = recent.reverse().map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Persist the user turn before calling Claude so we never lose it.
    await db.insert(schema.conversations).values({
      sessionId: session.id,
      role: 'user',
      content: userMessage,
    });

    // Retrieve candidate venues from the knowledge base based on the
    // latest user message. We fail soft if retrieval is misconfigured.
    let candidates = [];
    try {
      candidates = await searchKnowledgeBase(userMessage, { topK: RETRIEVAL_TOP_K });
    } catch (err) {
      console.warn('[api/chat] retrieval failed (continuing without):', err.message);
    }

    // External enrichments — all fail soft if the relevant API key is
    // missing. We only run them when there's a meaningful trip context
    // to anchor against, to avoid burning quota during onboarding.
    let weatherBlock = null;
    let travelHintsBlock = null;
    let eventsBlock = null;
    if (tripProfile?.arrivalDate && tripProfile?.departureDate) {
      try {
        const forecast = await fetchLisbonForecast();
        const dateRange = buildDateRange(
          tripProfile.arrivalDate,
          tripProfile.departureDate,
        );
        weatherBlock = formatForecastBlock(forecast, dateRange);
      } catch (err) {
        console.warn('[api/chat] weather failed:', err.message);
      }
      try {
        const events = await fetchLisbonEvents({
          from: tripProfile.arrivalDate,
          to: tripProfile.departureDate,
        });
        eventsBlock = formatEventsBlock(events);
      } catch (err) {
        console.warn('[api/chat] events failed:', err.message);
      }
    }
    if (latestItinerary?.content) {
      try {
        const hints = await travelHintsForItinerary(latestItinerary.content);
        travelHintsBlock = formatTravelHintsBlock(hints);
      } catch (err) {
        console.warn('[api/chat] travel hints failed:', err.message);
      }
    }

    const systemPrompt = buildSystemPrompt({
      session,
      tripProfile,
      itinerarySummary: latestItinerary
        ? {
            version: latestItinerary.version,
            generatedAt: latestItinerary.generatedAt,
            days: latestItinerary.content?.days?.map((d) => ({
              date: d.date,
              dayLabel: d.dayLabel,
              nfcDay: d.nfcDay,
              activityCount: d.blocks?.length ?? 0,
            })),
          }
        : null,
      candidates,
      weatherBlock,
      travelHintsBlock,
      eventsBlock,
    });

    const messagesForClaude = [...history, { role: 'user', content: userMessage }];

    const { text: replyText } = await chat(messagesForClaude, systemPrompt);

    await db.insert(schema.conversations).values({
      sessionId: session.id,
      role: 'assistant',
      content: replyText,
    });

    // Re-extract the trip profile from the updated transcript so we capture
    // any new details the visitor just shared. Failures are non-fatal.
    let extracted = null;
    try {
      const updatedHistory = [...history, { role: 'user', content: userMessage }];
      extracted = await extractProfile(updatedHistory);
    } catch (err) {
      console.warn('[api/chat] profile extraction failed:', err.message);
    }

    let profileComplete = false;
    let readyToGenerate = false;
    if (extracted) {
      const merged = mergeProfile(tripProfile, extracted);
      if (tripProfile) {
        await db
          .update(schema.tripProfiles)
          .set({ ...merged, updatedAt: new Date() })
          .where(eq(schema.tripProfiles.id, tripProfile.id));
      } else {
        await db.insert(schema.tripProfiles).values({
          sessionId: session.id,
          ...merged,
        });
      }
      profileComplete = Boolean(extracted.isComplete);
      readyToGenerate = profileComplete && Boolean(extracted.userConfirmedItinerary);
    }

    // Advance session status only — never regress it.
    const nextStatus =
      session.status === 'active'
        ? 'active'
        : profileComplete
          ? 'planning'
          : session.status;
    await db
      .update(schema.sessions)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(schema.sessions.id, session.id));

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        status: nextStatus,
        reply: replyText,
        profileComplete,
        readyToGenerate,
      },
    });
  } catch (err) {
    console.error('[api/chat] failed', err);
    return NextResponse.json(
      { success: false, error: err.message ?? 'chat error' },
      { status: 500 },
    );
  }
}


// Build an inclusive list of ISO date strings between two ISO dates.
function buildDateRange(start, end) {
  if (!start || !end) return [];
  const out = [];
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return [];
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
