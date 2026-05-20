import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db.js';
import { getOrCreateSession } from '@/lib/session.js';
import { chat } from '@/lib/claude.js';
import { buildSystemPrompt } from '@/lib/prompts/system.js';
import { searchKnowledgeBase } from '@/lib/retrieval.js';
import { extractProfile, mergeProfile } from '@/lib/profile-extractor.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HISTORY_LIMIT = 20;
const RETRIEVAL_TOP_K = 6;

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
