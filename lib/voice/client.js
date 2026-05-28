// Client-side voice helpers — only safe to import from 'use client' components.

// Strip markdown before sending to TTS so ElevenLabs doesn't spell out URLs,
// hash fragments, or asterisks. Keeps the human-readable label of links;
// removes everything else that isn't speakable prose.
function cleanTextForSpeech(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // [label](url) → label
    .replace(/https?:\/\/\S+/g, '')            // bare URLs
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, '$1') // bold / italic
    .replace(/_{1,2}([^_\n]+)_{1,2}/g, '$1')   // _italic_
    .replace(/^#{1,6}\s+/gm, '')               // ## headings
    .replace(/```[\s\S]*?```/g, '')            // fenced code blocks
    .replace(/`([^`]+)`/g, '$1')               // inline code
    .replace(/\n{3,}/g, '\n\n')               // collapse excess blank lines
    .trim();
}

let currentAudio = null;

// Stop any in-flight playback. Called before starting a new one.
export function stopSpeech() {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.src = '';
    } catch {}
    currentAudio = null;
  }
}

/**
 * Fetch synthesized speech for `text` and play it. Resolves when playback
 * ends (or rejects on error). The returned promise can be safely ignored.
 */
export async function playSpeech(text) {
  stopSpeech();
  const res = await fetch('/api/voice/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: cleanTextForSpeech(text) }),
  });
  if (!res.ok) {
    let err = `TTS failed: ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) err = j.error;
    } catch {}
    throw new Error(err);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  currentAudio = audio;
  await new Promise((resolve, reject) => {
    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      reject(new Error('audio playback failed'));
    };
    audio.play().catch(reject);
  });
}

// Prime the browser's autoplay policy by playing a tiny silent clip in
// response to a real user gesture (e.g. toggling the speaker on). After
// this, subsequent .play() calls on the same origin will not be blocked.
export async function primeAudio() {
  try {
    // 1-frame silent mp3 (base64). ~100 bytes.
    const silent =
      'data:audio/mp3;base64,SUQzAwAAAAAAAFRDT04AAAAAAAB//uQZAAAA';
    const a = new Audio(silent);
    a.muted = true;
    await a.play();
    a.pause();
  } catch {
    // Autoplay still blocked — the next real .play() will surface the error.
  }
}

/**
 * Start microphone recording. Returns a controller with stop() that
 * resolves to a Blob containing the recorded audio.
 */
export async function startRecording() {
  if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone not supported in this browser');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  // Pick the best supported mime type. Safari prefers mp4, Chrome/Firefox webm.
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    '',
  ];
  let mimeType = '';
  for (const c of candidates) {
    if (!c || (window.MediaRecorder && MediaRecorder.isTypeSupported(c))) {
      mimeType = c;
      break;
    }
  }
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.start();

  return {
    stop() {
      return new Promise((resolve) => {
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, {
            type: recorder.mimeType || 'audio/webm',
          });
          resolve(blob);
        };
        if (recorder.state !== 'inactive') recorder.stop();
      });
    },
    cancel() {
      stream.getTracks().forEach((t) => t.stop());
      if (recorder.state !== 'inactive') recorder.stop();
    },
  };
}

/**
 * Upload a recorded audio blob to the transcription endpoint.
 */
export async function transcribeBlob(blob, languageCode) {
  const ext = (blob.type || '').includes('mp4') ? 'm4a' : 'webm';
  const fd = new FormData();
  fd.append('audio', blob, `recording.${ext}`);
  if (languageCode) fd.append('languageCode', languageCode);
  const res = await fetch('/api/voice/transcribe', {
    method: 'POST',
    body: fd,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.success) {
    throw new Error(json?.error || `Transcription failed: ${res.status}`);
  }
  return json.data.text || '';
}
