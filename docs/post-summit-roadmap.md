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

---

## Suggested Build Order (Post-Summit)

1. **Debrief NFC Summit 2026** — collect real usage, identify what visitors actually asked, what broke, what worked
2. **Phase 1** — Extract event config (no new features, just architectural cleanup)
3. **Phase 2** — Multi-tenancy (database + routing)
4. **Phase 3** — Sponsor layer management
5. **Phase 4** — Event organiser onboarding (MVP: manual setup via JSON/API, no UI)
6. **Phase 5** — Self-serve organiser UI
7. **City-agnostic catalog** — evaluate after first non-Lisbon event

---

## Immediate Pre-Summit Priorities (Before June 4)

These are not platform features — they are polish on the current Gemel deployment:

1. **Perplexity migration** — replace SearchApi.io with Perplexity Sonar (see `docs/perplexity-migration-status.md`)
2. **Knowledge base review** — verify restaurant, gallery, and landmark data is current and accurate
3. **End-to-end visitor flow test** — full onboarding → itinerary → export run-through
4. **Load check** — serverless functions should handle summit-week traffic spikes on Vercel free tier

---

_End of post-summit roadmap._
