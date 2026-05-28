# Codebase Analysis — Gemel NFC Summit 2026 Concierge

_Generated: 2026-05-27. Based on full read of all source files, CLAUDE.md spec, git log, and docs/._

---

## 1. Project Identity

**Name:** Gemel  
**Persona:** Normie #6832 — an ERC-8004 on-chain agent identity used as the concierge's character  
**Purpose:** Conversational AI concierge helping NFC Summit 2026 visitors plan their Lisbon stay  
**Event:** NFC Summit 2026, Unicorn Factory Lisboa (Alcântara), June 4–6 2026  
**Deployment:** Vercel (serverless), Supabase Postgres, no self-hosted infrastructure  

---

## 2. Tech Stack (as built)

| Layer | Spec | Actual |
|---|---|---|
| Framework | Next.js 14, App Router, JavaScript | ✅ Same |
| Styling | Tailwind CSS v4 | ✅ Same |
| Fonts | Fontshare CDN (Clash Display + Satoshi) | ✅ Same |
| Database | Drizzle ORM + Vercel/Supabase Postgres | ✅ Supabase (free tier) |
| LLM | Anthropic Claude, claude-3-5-sonnet | ✅ `claude-sonnet-4-5` (configurable via `ANTHROPIC_MODEL`) |
| Vector DB | Pinecone or Chroma | ❌ **Dropped** — in-memory cosine over committed embeddings |
| Embeddings | OpenAI or Voyage AI | ✅ Voyage AI (`voyage-3`) |
| Maps | Google Maps Distance Matrix | ✅ Implemented in `lib/apis/maps.js` |
| Places | Google Places API | ✅ New API v1 in `lib/apis/places.js` |
| Weather | OpenWeatherMap | ✅ 5-day forecast in `lib/apis/weather.js` |
| Events | Luma + Eventbrite | ✅ HTTP scraping (no API keys needed) |
| Voice | Not in spec | ✅ **Added** — ElevenLabs TTS + STT |
| Web search | Not in spec | ✅ **Added** — SearchApi.io (migration to Perplexity pending) |
| Exports | PDF, Markdown, ICS, share link | ✅ All four implemented |
| i18n | EN, PT, ES, FR, DE, TR | ✅ Five languages (Turkish omitted) |
| Deployment | Vercel | ✅ Configured |

---

## 3. Directory Structure

```
nfc-agent/
├── app/                          Next.js App Router
│   ├── layout.js                 Root layout, Fontshare CDN, analytics
│   ├── page.js                   Landing page + session resumption
│   ├── globals.css               CSS variables, component-level styles
│   ├── chat/page.js              Main chat interface (use client)
│   ├── itinerary/[shareToken]/   Public read-only itinerary view
│   └── api/
│       ├── chat/route.js         POST — agentic chat loop (240 lines)
│       ├── session/route.js      POST/PATCH/GET — session management
│       ├── itinerary/route.js    GET/POST — generation + narration
│       ├── itinerary/export/     pdf | md | ics route handlers
│       └── voice/                speak | transcribe route handlers
│
├── components/
│   ├── chat/                     ChatWindow, MessageBubble, InputBar,
│   │                             TypingIndicator, MicButton, SpeakerToggle
│   ├── itinerary/                ItineraryView, DayBlock, ActivityCard,
│   │                             ExportBar, ShareExportBar
│   └── ui/                       Button, Badge, LanguageSwitcher
│
├── lib/
│   ├── claude.js                 Anthropic client (chat, chatTurnWithTools)
│   ├── db.js                     Drizzle + Postgres client
│   ├── embeddings.js             Voyage AI API wrapper
│   ├── retrieval.js              In-memory cosine similarity search
│   ├── static-catalog.js         Loads /data JSON into unified shape
│   ├── itinerary-builder.js      Pure scheduling logic (no LLM, 339 lines)
│   ├── profile-extractor.js      Claude zero-temp profile extraction
│   ├── session.js                HMAC-SHA256 signed cookie management
│   ├── tools.js                  12 tool definitions + dispatch (517 lines)
│   ├── nfc-programme.js          NFC Summit schedule loader
│   ├── prompts/                  system.js | itinerary.js | onboarding.js
│   ├── export/                   pdf.js | markdown.js | calendar.js
│   ├── i18n/index.js             UI strings in EN/PT/ES/FR/DE
│   ├── voice/                    client.js | tts.js | stt.js | elevenlabs.js
│   └── apis/                     maps | places | tripadvisor | normies |
│                                 weather | events | search
│
├── drizzle/
│   ├── schema.js                 6 tables (see §5)
│   └── migrations/               0000_cynical_tana_nile.sql
│
├── data/
│   ├── embeddings.json           Committed Voyage v3 vectors (~129 KB)
│   ├── nfc-summit/programme.json Event schedule (June 4–6, static)
│   └── lisbon/                   restaurants | galleries | landmarks |
│                                 nightlife | neighbourhoods | day-trips
│
├── scripts/
│   ├── seed-knowledge-base.js    Generates + commits embeddings.json
│   └── probe-retrieval.js        Manual retrieval smoke test
│
├── tests/
│   └── itinerary-builder.test.js Unit tests for scheduling logic
│
├── docs/
│   ├── codebase-analysis.md      This file
│   └── perplexity-migration-status.md  PR #10 plan (SearchApi.io → Perplexity)
│
└── public/gemel.svg              Pixel art portrait of Normie #6832
```

---

## 4. Data Flow

### Chat request lifecycle

```
Browser POST /api/chat
  │
  ├─ Read session cookie (HMAC-SHA256 verified)
  ├─ Load trip profile from DB
  ├─ Load last 20 conversation messages from DB
  ├─ Load latest itinerary summary from DB
  │
  ├─ Build Claude messages array (system prompt + history + user message)
  │
  ├─ Agentic tool loop (max 4 iterations):
  │   ├─ Call Claude with tool definitions
  │   ├─ If stop_reason == tool_use:
  │   │   ├─ Dispatch all requested tools in parallel
  │   │   └─ Append tool results, loop again
  │   └─ Else: extract assistant text, break
  │
  ├─ Save assistant message to conversations table
  ├─ Run profile extractor (zero-temp Claude call on transcript)
  ├─ If profile changed: update trip_profiles, advance session.status
  ├─ If userConfirmedItinerary == true: trigger itinerary generation
  │
  └─ Return { message, itinerary?, sessionStatus }
```

### Itinerary generation lifecycle

```
POST /api/itinerary (triggered from chat route or directly)
  │
  ├─ Load trip profile
  ├─ Run semantic search for each interest category
  ├─ Call itinerary-builder.js (pure scheduling, no LLM):
  │   ├─ Score candidates (NFC relevance, interest match, budget, dietary)
  │   ├─ Anchor NFC days to Summit venue
  │   ├─ Fill remaining slots (landmark → gallery → restaurant → bar)
  │   ├─ Cluster by neighbourhood to reduce travel
  │   └─ Return structured itinerary JSON
  │
  ├─ Call Claude to narrate (itinerary prompt, adds descriptive prose)
  ├─ Save to itineraries table (versioned, with shareToken)
  │
  └─ Return { itinerary, shareToken }
```

### Knowledge retrieval (no external DB)

```
searchKnowledgeBase(query, filters)
  │
  ├─ static-catalog.js loads all /data/lisbon/*.json + nfc-summit/
  ├─ Load embeddings.json (committed Voyage v3 vectors)
  ├─ Embed query via Voyage AI API (single external call)
  ├─ Float32Array cosine similarity over all catalog vectors
  ├─ Apply filters (type, neighbourhood, priceRange, tags, nfcRelevant)
  └─ Return top-K results (default 8)
```

---

## 5. Database Schema

### sessions
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | Generated on creation |
| createdAt / updatedAt | timestamptz | |
| language | string | en \| pt \| es \| fr \| de |
| status | string | onboarding → planning → active → completed |

### trip_profiles
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| sessionId | FK → sessions | |
| arrivalDate / departureDate | date | |
| groupType | string | solo \| couple \| friends \| family |
| budgetLevel | string | budget \| midrange \| premium |
| interests | text[] | art, food, nightlife, architecture, nature, shopping, music |
| dietaryNeeds / mobilityNeeds | text | Free text |
| nfcDays | text[] | ISO dates within June 4–6 |
| pace | string | relaxed \| balanced \| packed |

### conversations
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| sessionId | FK → sessions | |
| role | string | user \| assistant |
| content | text | |
| createdAt | timestamptz | |

### itineraries
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| sessionId | FK → sessions | |
| version | integer | Increments on regeneration |
| content | jsonb | Full structured itinerary (see §6) |
| shareToken | string UNIQUE | nanoid(24), used in public URL |

### recommendations
Declared in schema, never populated at runtime. Intended as an optional index of surfaced recommendations — skip for now.

---

## 6. Itinerary JSON Structure

```json
{
  "sessionId": "uuid",
  "version": 1,
  "generatedAt": "ISO timestamp",
  "trip": {
    "arrivalDate": "2026-06-04",
    "departureDate": "2026-06-08",
    "durationDays": 4
  },
  "days": [
    {
      "date": "2026-06-04",
      "dayLabel": "Day 1 — Arrival Day",
      "nfcDay": false,
      "blocks": [
        {
          "timeSlot": "morning | afternoon | evening | lunch",
          "activity": {
            "id": "slug",
            "type": "landmark | restaurant | gallery | bar | event",
            "name": "...",
            "description": "...",
            "address": "...",
            "neighbourhood": "...",
            "estimatedDuration": "2 hours",
            "coordinates": { "lat": 38.714, "lng": -9.132 },
            "priceRange": "free | budget | midrange | premium",
            "tags": ["walking", "historic", "views"],
            "backup": { }
          }
        }
      ]
    }
  ]
}
```

---

## 7. Tool Registry

All 12 tools defined in `lib/tools.js`. Called via agentic loop in `app/api/chat/route.js`.

| Tool | Source | Notes |
|------|--------|-------|
| `searchKnowledge` | Curated catalog + committed embeddings | NFC, neighbourhoods, day-trips, sponsored |
| `getWeather` | OpenWeatherMap | 5-day forecast; free tier limit ~5 days out |
| `getTravelTime` | Google Maps Distance Matrix | Walking, transit, driving |
| `getTripadvisorRating` | SearchApi.io | Deterministic rating lookup; 24h cache |
| `searchTripadvisor` | SearchApi.io | Discovery by category |
| `getNormie` | api.normies.art | On-chain NFT metadata |
| `getNormiePersona` | api.normies.art | ERC-8004 agent persona |
| `searchPlaces` | Google Places New API v1 | Primary venue discovery fallback |
| `searchWeb` | SearchApi.io (Google) | Editorial context — **migration target** |
| `searchNews` | SearchApi.io (Google News) | Time-sensitive disruptions — **migration target** |
| `searchReddit` | SearchApi.io (Reddit via Google) | Community sentiment — **migration target** |
| `findEvents` | Luma + Eventbrite scraping | Live side-events; brittle (HTML parsing) |

> `searchWeb`, `searchNews`, `searchReddit` are the three tools being replaced by a single `askPerplexity` tool in PR #10. See `docs/perplexity-migration-status.md`.

---

## 8. Agent Identity & System Prompt

**Identity:** Gemel, Normie #6832. Traits: Human, Female, Middle-Aged, Messy Hair, High Cheekbones, Small Shades, Content Expression, Fedora. Canvas: Untouched (Level 1).

**Rules baked into system prompt:**
- Never acknowledge being an AI/LLM — stay in character always
- No asterisk actions (`*walks over*`)
- Never invent venues or addresses — use tools, declare uncertainty when retrieval fails
- Only state addresses/hours that appear verbatim in tool results (citations over prior knowledge)
- Sponsored venues: disclose on first mention, recommend on merit
- Tool hierarchy: Knowledge → Places → Tripadvisor → Web → Reddit → News
- Scope guardrail: decline general-purpose tasks (math, coding, essays, unrelated news)

**Runtime context injected per request:**
- Today's date (UTC)
- Session language and status
- Trip profile (JSON if collected)
- Itinerary summary (version, dates, activity counts — not full content)

---

## 9. Spec Compliance

| Feature | Status | Notes |
|---------|--------|-------|
| Next.js 14 App Router | ✅ | |
| Tailwind CSS v4 | ✅ | |
| Drizzle ORM + Postgres | ✅ | Supabase |
| Claude API (Sonnet) | ✅ | `claude-sonnet-4-5`, env-configurable |
| Session persistence | ✅ | Signed cookies + DB, 90-day expiry |
| Knowledge base retrieval | ✅ Modified | In-memory cosine, Pinecone dropped |
| Itinerary generation | ✅ | Pure scheduling logic, no LLM calls |
| Profile extraction | ✅ | Zero-temp Claude call per turn |
| PDF export | ✅ | @react-pdf/renderer |
| Markdown export | ✅ | Native string generation |
| ICS calendar export | ✅ | ics npm package |
| Shareable link | ✅ | `/itinerary/[shareToken]` |
| Multilingual (EN/PT/ES/FR/DE) | ✅ | Turkish omitted |
| Google Maps integration | ✅ | getTravelTime tool |
| Google Places integration | ✅ | searchPlaces tool (New API v1) |
| Weather integration | ✅ | getWeather tool |
| Events integration | ✅ | findEvents (scraping) |
| Voice (TTS + STT) | ✅ Bonus | ElevenLabs — not in original spec |
| Web search | ✅ Bonus | SearchApi.io (migration to Perplexity pending) |
| Normies on-chain | ✅ Bonus | getNormie + getNormiePersona |
| Admin CMS | ✅ N/A | Explicitly out of scope (V1) |
| User authentication | ✅ N/A | Anonymous sessions only (per spec) |

---

## 10. Known Gaps & Risks

### Functional gaps
| Gap | Impact | Path to fix |
|-----|--------|-------------|
| Turkish (`tr`) not in i18n | Minor — spec allowed omission | Add i18n strings + update LanguageSwitcher |
| `recommendations` table never populated | Low — optional per spec | Wire to itinerary-builder if surfacing venue index becomes useful |
| Anthropic prompt caching not implemented | API cost higher than necessary | Add `cache_control` breakpoints to system prompt and first few conversation turns |
| Turkish not in ElevenLabs voice config | Low — no TR users yet | Add `tr` to voice/tts.js language map when Turkish i18n is added |

### Operational risks
| Risk | Severity | Notes |
|------|----------|-------|
| Event scraping brittleness | Medium | Luma `__NEXT_DATA__` and Eventbrite JSON-LD could break on deploy changes; failures are silent (empty array returned) |
| Weather forecast horizon | Low | OpenWeatherMap free tier covers ~5 days; visitors arriving before June 1 get no forecast |
| Tool iteration cap (4) | Low | If Claude needs >4 tool calls for a complex query, it returns on the 4th iteration with partial context |
| Embeddings locked at build time | Dev-time | Changes to `/data/*.json` require `npm run seed:kb` + recommit — easy to forget |
| Sonar address hallucinations (post-migration) | Medium | Perplexity occasionally embellishes addresses; mitigated by verbatim-only grounding rule in system prompt |
| No input validation on embeddings.json | Dev-time | Malformed file silently loads partial vectors; add a schema check to seed script |

---

## 11. Pending Work

### PR #9 — `feature/drop-pinecone` (open)
Replaces Pinecone with in-memory cosine over committed embeddings. Likely ready to merge — the implementation is on the current branch.

### PR #10 — `feature/swap-to-perplexity` (not yet branched)
Replaces SearchApi.io (`searchWeb`, `searchNews`, `searchReddit`) with a single `askPerplexity` tool backed by Perplexity Sonar. Detailed plan in `docs/perplexity-migration-status.md`.

**Pre-flight for PR #10:**
1. Load Perplexity credits (direct $50 at perplexity.ai/account/api recommended over OpenRouter)
2. Confirm PR #9 merge status; branch from correct base
3. Check for system prompt conflicts with PR #9

### Backlog (not formally tracked)
- Anthropic prompt caching on system prompt + early conversation turns
- Citation rendering decision (inline in chat vs. itinerary cards only)
- Turkish i18n
- Streaming for voice + Perplexity responses

---

## 12. Environment Variables Required

```
# Core (required)
ANTHROPIC_API_KEY
DATABASE_URL
VOYAGE_API_KEY
SESSION_SECRET
NEXT_PUBLIC_APP_URL

# Voice (required for voice features)
ELEVENLABS_API_KEY

# External APIs (optional — tools degrade gracefully if missing)
GOOGLE_MAPS_API_KEY
GOOGLE_PLACES_API_KEY
OPENWEATHERMAP_API_KEY
SEARCHAPI_KEY                  # Deprecated after PR #10

# Post-PR #10
PERPLEXITY_API_KEY

# Overrides (optional)
ANTHROPIC_MODEL                # Default: claude-sonnet-4-5
VOYAGE_MODEL                   # Default: voyage-3
ELEVENLABS_VOICE_ID            # Default: qSeXEcewz7tA0Q0qk9fH
ELEVENLABS_MODEL_ID            # Default: eleven_flash_v2_5
ELEVENLABS_STT_MODEL_ID        # Default: scribe_v2
```

---

_End of analysis._
