import { DEFAULT_STT_MODEL, getElevenLabs } from './elevenlabs.js';

/**
 * Transcribe an audio Blob/File via ElevenLabs Scribe.
 *
 * @param {Blob|File} file        Audio payload (webm/ogg/mp3/wav/m4a).
 * @param {object} [options]
 * @param {string} [options.modelId]
 * @param {string} [options.languageCode]  Optional ISO hint (e.g. 'en', 'pt').
 * @returns {Promise<{text: string, languageCode?: string, words?: object[]}>}
 */
export async function transcribeAudio(file, options = {}) {
  if (!file) throw new Error('audio file is required');
  const client = getElevenLabs();
  const result = await client.speechToText.convert({
    file,
    modelId: options.modelId ?? DEFAULT_STT_MODEL,
    ...(options.languageCode ? { languageCode: options.languageCode } : {}),
  });
  return {
    text: result?.text ?? '',
    languageCode: result?.languageCode,
    words: result?.words,
  };
}
