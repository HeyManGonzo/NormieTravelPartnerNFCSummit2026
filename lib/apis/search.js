// SearchApi.io wrappers for general web, news, and Reddit-via-Google
// queries. Used by Gemel when curated and structured sources (catalog,
// Places, Tripadvisor) don't cover the question — editorial context,
// live press, community sentiment. Same key/endpoint as the Tripadvisor
// integration; only the `engine` parameter differs.
//
// All three calls cache for 24h and soft-fail to null when the key is
// missing or the upstream errors. Lisbon scope is applied here, not at
// the call site, so the prompt doesn't have to remember.

const ENDPOINT = 'https://www.searchapi.io/api/v1/search';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const webCache = new Map();
const newsCache = new Map();
const redditCache = new Map();

async function callSearchApi(params) {
  const key = process.env.SEARCHAPI_KEY;
  if (!key) return null;
  try {
    const url = new URL(ENDPOINT);
    url.searchParams.set('api_key', key);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    const res = await fetch(url);
    if (!res.ok) {
      console.warn('[search] http', res.status, params.engine);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn('[search] fetch error:', err.message);
    return null;
  }
}

// Append "Lisbon" to the query unless the caller has flagged the question
// as Portugal-wide (transport strikes, national news). Keeps results
// relevant for a Lisbon-centric concierge without hard-coding it in every
// tool description.
function scopeQuery(query, { lisbonScope = true } = {}) {
  if (!query) return '';
  const trimmed = query.trim();
  if (!lisbonScope) return trimmed;
  const lower = trimmed.toLowerCase();
  if (lower.includes('lisbon') || lower.includes('lisboa')) return trimmed;
  return `${trimmed} Lisbon`;
}

// General web search via Google. Best for editorial context (Time Out,
// Eater, Condé Nast, travel blogs) and reviews from sources that aren't
// in Tripadvisor or Google Places. Returns title, link, source, snippet.
export async function searchWeb({ query, limit = 5, lisbonScope = true } = {}) {
  if (!query) return null;
  const q = scopeQuery(query, { lisbonScope });
  const ck = `${q}|${limit}`;
  const cached = webCache.get(ck);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const json = await callSearchApi({ engine: 'google', q });
  const results = json?.organic_results;
  if (!Array.isArray(results) || !results.length) {
    webCache.set(ck, { at: Date.now(), value: null });
    return null;
  }
  const value = results.slice(0, limit).map((r) => ({
    title: r.title ?? '',
    link: r.link ?? '',
    source: r.source ?? r.displayed_link ?? '',
    snippet: r.snippet ?? '',
    date: r.date ?? null,
  }));
  webCache.set(ck, { at: Date.now(), value });
  return value;
}

// Google News. Time-sensitive — strikes, weather warnings, closures,
// festivals, opening/closing news. Each result carries a date string
// ("5 hours ago", "2 days ago") so Gemel can reason about freshness.
export async function searchNews({ query, limit = 5, lisbonScope = true } = {}) {
  if (!query) return null;
  const q = scopeQuery(query, { lisbonScope });
  const ck = `${q}|${limit}`;
  const cached = newsCache.get(ck);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const json = await callSearchApi({ engine: 'google_news', q });
  const results = json?.organic_results;
  if (!Array.isArray(results) || !results.length) {
    newsCache.set(ck, { at: Date.now(), value: null });
    return null;
  }
  const value = results.slice(0, limit).map((r) => ({
    title: r.title ?? '',
    link: r.link ?? '',
    source: typeof r.source === 'string' ? r.source : r.source?.name ?? '',
    snippet: r.snippet ?? '',
    date: r.date ?? r.iso_date ?? null,
  }));
  newsCache.set(ck, { at: Date.now(), value });
  return value;
}

// Reddit via Google `site:` filter. SearchApi.io doesn't expose a direct
// reddit engine, but Google with a site filter on r/lisbon + r/portugal
// + r/travel covers the community-wisdom use case well — "what do
// locals say about X", "is Y a tourist trap", etc. Reddit threads
// embedded in Google organic results carry enough snippet for Gemel
// to summarise without scraping.
export async function searchReddit({ query, limit = 5 } = {}) {
  if (!query) return null;
  const base = query.trim();
  const q = `${base} site:reddit.com/r/lisbon OR site:reddit.com/r/portugal OR site:reddit.com/r/travel`;
  const ck = `${q}|${limit}`;
  const cached = redditCache.get(ck);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const json = await callSearchApi({ engine: 'google', q });
  const results = json?.organic_results;
  if (!Array.isArray(results) || !results.length) {
    redditCache.set(ck, { at: Date.now(), value: null });
    return null;
  }
  const value = results
    .filter((r) => typeof r.link === 'string' && r.link.includes('reddit.com'))
    .slice(0, limit)
    .map((r) => {
      const m = /reddit\.com\/r\/([^/]+)\//i.exec(r.link || '');
      return {
        title: r.title ?? '',
        link: r.link ?? '',
        subreddit: m ? `r/${m[1]}` : '',
        snippet: r.snippet ?? '',
        date: r.date ?? null,
      };
    });
  if (!value.length) {
    redditCache.set(ck, { at: Date.now(), value: null });
    return null;
  }
  redditCache.set(ck, { at: Date.now(), value });
  return value;
}
