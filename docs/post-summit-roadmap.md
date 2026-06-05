# Post-Summit Roadmap — Gemel as a White-Label Platform

_NFC Summit 2026 is the proof of concept. This document captures the commercial vision and implementation plan for what comes after._

---

## The Vision

Turn Gemel into a **white-label AI event concierge platform** that event organisers can license and deploy under their own branding for their own events.

An event organiser signs up, configures their event details, uploads their sponsor information, and gets a branded concierge — the same technology that ran at NFC Summit 2026, dressed in their colours and speaking their event's language.

**Why this is differentiated from existing products:**  
Current event concierge tools (Agent Analog, RSVPify, AI-Concierge) focus on logistics — photo delivery, networking, check-in. Nobody is doing deep travel planning, personalised multi-day itineraries, voice interaction, and a sponsor information hierarchy in a single product. That combination is the moat.

**Business models to evaluate:**
- Per-event license fee (flat rate per event deployment)
- Subscription (monthly/annual, covers N active events)
- Revenue share on sponsor layer bookings (longer-term)

---

## Information Hierarchy — The Core Design Concept

Every deployment of the platform serves three layers of information in priority order:

```
┌─────────────────────────────────────────────────┐
│  LAYER 1 — Sponsored content (highest priority) │
│  Event sponsors, disclosed transparently        │
├─────────────────────────────────────────────────┤
│  LAYER 2 — Event-specific content               │
│  Schedule, sessions, venue, speakers,           │
│  side-events, organiser-curated picks           │
├─────────────────────────────────────────────────┤
│  LAYER 3 — City / local discovery               │
│  Google Places, TripAdvisor, weather,           │
│  web search — the live world                    │
└─────────────────────────────────────────────────┘
```

**Layer 1 — Sponsored content:**
- Sponsors pay the event organiser; the organiser configures which sponsors appear and how
- Disclosure is mandatory and always explicit — the visitor knows upfront that sponsor information is prioritised
- Example: _"This event is sponsored by [Brand]. When I recommend a coffee spot, I'll mention their pop-up first — but I'll always be upfront about it."_
- Gemel's current system prompt already has the seed of this: sponsored venues are disclosed on first mention and recommended on merit

**Layer 2 — Event content:**
- Supplied by the organiser: schedule, sessions, venue map, speakers, NFC-style side-events
- Can be provided as JSON upload, CSV, or via an event platform API (Luma, Eventbrite, custom)
- This is the equivalent of the current `data/nfc-summit/programme.json`

**Layer 3 — City discovery:**
- The existing live API stack (Google Places, TripAdvisor, weather, web search) already covers this
- Needs to become city-agnostic — configurable to any city, not hardcoded to Lisbon

---

## What Needs to Be Built

### Phase 1 — Extract hardcoded config

Everything currently hardcoded for NFC Summit 2026 needs to move into a per-event config object.

**Hardcoded things to extract:**
- Event name, dates, venue name, venue address, venue neighbourhood, venue coordinates
- City name and country
- Agent persona name and identity (currently Gemel / Normie #6832 — future deployments would have their own persona or a generic one)
- The `data/nfc-summit/programme.json` → becomes a generic event programme schema
- The `data/lisbon/` catalog → becomes a city-agnostic catalog tied to a config `city` field
- System prompt references to "Lisbon", "NFC Summit", "Unicorn Factory" → injected from config at runtime

**Target shape of an event config object:**
```json
{
  "eventId": "nfc-summit-2026",
  "eventName": "NFC Summit 2026",
  "dates": { "start": "2026-06-04", "end": "2026-06-06" },
  "venue": {
    "name": "Unicorn Factory Lisboa",
    "address": "...",
    "neighbourhood": "Alcântara",
    "coordinates": { "lat": 38.701, "lng": -9.177 }
  },
  "city": "Lisbon",
  "country": "Portugal",
  "agentName": "Gemel",
  "agentPersona": "normie-6832",
  "branding": {
    "primaryColor": "#d9ff00",
    "logoUrl": "..."
  },
  "sponsors": [...],
  "programme": [...]
}
```

### Phase 2 — Multi-tenancy in the database

Add an `events` table and an `organisations` table. Session and itinerary records gain an `eventId` foreign key so all data is scoped per event deployment.

**New tables:**
```
organisations { id, name, contactEmail, plan, createdAt }
events { id, orgId, config (jsonb), status, createdAt }
sessions { ..., eventId (FK) }   ← add eventId column
```

**Routing:** Each event gets its own subdomain or slug:
- `nfc-summit.normieagent.com` — current event
- `[event-slug].normieagent.com` — future deployments
- Or a custom domain per organiser pointing to the platform

### Phase 3 — Sponsor layer management

A simple admin interface (or API endpoint) for organisers to:
- Add/remove sponsors with name, description, and optional venue/deal details
- Set sponsor priority order
- Preview how sponsor disclosures appear in the chat

The system prompt generation should include a dynamically-built sponsor block when sponsors are configured.

### Phase 4 — Event organiser onboarding

A self-serve flow for new organisers:
1. Create account and event
2. Enter event details (dates, venue, city)
3. Upload event programme (CSV or JSON, or connect Luma/Eventbrite)
4. Configure sponsors (optional)
5. Choose branding (logo, colour)
6. Get a preview URL
7. Publish

### Phase 5 — City-agnostic knowledge base

Currently the knowledge base is Lisbon-specific (hardcoded JSON in `data/lisbon/`).  
Two options:

**Option A — Dynamic only:** Drop the curated catalog entirely. For non-Lisbon cities rely fully on Google Places + TripAdvisor. Fast to ship, lower quality for lesser-known cities.

**Option B — Seeded per city:** Keep the concept of a curated catalog but make it per-city and seeded on first deployment. A script pulls top venues from Google Places for the event city, generates embeddings, and commits them. Quality varies by city coverage in Places.

Recommended: **Option A first**, revisit Option B once demand proves the model.

### Phase 6 — Location- & language-aware live news (config-driven)

For time-sensitive local questions (transport strikes, closures, weather warnings, airport
issues) the freshest and most accurate coverage is the **local-language press** and the
**official operators**, not international/English outlets — which lag. NFC Summit 2026 proved this
live: during the 3 June Lisbon transport strike, web search initially surfaced only English
aggregators (or came back empty), so a steer was added to prioritise Portuguese sources and
operators.

That steer currently lives as **hardcoded constants** and must become per-event config:

- `lib/apis/perplexity.js` — `LANGUAGE_STEER` (hardcoded `pt`) and `scopeQuery()` (hardcoded
  `"Lisbon"` append).
- `lib/tools.js` `execSearchWeb` — `LOCAL_NEWS_HINT` (hardcoded list of PT outlets + Lisbon
  operators) and the bilingual query nudge ("notícias de hoje").
- `lib/prompts/system.js` — the search-rule line naming the PT outlets/operators.

**Target: read these from `events.config` instead of constants.** New config fields:
```jsonc
{
  "location": {
    "city": "Lisbon",
    "country": "PT",
    "timezone": "Europe/Lisbon",
    "coordinates": { "lat": 38.72, "lng": -9.14 },  // "near venue" scoping
    "scopeTerm": "Lisbon"                            // replaces scopeQuery()'s hardcoded append
  },
  "newsLocale": "pt",                                // → askPerplexity language steer + nudge wording
  "localNewsSources":  ["CNN Portugal", "SIC Notícias", "Público", "Observador", "RTP", "Lusa"],
  "officialOperators": ["Metro de Lisboa", "Carris", "CP", "ANA / Aeroportos"]
}
```

`execSearchWeb` builds the `systemHint` + bilingual nudge from these at runtime; `askPerplexity`
takes `language`/`scopeTerm` from config. Result: a Barcelona event steers to La Vanguardia / El
Periódico / TMB in Spanish, a Berlin event to rbb24 / BVG in German — **no code change, only
config**.

**Admin UI:** a small "Location & news" section in the event editor — city/country/timezone/
coordinates, a primary news language, and two editable chip-lists (news outlets, official
operators). Slots in beside the sponsors/announcements editors already on `feature/admin-panel`.

This is the logical companion to Phase 1 (config extraction) and the sponsor/announcement config,
and squarely in the white-label direction.

### Phase 7 — Per-event data retention & purge (privacy by design)

Events are time-boxed, so visitor data shouldn't live forever. Let each event define a **retention
cut-off**: after a set date, all stored PII for that event is deleted and the session cookies stop
mattering. This is GDPR storage-limitation compliance and a real selling point — pairs with the
ElevenLabs **Zero-Retention** toggle (their side) for a complete retention story.

**The schema already makes the purge clean (verified):**
- PII tables — `trip_profiles`, `conversations`, `itineraries`, `recommendations` — all
  `onDelete: cascade` from `sessions`. So **purge = delete the session rows**; PII cascades away.
- `usage_events.session_id` is `onDelete: set null` (not cascade), so deleting sessions
  **preserves the cost/usage dashboard** — analytics survive, just anonymised. Ideal split:
  delete PII, keep aggregate billing data.
- `events.config` (jsonb) is the natural home for retention settings; `sessions.event_id` scopes
  the purge per event.

**Design:**
- **Config in `events.config`:** `retention: { purgeAfterEventDays: 14, purgeAt:
  'YYYY-MM-DD' (computed from event end, admin-overridable), lastPurgedAt }`. Default event-end
  + 14 days (lets attendees return/export their itinerary); overridable down to ~7.
- **Manual date, automatic enforcement:** admin sets/overrides the date; a **Vercel Cron** (no
  `vercel.json` cron exists yet — would be added) hits a purge route daily that, for each event
  past `purgeAt`, deletes expired sessions (cascade wipes PII) and leaves `usage_events`
  anonymised. Add a **"Purge now"** override and a **dry-run count** in admin.
- **Cookies, two layers:** (1) shorten the session cookie's 90-day `COOKIE_MAX_AGE`
  (`lib/session.js`) to the event window for event deployments so it self-expires; (2) once the
  session row is deleted, any lingering cookie points at nothing and is treated as a new visitor.
- **Idempotent + logged:** each purge records counts + timestamp as audit evidence; safe to re-run.
- **Publish it:** when shipped, add a retention line to the Disclaimer ("conversation data deleted
  N days after the event; only anonymised usage stats retained"). Note: this also invalidates
  public itinerary **share links** (expected).

Admin UI: a "Privacy & retention" section in the event editor — the cut-off date, a dry-run
preview, and a "Purge now" button. Supersedes the earlier vague "GDPR retention" backlog note.

---

## What Already Works Toward This Vision

| Component | Status | Notes |
|-----------|--------|-------|
| Three-layer information architecture | Partial | Layer 2 + 3 implemented; Layer 1 (sponsors) is a manual config in system prompt, not dynamic |
| Sponsored venue disclosure | Partial | System prompt instructs disclosure on first mention |
| Live city discovery (Layer 3) | ✅ | Google Places, TripAdvisor, weather, web search all working |
| Event programme as structured data | ✅ | Pattern exists in `data/nfc-summit/programme.json` |
| Voice interface | ✅ | ElevenLabs TTS + STT |
| Multi-language support | ✅ | EN, PT, ES, FR, DE — useful for international events |
| Session persistence | ✅ | Anonymous sessions, returning visitor support |
| Export formats | ✅ | PDF, Markdown, ICS, shareable link |
| Multi-tenancy | ❌ | Not built — all hardcoded to NFC Summit 2026 |
| Event organiser onboarding | ❌ | Not built |
| Dynamic sponsor layer | ❌ | Not built |
| White-label theming | ❌ | Not built — colours/fonts hardcoded |
| City-agnostic catalog | ❌ | Lisbon-specific JSON files |
| Location-/language-aware live news | Partial | Time-sensitive search steers to PT sources + operators, but hardcoded — needs to move to `events.config` (Phase 6) |
| Per-event data retention & purge | ❌ | Not built — schema is purge-ready (PII cascades from `sessions`; `usage_events` survives anonymised). Admin cut-off date + cron purge (Phase 7) |

---

## Suggested Build Order (Post-Summit)

1. **Debrief NFC Summit 2026** — collect real usage, identify what visitors actually asked, what broke, what worked
2. **Phase 1** — Extract event config (no new features, just architectural cleanup)
   - Fold in **Phase 6** (location-/language-aware live news) here — it's the same config-extraction work applied to the search steer
3. **Phase 2** — Multi-tenancy (database + routing)
4. **Phase 3** — Sponsor layer management
5. **Phase 4** — Event organiser onboarding (MVP: manual setup via JSON/API, no UI)
6. **Phase 5** — Self-serve organiser UI
7. **City-agnostic catalog** — evaluate after first non-Lisbon event
8. **Phase 7** — Per-event data retention & purge (can land early alongside Phase 2 multi-tenancy; the purge mechanism is mostly schema-ready today)

---

## Immediate Pre-Summit Priorities (Before June 4)

These are not platform features — they are polish on the current Gemel deployment:

1. **Perplexity migration** — replace SearchApi.io with Perplexity Sonar (see `docs/perplexity-migration-status.md`)
2. **Knowledge base review** — verify restaurant, gallery, and landmark data is current and accurate
3. **End-to-end visitor flow test** — full onboarding → itinerary → export run-through
4. **Load check** — serverless functions should handle summit-week traffic spikes on Vercel free tier

---

## Event Configuration Checklist

Every time Gemel is deployed for a new event, the following must be done **in order**. Skipping any step will cause Gemel to give wrong information — wrong venue, wrong days, wrong schedule.

This checklist applies now (NFC Summit 2026) and to every future event deployment until the platform has a proper self-serve onboarding UI.

---

### Step 1 — Update the system prompt (`lib/prompts/system.js`)

**Why:** The system prompt has hardcoded facts about the event that the LLM reads directly. If these are wrong or missing, Gemel fabricates answers from training data (e.g. getting the day of the week wrong).

**What to update:**

1. **`AGENT_IDENTITY`** — change the event name, venue name, neighbourhood, and date range in the opening paragraph.

2. **`NFC_CALENDAR` (or equivalent block)** — replace with the new event's date-to-day-of-week mapping. **This is critical.** LLMs cannot reliably compute day-of-week for future dates. The calendar block must be explicit:
   ```
   Tuesday   2 October 2026  — day before event (common arrival)
   Wednesday 3 October 2026  — Event Day 1
   Thursday  4 October 2026  — Event Day 2
   ...
   ```
   Always verify the day-of-week independently (use a calendar tool, not Claude) before writing this block.

3. **`ONBOARDING_FLOW`** — update the list of event days visitors can attend (e.g. "subset of 4, 5, 6 June 2026" becomes the new event dates).

4. **`ITINERARY_RULES`** — update any references to specific neighbourhoods, the Summit venue, or summit-specific activities.

---

### Step 2 — Update the programme file (`data/nfc-summit/programme.json`)

**Why:** This is Gemel's ground-truth source for the event schedule and side events. The itinerary builder, knowledge base, and retrieval system all read from it.

**What to update:**

1. **`event` object** — new event name, venue name, correct address (verify on Google Maps — don't copy from a previous event), neighbourhood, GPS coordinates, start/end dates, and URL.

2. **`days` array** — one entry per event day with date, `dayOfWeek` label, themes, and door times.

3. **`sideEvents` array** — scrape the event's Luma calendar and any other event listing pages. For each side event capture: id, name, dates, timeStart/timeEnd, venue, address, organiser, type, description, lumaUrl. Tips:
   - Luma calendar pages only show ~20 events via WebFetch (JavaScript rendering). You need the direct Luma URLs for events beyond that — ask the organiser.
   - Fetch each event's individual page for exact date/time (the calendar page doesn't show them reliably).
   - Events with unknown dates: add them with a `note` field and the best estimate; update when confirmed.

---

### Step 3 — Update the city knowledge base (`data/[city]/`)

**Why:** The Lisbon venue files are Lisbon-specific. A new city needs its own curated files.

**What to do:**

1. Create `data/[city]/` with the same file structure: `restaurants.json`, `galleries.json`, `landmarks.json`, `nightlife.json`, `neighbourhoods.json`, `day-trips.json`.
2. Each entry must follow the standard shape (id, type, name, description, address, neighbourhood, coordinates, priceRange, openingHours, tags, nfcRelevant).
3. Update `lib/static-catalog.js` imports to point to the new city files.
4. For the first deployment in a new city, start with ~10–15 entries per category. Quality matters more than quantity — every entry Gemel cites reflects on the product.

---

### Step 4 — Regenerate embeddings

**Why:** The knowledge base uses pre-computed vector embeddings stored in `data/embeddings.json`. Any change to the data files — adding venues, updating descriptions, changing tags — makes the embeddings stale.

**Command:**
```bash
npm run seed:kb
```

This calls `scripts/seed-knowledge-base.js`, which reads all data files, calls the Voyage AI API to generate embeddings, and writes `data/embeddings.json`.

**Rules:**
- Run this **after every data change**, no exceptions.
- The output shows how many entries were embedded — verify the count looks right.
- Commit `data/embeddings.json` to the repo alongside the data changes. They must stay in sync.
- `VOYAGE_API_KEY` must be set in `.env.local`.

---

### Step 5 — Update environment variables (Vercel)

**Why:** The deployed function reads secrets from Vercel environment variables. A new event may use a different API key, domain, or model.

**What to check:**
- `NEXT_PUBLIC_APP_URL` — update to the new deployment URL or custom domain.
- `SESSION_SECRET` — rotate for each new event deployment.
- Any new API keys specific to the event organiser (e.g. a different ElevenLabs voice).

---

### Step 6 — Smoke-test before go-live

Run through the full visitor flow end-to-end before the event opens:

1. Open the app as a new visitor (incognito window).
2. Complete the onboarding — confirm the event dates and day names are correct.
3. Confirm the itinerary is generated and the panel opens.
4. Ask Gemel "what's happening on [Day 1 date]?" — verify she names the correct day of the week.
5. Ask about a specific side event — verify she has the correct time and venue.
6. Export the itinerary as PDF, ICS, and Markdown — verify all three download correctly.
7. Test voice input and output if ElevenLabs is configured.

---

### Lessons from NFC Summit 2026 (avoid repeating these)

| Issue | Root cause | Fix |
|-------|-----------|-----|
| Gemel named wrong day of week (e.g. "June 3 is a Tuesday") | LLM computing dates from training data | Always inject explicit `NFC_CALENDAR` block — never trust the model to compute day-of-week |
| Venue listed as Alcântara instead of Beato | Incorrect address in `programme.json` and system prompt | Verify venue address on Google Maps independently; don't copy from memory or prior docs |
| Side events missing (Normies Brunch, 10 others) | Luma calendar page only renders ~20 events via static fetch | Obtain direct Luma URLs from the organiser for all events; individual event pages have accurate dates/times |
| Itinerary panel never appeared | `readyToGenerate` required explicit user confirmation phrase Gemel wasn't triggering | Changed trigger to fire automatically when profile is complete and session is not yet active |
| TTS spelling out URLs and hash fragments | Raw markdown sent to ElevenLabs | Always run text through `cleanTextForSpeech()` before TTS |

---

_End of post-summit roadmap._
