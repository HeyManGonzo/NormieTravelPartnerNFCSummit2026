import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db.js';

const COOKIE_NAME = 'nfc_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('SESSION_SECRET must be set to a random 32+ char string.');
  }
  return secret;
}

function sign(value) {
  return createHmac('sha256', getSecret()).update(value).digest('hex');
}

function pack(sessionId) {
  return `${sessionId}.${sign(sessionId)}`;
}

function unpack(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const [sessionId, signature] = raw.split('.');
  if (!sessionId || !signature) return null;
  const expected = Buffer.from(sign(sessionId), 'hex');
  const provided = Buffer.from(signature, 'hex');
  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;
  return sessionId;
}

// Read the session ID from the signed cookie. Returns null if missing/invalid.
export async function readSessionIdFromCookie() {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  return unpack(raw);
}

// Write the signed session cookie. Call from a Route Handler.
export async function writeSessionCookie(sessionId) {
  const store = await cookies();
  store.set(COOKIE_NAME, pack(sessionId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
}

// Look up an existing session row, or create one if the cookie is missing
// or its session has been deleted. Always returns a row.
export async function getOrCreateSession() {
  const existingId = await readSessionIdFromCookie();
  if (existingId) {
    const [row] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, existingId))
      .limit(1);
    if (row) return { session: row, isNew: false };
  }

  const [created] = await db
    .insert(schema.sessions)
    .values({})
    .returning();
  await writeSessionCookie(created.id);
  return { session: created, isNew: true };
}

// Load session by ID without touching cookies (used by server components
// rendering shared itinerary views, etc.).
export async function loadSessionById(sessionId) {
  const [row] = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, sessionId))
    .limit(1);
  return row ?? null;
}
