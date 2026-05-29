'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Conversation } from '@elevenlabs/client';
import { Phone, PhoneOff } from 'lucide-react';

// Visual states surfaced to the user.
const STATUS = {
  idle:        'idle',        // conversation not started
  connecting:  'connecting',  // fetching signed URL, handshaking
  listening:   'listening',   // Gemel is waiting for the visitor to speak
  speaking:    'speaking',    // Gemel is speaking
  error:       'error',       // something went wrong
};

const STATUS_LABEL = {
  idle:       null,
  connecting: 'Connecting…',
  listening:  'Listening…',
  speaking:   'Speaking…',
  error:      'Error — tap to retry',
};

// Pulse animation colours per state.
const STATUS_RING = {
  idle:       '',
  connecting: 'ring-2 ring-[color:var(--color-accent)] ring-opacity-50 animate-pulse',
  listening:  'ring-2 ring-[color:var(--color-accent)] animate-pulse',
  speaking:   'ring-2 ring-green-400 animate-pulse',
  error:      'ring-2 ring-red-400',
};

export default function ConversationButton({ onMessage, onStatusChange, language = 'en' }) {
  const [uiStatus, setUiStatus] = useState(STATUS.idle);
  const conversationRef = useRef(null);

  const updateStatus = useCallback((next) => {
    setUiStatus(next);
    onStatusChange?.(next);
  }, [onStatusChange]);

  const startConversation = useCallback(async () => {
    updateStatus(STATUS.connecting);
    try {
      // Request a signed URL from our server. The server embeds the session
      // ID so the LLM webhook can load the visitor's profile and itinerary.
      const tokenRes = await fetch('/api/voice/conversation-token', { credentials: 'include' });
      if (!tokenRes.ok) throw new Error('Could not get conversation token');
      const { data } = await tokenRes.json();

      const conversation = await Conversation.startSession({
        signedUrl: data.signedUrl,
        // Pass session ID through to the custom LLM webhook.
        customLlmExtraBody: { session_id: data.sessionId },
        // Override the agent language to match the visitor's chosen locale.
        overrides: {
          agent: { language },
        },
        onConnect: () => updateStatus(STATUS.listening),
        onDisconnect: () => updateStatus(STATUS.idle),
        onError: (err) => {
          console.error('[ConversationButton] error:', err);
          updateStatus(STATUS.error);
        },
        onModeChange: ({ mode }) => {
          // ElevenLabs reports 'speaking' when Gemel is talking, 'listening'
          // when it is waiting for the visitor's input.
          updateStatus(mode === 'speaking' ? STATUS.speaking : STATUS.listening);
        },
        onMessage: ({ message, source }) => {
          // Forward transcript turns to the parent so they can appear in the
          // chat history panel alongside text messages.
          onMessage?.({ role: source === 'ai' ? 'assistant' : 'user', content: message });
        },
      });

      conversationRef.current = conversation;
    } catch (err) {
      console.error('[ConversationButton] failed to start:', err);
      updateStatus(STATUS.error);
    }
  }, [language, onMessage, updateStatus]);

  const endConversation = useCallback(async () => {
    try {
      await conversationRef.current?.endSession();
    } catch {}
    conversationRef.current = null;
    updateStatus(STATUS.idle);
  }, [updateStatus]);

  const handleToggle = useCallback(() => {
    if (uiStatus === STATUS.idle || uiStatus === STATUS.error) {
      startConversation();
    } else {
      endConversation();
    }
  }, [uiStatus, startConversation, endConversation]);

  // Clean up if the component unmounts while a session is active.
  useEffect(() => {
    return () => {
      conversationRef.current?.endSession().catch(() => {});
    };
  }, []);

  const isActive = uiStatus !== STATUS.idle && uiStatus !== STATUS.error;
  const label = STATUS_LABEL[uiStatus];

  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="hidden text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-muted)] sm:inline">
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={handleToggle}
        aria-label={isActive ? 'End voice conversation' : 'Start voice conversation'}
        className={[
          'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
          isActive
            ? 'bg-[color:var(--color-accent)] text-[color:var(--color-accent-text)]'
            : 'border border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-text)] hover:border-[color:var(--color-border-strong)]',
          STATUS_RING[uiStatus],
        ].join(' ')}
      >
        {isActive ? <PhoneOff size={16} aria-hidden /> : <Phone size={16} aria-hidden />}
      </button>
    </div>
  );
}
