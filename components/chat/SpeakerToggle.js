'use client';

import { Volume2, VolumeX } from 'lucide-react';
import { primeAudio, stopSpeech } from '@/lib/voice/client';

export default function SpeakerToggle({ enabled, onChange, label }) {
  function toggle() {
    const next = !enabled;
    if (next) {
      // Prime the browser's autoplay policy while we still have a user gesture.
      primeAudio();
    } else {
      stopSpeech();
    }
    onChange(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
        enabled
          ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent)]'
          : 'border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-muted)] hover:border-[color:var(--color-border-strong)]'
      }`}
    >
      {enabled ? (
        <Volume2 size={16} aria-hidden />
      ) : (
        <VolumeX size={16} aria-hidden />
      )}
    </button>
  );
}
