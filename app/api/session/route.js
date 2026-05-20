import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db.js';
import { getOrCreateSession, readSessionIdFromCookie } from '@/lib/session.js';
import { SUPPORTED_LOCALES } from '@/lib/i18n';

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

// PATCH /api/session — update session preferences (currently: language).
export async function PATCH(request) {
  try {
    const sessionId = await readSessionIdFromCookie();
    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'no session' },
        { status: 401 },
      );
    }
    const body = await request.json().catch(() => ({}));
    const updates = {};
    if (typeof body.language === 'string') {
      if (!SUPPORTED_LOCALES.includes(body.language)) {
        return NextResponse.json(
          { success: false, error: 'unsupported language' },
          { status: 400 },
        );
      }
      updates.language = body.language;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'no updatable fields' },
        { status: 400 },
      );
    }
    updates.updatedAt = new Date();

    const [row] = await db
      .update(schema.sessions)
      .set(updates)
      .where(eq(schema.sessions.id, sessionId))
      .returning();

    if (!row) {
      return NextResponse.json(
        { success: false, error: 'session not found' },
        { status: 404 },
      );
    }
    return NextResponse.json({
      success: true,
      data: {
        sessionId: row.id,
        status: row.status,
        language: row.language,
      },
    });
  } catch (err) {
    console.error('[api/session] PATCH failed', err);
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
