# Service Providers — Gemel NFC Summit 2026

_Last updated: 2026-05-30_

Complete inventory of external services this app depends on, with current plan/cost, purpose, and where it's configured. Use this as the single source of truth when reviewing spend or onboarding the project to a new owner.

---

## At a glance

| # | Service | Category | Current plan | Monthly cost | Required? |
|---|---|---|---|---|---|
| 1 | **Vercel** | Hosting + serverless | Hobby | $0 | ✅ Yes |
| 2 | **Supabase** | Postgres database | Free | $0 | ✅ Yes |
| 3 | **Anthropic** | LLM (Claude) | Pay-as-you-go | ~$5–15 est. | ✅ Yes |
| 4 | **Voyage AI** | Embeddings | Free tier | $0 | ✅ Yes |
| 5 | **ElevenLabs** | TTS + STT + Conv AI | Starter | $6 | ✅ Yes (voice) |
| 6 | **Google Cloud** | Maps + Places APIs | Free credits | $0 (under quota) | ⚠️ Optional |
| 7 | **OpenWeatherMap** | Weather forecast | Free | $0 | ⚠️ Optional |
| 8 | **SearchApi.io** | Tripadvisor + web search | Paid tier | ~$40 | ⚠️ Pending replacement |
| 9 | **Perplexity** | Web search (planned) | Pay-as-you-go | ~$3–10 est. | ⚠️ Future |
| 10 | **GitHub** | Source hosting | Free | $0 | ✅ Yes |
| 11 | **Domain registrar** | normieagent.com | Annual | ~$1/mo | ✅ Yes |
| 12 | **api.normies.art** | NFT metadata | Public | $0 | ⚠️ Optional |
| 13 | **Lu.ma / Eventbrite** | Event scraping | Public | $0 | ⚠️ Optional |

**Estimated current monthly total: ~$50–70**  
**Mostly variable** — concentrated in SearchApi.io ($40) and ElevenLabs voice minutes during the summit.

---

## 1. Vercel — Hosting + Serverless Functions

- **What we use it for:** Hosting `normieagent.com`, Next.js build pipeline, serverless functions (every `/api/*` route), edge functions, Vercel Analytics, project-level firewall, MCP server access.
- **Plan:** Hobby ($0)
- **Account:** heymangonzo@... (team `heymangonzos-projects`)
- **Project ID:** `prj_0ppG3EQnlXdrc4fdrl5h8KX73Bq2`
- **Domains:** normieagent.com, www.normieagent.com, + Vercel-issued URLs
- **Hobby plan limits hit:**
  - ❌ Can't add System Bypass IPs (Pro-only — blocks ElevenLabs voice conversation webhook calls)
  - ❌ Deployment Protection Exceptions (Pro $150/mo)
  - 100 GB-hours of compute per month (not yet hit)
- **Pro upgrade:** $20/mo — needed if voice conversation mode is required
- **Where configured:** Vercel Dashboard, no env vars on our side
- **Notes:** Recent issue — Vercel's auto firewall (ANOMALY_SCORE_EXCEEDED) blocks ElevenLabs server-to-server POSTs without a System Bypass IP rule

---

## 2. Supabase — Postgres Database

- **What we use it for:** Sessions, trip profiles, conversation history, itineraries (jsonb), recommendations
- **Plan:** Free tier (assumed)
- **Free tier limits:** 500 MB database, 2 GB egress/month, 50k monthly active users, pauses after 7 days inactivity
- **Connection:** Transaction pooler on port 6543 (required for Vercel serverless)
- **Env var:** `DATABASE_URL`
- **Driver:** `postgres` (npm) via Drizzle ORM
- **ORM:** Drizzle ORM (`drizzle-orm` + `drizzle-kit`)
- **Schema location:** `drizzle/schema.js`
- **Migration commands:** `npm run db:generate`, `db:migrate`, `db:push`
- **Risks:**
  - Database pauses if no requests for 7 days — fine during pre/post-summit
  - Connection limits on free tier can throttle traffic spikes during summit
- **Upgrade path:** Supabase Pro $25/mo (2 GB DB, no pause, more connections)

---

## 3. Anthropic — Claude (LLM)

- **What we use it for:**
  - Main chat agent (`chatTurnWithTools`) — Sonnet 4.5
  - Profile extraction (`extractProfile`) — Haiku 4.5 (faster, cheaper)
  - Streaming final-turn responses (`streamFinalTurn`)
  - Used by the ElevenLabs Conversational AI webhook (every voice turn)
- **Plan:** Pay-as-you-go (Workbench credits)
- **Default model:** `claude-sonnet-4-5` (configurable via `ANTHROPIC_MODEL`)
- **Other usage:**
  - Prompt caching enabled (system prompt cached for 5 min, big cost saver)
- **Env var:** `ANTHROPIC_API_KEY`
- **SDK:** `@anthropic-ai/sdk` v0.97.1
- **Estimated cost per chat session:** $0.02–0.10 with caching
- **Notes:** Includes the company that recently acquired Voyage AI — potential consolidation opportunity (see Consolidation doc)

---

## 4. Voyage AI — Embeddings

- **What we use it for:** Generate 1024-dim vector embeddings for the curated Lisbon catalog + per-query embedding at retrieval time
- **Plan:** Free tier (assumed)
- **Model:** `voyage-3`
- **Used in:**
  - `scripts/seed-knowledge-base.js` (build-time, generates `data/embeddings.json`)
  - `lib/retrieval.js` (runtime, query embedding only)
- **Env var:** `VOYAGE_API_KEY`
- **Free tier:** 200M tokens/month
- **Why this service:** Anthropic-recommended embeddings ("Anthropic-aligned" — Anthropic acquired Voyage AI in 2024)
- **Estimated usage:** Tiny — only one embedding per chat query, no batch operations during a normal session. Far under free tier.

---

## 5. ElevenLabs — TTS + STT + Conversational AI

- **What we use it for:**
  - **TTS** (`/api/voice/speak`): synthesize Gemel's voice (Flash v2.5 model)
  - **STT** (`/api/voice/transcribe`): push-to-talk mic input (Scribe v2)
  - **Conversational AI** (new in PR feature/voice-conversation): real-time voice mode via WebSocket
- **Plan:** Starter ($6/mo)
  - 30,000 character credits
  - 30 min Conversational AI minutes included
  - 75 min total calls (across Starter quotas)
- **Currently used:** 4,842 / 40,000 credits (12%)
- **Env vars:**
  - `ELEVENLABS_API_KEY`
  - `ELEVENLABS_VOICE_ID=qSeXEcewz7tA0Q0qk9fH` (Victoria voice)
  - `ELEVENLABS_MODEL_ID=eleven_flash_v2_5`
  - `ELEVENLABS_STT_MODEL_ID=scribe_v2`
  - `ELEVENLABS_AGENT_ID=agent_5501ksrjcc65eevb542tx1fh2det` (Gemel agent)
- **API key scopes required:** Text-to-Speech (Access), Speech-to-Text (Access), Voices (Read), **ElevenAgents (Write)** for Conversational AI
- **Agent config:** Overrides for System prompt + LLM + Agent language + **Custom LLM extra body** must all be enabled and Published (see `docs/elevenlabs-agent-setup.md`)
- **Per-conversation cost:** ~10 ElevenLabs credits per voice exchange
- **Estimated summit-week cost:** $5–30 above the Starter plan if voice mode is used heavily (~50 visitors × 10 min average)

---

## 6. Google Cloud — Maps + Places APIs

- **What we use it for:**
  - **Distance Matrix API** (`getTravelTime` tool): walking/transit/driving times between Lisbon venues
  - **Places (New) API v1** (`searchPlaces` tool): live venue discovery fallback when curated catalog has no match
- **Plan:** Free tier ($200 monthly credit)
- **Env vars:**
  - `GOOGLE_MAPS_API_KEY` (Distance Matrix)
  - `GOOGLE_PLACES_API_KEY` (Places API)
- **Estimated usage:** Far below free tier (each query <$0.01). Realistic summit-week cost: $0.
- **Notes:**
  - Two separate API keys (Maps vs Places) — could be consolidated to one Google Cloud project with both APIs enabled
  - Tools soft-fail if either key is missing

---

## 7. OpenWeatherMap — Weather Forecast

- **What we use it for:** 5-day Lisbon weather forecast (`getWeather` tool)
- **Plan:** Free
- **Free tier:** 60 calls/minute, 1M calls/month
- **Env var:** `OPENWEATHERMAP_API_KEY`
- **Usage:** ~1 call per chat query that mentions weather. Realistic summit-week usage: <500 calls/day.
- **Notes:**
  - 5-day cap means weather isn't available for visitors arriving before June 1 (5 days out from summit)
  - Tool soft-fails if missing

---

## 8. SearchApi.io — Tripadvisor + Web Search

- **What we use it for:**
  - **Tripadvisor** ratings + venue search (`getTripadvisorRating`, `searchTripadvisor`)
  - **Google web search** for editorial context (`searchWeb`)
  - **Google News** for time-sensitive disruptions (`searchNews`)
  - **Reddit** (via Google) for community sentiment (`searchReddit`)
- **Plan:** Paid tier (~$40/mo fixed cost)
- **Env var:** `SEARCHAPI_KEY`
- **Status:** ⚠️ **Pending replacement** — PR #10 plans to migrate `searchWeb`/`searchNews`/`searchReddit` to Perplexity Sonar. Tripadvisor lookups stay on SearchApi.io for now (no Perplexity equivalent).
- **Notes:** Biggest single fixed cost in the stack. Replacement plan in `docs/perplexity-migration-status.md`.

---

## 9. Perplexity Sonar (planned)

- **What we plan to use it for:** Replace SearchApi.io web/news/Reddit lookups with a single `askPerplexity` tool
- **Plan:** Pay-as-you-go (minimum $50 top-up to start)
- **Estimated cost:** ~$0.006–0.008 per query, ~5,000 queries/month break-even vs SearchApi.io's $40 floor
- **Env var (future):** `PERPLEXITY_API_KEY`
- **Status:** Branch not yet created. Detailed plan in `docs/perplexity-migration-status.md`.

---

## 10. GitHub — Source Hosting

- **What we use it for:** Source code, Vercel deployment integration (push to main = production deploy)
- **Plan:** Free (personal account)
- **Repo:** `HeyManGonzo/NormieTravelParterNFCSummit2026` (private)
- **Notes:** Repo is private — Vercel has GitHub OAuth installed for this account to enable auto-deploy

---

## 11. Domain — normieagent.com

- **Registrar:** Unknown (to be filled in)
- **Cost:** ~$10–15/year (~$1/mo amortized)
- **DNS:** Pointed to Vercel
- **Notes:** Domain ownership and renewal date should be documented in case of hand-off

---

## 12. api.normies.art — Normies NFT Metadata

- **What we use it for:** Look up Normie on-chain traits (`getNormie`), ERC-8004 agent personas (`getNormiePersona`)
- **Plan:** Public API, no auth required
- **Cost:** $0
- **Notes:** Hardcoded base URL `https://api.normies.art` in `lib/apis/normies.js`. Used because the agent persona IS Normie #6832.

---

## 13. Lu.ma + Eventbrite — Event Scraping

- **What we use it for:** Find live side-events in Lisbon during the trip window (`findEvents` tool)
- **Plan:** Public scraping (no API keys)
- **Method:** Parses Luma's `__NEXT_DATA__` and Eventbrite's JSON-LD from public HTML
- **Cost:** $0
- **Risks:** Brittle — both sites can change their HTML structure and silently break the tool. Soft-fails to empty array.

---

## MCP servers (development tooling, not production deps)

These run in the developer's environment, not in the deployed app:

- **Vercel MCP** (`https://mcp.vercel.com`) — read-only access to deployments, logs, project config. OAuth-based. No cost.
- **ElevenLabs MCP** (`uvx elevenlabs-mcp`) — local stdio server with TTS, STT, agent management, conversation history. Uses the same `ELEVENLABS_API_KEY`. No additional cost.

---

## Where to look when reviewing spend

| To check | Go to |
|---|---|
| Vercel function invocations + bandwidth | Vercel → Project → Usage tab |
| Supabase DB size + connections | supabase.com/dashboard/project/<ref>/database |
| Anthropic spend | console.anthropic.com → Settings → Billing |
| Voyage AI usage | dash.voyageai.com → Usage |
| ElevenLabs credits remaining | elevenlabs.io/app/subscription/agents |
| Google Cloud API spend | console.cloud.google.com → Billing |
| OpenWeatherMap usage | home.openweathermap.org → API Keys & statistics |
| SearchApi.io usage | searchapi.io → Dashboard |

---

_For consolidation opportunities and cost-reduction options, see [`service-consolidation.md`](./service-consolidation.md)._
