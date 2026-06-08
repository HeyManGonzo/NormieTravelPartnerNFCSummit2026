// Snapshot the owner's awakened-Normie agent personas into the repo so the app
// can render multiple selectable identities without a runtime API dependency
// (same philosophy as data/embeddings.json). Pulls each persona + traits from
// api.normies.art and saves the pixel portraits into public/agents/.
//
// Run with: npm run seed:personas
// Re-run whenever a Normie levels up (persona evolves) or you add/remove an ID.

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getNormieDetails, getNormiePersona } from '../lib/apis/normies.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_JSON = join(ROOT, 'data', 'agents', 'personas.json');
const PORTRAIT_DIR = join(ROOT, 'public', 'agents');

// The owner's awakened Normies. Gemel (#6832) is the default identity; order
// here is the order shown in the selector.
const TOKEN_IDS = ['6832', '2601', '2359'];
const IMAGE_URL = (id) => `https://api.normies.art/normie/${id}/image.svg`;

// Per-agent accent colour. Drives the avatar tint AND the whole app's theme
// while that agent is active (--color-accent). accentText must read on the
// accent (all three are bright, so near-black); accentSoft is the low-alpha
// variant used for glows/soft fills.
const ACCENTS = {
  '6832': { color: '#d9ff00', text: '#07070a', soft: 'rgba(217,255,0,0.12)' }, // Gemel — lime (brand)
  '2601': { color: '#5cc8ff', text: '#07070a', soft: 'rgba(92,200,255,0.12)' }, // Seil — ice blue
  '2359': { color: '#f5a742', text: '#07070a', soft: 'rgba(245,167,66,0.12)' }, // Uxje — amber
};

// Turn a raw on-chain Normie SVG into the app-styled avatar: drop the opaque
// background rect (so it sits on the dark UI) and recolour the monochrome ink
// to the agent's accent — exactly how the original gemel.svg was made.
function themeSvg(svg, color) {
  return svg
    .replace(/<rect\s+width="40"\s+height="40"[^>]*\/>/, '')
    .replace(/fill="#[0-9a-fA-F]{3,8}"/g, `fill="${color}"`);
}

// Keep only the traits we surface as flavour in the identity block.
const TRAIT_KEYS = ['Gender', 'Age', 'Hair Style', 'Facial Feature', 'Eyes', 'Expression', 'Accessory'];

async function fetchPortrait(id) {
  const res = await fetch(IMAGE_URL(id));
  if (!res.ok) throw new Error(`portrait ${id}: HTTP ${res.status}`);
  return await res.text(); // SVG is text
}

async function main() {
  await mkdir(dirname(OUT_JSON), { recursive: true });
  await mkdir(PORTRAIT_DIR, { recursive: true });

  const agents = [];
  for (const id of TOKEN_IDS) {
    console.log(`Fetching Normie #${id}…`);
    const [persona, details] = await Promise.all([
      getNormiePersona(id),
      getNormieDetails(id),
    ]);
    if (!persona?.name) {
      throw new Error(`#${id} is not a registered agent (no persona) — awaken it first or remove the ID.`);
    }

    const traits = {};
    for (const k of TRAIT_KEYS) {
      if (details?.attributes?.[k]) traits[k] = details.attributes[k];
    }

    const accent = ACCENTS[String(id)] ?? ACCENTS['6832'];
    const rawSvg = await fetchPortrait(id);
    // Save the app-styled (themed) avatar as the portrait the UI uses, plus the
    // untouched on-chain bitmap alongside it for reference.
    await writeFile(join(PORTRAIT_DIR, `${id}.svg`), themeSvg(rawSvg, accent.color), 'utf8');
    await writeFile(join(PORTRAIT_DIR, `${id}-raw.svg`), rawSvg, 'utf8');

    agents.push({
      tokenId: String(id),
      agentId: persona.agentId ?? null,
      name: persona.name,
      type: persona.type ?? details?.attributes?.Type ?? null,
      tagline: persona.tagline ?? null,
      backstory: persona.backstory ?? null,
      greeting: persona.greeting ?? null,
      personalityTraits: persona.personalityTraits ?? [],
      communicationStyle: persona.communicationStyle ?? null,
      quirks: persona.quirks ?? [],
      traits,
      portrait: `/agents/${id}.svg`,
      accent: accent.color,
      accentText: accent.text,
      accentSoft: accent.soft,
      openSeaUrl: details?.openSeaUrl ?? null,
    });
    console.log(`  ✓ ${persona.name} (#${id}) — themed avatar (${accent.color}) saved`);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    defaultTokenId: '6832',
    agents,
  };
  await writeFile(OUT_JSON, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`\n✓ Wrote ${agents.length} personas to data/agents/personas.json`);
}

main().catch((err) => {
  console.error('✗ Persona seeding failed:', err.message);
  process.exit(1);
});
