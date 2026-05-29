import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db.js';
import { buildSystemPrompt } from '@/lib/prompts/system.js';
import { streamFinalTurn } from '@/lib/claude.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// How many recent turns to pass to Claude. Voice conversations are fast-paced
// so a shorter window keeps the context lean and latency low.
const VOICE_HISTORY_LIMIT = 10;

// POST /api/voice/conversation-llm
//
// ElevenLabs Conversational AI custom-LLM webhook. On every conversation turn
// ElevenLabs sends an OpenAI-format chat completion request to this endpoint.
// We rebuild the visitor's full session context (profile, itinerary) from the
// session ID passed in custom_llm_extra_body, call Claude, and stream an
// OpenAI-format SSE response back.
//
// Request body (from ElevenLabs):
// {
//   messages: [{ role: 'user'|'assistant'|'system', content: string }],
//   custom_llm_extra_body: { session_id: string },
//   stream: true
// }
//
// Response: OpenAI-compatible SSE stream
// data: {"choices":[{"delta":{"content":"..."}}]}\n\n
// ...
// data: [DONE]\n\n

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = body?.custom_llm_extra_body?.session_id;
    const rawMessages = Array.isArray(body?.messages) ? body.messages : [];

    if (!sessionId) {
      return new Response('data: {"error":"missing session_id"}\n\ndata: [DONE]\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }

    // Load session and context from DB.
    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .limit(1);

    if (!session) {
      return new Response('data: {"error":"session not found"}\n\ndata: [DONE]\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }

    const [[tripProfile], [latestItinerary]] = await Promise.all([
      db.select().from(schema.tripProfiles).where(eq(schema.tripProfiles.sessionId, sessionId)).limit(1),
      db.select({
          id: schema.itineraries.id,
          version: schema.itineraries.version,
          generatedAt: schema.itineraries.updatedAt,
          content: schema.itineraries.content,
        })
        .from(schema.itineraries)
        .where(eq(schema.itineraries.sessionId, sessionId))
        .orderBy(desc(schema.itineraries.version))
        .limit(1),
    ]);

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

    // Strip ElevenLabs' injected system message — we supply our own via
    // buildSystemPrompt so Gemel's full persona and session context are intact.
    const conversationMessages = rawMessages
      .filter((m) => m.role !== 'system')
      .slice(-VOICE_HISTORY_LIMIT)
      .map((m) => ({ role: m.role, content: String(m.content ?? '') }));

    if (conversationMessages.length === 0) {
      // No user turn yet — ElevenLabs may call us before the first message
      // to pre-warm. Return an empty done event.
      return new Response('data: [DONE]\n\n', {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }

    // Persist the latest user turn before calling Claude.
    const lastUserMsg = [...conversationMessages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
      await db.insert(schema.conversations).values({
        sessionId,
        role: 'user',
        content: lastUserMsg.content,
      }).catch(() => {}); // non-fatal
    }

    // Stream Claude's response, converting Anthropic token deltas to the
    // OpenAI chunk format ElevenLabs expects.
    const encoder = new TextEncoder();
    let fullReply = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamFinalTurn(conversationMessages, systemPrompt)) {
            fullReply += chunk;
            const data = JSON.stringify({ choices: [{ delta: { content: chunk }, index: 0 }] });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
        } catch (err) {
          console.error('[conversation-llm] stream error:', err);
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();

        // Persist assistant reply after stream closes (non-blocking).
        if (fullReply) {
          db.insert(schema.conversations)
            .values({ sessionId, role: 'assistant', content: fullReply })
            .catch(() => {});
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    console.error('[conversation-llm] failed:', err);
    return new Response(`data: {"error":"${err.message}"}\n\ndata: [DONE]\n\n`, {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }
}
