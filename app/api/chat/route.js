import { NextResponse } from 'next/server';
import { asc, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db.js';
import { getOrCreateSession } from '@/lib/session.js';
import { chatTurnWithTools } from '@/lib/claude.js';
import { buildSystemPrompt } from '@/lib/prompts/system.js';
import { extractProfile, mergeProfile } from '@/lib/profile-extractor.js';
import { TOOL_DEFINITIONS, executeTool } from '@/lib/tools.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HISTORY_LIMIT = 20;
const MAX_TOOL_ITERATIONS = 4;

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

    // Fetch trip profile, itinerary summary, and conversation history in parallel.
    const [
      [tripProfile],
      [latestItinerary],
      recent,
    ] = await Promise.all([
      db.select()
        .from(schema.tripProfiles)
        .where(eq(schema.tripProfiles.sessionId, session.id))
        .limit(1),
      db.select({
          id: schema.itineraries.id,
          version: schema.itineraries.version,
          generatedAt: schema.itineraries.updatedAt,
          content: schema.itineraries.content,
        })
        .from(schema.itineraries)
        .where(eq(schema.itineraries.sessionId, session.id))
        .orderBy(desc(schema.itineraries.version))
        .limit(1),
      db.select()
        .from(schema.conversations)
        .where(eq(schema.conversations.sessionId, session.id))
        .orderBy(desc(schema.conversations.createdAt))
        .limit(HISTORY_LIMIT),
    ]);

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
    });

    // Tool-using loop: Claude may call searchKnowledge / getWeather /
    // getTravelTime up to MAX_TOOL_ITERATIONS times before we force it to
    // stop. Parallel tool_use blocks in one turn are dispatched concurrently.
    const messagesForClaude = [...history, { role: 'user', content: userMessage }];
    const toolTrace = [];
    let replyText = '';

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter += 1) {
      const { response, stopReason, textBlocks, toolUses } =
        await chatTurnWithTools(messagesForClaude, systemPrompt, TOOL_DEFINITIONS);

      if (stopReason !== 'tool_use' || toolUses.length === 0) {
        replyText = textBlocks.join('\n').trim();
        break;
      }

      // Persist the assistant turn (containing tool_use blocks) verbatim
      // so the next turn's history references resolve.
      messagesForClaude.push({ role: 'assistant', content: response.content });

      const results = await Promise.all(
        toolUses.map(async (tu) => {
          const result = await executeTool(tu.name, tu.input);
          toolTrace.push({ name: tu.name, input: tu.input, ok: !result?.error });
          return { id: tu.id, result };
        }),
      );

      messagesForClaude.push({
        role: 'user',
        content: results.map((r) => ({
          type: 'tool_result',
          tool_use_id: r.id,
          content: JSON.stringify(r.result),
        })),
      });

      // Final iteration — if Claude still wants tools, fall through and
      // surface whatever text it produced. Avoids infinite loops.
      if (iter === MAX_TOOL_ITERATIONS - 1) {
        const { textBlocks: finalText } = await chatTurnWithTools(
          messagesForClaude,
          systemPrompt,
          TOOL_DEFINITIONS,
        );
        replyText = finalText.join('\n').trim();
        break;
      }
    }

    if (!replyText) {
      replyText = "Sorry — I lost my thread for a moment. Can you ask that again?";
    }

    await db.insert(schema.conversations).values({
      sessionId: session.id,
      role: 'assistant',
      content: replyText,
    });

    // Re-extract the trip profile to capture any new details the visitor shared.
    // Skip when the session is already active — the profile is locked in and
    // itinerary generated; extraction would only add latency with no benefit.
    let extracted = null;
    if (session.status !== 'active') {
      try {
        const updatedHistory = [...history, { role: 'user', content: userMessage }];
        extracted = await extractProfile(updatedHistory);
      } catch (err) {
        console.warn('[api/chat] profile extraction failed:', err.message);
      }
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
