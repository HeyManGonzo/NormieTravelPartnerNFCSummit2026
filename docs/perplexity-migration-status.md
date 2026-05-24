# Perplexity Migration — Status & Next Steps

_Last updated: 2026-05-24_

Resume point for the SearchApi.io → Perplexity Sonar swap. Read top-to-bottom; everything you need to pick this back up cold is in this file.

---

## Where we are

- **PR #8** (`feature/curator-reset`) — open.
- **PR #9** (`feature/drop-pinecone`) — open, stacked on PR #8. Replaces Pinecone with in-memory vector search over the curated knowledge base.
- **PR #10** (`feature/swap-to-perplexity`) — **not yet branched.** This is the next piece of work.

Cost goal of this phase: drop the two fixed monthly floors (Pinecone, SearchApi.io ~$40/mo) and move to pay-as-you-go for everything outside Anthropic + the database.

---

## Validation pass — what we already proved

Spent ~$0.032 in the Perplexity playground across 4 queries to validate the swap target.

| Query | Surface | Cost | Outcome |
|---|---|---|---|
| Marvila natural-wine bar, Sunday evening | Search API (`/search`) | $0.005 | ❌ 4/5 snippets empty — unusable |
| Same query | Agent API "Fast Search" (Gemini 3 Flash + `web_search`) | $0.00919 | ✅ Specific venues, addresses, hours |
| "Restaurante Café Tartaruga Negra" (dead-end) | Agent API Fast Search | $0.00668 | ✅ Refused to invent, suggested phonetically-similar real venues |
| Same Marvila query | Agent API → Custom Sonar **without** `web_search` tool | $0.00093 | ❌ Pure-LLM hallucination (wrong addresses, LX Factory placed adjacent to Marvila) |
| Same Marvila query | Agent API → Custom Sonar **with** `web_search` tool | $0.00688 | ✅ Names Studio Marvila, cites 9 sources, acknowledges Sunday uncertainty |

### Decisions locked in

- **Swap target:** Perplexity Sonar via `POST https://api.perplexity.ai/chat/completions`, `model: "sonar"`, low search context size.
- **Expected unit cost:** ~$0.006–0.008 per query.
- **Break-even vs SearchApi.io ($40/mo floor):** ~5,500 queries/month. At Summit-week peak we might hit 5,000 in a single week, then drop to <500/month off-season. Pay-as-you-go wins the lifecycle.
- **Known failure mode:** Sonar will occasionally embellish a snippet with a specific that isn't in the source (e.g. invented street number `16` for Studio Marvila; postal code `1900` instead of `1950`). Mitigated in the system prompt and, later, by a Google Places cross-check on itinerary commits.

---

## PR #10 plan — `feature/swap-to-perplexity`

Stacked on `feature/drop-pinecone` (PR #9). Do not branch off `main` until #9 is merged.

### Files to add

- **`lib/apis/perplexity.js`** — single `askPerplexity(query, { recency, contextSize, systemHint })` wrapping `POST /chat/completions`. Returns `{ answer, citations, usage }`. No business logic.

### Files to modify

- **`lib/tools.js`** — remove `searchWeb`, `searchNews`, `searchReddit` (all three are SearchApi.io engines). Add one `askPerplexity` tool. Keep `searchTripadvisor` (deterministic rating field), `placesTextSearch`, Maps, Weather, Luma, Eventbrite untouched.
- **`lib/prompts/system.js`** — add verbatim-only grounding rule:
  > _"Only state addresses, phone numbers, and opening hours that appear verbatim in the search results. Do not infer street numbers, postal codes, or hours that aren't explicitly shown. If a citation contradicts your prior knowledge, the citation wins."_
  Update the retrieval hierarchy section to reflect one general web search tool instead of three.
- **`.env.example`** — add `PERPLEXITY_API_KEY`. Mark `SEARCHAPI_API_KEY` as deprecated but keep the entry until the next deploy in case of rollback.
- **`package.json`** — no new deps; Perplexity is a plain `fetch` call.

### Files to delete (defer)

- Don't delete the SearchApi.io code path in this PR. Comment it out / feature-flag it. Remove in a follow-up PR after one week of clean Perplexity production traffic.

### Tests

- Unit-test `askPerplexity` against a mocked `fetch` (success, 429, 5xx, malformed JSON).
- Add one integration test guarded behind `PERPLEXITY_API_KEY` env presence — runs only locally, hits the real API once with a fixed query, asserts non-empty `citations`.

### Risks / open questions

- **Citation rendering in the UI** — we haven't yet decided whether to show citation URLs inline in chat answers or only on itinerary cards. Decide before merge.
- **Rate limits** — Perplexity tier 1 (after the $50 spend) is generous; pre-spend is restrictive. Confirm tier limits once credits are loaded.
- **Streaming** — Sonar supports streaming. Defer; first cut is non-streamed. Add if tool latency feels rough during local testing.

---

## Before resuming — checklist

1. **Decide on credits.**
   - Option A: **OpenRouter $10 top-up**, route Perplexity through OpenRouter. Lower commitment, but adds a vendor hop and you don't get Perplexity's native search-results array in the response (only the synthesized answer + citations).
   - Option B: **Perplexity direct $50 minimum top-up** at https://www.perplexity.ai/account/api. Cleaner integration, full response shape, tier-1 rate limits.
   - **Recommended:** Option B. The $50 will last well past Summit week given our query shape, and the native response includes `search_results` which we may want to surface in the UI later.

2. **Confirm `feature/drop-pinecone` (PR #9) status.** If merged, branch `feature/swap-to-perplexity` from `main`. If still open, branch from `feature/drop-pinecone`.

3. **Open Anthropic Console** and confirm there are no pending changes to `lib/prompts/system.js` from PR #9 that this PR would conflict with.

---

## Resume command

When you come back:

> _"Resume the Perplexity migration. Credits are loaded on \<OpenRouter | Perplexity\>. Branch PR #10 and start with `lib/apis/perplexity.js`."_

That's enough context for me to reload this doc and start writing code.

---

## References

- Perplexity API docs: https://docs.perplexity.ai/api-reference/chat-completions-post
- Perplexity account / API keys: https://www.perplexity.ai/account/api
- Validation playground session JSONs are in chat history (request IDs `b53a84ac`, `aeff675f`, `a722e2af`, `31f9f219`).
