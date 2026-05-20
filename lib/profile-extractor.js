// Extracts a structured trip profile from a conversation using Claude.
// Pure application logic — the LLM round-trip goes through lib/claude.js.

import { chat } from '@/lib/claude.js';
import { PROFILE_EXTRACTOR_PROMPT, formatTranscript } from '@/lib/prompts/onboarding.js';

const REQUIRED_FIELDS = [
  'arrivalDate',
  'departureDate',
  'groupType',
  'budgetLevel',
  'pace',
];

function parseJsonLoose(text) {
  if (!text) return null;
  const trimmed = text.trim();
  // Fast path: it's already plain JSON.
  try {
    return JSON.parse(trimmed);
  } catch {}
  // Slow path: extract the first {...} block (in case the model wrapped it).
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normaliseProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const interests = Array.isArray(raw.interests) ? raw.interests : null;
  const nfcDays = Array.isArray(raw.nfcDays) ? raw.nfcDays : null;
  return {
    arrivalDate: raw.arrivalDate ?? null,
    departureDate: raw.departureDate ?? null,
    groupType: raw.groupType ?? null,
    budgetLevel: raw.budgetLevel ?? null,
    interests: interests && interests.length ? interests : null,
    dietaryNeeds: raw.dietaryNeeds ?? null,
    mobilityNeeds: raw.mobilityNeeds ?? null,
    nfcDays: nfcDays && nfcDays.length ? nfcDays : null,
    pace: raw.pace ?? null,
    isComplete: Boolean(raw.isComplete),
    userConfirmedItinerary: Boolean(raw.userConfirmedItinerary),
  };
}

// Re-evaluate completeness server-side so we don't have to trust the model.
function computeIsComplete(profile) {
  if (!profile) return false;
  for (const k of REQUIRED_FIELDS) if (!profile[k]) return false;
  if (!profile.interests?.length) return false;
  if (!profile.nfcDays?.length) return false;
  return true;
}

// Extract a trip profile from the message history. Returns null if the model
// produced garbage; callers should treat that as "no update this turn".
export async function extractProfile(messages) {
  if (!messages?.length) return null;
  const transcript = formatTranscript(messages);
  const { text } = await chat(
    [{ role: 'user', content: `Conversation transcript:\n\n${transcript}` }],
    PROFILE_EXTRACTOR_PROMPT,
    { temperature: 0, maxTokens: 600 },
  );

  const parsed = normaliseProfile(parseJsonLoose(text));
  if (!parsed) return null;
  parsed.isComplete = computeIsComplete(parsed);
  return parsed;
}

const EDITABLE_FIELDS = [
  'arrivalDate',
  'departureDate',
  'groupType',
  'budgetLevel',
  'interests',
  'dietaryNeeds',
  'mobilityNeeds',
  'nfcDays',
  'pace',
];

// Merge an extraction result onto an existing profile row. Returns ONLY the
// editable column values (no id/sessionId/timestamps) so the result is safe
// to pass to Drizzle's insert().values() and update().set().
export function mergeProfile(existing, extracted) {
  const merged = {};
  for (const f of EDITABLE_FIELDS) {
    if (existing && existing[f] !== undefined && existing[f] !== null) {
      merged[f] = existing[f];
    }
    const v = extracted?.[f];
    if (v !== null && v !== undefined) merged[f] = v;
  }
  return merged;
}
