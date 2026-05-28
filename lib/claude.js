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

/**
 * Single round of a tool-using chat. Sends the current message history
 * plus the tool registry to Claude and returns the raw response (which
 * may contain tool_use blocks the caller must execute and feed back in).
 *
 * The loop itself lives in the caller — this keeps lib/claude.js a thin
 * transport layer and lets routes own iteration bounds, logging, etc.
 *
 * @param {Array<object>} messages — Anthropic-shaped message list (content may be string or block array).
 * @param {string} systemPrompt
 * @param {Array<object>} tools — Anthropic tool definitions.
 * @param {object} [options]
 * @returns {Promise<{response: object, stopReason: string, textBlocks: string[], toolUses: Array<{id:string,name:string,input:object}>}>}
 */
export async function chatTurnWithTools(messages, systemPrompt, tools, options = {}) {
  const client = getClient();
  // Cache the system prompt at Anthropic's servers (5-min TTL). The prompt is
  // large (~2k tokens) and mostly static — caching cuts input-processing time
  // by ~80% on cache hits and meaningfully reduces cost.
  const systemBlock = [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }];
  const response = await client.messages.create({
    model: options.model ?? DEFAULT_MODEL,
    max_tokens: options.maxTokens ?? 2048,
    temperature: options.temperature ?? 0.6,
    system: systemBlock,
    tools,
    messages,
  });

  const blocks = response.content ?? [];
  const textBlocks = blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text);
  const toolUses = blocks
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({ id: b.id, name: b.name, input: b.input }));

  return {
    response,
    stopReason: response.stop_reason,
    textBlocks,
    toolUses,
  };
}

/**
 * Stream the final text turn of a conversation. No tools — call this only
 * when Claude should respond with prose (not tool calls).
 * Yields text chunks as they arrive from the API.
 *
 * @param {Array<object>} messages
 * @param {string} systemPrompt
 * @param {object} [options]
 * @returns {AsyncGenerator<string>}
 */
export async function* streamFinalTurn(messages, systemPrompt, options = {}) {
  const client = getClient();
  const systemBlock = [
    { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
  ];
  const stream = client.messages.stream({
    model: options.model ?? DEFAULT_MODEL,
    max_tokens: options.maxTokens ?? 2048,
    temperature: options.temperature ?? 0.6,
    system: systemBlock,
    messages,
  });
  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta?.type === 'text_delta' &&
      event.delta.text
    ) {
      yield event.delta.text;
    }
  }
}
