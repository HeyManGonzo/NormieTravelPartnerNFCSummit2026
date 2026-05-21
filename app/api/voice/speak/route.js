import { NextResponse } from 'next/server';
import { streamSpeech } from '@/lib/voice/tts.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TEXT_LENGTH = 5000;

// POST /api/voice/speak
// Body: { text: string, voiceId?: string, modelId?: string }
// Returns: audio/mpeg stream (mp3)
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text) {
      return NextResponse.json(
        { success: false, error: 'text is required' },
        { status: 400 },
      );
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { success: false, error: `text exceeds ${MAX_TEXT_LENGTH} chars` },
        { status: 413 },
      );
    }

    const audioStream = await streamSpeech(text, {
      voiceId: body?.voiceId,
      modelId: body?.modelId,
    });

    return new Response(audioStream, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[voice/speak] error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'tts failed' },
      { status: 500 },
    );
  }
}
