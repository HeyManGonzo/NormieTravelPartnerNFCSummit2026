import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db.js';
import { getOrCreateSession } from '@/lib/session.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/session — create or resume a session for this browser.
// Returns the session row plus a flag indicating whether the trip profile
// has been collected yet (used by the frontend to decide between onboarding
// and the planning chat).
export async function POST() {
  try {
    const { session, isNew } = await getOrCreateSession();

    const [profile] = await db
      .select()
      .from(schema.tripProfiles)
      .where(eq(schema.tripProfiles.sessionId, session.id))
      .limit(1);

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        status: session.status,
        language: session.language,
        isNew,
        hasProfile: Boolean(profile),
      },
    });
  } catch (err) {
    console.error('[api/session] failed', err);
    return NextResponse.json(
      { success: false, error: err.message ?? 'session error' },
      { status: 500 },
    );
  }
}

// GET /api/session — read-only status check (no cookie write if missing).
export async function GET() {
  try {
    const { session, isNew } = await getOrCreateSession();
    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        status: session.status,
        language: session.language,
        isNew,
      },
    });
  } catch (err) {
    console.error('[api/session] failed', err);
    return NextResponse.json(
      { success: false, error: err.message ?? 'session error' },
      { status: 500 },
    );
  }
}
