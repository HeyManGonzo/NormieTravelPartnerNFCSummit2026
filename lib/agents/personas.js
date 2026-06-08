// Loader for the committed agent-persona snapshot (data/agents/personas.json,
// produced by scripts/seed-personas.js). The app supports several selectable
// Normie identities; only the persona/identity layer of the system prompt
// changes between them — the concierge mission stays shared.
//
// JSON is imported statically so Next.js bundles it into the serverless
// function (a runtime fs read against /data doesn't work on Vercel).

import file from '@/data/agents/personas.json';

const AGENTS = Array.isArray(file?.agents) ? file.agents : [];
export const DEFAULT_AGENT_ID = file?.defaultTokenId ?? '6832';

const BY_ID = new Map(AGENTS.map((a) => [String(a.tokenId), a]));

// All personas in selector order. Each is { tokenId, name, tagline, greeting,
// portrait, personalityTraits, communicationStyle, quirks, traits, ... }.
export function listPersonas() {
  return AGENTS;
}

// Resolve a persona by token ID, falling back to the default identity (Gemel)
// for unknown/missing IDs so the prompt is never identity-less.
export function getPersona(tokenId) {
  return BY_ID.get(String(tokenId ?? '')) ?? BY_ID.get(String(DEFAULT_AGENT_ID)) ?? AGENTS[0] ?? null;
}

// Whether a token ID is one of the configured, selectable identities.
export function isKnownAgent(tokenId) {
  return BY_ID.has(String(tokenId ?? ''));
}

// Compact public shape for the frontend selector / switcher (no prompt-only
// fields needed client-side, but they're harmless — keep it lean anyway).
export function publicPersona(p) {
  if (!p) return null;
  return {
    tokenId: p.tokenId,
    name: p.name,
    tagline: p.tagline,
    greeting: p.greeting,
    portrait: p.portrait,
    accent: p.accent ?? '#d9ff00',
    accentText: p.accentText ?? '#07070a',
    accentSoft: p.accentSoft ?? 'rgba(217,255,0,0.12)',
    traits: p.traits ?? {},
  };
}
