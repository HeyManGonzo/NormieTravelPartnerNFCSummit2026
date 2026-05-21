import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

const globalForEleven = globalThis;

export function getElevenLabs() {
  if (globalForEleven.__elevenlabsClient) return globalForEleven.__elevenlabsClient;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set');
  const client = new ElevenLabsClient({ apiKey });
  globalForEleven.__elevenlabsClient = client;
  return client;
}

export const DEFAULT_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || 'qSeXEcewz7tA0Q0qk9fH';
export const DEFAULT_TTS_MODEL =
  process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5';
export const DEFAULT_STT_MODEL =
  process.env.ELEVENLABS_STT_MODEL_ID || 'scribe_v2';
