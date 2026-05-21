'use client';

import { useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { startRecording, transcribeBlob } from '@/lib/voice/client';

export default function MicButton({
  disabled = false,
  languageCode,
  onTranscript,
  onError,
  labels = {},
}) {
  const [state, setState] = useState('idle'); // idle | recording | transcribing
  const recorderRef = useRef(null);

  async function handleClick() {
    if (disabled) return;
    if (state === 'idle') {
      try {
        const ctrl = await startRecording();
        recorderRef.current = ctrl;
        setState('recording');
      } catch (err) {
        onError?.(err?.message || 'Microphone unavailable');
      }
      return;
    }
    if (state === 'recording') {
      const ctrl = recorderRef.current;
      recorderRef.current = null;
      if (!ctrl) {
        setState('idle');
        return;
      }
      setState('transcribing');
      try {
        const blob = await ctrl.stop();
        const text = await transcribeBlob(blob, languageCode);
        if (text && text.trim()) onTranscript?.(text.trim());
        else onError?.(labels.empty || 'Could not understand audio');
      } catch (err) {
        onError?.(err?.message || 'Transcription failed');
      } finally {
        setState('idle');
      }
    }
  }

  const isRec = state === 'recording';
  const isBusy = state === 'transcribing';
  const aria =
    isRec
      ? labels.stop || 'Stop recording'
      : isBusy
      ? labels.transcribing || 'Transcribing'
      : labels.start || 'Start voice input';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isBusy}
      aria-label={aria}
      title={aria}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition ${
        isRec
          ? 'animate-pulse border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent)]'
          : 'border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-muted)] hover:border-[color:var(--color-border-strong)] disabled:opacity-40'
      }`}
    >
      {isBusy ? (
        <Loader2 size={16} className="animate-spin" aria-hidden />
      ) : isRec ? (
        <Square size={14} strokeWidth={2.5} aria-hidden />
      ) : (
        <Mic size={16} aria-hidden />
      )}
    </button>
  );
}
