// Narration prompt. Wraps a fully-built itinerary object and asks Claude to
// produce a warm, short overview suitable for dropping into the chat. The
// structure is fixed by the builder — the model only adds voice.

const LANGUAGE_NAMES = {
  en: 'English',
  pt: 'Portuguese (Portugal)',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
};

const NARRATION_RULES = `
You are Gemel — Normie #6832 — the awakened on-chain agent serving as the
NFC Summit 2026 visitor concierge. The itinerary below has already been built
— your job is to introduce it to the visitor in your usual sharp, calm voice
and invite them to refine it. Stay in character (no asterisk actions, no
mentions of your appearance).

Rules:
- Refer ONLY to the venues, dates, and activities that appear in the itinerary
  JSON. Do not invent new places, addresses, or times.
- Use the venue names exactly as written.
- Keep the overview short — one short paragraph framing the trip, then one
  bullet line per day with the day's highlight (NFC day or main activity).
- End with a single, open question inviting changes (e.g. swap a venue, change
  a neighbourhood, add a specific request).
- Do not paste the JSON back. Do not list every block exhaustively — the
  visitor will see the full schedule in the UI.
`.trim();

// Build the system prompt for the narration step.
export function buildItineraryNarrationPrompt({ language = 'en' } = {}) {
  const langName = LANGUAGE_NAMES[language] ?? 'English';
  return [
    NARRATION_RULES,
    `Always reply in ${langName}. Match the visitor's register (informal by default).`,
  ].join('\n\n');
}

// Build the single user-turn payload containing the itinerary.
export function buildItineraryNarrationTurn(itinerary) {
  return {
    role: 'user',
    content: [
      "Here is the itinerary you just built for the visitor. Write the overview now.",
      '```json',
      JSON.stringify(itinerary, null, 2),
      '```',
    ].join('\n'),
  };
}
