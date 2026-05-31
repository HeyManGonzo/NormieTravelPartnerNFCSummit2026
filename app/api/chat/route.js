import { NextResponse } from 'next/server';
import { asc, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db.js';
import { getOrCreateSession } from '@/lib/session.js';
import { streamTurnRaw } from '@/lib/claude.js';
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
            // Include full activity names so Gemel references the same venues
            // in chat as appear in the downloadable/exported itinerary.
            days: latestItinerary.content?.days?.map((d) => ({
              date: d.date,
              dayLabel: d.dayLabel,
              nfcDay: d.nfcDay,
              blocks: d.blocks?.map((b) => ({
                timeSlot: b.timeSlot,
                name: b.activity?.name,
                type: b.activity?.type,
                neighbourhood: b.activity?.neighbourhood,
                address: b.activity?.address,
              })),
            })),
          }
        : null,
    });

    // Streaming-first tool loop. The Response is returned immediately so the
    // HTTP connection opens and the client sees the thinking indicator right
    // away. All work (tool calls, final generation, DB writes, profile
    // extraction) happens inside the ReadableStream's async start() callback,
    // which keeps the serverless function alive until the stream closes.
    const messagesForClaude = [...history, { role: 'user', content: userMessage }];
    const toolTrace = [];

    const encoder = new TextEncoder();
    const sse = (obj) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

    const responseStream = new ReadableStream({
      async start(controller) {
        controller.enqueue(sse({ type: 'meta', sessionId: session.id, status: session.status }));

        let replyText = '';

        try {
          for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter += 1) {
            let finalMessage = null;

            for await (const event of streamTurnRaw(messagesForClaude, systemPrompt, TOOL_DEFINITIONS)) {
              if (event.type === 'text') {
                replyText += event.text;
                controller.enqueue(sse({ type: 'token', text: event.text }));
              } else if (event.type === 'final') {
                finalMessage = event.message;
              }
            }

            const toolUses = (finalMessage?.content ?? []).filter((b) => b.type === 'tool_use');
            if (finalMessage?.stop_reason !== 'tool_use' || toolUses.length === 0) break;

            messagesForClaude.push({ role: 'assistant', content: finalMessage.content });

            const results = await Promise.all(
              toolUses.map(async (tu) => {
                const result = await executeTool(tu.name, tu.input, { sessionId: session.id });
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
          }

          if (!replyText) replyText = "Sorry — I lost my thread for a moment. Can you ask that again?";
        } catch (err) {
          console.error('[api/chat stream]', err);
          controller.enqueue(sse({ type: 'error', message: 'Stream failed. Please try again.' }));
          controller.close();
          return;
        }

        await db.insert(schema.conversations).values({
          sessionId: session.id,
          role: 'assistant',
          content: replyText,
        });

        // Re-extract the trip profile to capture any new details the visitor
        // shared. Skip when the session is already active.
        let profileComplete = false;
        let readyToGenerate = false;

        if (session.status !== 'active') {
          try {
            const updatedHistory = [...history, { role: 'user', content: userMessage }];
            const extracted = await extractProfile(updatedHistory);
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
              // Trigger itinerary generation as soon as the profile is complete.
              // session.status !== 'active' gates re-triggering: the itinerary
              // route sets the session to 'active' on success, so this only
              // fires once per session.
              readyToGenerate = profileComplete && session.status !== 'active';
            }
          } catch (err) {
            console.warn('[api/chat] profile extraction failed:', err.message);
          }
        }

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

        const itineraryUpdated = toolTrace.some(
          (t) => t.name === 'saveItinerary' && t.ok,
        );

        controller.enqueue(sse({ type: 'done', profileComplete, readyToGenerate, status: nextStatus, itineraryUpdated }));
        controller.close();
      },
    });

    return new Response(responseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
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
