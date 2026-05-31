import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db.js';
import { buildSystemPrompt } from '@/lib/prompts/system.js';
import { streamFinalTurn } from '@/lib/claude.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// How many recent turns to pass to Claude. Voice conversations are fast-paced
// so a shorter window keeps the context lean and latency low.
const VOICE_HISTORY_LIMIT = 10;

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
};

// ElevenLabs' "Brain" parser requires fully OpenAI-compliant chat completion
// chunks — the bare {"choices":[{"delta":...}]} shape makes it report
// "Brain returned no response". Each chunk needs id/object/created/model and the
// stream must end with a chunk carrying finish_reason:"stop" before [DONE].
const COMPLETION_ID = () => `chatcmpl-${Math.random().toString(36).slice(2)}`;
const REPORTED_MODEL = 'claude-sonnet-4-5';

function chunk(id, delta, finishReason = null) {
  return `data: ${JSON.stringify({
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: REPORTED_MODEL,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\n\n`;
}

// Build a complete one-shot SSE body: role chunk → content chunk → stop → [DONE].
function oneShotSSE(text) {
  const id = COMPLETION_ID();
  return (
    chunk(id, { role: 'assistant' }) +
    chunk(id, { content: text }) +
    chunk(id, {}, 'stop') +
    'data: [DONE]\n\n'
  );
}

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
    // ElevenLabs docs name this field `elevenlabs_extra_body` but the SDK
    // ships `custom_llm_extra_body` — accept either to survive any rename.
    const extraBody = body?.elevenlabs_extra_body ?? body?.custom_llm_extra_body ?? {};
    const sessionId = extraBody.session_id;
    const rawMessages = Array.isArray(body?.messages) ? body.messages : [];

    // When session_id is missing (e.g. ElevenLabs "Test Connection" probe), we
    // still need to return a valid OpenAI SSE stream so the test passes. The
    // probe doesn't include extra_body, so this branch only triggers for tests
    // or misconfigured clients.
    if (!sessionId) {
      return new Response(
        oneShotSSE('Custom LLM webhook reachable. Provide session_id in extra_body for real conversations.'),
        { headers: SSE_HEADERS },
      );
    }

    // Load session and context from DB.
    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .limit(1);

    if (!session) {
      return new Response(
        oneShotSSE('Sorry, I could not find your session. Please refresh the page and try again.'),
        { headers: SSE_HEADERS },
      );
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
      // to pre-warm. Return a complete (empty-content) completion so the parser
      // sees a valid, terminated response rather than "no response".
      return new Response(oneShotSSE(''), { headers: SSE_HEADERS });
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
    const completionId = COMPLETION_ID();
    let fullReply = '';

    const stream = new ReadableStream({
      async start(controller) {
        // Opening chunk announces the assistant role (OpenAI convention).
        controller.enqueue(encoder.encode(chunk(completionId, { role: 'assistant' })));
        try {
          for await (const token of streamFinalTurn(conversationMessages, systemPrompt)) {
            fullReply += token;
            controller.enqueue(encoder.encode(chunk(completionId, { content: token })));
          }
        } catch (err) {
          console.error('[conversation-llm] stream error:', err);
        }

        // Final chunk must carry finish_reason so the parser closes the
        // completion, then the [DONE] sentinel.
        controller.enqueue(encoder.encode(chunk(completionId, {}, 'stop')));
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

    return new Response(stream, { headers: SSE_HEADERS });
  } catch (err) {
    console.error('[conversation-llm] failed:', err);
    // Still return a valid, terminated completion so ElevenLabs surfaces a
    // spoken fallback rather than a cascade error.
    return new Response(
      oneShotSSE('Sorry — something went wrong on my end. Could you say that again?'),
      { headers: SSE_HEADERS },
    );
  }
}
