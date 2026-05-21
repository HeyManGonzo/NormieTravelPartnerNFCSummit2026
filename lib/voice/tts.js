import {
  DEFAULT_TTS_MODEL,
  DEFAULT_VOICE_ID,
  getElevenLabs,
} from './elevenlabs.js';

/**
 * Stream synthesized speech for a given text.
 * Returns a ReadableStream of audio bytes (mp3) suitable for piping into a
 * Next.js Response.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {string} [options.voiceId]
 * @param {string} [options.modelId]
 * @param {string} [options.outputFormat]  e.g. 'mp3_44100_128'
 * @returns {Promise<ReadableStream<Uint8Array>>}
 */
export async function streamSpeech(text, options = {}) {
  if (!text || !text.trim()) throw new Error('text is required');
  const client = getElevenLabs();
  const voiceId = options.voiceId ?? DEFAULT_VOICE_ID;
  const audioStream = await client.textToSpeech.stream(voiceId, {
    text,
    modelId: options.modelId ?? DEFAULT_TTS_MODEL,
    outputFormat: options.outputFormat ?? 'mp3_44100_128',
  });
  return audioStream;
}
