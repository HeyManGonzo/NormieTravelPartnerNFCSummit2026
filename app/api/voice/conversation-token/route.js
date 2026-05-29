import { NextResponse } from 'next/server';
import { getOrCreateSession } from '@/lib/session.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/voice/conversation-token
// Returns a short-lived signed WebSocket URL so the browser can connect to
// ElevenLabs Conversational AI without exposing the API key or agent ID.
// The session ID is embedded as metadata so the LLM webhook can load the
// visitor's trip profile and itinerary context on each turn.
export async function GET() {
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!agentId) {
    return NextResponse.json(
      { success: false, error: 'ELEVENLABS_AGENT_ID is not configured' },
      { status: 503 },
    );
  }

  try {
    const { session } = await getOrCreateSession();

    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
      {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '',
        },
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[conversation-token] ElevenLabs error:', res.status, body);
      // Surface the upstream status + body to the browser so it appears in
      // DevTools Network. Cap body to avoid leaking large HTML responses.
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to get signed URL from ElevenLabs',
          upstreamStatus: res.status,
          upstreamBody: body.slice(0, 500),
        },
        { status: 502 },
      );
    }

    const { signed_url } = await res.json();

    return NextResponse.json({
      success: true,
      data: { signedUrl: signed_url, sessionId: session.id },
    });
  } catch (err) {
    console.error('[conversation-token] failed:', err);
    return NextResponse.json(
      { success: false, error: err.message ?? 'token generation failed' },
      { status: 500 },
    );
  }
}
