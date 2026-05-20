// Loads and caches the NFC Summit 2026 programme JSON for use as
// reference data in the itinerary builder.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const globalForProgramme = globalThis;

export async function loadNfcProgramme() {
  if (globalForProgramme.__nfcProgramme) return globalForProgramme.__nfcProgramme;
  const path = join(process.cwd(), 'data', 'nfc-summit', 'programme.json');
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw);
  if (process.env.NODE_ENV !== 'production') {
    globalForProgramme.__nfcProgramme = parsed;
  }
  return parsed;
}
