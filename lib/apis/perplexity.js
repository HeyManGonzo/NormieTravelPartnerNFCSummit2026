// Perplexity Sonar wrapper — replaces SearchApi.io for general web, news, and
// community (Reddit) search. One search-grounded LLM call returns a synthesised
// answer plus citations, covering all three use cases the three old SearchApi.io
// engines handled separately.
//
// Thin transport only: no business logic. Soft-fails to null when the key is
// missing or the upstream errors, and caches for 1h (same contract as the old
// search.js helpers). Lisbon scope is applied here so the prompt doesn't have
// to remember.
//
// Docs: https://docs.perplexity.ai/api-reference/chat-completions-post

const ENDPOINT = 'https://api.perplexity.ai/chat/completions';
const MODEL = 'sonar';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cache = new Map();

// Keep the system prompt LIGHT. A restrictive prompt ("only state things
// verbatim / if unsure say so") makes Sonar refuse and reply "I don't have
// search results" with zero citations — it suppresses grounding. The
// verbatim-grounding discipline is enforced in Gemel's own system prompt
// (RETRIEVAL_RULES) when she relays the answer, not here.
const SYSTEM_BASE =
  'Be concise and factual. The user is a visitor to Lisbon, Portugal — focus '
  + 'on Lisbon unless the question is explicitly broader.';

// Append "Lisbon" unless the caller flagged the question as Portugal-wide or it
// already mentions the city. Mirrors the old search.js scopeQuery behaviour.
function scopeQuery(query, lisbonScope) {
  const trimmed = (query ?? '').trim();
  if (!trimmed || !lisbonScope) return trimmed;
  const lower = trimmed.toLowerCase();
  if (lower.includes('lisbon') || lower.includes('lisboa')) return trimmed;
  return `${trimmed} Lisbon`;
}

/**
 * Ask Perplexity Sonar a grounded question.
 *
 * @param {string} query
 * @param {object} [options]
 * @param {'hour'|'day'|'week'|'month'|'year'|null} [options.recency=null] — omit for evergreen/editorial; set for news
 * @param {'low'|'medium'|'high'} [options.contextSize='low']
 * @param {string[]|null} [options.domainFilter=null] — restrict sources, e.g. ['reddit.com']
 * @param {string|null} [options.systemHint=null] — extra system context
 * @param {boolean} [options.lisbonScope=true]
 * @returns {Promise<{answer:string, citations:string[], searchResults:Array<{title:string,url:string,snippet:string,date:string|null}>}|null>}
 */
export async function askPerplexity(query, {
  recency = null,
  contextSize = 'low',
  domainFilter = null,
  systemHint = null,
  lisbonScope = true,
} = {}) {
  const key = process.env.PERPLEXITYAPI_KEY;
  if (!key || !query) return null;

  const q = scopeQuery(query, lisbonScope);
  const ck = `${q}|${recency}|${contextSize}|${(domainFilter ?? []).join(',')}|${systemHint ?? ''}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: systemHint ? `${SYSTEM_BASE}\n\n${systemHint}` : SYSTEM_BASE },
      { role: 'user', content: q },
    ],
    max_tokens: 600,
    temperature: 0.2,
    web_search_options: { search_context_size: contextSize },
  };
  // Only narrow by recency when explicitly asked (news / time-sensitive).
  // Applying it to evergreen queries filters out valid older guides.
  if (recency) body.search_recency_filter = recency;
  if (Array.isArray(domainFilter) && domainFilter.length) {
    body.search_domain_filter = domainFilter;
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn('[perplexity] http', res.status);
      cache.set(ck, { at: Date.now(), value: null });
      return null;
    }
    const json = await res.json();
    const answer = json?.choices?.[0]?.message?.content?.trim() ?? '';
    if (!answer) {
      cache.set(ck, { at: Date.now(), value: null });
      return null;
    }
    // Newer responses carry search_results[]; older ones only citations[] (URLs).
    const rawResults = Array.isArray(json?.search_results) ? json.search_results : [];
    const searchResults = rawResults.slice(0, 8).map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.snippet ?? '',
      date: r.date ?? null,
    }));
    const citations = Array.isArray(json?.citations)
      ? json.citations.filter((c) => typeof c === 'string')
      : searchResults.map((r) => r.url).filter(Boolean);

    const value = { answer, citations, searchResults };
    cache.set(ck, { at: Date.now(), value });
    return value;
  } catch (err) {
    console.warn('[perplexity] fetch error:', err.message);
    cache.set(ck, { at: Date.now(), value: null });
    return null;
  }
}
