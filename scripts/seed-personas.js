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

    const svg = await fetchPortrait(id);
    await writeFile(join(PORTRAIT_DIR, `${id}.svg`), svg, 'utf8');

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
      openSeaUrl: details?.openSeaUrl ?? null,
    });
    console.log(`  ✓ ${persona.name} (#${id}) — portrait saved`);
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
