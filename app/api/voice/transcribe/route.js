import { NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/voice/stt.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB safety cap

// POST /api/voice/transcribe
// Body: multipart/form-data with fields:
//   audio: File (webm/ogg/mp3/wav/m4a)
//   languageCode?: string (optional ISO hint, e.g. 'en', 'pt')
// Returns: { success: true, data: { text, languageCode } }
export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get('audio');
    const languageCode = form.get('languageCode');

    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { success: false, error: 'audio file is required' },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: 'audio exceeds 25 MB' },
        { status: 413 },
      );
    }

    const result = await transcribeAudio(file, {
      languageCode: typeof languageCode === 'string' && languageCode
        ? languageCode
        : undefined,
    });

    return NextResponse.json({
      success: true,
      data: {
        text: result.text,
        languageCode: result.languageCode,
      },
    });
  } catch (error) {
    console.error('[voice/transcribe] error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'transcription failed' },
      { status: 500 },
    );
  }
}
