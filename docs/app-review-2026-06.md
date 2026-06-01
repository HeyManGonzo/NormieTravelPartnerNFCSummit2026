# Gemel — Application Review & Recommendations

_Date: 2026-06-01 · Reviewer: engineering pass over the full codebase_
_Scope: architecture, security, cost/abuse, reliability, performance, testing, features, compliance._

This is a point-in-time health check of the NFC Summit 2026 visitor agent (Gemel) ahead of
the 4–6 June event. Findings are grounded in the current code; file paths are cited so each
item is actionable. Severity tags: **P0** (fix before/at summit), **P1** (soon after),
**P2** (nice-to-have / post-summit).

---

## 1. Overall assessment

The app is in **good shape for the summit**. The core flows — onboarding, itinerary
generation, text chat, voice chat, exports, multilingual — are implemented and working in
production. The architecture is unusually resilient for a hackathon-origin codebase: nearly
every external call soft-fails to `null` and there are sane fallbacks throughout.

The single most important gap is **the complete absence of rate limiting / abuse protection**
on unauthenticated, paid-LLM endpoints. Everything else is incremental.

---

## 2. Strengths (what's done well)

- **Graceful degradation everywhere.** Every external API (`lib/apis/*`) returns `null` on
  error instead of throwing; the itinerary builder falls back to the static catalog so it's
  never venue-starved (`app/api/itinerary/route.js` `gatherCandidates` + `POOL_FLOOR`).
- **Session security is correct.** HMAC-SHA256 signed cookie, `httpOnly`, `sameSite=lax`,
  `secure` in prod, `timingSafeEqual` for the signature, `SESSION_SECRET` length-checked
  (`lib/session.js`). Share links use unguessable `nanoid(24)` tokens.
- **Exports are properly scoped — no IDOR.** PDF/MD/ICS routes serve either the cookie
  session's itinerary or a row matched by the random `shareToken`; there is no raw
  `?sessionId=` lookup (`app/api/itinerary/export/*`).
- **Secret hygiene is clean.** `.env`, `.env.local`, `.env.*.local`, and `.mcp.json` are all
  gitignored; only `.env.example` is tracked. No secrets in git history (verified).
- **Cost-conscious AI architecture.** Committed embeddings + in-memory cosine search (no
  Pinecone bill), Anthropic prompt-cache split (static vs dynamic blocks in `lib/claude.js`),
  model tiering (Haiku for the voice tool-decision pass, Sonnet for prose), real token
  streaming, and a compact voice programme to cut context size.
- **Clean module boundaries.** `lib/apis/*` (one file per provider), `lib/export/*`,
  `lib/prompts/*`, `lib/tools.js` as a single dispatch registry. Easy to reason about.
- **Hybrid data strategy.** Curated catalog + Google Places (live, structured) + Perplexity
  (editorial/sentiment) + Luma/Eventbrite (events), with curated NFC events merged
  authoritatively into `findEvents`.

---

## 3. Security review

| # | Finding | Severity | Notes |
|---|---------|----------|-------|
| S1 | **No rate limiting on any endpoint** | **P0** | `/api/chat`, `/api/voice/conversation-llm/...`, `/api/itinerary`, `/api/voice/transcribe`, `/api/voice/speak` are all unauthenticated (anonymous sessions) and each call spends money (Anthropic, Perplexity, ElevenLabs, Google). A trivial script can rack up cost or exhaust quotas. No `rateLimit`/throttle exists anywhere (verified). |
| S2 | **Voice LLM webhook is open** | **P1** | `app/api/voice/conversation-llm/chat/completions` accepts any POST. With a known `session_id` (UUID) anyone could (a) drive paid Claude+tool calls, (b) inject arbitrary turns into that session's stored history. UUIDs aren't enumerable, but the endpoint has no shared-secret check. Consider validating an `x-...` shared secret from ElevenLabs, or signing the session_id. |
| S3 | **Orphaned but live voice endpoints** | **P1** | `/api/voice/speak` (TTS) and `/api/voice/transcribe` (STT) appear unused since the push-to-talk UI was removed (ConversationButton replaced MicButton/SpeakerToggle), yet remain deployed, open, and call ElevenLabs. Dead attack/cost surface. **Verify unused, then delete** (also `lib/voice/{client,tts,stt,elevenlabs}.js`). |
| S4 | **Error messages leak `err.message` to clients** | **P2** | `/api/chat`, `/api/itinerary`, export routes return `err.message` in the response body. Low-risk info disclosure (stack details, internal strings). Return generic messages; log details server-side only. |
| S5 | **No input-size cap on chat messages** | **P2** | `/api/chat` accepts an arbitrarily long `message`; a large payload inflates token cost. Add a sane length cap (e.g. 2–4k chars). |
| S6 | **Prompt-injection via tool results** | **P2 (accepted)** | Web/Places/event results are fed back to Claude. Mitigated by the constitutional rules in the system prompt and the fact the only state-mutating tool (`saveItinerary`) is session-scoped. Standard LLM risk; keep an eye on it, don't over-engineer now. |

**Not issues (verified good):** cookie signing, share-token randomness, secret gitignoring,
export scoping, SQL (Drizzle parameterised — no raw string concatenation in the hot paths).

---

## 4. Cost & abuse (the #1 priority)

S1 above deserves its own section because it's the highest-leverage risk. Recommended, in order:

1. **Edge rate limiting** on the paid routes — simplest is `@upstash/ratelimit` + Upstash Redis
   (works on Vercel, generous free tier), keyed by IP and/or session cookie. Even a coarse
   "30 requests/min/IP" stops scripted abuse without hurting real users.
2. **Per-service spend alerts.** Set budget alerts on Anthropic, Perplexity, ElevenLabs, and
   Google Cloud. Today a runaway loop or abuser would be invisible until the bill arrives.
   Vercel Pro spend management covers hosting only, not the AI vendors.
3. **Cap the tool loop blast radius.** Text chat allows `MAX_TOOL_ITERATIONS = 4`; voice is
   capped at 2. Confirm a single turn can't fan out to many paid calls.
4. After the summit, if traffic is low, **down-tier**: the System Bypass / Pro requirement is
   moot now that voice uses the `*.vercel.app` alias (not the bypass header) — revisit.

---

## 5. Reliability & observability

- **No CI gate.** Pushes to `main` deploy straight to production with no automated
  lint/test/typecheck. A syntax error or broken import only surfaces in the Vercel build.
  **Add a minimal GitHub Action** (install → `node --check` or `next build` → run the one
  test) on PRs. (P1)
- **No structured error monitoring.** Errors go to `console.error` → Vercel logs only. No
  Sentry/alerting; a production error during the event would be noticed only by manually
  tailing logs. Consider a lightweight error reporter for summit week. (P1)
- **DB/function region.** Earlier diagnostics showed compute in `iad1` (US East). If Supabase
  is EU-hosted, every DB round-trip is transatlantic (~100ms). Confirm co-location; for an
  EU event, EU function region + EU DB would shave latency. (P2)
- **Good:** soft-fail design means one provider outage degrades rather than breaks the app.

---

## 6. Performance / optimization

Most of the wins are already done this cycle (streaming, prompt-cache split, Haiku decision
pass, compact voice programme). Remaining opportunities:

- **Trim the text-chat system prompt.** The persona + constitutional + Normies sections are
  large; cached now, but they still cost on cold cache and can dilute instruction-following.
  Consider making the deep Normies lore retrievable rather than always-resident. (P2)
- **Cache query embeddings.** Each `searchKnowledge` embeds the query via a Voyage round-trip
  (~100–300ms). Common queries could be memoised. (P2)
- **`embeddings.json` bundle size.** 176 vectors × 1024 floats ship in the function payload and
  load into memory on cold start. Fine at this scale; revisit if the KB grows 10×. (P2)
- **Voice latency** is now ~1.4s (direct) / ~5–7s (lookup). Lookups are bounded by sequential
  tool + model calls — largely irreducible without parallel speculative tool calls. Good enough.

---

## 7. Testing

- **One test exists:** `tests/itinerary-builder.test.js`. Everything else is untested.
- The highest-value additions: unit tests for `lib/apis/perplexity.js` (mock fetch: success,
  401, 5xx, malformed), `lib/tools.js` dispatch, `lib/session.js` sign/unpack, and the
  `findEvents` curated-merge + dedup logic. (P1)
- No test for the SSE streaming routes (hard to unit test; an integration smoke test against a
  preview deploy would be more valuable than mocks here).

---

## 8. Feature / utility suggestions

Prioritised by visitor value vs. effort. (Several are explicitly out of V1 scope per CLAUDE.md
§14 — listed anyway as candidates.)

**High value:**
- **Map view of the itinerary.** A travel concierge that never shows a map is a gap. Plot the
  day's venues (coords already exist on catalog entries + Places results). Even static
  Google/Mapbox thumbnails per day would help.
- **Directions deep-links.** "Get directions" → Google/Apple Maps URL from venue coords. Cheap,
  high utility on the ground.
- **PWA / offline.** Visitors roam with spotty data. Make it installable and cache the latest
  itinerary for offline viewing. Low effort, big perceived quality.
- **Voice can't build an itinerary.** Voice turns skip profile extraction, so a voice-only user
  never triggers itinerary generation. Add extraction to the voice path (known gap).

**Medium value:**
- **Venue cards with images** instead of plain text (Places returns photo refs).
- **Budget/cost estimate** for the generated itinerary.
- **"What's on now / next today"** quick view during the event (no push — just on-demand).
- **Save / favourite venues** across the trip.
- **Currency, tipping, transit-ticket, etiquette** quick-reference card for first-timers.

**Lower / post-summit:**
- Group/companion sharing of the live plan (not just the read-only itinerary).
- Feedback thumbs on recommendations (explicitly out of V1).

---

## 9. Data freshness & multi-event (white-label)

- **Luma data is a manual snapshot.** `programme.json.sideEvents` is hand-synced; we found and
  filled gaps today. There's no automated sync, so it drifts. A small scheduled re-scrape of
  `lu.ma/nfcsummit` → `sideEvents` would keep it current (post-summit).
- **Heavy single-event hardcoding.** Dates, venue, programme, day-of-week, and persona are
  baked into prompts/data. Correct for this event, but the white-label vision needs the
  per-event config extracted into one place. The procedure is already documented
  ([feedback_event_config], `docs/post-summit-roadmap.md`) — the code refactor is the work.
- **Stale docs.** `docs/service-consolidation.md` wrongly claims the itinerary builder uses
  Tripadvisor ratings as a scoring signal (it has zero references). The Perplexity migration
  doc references an old PR structure. Clean these up.

---

## 10. Privacy / compliance (EU event)

- Sessions are anonymous (good), but **trip profiles persist indefinitely** and can include
  **dietary and mobility needs** — under GDPR, health/mobility data is potentially
  special-category. For an EU event there is currently no privacy notice, retention policy, or
  deletion mechanism. (P1 for a commercial/white-label product; lower for a one-off demo.)
  Minimum: a short privacy note + a data-retention/auto-purge job (e.g. delete sessions older
  than N days).

---

## 11. Prioritised action list

**P0 — before / during summit**
- Add rate limiting to the paid endpoints (S1). Coarse IP+session limit is enough.
- Set spend alerts on Anthropic, Perplexity, ElevenLabs, Google.

**P1 — shortly after**
- Lock down or delete the orphaned `/api/voice/{speak,transcribe}` endpoints (S3) and the
  voice LLM webhook auth (S2).
- Add a minimal CI gate (build + the one test) on PRs.
- Lightweight error monitoring for the event window.
- Add the highest-value unit tests (perplexity, session, findEvents merge).
- Decide GDPR posture (retention + deletion) if this goes commercial.

**P2 — post-summit / white-label**
- Map view + directions deep-links + PWA.
- Voice-path profile extraction so voice users get itineraries.
- Tripadvisor → Google Places consolidation (see deferred plan), prompt trimming, embedding
  cache, doc cleanups, automated Luma sync, per-event config extraction.

---

_End of review._
