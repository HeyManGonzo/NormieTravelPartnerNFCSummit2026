# Service Consolidation Analysis — Gemel

_Last updated: 2026-05-30. Companion to [`service-providers.md`](./service-providers.md)._

The app currently uses 12+ external services across 8+ separate billing accounts. This document evaluates where consolidation would make sense — technically, operationally, or financially — and where it would not.

---

## Summary recommendation

| Action | Effort | Monthly savings | Verdict |
|--------|--------|-----------------|---------|
| **Migrate SearchApi.io → Perplexity** | 2–3 days | ~$30 | ✅ Plan exists (PR #10) — do post-summit |
| **Upgrade Vercel Hobby → Pro for one month** | 5 min | -$20 (cost) | ⚠️ Required for voice mode this week |
| **Drop SearchApi.io Tripadvisor → use Perplexity for everything** | +1 day on top of PR #10 | ~$10 (no Tripadvisor minimums) | ⚠️ Maybe — quality tradeoff |
| **Move embeddings from Voyage AI → Anthropic** | When Anthropic ships native embeddings | $0 now | ⏸️ Wait, not yet available |
| **Move TTS+STT from ElevenLabs → OpenAI** | 1 week | $6 + quality loss | ❌ Not worth it |
| **Move Supabase → Vercel Postgres** | 1 day | -$0 or +$25 (varies) | ❌ Not worth it |
| **Move database egress through Vercel** | None — same tier | $0 | N/A |
| **Consolidate Google Maps + Places to one key** | 30 min | $0 (just operational) | ✅ Easy hygiene win |

**Bottom line:** The summit-week stack is reasonable as-is. Biggest sustainable win is the Perplexity migration (already planned). Avoid premature re-platforming — Vercel/Supabase/Anthropic/ElevenLabs are each best-in-class for their job.

---

## 1. SearchApi.io → Perplexity (HIGHEST PRIORITY)

**Status:** Plan exists in `docs/perplexity-migration-status.md`, code not yet written.

**Why consolidate:**
- SearchApi.io is the biggest fixed cost (~$40/mo floor) in the entire stack
- Three of our four SearchApi.io tools (`searchWeb`, `searchNews`, `searchReddit`) can be replaced with a single Perplexity Sonar call
- Perplexity is pay-as-you-go (~$0.006–0.008/query) — at our volume (<5k queries/mo off-summit, ~5k during summit week), Perplexity wins lifecycle

**What stays on SearchApi.io:** `getTripadvisorRating` + `searchTripadvisor` (Perplexity doesn't have structured Tripadvisor data — see option below)

**Estimated savings:** ~$30/mo average (peak summit week roughly breaks even, off-season big savings)

**Effort:** 2–3 days, plan already written

**Risk:** Sonar occasionally embellishes addresses (documented in the migration plan). Mitigated by a verbatim-only grounding rule in the system prompt.

---

## 2. Drop Tripadvisor too — let Perplexity handle ratings

**Status:** Exploratory.

If we accept that Perplexity Sonar can pull rating context from the web (even without a structured Tripadvisor API), we could drop SearchApi.io entirely and save the remaining floor.

**Tradeoff:**
- ✅ Eliminates the last paid-floor service
- ❌ Loses structured rating data (numerical score, review count) — Sonar returns prose summary
- ❌ Itinerary builder currently uses Tripadvisor ratings as a soft scoring signal in `lib/itinerary-builder.js`
- ⚠️ Could be partially replaced by Google Places ratings (already integrated and free)

**Estimated savings:** Additional ~$10/mo if Tripadvisor calls are infrequent (most plans charge for SearchApi.io as a flat rate regardless)

**Verdict:** Worth evaluating post-summit. If Google Places ratings turn out to be sufficient, drop SearchApi.io completely.

---

## 3. Anthropic native embeddings (future watch)

**Status:** Not yet available.

Anthropic acquired Voyage AI in 2024. Eventually Anthropic will likely ship a native embeddings endpoint, at which point we could consolidate from:
- **Anthropic Claude** (chat + caching) + **Voyage AI** (embeddings) = two accounts

to:
- **Anthropic** (chat + embeddings) = one account, one bill, one auth model

**Estimated savings:** $0 now (Voyage is on free tier), but consolidates billing and reduces dependency count

**Effort:** Trivial when available — swap one API client.

**Verdict:** ⏸️ Wait. Don't proactively move.

---

## 4. ElevenLabs vs OpenAI TTS + STT

**Status:** Not recommended.

OpenAI has TTS (`tts-1-hd`) and STT (`whisper-1`, `gpt-4o-transcribe`) products. Theoretical consolidation:
- Today: ElevenLabs (TTS + STT + Conv AI) + Anthropic (LLM) = two voice/LLM accounts
- Future: OpenAI (TTS + STT) + Anthropic (LLM) = still two accounts

**Tradeoffs:**
- ❌ OpenAI TTS voice quality is below ElevenLabs Flash v2.5 for conversational use
- ❌ OpenAI has no equivalent to ElevenLabs Conversational AI (real-time voice WebSocket with VAD/turn-taking)
- ❌ Would not actually reduce account count
- ✅ Slightly cheaper per character for TTS

**Verdict:** ❌ Not worth it. ElevenLabs is the right choice for the voice features we ship.

---

## 5. Supabase → Vercel Postgres (or stay)

**Status:** Not recommended.

Vercel sells Postgres now (powered by Neon). Theoretical consolidation: hosting + DB on one Vercel bill.

**Tradeoffs:**

| Aspect | Supabase Free | Vercel Postgres Hobby |
|--------|---------------|----------------------|
| Price | $0 | $0 (60 hours/mo) |
| Storage | 500 MB | 256 MB |
| Connections | Pooled, generous | Limited |
| Pauses | After 7 days inactive | Always-on |
| Migration effort | — | 1 day (Drizzle works on both) |
| Drizzle ORM compatible | ✅ | ✅ |

- ❌ Vercel Postgres Hobby has tighter storage limit
- ❌ Migration risk (small but non-zero)
- ✅ One fewer dashboard to check
- ✅ Co-located network with Vercel functions (slightly lower latency)

**Verdict:** ❌ Not worth it. Supabase Free is fine for this app's footprint, and the pause-on-inactivity actually helps when nobody's using the site.

---

## 6. Google Cloud Maps + Places — consolidate to one project (EASY WIN)

**Status:** Trivially doable.

We use two separate Google Cloud API keys:
- `GOOGLE_MAPS_API_KEY` (Distance Matrix)
- `GOOGLE_PLACES_API_KEY` (Places New API)

These can be a single Google Cloud project with both APIs enabled, using a single key.

**Effort:** 30 minutes — create one new key in Google Cloud with both Distance Matrix and Places enabled, update both env var references to point to it.

**Benefit:** Operational hygiene only. One key to rotate, one billing line.

**Code changes:** Could collapse `GOOGLE_MAPS_API_KEY` and `GOOGLE_PLACES_API_KEY` into a single `GOOGLE_API_KEY` env var.

**Verdict:** ✅ Worth doing during the next cleanup pass.

---

## 7. Vercel Hobby vs Pro — required for voice this week

This is not a consolidation question but it's the immediate budget decision.

**Hobby ($0)** problem we hit:
- ❌ Can't add System Bypass IPs → Vercel's auto-firewall blocks ElevenLabs Conversational AI webhook POSTs

**Pro ($20/mo)** unlocks:
- ✅ System Bypass IPs (whitelist ElevenLabs' 6 static egress IPs)
- ✅ Custom firewall rules with full control
- ✅ Higher function limits, more build minutes
- ✅ Spend management controls

**Verdict:** ✅ Upgrade for the summit month, downgrade after if voice mode isn't kept. Single best ~$20 spend in the entire project.

---

## Domain & GitHub — leave alone

These two services are basically free and not consolidatable into the runtime stack. GitHub Free + an annual domain renewal is the minimum any web app needs.

---

## Consolidation order if you want to act on this

1. **NOW (pre-summit):**
   - Upgrade Vercel to Pro ($20) → unlocks voice mode
2. **POST-SUMMIT WEEK 1:**
   - Execute Perplexity migration (PR #10) — saves ~$30/mo
   - Collapse Google Maps + Places to one API key (30 min hygiene win)
3. **POST-SUMMIT MONTH 1:**
   - Evaluate dropping SearchApi.io entirely (Tripadvisor via Perplexity/Places) — saves additional ~$10/mo
   - Decide whether to keep Vercel Pro or downgrade — if commercializing the platform, keep Pro
4. **WATCH (no action yet):**
   - Anthropic native embeddings — swap from Voyage when available
   - Vercel platform improvements (Hobby system bypass) — would let us downgrade back

---

## What we are NOT consolidating, and why

- **ElevenLabs voice services** — already one account doing TTS + STT + Conversational AI. Best-in-class for each.
- **Anthropic + Voyage** — Voyage is Anthropic-owned but separately billed for now. Wait for native consolidation.
- **GitHub** — irreplaceable for source hosting + Vercel integration.
- **Supabase** — has features (Auth, Realtime, Storage) we might want for the post-summit platform. Keep the door open.

---

## Future state vision (if commercializing as white-label platform)

Once the app becomes a multi-tenant white-label product (see `docs/post-summit-roadmap.md`), the stack might look like:

```
Vercel Pro            $20/mo  hosting + functions + firewall
Supabase Pro          $25/mo  larger DB, no pause, more connections
Anthropic             ~$50    LLM at scale
ElevenLabs Creator    $22     more voice minutes
Perplexity            ~$20    web search at scale
Google Cloud          ~$10    Maps + Places, paid tier
─────────────────────────────
Total                 ~$150/mo + per-event variable
```

That's the cost basis for a SaaS that licenses to event organisers. At even $200/mo per event-org client, the stack is profitable from a single customer.

---

_End of consolidation analysis._
