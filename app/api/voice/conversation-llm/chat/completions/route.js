import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db.js';
import { buildSystemPrompt } from '@/lib/prompts/system.js';
import { chatTurnWithTools, streamTurnRaw } from '@/lib/claude.js';
import { TOOL_DEFINITIONS, executeTool } from '@/lib/tools.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// How many recent turns to pass to Claude. Voice conversations are fast-paced
// so a shorter window keeps the context lean and latency low.
const VOICE_HISTORY_LIMIT = 10;
// Voice gets the same tool loop as text chat so Gemel can do live lookups
// (places, weather, events, ratings). Capped tighter than text chat to bound
// time-to-first-audio — ElevenLabs aborts a turn whose LLM is slow to respond.
const MAX_TOOL_ITERATIONS = 2;

// Iter 0 (tool-decision pass) uses Haiku: it only needs to pick the right tool
// and format a query string — first token in ~300ms vs ~700ms for Sonnet.
// Iter 1+ (the actual spoken answer after tools run) reverts to Sonnet for
// quality. If iter 0 turns out to be the final answer (no tools needed),
// Haiku handles it — voice replies are 1-3 sentences so quality gap is minimal.
const VOICE_DECISION_MODEL = 'claude-haiku-4-5-20251001';

// Spoken "buffer word" emitted the instant a lookup (tool call) starts, so
// ElevenLabs gets audio within ~1s and doesn't time out the turn while the
// tools + answer generation run. Only fires on tool turns; keyed off session
// language with an English fallback.
const FILLERS = {
  en: 'Let me check that.',
  pt: 'Deixa eu ver isso.',
  es: 'Déjame ver eso.',
  fr: 'Laisse-moi vérifier.',
  de: 'Lass mich kurz nachsehen.',
  tr: 'Bir bakayım.',
};

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

// Non-streaming OpenAI chat completion object. ElevenLabs' "Test Connection"
// probe sends stream:false and expects this JSON shape, not SSE — returning a
// stream to a non-stream client yields "Brain returned no response".
function jsonCompletion(text) {
  return Response.json({
    id: COMPLETION_ID(),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: REPORTED_MODEL,
    choices: [
      { index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  });
}

// One-shot reply in whichever transport the caller asked for.
function oneShot(text, wantsStream) {
  return wantsStream
    ? new Response(oneShotSSE(text), { headers: SSE_HEADERS })
    : jsonCompletion(text);
}

// Hard guarantee that voice Gemel never speaks a URL or markdown aloud. The
// VOICE_OUTPUT_RULES prompt reduces this but isn't reliable, so we strip it
// server-side before the text reaches ElevenLabs TTS. Belt and suspenders.
function sanitizeForVoice(text) {
  if (!text) return '';
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')            // [label](url) → label
    .replace(/\bhttps?:\/\/\S+/gi, '')                  // http(s):// URLs
    .replace(/\bwww\.\S+/gi, '')                        // www. URLs
    // bare domains like "normieagent.com" or "luma.com/x" (TLD-anchored)
    .replace(/\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:com|net|org|io|art|co|pt|eu|app|xyz|gg|dev|ai|me|tv)(?:\/\S*)?/gi, '')
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, '$1')          // **bold** / *italic*
    .replace(/_{1,2}([^_\n]+)_{1,2}/g, '$1')            // _italic_
    .replace(/`([^`]+)`/g, '$1')                        // `inline code`
    .replace(/```[\s\S]*?```/g, '')                     // fenced code blocks
    .replace(/^#{1,6}\s+/gm, '')                        // ## headings
    .replace(/\(\s*\)/g, '')                            // empty () left by URL removal
    .replace(/\s+([.,!?;:])/g, '$1')                    // stray space before punctuation
    .replace(/[ \t]{2,}/g, ' ')                         // collapse double spaces
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Non-streaming tool loop used only for the stream:false (Test Connection) path.
// Live conversation turns use the streaming-first approach inside the ReadableStream.
async function runToolLoopBuffered(messages, system, sessionId) {
  let buffered = '';
  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter += 1) {
    const { response, stopReason, textBlocks, toolUses } =
      await chatTurnWithTools(messages, system, TOOL_DEFINITIONS);

    if (stopReason !== 'tool_use' || toolUses.length === 0) {
      buffered = textBlocks.join('\n').trim();
      break;
    }

    messages.push({ role: 'assistant', content: response.content });

    const results = await Promise.all(
      toolUses.map(async (tu) => ({
        id: tu.id,
        result: await executeTool(tu.name, tu.input, { sessionId }),
      })),
    );

    messages.push({
      role: 'user',
      content: results.map((r) => ({
        type: 'tool_result',
        tool_use_id: r.id,
        content: JSON.stringify(r.result),
      })),
    });
  }
  return buffered;
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
    // ElevenLabs' Test Connection probes with stream:false and expects a JSON
    // completion; live conversation turns send stream:true and want SSE.
    const wantsStream = body?.stream !== false;

    // When session_id is missing (e.g. ElevenLabs "Test Connection" probe), we
    // still need to return a valid OpenAI SSE stream so the test passes. The
    // probe doesn't include extra_body, so this branch only triggers for tests
    // or misconfigured clients.
    if (!sessionId) {
      return oneShot(
        'Custom LLM webhook reachable. Provide session_id in extra_body for real conversations.',
        wantsStream,
      );
    }

    // Load session and context from DB.
    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .limit(1);

    if (!session) {
      return oneShot(
        'Sorry, I could not find your session. Please refresh the page and try again.',
        wantsStream,
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
      voice: true,
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
      return oneShot('', wantsStream);
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

    // Non-streaming transport (ElevenLabs Test Connection, stream:false):
    // not latency-sensitive — buffer the full reply, sanitise, return JSON.
    if (!wantsStream) {
      const messages = [...conversationMessages];
      let buffered = '';
      try {
        buffered = await runToolLoopBuffered(messages, systemPrompt, sessionId);
      } catch (err) {
        console.error('[conversation-llm] non-stream error:', err);
      }
      const clean = sanitizeForVoice(buffered) || 'OK.';
      db.insert(schema.conversations)
        .values({ sessionId, role: 'assistant', content: clean })
        .catch(() => {});
      return jsonCompletion(clean);
    }

    // Streaming transport (live conversation). Return the Response immediately
    // so the HTTP connection opens right away. All work happens inside async
    // start() — text tokens flow to ElevenLabs as Claude generates them.
    // When a lookup (tool call) starts, emit a short filler word immediately so
    // ElevenLabs gets audio within ~1s and won't abort the turn while tools run.
    // All emitted text is sanitised (URLs/markdown stripped) before TTS.
    const encoder = new TextEncoder();
    const completionId = COMPLETION_ID();
    const messagesForClaude = [...conversationMessages];
    const filler = FILLERS[session?.language] ?? FILLERS.en;

    const stream = new ReadableStream({
      async start(controller) {
        const t0 = Date.now();
        const emit = (content) =>
          controller.enqueue(encoder.encode(chunk(completionId, { content })));
        controller.enqueue(encoder.encode(chunk(completionId, { role: 'assistant' })));

        let fullReply = '';
        let fillerEmitted = false;

        try {
          for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter += 1) {
            let finalMessage = null;
            let iterText = ''; // buffer the full iteration text before sanitising

            for await (const event of streamTurnRaw(messagesForClaude, systemPrompt, TOOL_DEFINITIONS, { model: iter === 0 ? VOICE_DECISION_MODEL : undefined })) {
              if (event.type === 'text') iterText += event.text;
              else if (event.type === 'final') finalMessage = event.message;
            }

            console.log(`[conversation-llm] iter ${iter} ${Date.now() - t0}ms stop=${finalMessage?.stop_reason}`);

            const toolUses = (finalMessage?.content ?? []).filter((b) => b.type === 'tool_use');
            const isFinalTurn = finalMessage?.stop_reason !== 'tool_use' || toolUses.length === 0;

            if (isFinalTurn) {
              // Final answer — sanitise the complete text so multi-word markdown
              // links like [Name](url) are stripped cleanly in one pass.
              const clean = sanitizeForVoice(iterText);
              if (clean) { fullReply += clean; emit(clean); }
              break;
            }

            // Tool call — emit filler ONLY if Haiku didn't already narrate its
            // intent ("I'll search for…"). If it did, use that as the filler so
            // we don't double up with "I'll search… Let me check that."
            if (!fillerEmitted) {
              fillerEmitted = true;
              const spokenSoFar = sanitizeForVoice(iterText);
              const spoken = spokenSoFar || filler;
              fullReply += `${spoken} `;
              emit(`${spoken} `);
            }

            messagesForClaude.push({ role: 'assistant', content: finalMessage.content });
            const results = await Promise.all(
              toolUses.map(async (tu) => ({
                id: tu.id,
                result: await executeTool(tu.name, tu.input, { sessionId }),
              })),
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

          if (!fullReply.trim()) {
            const fallback = 'Sorry, could you say that again?';
            fullReply = fallback;
            emit(fallback);
          }
        } catch (err) {
          console.error('[conversation-llm] stream error:', err);
        }

        controller.enqueue(encoder.encode(chunk(completionId, {}, 'stop')));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();

        // Persist the answer (not the filler) for chat history.
        if (fullReply.trim()) {
          db.insert(schema.conversations)
            .values({ sessionId, role: 'assistant', content: fullReply.trim() })
            .catch(() => {});
        }
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  } catch (err) {
    console.error('[conversation-llm] failed:', err);
    // Still return a valid, terminated completion so ElevenLabs surfaces a
    // spoken fallback rather than a cascade error. Default to SSE — by this
    // point we may not have parsed the stream flag.
    return new Response(
      oneShotSSE('Sorry — something went wrong on my end. Could you say that again?'),
      { headers: SSE_HEADERS },
    );
  }
}
