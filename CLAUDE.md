# CLAUDE.md — NFC Summit 2026 Visitor Agent

This file is the authoritative technical specification for the NFC Summit 2026 Visitor Agent project. Read it fully before generating any code. Every architectural decision, naming convention, data model, and module boundary described here should be respected throughout development.

---

## 1. Project Overview

This is a conversational AI concierge agent built for visitors of NFC Summit 2026, a digital arts event held at Unicorn Factory Lisboa, Lisbon, Portugal, from 4–6 June 2026.

The agent helps visitors plan their stay in Lisbon by:
- Collecting their trip details and personal preferences through a natural conversation
- Generating a personalized day-by-day itinerary that anchors around their NFC Summit attendance
- Recommending restaurants, galleries, bars, landmarks, and city experiences
- Persisting trip memory and itinerary state so users can return at any point during their stay and continue the conversation without losing context
- Exporting the itinerary as a shareable link, PDF, Markdown file, or calendar-compatible format

The product is a mobile-friendly web application deployed on Vercel, with Node.js serverless functions for the backend.

---

## 2. Tech Stack

### Frontend
- **Framework:** Next.js 14 (App Router)
- **Language:** JavaScript (not TypeScript for now — keep it simple)
- **Styling:** Tailwind CSS v4
- **UI components:** Shadcn/ui where helpful, custom components otherwise
- **Fonts:** Loaded via Fontshare CDN — display font + body font pairing
- **Icons:** Lucide React

### Backend
- **Runtime:** Node.js via Next.js API routes / Route Handlers (serverless)
- **LLM:** Anthropic Claude API (claude-3-5-sonnet-20241022 or latest available)
- **Deployment:** Vercel (free tier to start)

### Database
- **Provider:** Vercel Postgres (via @vercel/postgres) or Supabase (preferred if Vercel Postgres has limitations on the free tier)
- **ORM:** Drizzle ORM — lightweight, Vercel-compatible, SQL-first
- **Purpose:** Persist user sessions, trip profiles, conversation history, itinerary state

### Retrieval / Knowledge Layer
- **Vector DB:** Pinecone (free tier) or Chroma (self-hosted via a lightweight Vercel-compatible approach)
- **Embeddings:** OpenAI text-embedding-3-small or Voyage AI (Anthropic-aligned)
- **Purpose:** Semantic search over curated Lisbon knowledge base and NFC event data

### External APIs
- **Maps / travel time:** Google Maps Distance Matrix API or Mapbox API
- **Places / restaurants:** Google Places API (Text Search + Place Details)
- **Events:** Luma API, Eventbrite API
- **Weather:** OpenWeatherMap API
- **Calendar export:** Generate ICS files (no external API needed — use the `ics` npm package)
- **PDF export:** Puppeteer or `@react-pdf/renderer`
- **Markdown export:** Native string generation — no extra library needed

---

## 3. Project Folder Structure

```
nfc-agent/
├── CLAUDE.md                        ← This file
├── .env.local                       ← All API keys and secrets (never commit)
├── .env.example                     ← Template showing required env vars (no values)
├── package.json
├── next.config.js
├── tailwind.config.js
│
├── app/                             ← Next.js App Router
│   ├── layout.js                    ← Root layout, fonts, global styles
│   ├── page.js                      ← Landing / entry point
│   ├── chat/
│   │   └── page.js                  ← Main chat interface
│   ├── itinerary/
│   │   └── [sessionId]/
│   │       └── page.js              ← Shareable itinerary view
│   └── api/
│       ├── chat/
│       │   └── route.js             ← POST — main chat endpoint
│       ├── itinerary/
│       │   ├── route.js             ← GET/POST — fetch or save itinerary
│       │   ├── export/pdf/route.js  ← GET — generate and return PDF
│       │   ├── export/md/route.js   ← GET — return Markdown string
│       │   └── export/ics/route.js  ← GET — return ICS calendar file
│       ├── session/
│       │   └── route.js             ← POST — create or resume session
│       └── recommendations/
│           └── route.js             ← POST — query knowledge base
│
├── components/
│   ├── chat/
│   │   ├── ChatWindow.js            ← Main chat container
│   │   ├── MessageBubble.js         ← Individual message rendering
│   │   ├── InputBar.js              ← User input with send button
│   │   └── TypingIndicator.js       ← Animated typing indicator
│   ├── itinerary/
│   │   ├── ItineraryView.js         ← Full itinerary display
│   │   ├── DayBlock.js              ← One day of the itinerary
│   │   ├── ActivityCard.js          ← A single activity/recommendation
│   │   └── ExportBar.js             ← Export buttons (PDF, MD, ICS, share)
│   └── ui/
│       ├── Button.js
│       ├── Badge.js
│       └── LanguageSwitcher.js
│
├── lib/
│   ├── claude.js                    ← Anthropic client setup and chat function
│   ├── db.js                        ← Database client (Drizzle + Postgres)
│   ├── embeddings.js                ← Embedding generation utility
│   ├── retrieval.js                 ← Query the knowledge base / vector DB
│   ├── itinerary-builder.js         ← Itinerary assembly and scheduling logic
│   ├── export/
│   │   ├── pdf.js                   ← PDF generation
│   │   ├── markdown.js              ← Markdown generation
│   │   └── calendar.js              ← ICS file generation
│   ├── apis/
│   │   ├── maps.js                  ← Google Maps / Mapbox wrapper
│   │   ├── places.js                ← Google Places wrapper
│   │   ├── events.js                ← Luma / Eventbrite wrapper
│   │   └── weather.js               ← OpenWeatherMap wrapper
│   └── prompts/
│       ├── system.js                ← Main system prompt for the agent
│       ├── onboarding.js            ← Preference extraction prompt
│       └── itinerary.js             ← Itinerary generation prompt
│
├── data/
│   ├── nfc-summit/
│   │   └── programme.json           ← NFC Summit 2026 event data (static)
│   └── lisbon/
│       ├── restaurants.json         ← Curated restaurant list with metadata
│       ├── galleries.json           ← Art spaces, digital art venues
│       ├── landmarks.json           ← Viewpoints, monuments, experiences
│       ├── nightlife.json           ← Bars, clubs, fado venues
│       └── neighbourhoods.json      ← Neighbourhood descriptions
│
├── scripts/
│   ├── seed-knowledge-base.js       ← Embed and index all /data files into vector DB
│   └── update-nfc-programme.js      ← Re-index NFC programme data when updated
│
└── drizzle/
    ├── schema.js                    ← Database schema definitions
    └── migrations/                  ← Auto-generated migration files
```

---

## 4. Database Schema

Define these tables in `drizzle/schema.js`.

### sessions
Represents one user visit. A user is identified anonymously by a session ID stored in a cookie.

```js
sessions {
  id            string  PRIMARY KEY   // UUID, generated on creation
  createdAt     timestamp
  updatedAt     timestamp
  language      string  DEFAULT 'en'  // User's chosen language
  status        string  DEFAULT 'onboarding'
                        // onboarding | planning | active | completed
}
```

### trip_profiles
Stores the user's preferences, collected during onboarding.

```js
trip_profiles {
  id            string  PRIMARY KEY
  sessionId     string  FOREIGN KEY → sessions.id
  arrivalDate   date
  departureDate date
  groupType     string  // solo | couple | friends | family
  budgetLevel   string  // budget | midrange | premium
  interests     string[] // art | food | nightlife | architecture | nature | shopping | music
  dietaryNeeds  string  // free text or tags
  mobilityNeeds string  // free text
  nfcDays       string[] // ['2026-06-04', '2026-06-05', '2026-06-06']
  pace          string  // relaxed | balanced | packed
  createdAt     timestamp
  updatedAt     timestamp
}
```

### conversations
Stores chat message history per session.

```js
conversations {
  id            string  PRIMARY KEY
  sessionId     string  FOREIGN KEY → sessions.id
  role          string  // user | assistant
  content       text
  createdAt     timestamp
}
```

### itineraries
Stores the current (and past) itinerary versions for a session.

```js
itineraries {
  id            string  PRIMARY KEY
  sessionId     string  FOREIGN KEY → sessions.id
  version       integer DEFAULT 1   // Increments on each regeneration
  content       jsonb               // Full structured itinerary object
  shareToken    string  UNIQUE      // Random token for public share link
  createdAt     timestamp
  updatedAt     timestamp
}
```

### recommendations
Optional: store individual recommendations surfaced in conversations for quick retrieval.

```js
recommendations {
  id            string  PRIMARY KEY
  sessionId     string  FOREIGN KEY → sessions.id
  itineraryId   string  FOREIGN KEY → itineraries.id
  type          string  // restaurant | gallery | bar | landmark | event
  name          string
  description   text
  address       string
  neighbourhood string
  date          date    // Which day of the itinerary this belongs to
  timeSlot      string  // morning | afternoon | evening
  metadata      jsonb   // Opening hours, price range, coordinates, etc.
  createdAt     timestamp
}
```

---

## 5. Data Models (Application Layer)

### Itinerary Object Structure (stored in `itineraries.content`)

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
          "timeSlot": "morning",
          "activity": {
            "id": "lisbon-alfama-walk",
            "type": "landmark",
            "name": "Alfama neighbourhood walk",
            "description": "...",
            "address": "Alfama, Lisboa",
            "neighbourhood": "Alfama",
            "estimatedDuration": "2 hours",
            "coordinates": { "lat": 38.714, "lng": -9.132 },
            "priceRange": "free",
            "tags": ["walking", "historic", "views"]
          }
        },
        {
          "timeSlot": "afternoon",
          "activity": { ... }
        },
        {
          "timeSlot": "evening",
          "activity": {
            "type": "restaurant",
            "name": "...",
            "backup": { ... }
          }
        }
      ]
    }
  ]
}
```

---

## 6. Core Module Responsibilities

### `lib/claude.js`
- Initializes the Anthropic client using `ANTHROPIC_API_KEY`
- Exports a `chat(messages, systemPrompt, options)` function
- Handles streaming if needed for better UX
- Should never contain business logic — only LLM communication

### `lib/retrieval.js`
- Accepts a query string and filter options (type, neighbourhood, budget, tags)
- Embeds the query and queries the vector database
- Returns a ranked list of matching knowledge base items
- Used by the itinerary builder and by the chat API to enrich responses

### `lib/itinerary-builder.js`
- Accepts a `trip_profile` and a list of `candidates` from retrieval
- Applies scheduling logic: NFC days anchor first, other activities fill around them
- Clusters recommendations by neighbourhood to minimize travel
- Assigns activities to morning, afternoon, and evening blocks
- Returns a complete structured itinerary object (see data model above)
- This is pure logic — no LLM calls here. The LLM narrates; this module schedules.

### `lib/prompts/system.js`
The main system prompt that defines the agent's identity and behavior. It should:
- Establish the agent's name, tone, and purpose
- Explain the NFC Summit context
- Instruct the agent to use retrieved data — not hallucinate venues or facts
- Instruct the agent to use stored trip memory when available
- Define the onboarding question flow
- Instruct the agent to always confirm the user's profile before generating an itinerary

### `app/api/chat/route.js`
The main POST endpoint. On each request it should:
1. Retrieve or create the session from the database
2. Load the user's trip profile and last N conversation messages
3. Load the latest itinerary (if one exists)
4. Build the messages array for Claude, including system prompt and conversation history
5. Call Claude
6. Save the assistant's response to the conversation table
7. If the response includes an updated itinerary, save it to the itineraries table
8. Return the assistant's response and any updated itinerary state

### `app/api/session/route.js`
- POST: Creates a new session or resumes an existing one from a cookie
- Returns session ID and current status (onboarding / planning / active)

---

## 7. Persistent Session and Memory Strategy

Since Vercel serverless functions are stateless, all memory must live in the database.

**On every chat request:**
1. Read session ID from the HTTP-only cookie
2. Load the full trip profile from the database
3. Load the last 20 conversation messages (to keep context window manageable)
4. Load the latest itinerary version summary
5. Inject all of this into the Claude context window as structured context in the system prompt

**Returning user detection:**
- If a session exists and the trip profile is complete, skip onboarding
- If the session exists but the conversation is empty (user cleared browser), greet the user as a returning visitor and offer to continue with their saved plan

**Conversation history management:**
- Keep full history in the database
- Pass only the last 20 messages to Claude per request
- Summarize older messages periodically if needed to reduce token usage

---

## 8. Knowledge Base Setup

All curated data lives in `/data/` as JSON files. Each entry should follow a consistent structure with:
- `id` — unique slug
- `type` — restaurant | gallery | bar | landmark | event
- `name`
- `description` — 2–3 sentences, written in English (translations handled by LLM at runtime)
- `address`
- `neighbourhood`
- `coordinates` — lat/lng
- `priceRange` — free | budget | midrange | premium
- `openingHours` — object with day keys
- `tags` — array of interest tags
- `nfcRelevant` — boolean (true if especially relevant to NFC Summit visitors)

The `scripts/seed-knowledge-base.js` script should:
1. Read all JSON files from `/data/`
2. Generate embeddings for each entry (name + description + tags concatenated)
3. Upsert each entry into the vector database with its metadata
4. Log completion and any errors

Run this script once before launch and again whenever data changes.

---

## 9. Environment Variables

Define all of these in `.env.local`. Add the key names (without values) to `.env.example`.

```
# LLM
ANTHROPIC_API_KEY=

# Database
DATABASE_URL=

# Vector DB
PINECONE_API_KEY=
PINECONE_INDEX_NAME=

# Embeddings
VOYAGE_API_KEY=         # or OPENAI_API_KEY if using OpenAI for embeddings

# External APIs
GOOGLE_MAPS_API_KEY=
GOOGLE_PLACES_API_KEY=
OPENWEATHERMAP_API_KEY=
LUMA_API_KEY=
EVENTBRITE_API_KEY=

# App
NEXT_PUBLIC_APP_URL=    # e.g. https://nfc-agent.vercel.app
SESSION_SECRET=         # Random string for cookie signing
```

---

## 10. Multilingual Support

The application targets English, Portuguese, Spanish, and French at launch. German and Turkish should be included if implementation is straightforward.

**Strategy:**
- The curated data in `/data/` is stored in English only
- The LLM translates and responds in the user's chosen language at runtime
- The UI language is set via a language switcher stored on the session
- The system prompt instructs Claude to respond in `{{ session.language }}` at all times
- Static UI strings should use a simple key-value i18n object per language in `lib/i18n/`

**Language codes to support:**
- `en` — English
- `pt` — Portuguese
- `es` — Spanish
- `fr` — French
- `de` — German
- `tr` — Turkish

---

## 11. Export Implementations

### Shareable link
- On itinerary save, generate a unique `shareToken` (UUID or nanoid)
- Public route: `/itinerary/[shareToken]` — renders the itinerary in read-only view
- No authentication required on the public view

### PDF export
- Use `@react-pdf/renderer` to render the itinerary as a styled PDF
- Endpoint: `GET /api/itinerary/export/pdf?sessionId=xxx`
- Returns a downloadable PDF file

### Markdown export
- Build a plain Markdown string from the itinerary JSON
- Day-by-day structure with headers, activity names, descriptions, and addresses
- Endpoint: `GET /api/itinerary/export/md?sessionId=xxx`
- Returns a `.md` file download

### Calendar export (ICS)
- Use the `ics` npm package to generate an ICS file
- One calendar event per activity block, with name, description, location, and time
- Endpoint: `GET /api/itinerary/export/ics?sessionId=xxx`
- Returns a downloadable `.ics` file compatible with Google Calendar, Apple Calendar, Outlook

---

## 12. Coding Conventions

- **Language:** JavaScript (ES modules, no TypeScript for now)
- **Module style:** ES module imports (`import/export`)
- **Async:** Always use `async/await`, never `.then()` chains
- **Error handling:** Every API route should have try/catch with meaningful error responses
- **API responses:** Always return JSON with a consistent shape: `{ success: true, data: {...} }` or `{ success: false, error: 'message' }`
- **No inline secrets:** Always read from `process.env`, never hardcode
- **Comments:** Comment the *why*, not the *what*. Keep code self-explanatory
- **File naming:** kebab-case for all files and folders
- **Component naming:** PascalCase for React components
- **Database queries:** Always go through Drizzle ORM — no raw SQL strings unless necessary
- **LLM calls:** Always go through `lib/claude.js` — never call Anthropic directly from route handlers

---

## 13. Build Order

Build the application in this order. Do not skip ahead.

### Step 1 — Project scaffold
- Initialize Next.js 14 project with App Router
- Install and configure Tailwind CSS v4
- Set up `.env.local` and `.env.example`
- Set up Drizzle ORM and connect to the database
- Run initial migration to create all tables from schema

### Step 2 — Session and memory layer
- Build `app/api/session/route.js` — create/resume session
- Build cookie-based session identification
- Verify session persistence in the database

### Step 3 — Knowledge base
- Write the initial JSON data files in `/data/`
- Build `scripts/seed-knowledge-base.js`
- Set up the vector database and run the seeding script
- Build `lib/retrieval.js` and verify search returns relevant results

### Step 4 — Core chat API
- Build `lib/claude.js`
- Write the system prompt in `lib/prompts/system.js`
- Build `app/api/chat/route.js` with session loading, history injection, LLM call, and response saving
- Test with Postman or curl before building any UI

### Step 5 — Onboarding and itinerary generation
- Build `lib/itinerary-builder.js`
- Write the itinerary generation prompt in `lib/prompts/itinerary.js`
- Wire the chat API to detect when a profile is complete and trigger itinerary generation
- Save itinerary to the database and return it with the chat response

### Step 6 — Frontend
- Build the chat UI: `ChatWindow`, `MessageBubble`, `InputBar`, `TypingIndicator`
- Build the itinerary view: `ItineraryView`, `DayBlock`, `ActivityCard`
- Connect frontend to the session and chat API endpoints
- Add the language switcher

### Step 7 — Exports
- Implement shareable link and public itinerary view
- Implement PDF export
- Implement Markdown export
- Implement ICS calendar export
- Build the `ExportBar` component

### Step 8 — External API integrations
- Add weather integration and inject into itinerary context
- Add events integration for current Lisbon events
- Add Google Places for venue enrichment
- Add travel time estimates via Maps API

### Step 9 — Polish and QA
- Test returning user flow end to end
- Test all export formats
- Test all six languages
- Mobile responsiveness check at 375px
- Deploy to Vercel and verify in production

---

## 14. What NOT to Build in V1

The following are explicitly out of scope for this version:

- Social media ingestion or social buzz scoring
- User rating or thumbs-up systems for recommendations
- An admin CMS or editor for non-technical curators
- In-product analytics dashboards
- User authentication or account creation (sessions are anonymous)
- Push notifications or SMS
- Native mobile app

---

## 15. NFC Summit Context (for the Agent's Knowledge)

The agent should be aware of the following:

- NFC Summit 2026 is a digital arts conference held at Unicorn Factory Lisboa
- Event dates: 4–6 June 2026
- The event covers NFTs, digital art, and Web3 culture
- The venue is in the Parque das Nações area of Lisbon
- Attendees are typically artists, collectors, curators, and Web3-native professionals
- The event includes exhibitions, talks, and community side-events

This context should be baked into the system prompt and the NFC-specific data in `/data/nfc-summit/`.

---

*End of CLAUDE.md — Read this file fully before generating any code.*
