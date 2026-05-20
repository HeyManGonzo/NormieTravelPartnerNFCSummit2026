import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL =
  process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const DEFAULT_MAX_TOKENS = 1024;

const globalForClaude = globalThis;

function getClient() {
  if (globalForClaude.__anthropicClient) return globalForClaude.__anthropicClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  const client = new Anthropic({ apiKey });
  globalForClaude.__anthropicClient = client;
  return client;
}

/**
 * Send a chat completion request to Claude.
 *
 * @param {Array<{role: 'user'|'assistant', content: string}>} messages
 * @param {string} systemPrompt
 * @param {object} [options]
 * @param {string} [options.model]
 * @param {number} [options.maxTokens]
 * @param {number} [options.temperature]
 * @returns {Promise<{text: string, raw: object}>}
 */
export async function chat(messages, systemPrompt, options = {}) {
  const client = getClient();
  const response = await client.messages.create({
    model: options.model ?? DEFAULT_MODEL,
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: options.temperature ?? 0.6,
    system: systemPrompt,
    messages,
  });

  const text = (response.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  return { text, raw: response };
}
