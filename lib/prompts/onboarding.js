// Profile-extraction prompt. Runs after each user turn against the recent
// conversation and returns a strict JSON payload of the trip profile fields
// the user has revealed so far.

const SCHEMA_DOC = `
Return ONLY a single JSON object matching this schema. Use null for fields the
user has not yet supplied. Do not invent or guess values.

{
  "arrivalDate":   string | null,   // ISO YYYY-MM-DD
  "departureDate": string | null,   // ISO YYYY-MM-DD
  "groupType":     "solo" | "couple" | "friends" | "family" | null,
  "budgetLevel":   "budget" | "midrange" | "premium" | null,
  "interests":     string[] | null, // any of: art, food, nightlife, architecture, nature, shopping, music
  "dietaryNeeds":  string | null,   // short free text e.g. "vegetarian"
  "mobilityNeeds": string | null,   // short free text
  "nfcDays":       string[] | null, // subset of ["2026-06-04","2026-06-05","2026-06-06"]
  "pace":          "relaxed" | "balanced" | "packed" | null,
  "isComplete":    boolean,         // true ONLY when all required fields are non-null
  "userConfirmedItinerary": boolean // true if the user just said "yes, generate it" or similar
}
`.trim();

const REQUIRED_FOR_COMPLETE = `
A profile is complete only when arrivalDate, departureDate, groupType,
budgetLevel, interests (non-empty), nfcDays (non-empty), and pace are all set.
dietaryNeeds and mobilityNeeds are optional and can stay null.
`.trim();

const RULES = `
Rules:
- Read the conversation top to bottom. Use the most recent value if the user
  changed their mind.
- Resolve relative dates against the NFC Summit context: it runs 4–6 June 2026.
  "Arriving the day before" → 2026-06-03. "Leaving the day after" → 2026-06-07.
- nfcDays must be ISO dates within 2026-06-04 to 2026-06-06.
- Interests must use the canonical lowercase tags listed above.
- userConfirmedItinerary is true only when the user explicitly agreed to
  generate the plan in their latest message (e.g. "yes, build it", "go ahead",
  "let's see the plan"). Default to false.
- Do not wrap the JSON in markdown fences. Do not add commentary. JSON only.
`.trim();

export const PROFILE_EXTRACTOR_PROMPT = [
  'You extract a structured trip profile from a conversation with a visitor to NFC Summit 2026 in Lisbon.',
  SCHEMA_DOC,
  REQUIRED_FOR_COMPLETE,
  RULES,
].join('\n\n');

// Render the conversation as a transcript the extractor can read.
export function formatTranscript(messages) {
  return messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');
}
