import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema, withTimeout } from '@/lib/db.js';
import { getOrCreateSession, readSessionIdFromCookie } from '@/lib/session.js';
import { SUPPORTED_LOCALES } from '@/lib/i18n';
import { isKnownAgent, getPersona, publicPersona, listPersonas } from '@/lib/agents/personas.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/session — create or resume a session for this browser.
// Returns the session row plus a flag indicating whether the trip profile
// has been collected yet (used by the frontend to decide between onboarding
// and the planning chat).
export async function POST() {
  try {
    const { session, isNew } = await withTimeout(getOrCreateSession(), 8000, 'session');

    const [profile] = await withTimeout(
      db
        .select()
        .from(schema.tripProfiles)
        .where(eq(schema.tripProfiles.sessionId, session.id))
        .limit(1),
      8000,
      'profile',
    );

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        status: session.status,
        language: session.language,
        isNew,
        hasProfile: Boolean(profile),
        agentTokenId: session.agentTokenId,
        agent: publicPersona(getPersona(session.agentTokenId)),
        agents: listPersonas().map(publicPersona),
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
    if (typeof body.agentTokenId === 'string') {
      if (!isKnownAgent(body.agentTokenId)) {
        return NextResponse.json(
          { success: false, error: 'unknown agent' },
          { status: 400 },
        );
      }
      updates.agentTokenId = body.agentTokenId;
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
        agentTokenId: row.agentTokenId,
        agent: publicPersona(getPersona(row.agentTokenId)),
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
    const { session, isNew } = await withTimeout(getOrCreateSession(), 8000, 'session');
    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        status: session.status,
        language: session.language,
        isNew,
        agentTokenId: session.agentTokenId,
        agent: publicPersona(getPersona(session.agentTokenId)),
        agents: listPersonas().map(publicPersona),
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
