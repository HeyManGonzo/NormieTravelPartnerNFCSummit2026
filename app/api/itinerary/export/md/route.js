import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db.js';
import { getOrCreateSession } from '@/lib/session.js';
import { buildMarkdown } from '@/lib/export/markdown.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/itinerary/export/md
//   Optional ?token=<shareToken> for the public read-only view; otherwise
//   uses the current session.
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    const localeQuery = url.searchParams.get('locale');

    let row;
    let sessionLocale = null;
    if (token) {
      [row] = await db
        .select()
        .from(schema.itineraries)
        .where(eq(schema.itineraries.shareToken, token))
        .limit(1);
      if (row) {
        const [s] = await db
          .select({ language: schema.sessions.language })
          .from(schema.sessions)
          .where(eq(schema.sessions.id, row.sessionId))
          .limit(1);
        sessionLocale = s?.language ?? null;
      }
    } else {
      const { session } = await getOrCreateSession();
      sessionLocale = session.language;
      [row] = await db
        .select()
        .from(schema.itineraries)
        .where(eq(schema.itineraries.sessionId, session.id))
        .orderBy(desc(schema.itineraries.version))
        .limit(1);
    }

    if (!row) {
      return new Response('No itinerary available.', { status: 404 });
    }

    const locale = localeQuery || sessionLocale || 'en';
    const md = buildMarkdown(row.content, locale);
    return new Response(md, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="nfc-summit-itinerary-v${row.version}.md"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[api/itinerary/export/md] failed', err);
    return new Response(err.message ?? 'export failed', { status: 500 });
  }
}
