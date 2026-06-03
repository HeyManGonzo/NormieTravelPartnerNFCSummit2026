# Reading Gemel conversation transcripts

Every request and Gemel's answer — **text and voice** — is persisted in the **`conversations`**
table in Supabase Postgres. The logs are *not* the place to look:

- **Vercel logs** only contain `console.log` output (errors, warnings, usage metering), not
  message bodies — message content is deliberately not logged there.
- **Anthropic Console** shows usage/cost/rate-limit metrics, not prompt/response content.

So the database is the authoritative (and only) transcript source.

## Where the data lives

Table `conversations` — columns: `id`, `session_id`, `role` (`user` | `assistant`), `content`,
`created_at`. Written by:

- **Text chat** — user turn in [app/api/chat/route.js](../app/api/chat/route.js) (~L97),
  Gemel's reply (~L189); itinerary narration in
  [app/api/itinerary/route.js](../app/api/itinerary/route.js) (~L189).
- **Voice** — user turn and Gemel's spoken answer in
  [app/api/voice/conversation-llm/chat/completions/route.js](../app/api/voice/conversation-llm/chat/completions/route.js)
  (~L264 and ~L282 / L375). The clean answer is stored, not the "let me check…" filler.

## How to read them (Supabase → SQL Editor)

```sql
-- One full conversation, in order:
select created_at, role, content
from conversations
where session_id = '‹session-id›'
order by created_at;
```

```sql
-- Find the busiest / most recent sessions to read:
select session_id,
       count(*)        as msgs,
       min(created_at) as started,
       max(created_at) as last_active
from conversations
group by session_id
order by last_active desc
limit 50;
```

```sql
-- Recent activity across all sessions (snippets):
select session_id, created_at, role, left(content, 300) as preview
from conversations
order by created_at desc
limit 100;
```

```sql
-- Reconstruct a session as a single readable thread:
select string_agg(
         to_char(created_at, 'HH24:MI') || '  ' || upper(role) || ': ' || content,
         e'\n\n' order by created_at
       ) as transcript
from conversations
where session_id = '‹session-id›';
```

## Privacy

Sessions are anonymous (no accounts), but visitors type real trip details — arrival dates, where
they're staying, dietary and mobility needs. Treat transcripts as **personal data**: this is
covered by the [Disclaimer](../app/disclaimer/page.js), and a GDPR retention policy is on the
post-summit backlog ([docs/post-summit-roadmap.md](post-summit-roadmap.md)).

## Nicer access later (not built yet)

- A read-only **"Conversations"** page in the admin panel (`feature/admin-panel`): list sessions,
  click to read the full transcript in the browser.
- A small `npm run transcript <sessionId>` CLI script that prints a clean thread to the terminal.
