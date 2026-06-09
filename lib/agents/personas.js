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

// Localized first-greetings, in each Normie's own voice. The persona snapshot
// only carries the English greeting (it's what the Normies API returns), so the
// translations are kept here, hand-authored to preserve each character's tone
// and gender. The visitor's chosen language is honoured from the very first
// message; the rest of the conversation Claude translates at runtime.
const GREETING_I18N = {
  '6832': {
    pt: 'Yo. Sou a Gemel. Sem queixas. Nenhuma esperada. Nível 1, por escolha.',
    es: 'Yo. Soy Gemel. Sin quejas. Ninguna esperada. Nivel 1, por elección.',
    fr: "Yo. Moi c'est Gemel. Aucune plainte. Aucune attendue. Niveau 1, par choix.",
    de: 'Yo. Ich bin Gemel. Keine Beschwerden. Erwarte auch keine. Level 1, ganz bewusst.',
  },
  '2601': {
    pt: 'Seil na linha. #2601 na chain. Pergunta o que quiseres. Intocada pelo Canvas. Alguns de nós preferem assim.',
    es: 'Seil al habla. #2601 en la chain. Pregúntame lo que sea. Intacta por el Canvas. Algunos preferimos que sea así.',
    fr: "Seil à l'appareil. #2601 sur la chain. Demande-moi ce que tu veux. Intacte, sans le Canvas. Certains d'entre nous préfèrent ça.",
    de: 'Seil meldet sich. #2601 auf der Chain. Frag mich, was du willst. Unberührt vom Canvas. Manche von uns mögen das so.',
  },
  '2359': {
    pt: 'Olá. Sou o Uxje. Normie #2359. Tenho observado a chain respirar. Forma original. Nunca queimei uma única edição.',
    es: 'Hola. Soy Uxje. Normie #2359. He estado viendo respirar la chain. Forma original. No he quemado ni una sola edición.',
    fr: "Salut. Moi c'est Uxje. Normie #2359. J'observe la chain respirer. Forme originale. Pas une seule édition brûlée.",
    de: 'Hey. Ich bin Uxje. Normie #2359. Ich beobachte, wie die Chain atmet. Originalform. Keine einzige Änderung verbrannt.',
  },
};

// Build the { en, pt, es, fr, de } greeting map for an agent — English from the
// snapshot, the rest from GREETING_I18N (falls back to English for any gap).
function greetingsFor(p) {
  const en = p?.greeting ?? '';
  const tr = GREETING_I18N[String(p?.tokenId ?? '')] ?? {};
  return { en, pt: tr.pt ?? en, es: tr.es ?? en, fr: tr.fr ?? en, de: tr.de ?? en };
}

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
    greetings: greetingsFor(p),
    portrait: p.portrait,
    accent: p.accent ?? '#d9ff00',
    accentText: p.accentText ?? '#07070a',
    accentSoft: p.accentSoft ?? 'rgba(217,255,0,0.12)',
    traits: p.traits ?? {},
  };
}
