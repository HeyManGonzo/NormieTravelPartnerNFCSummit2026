'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ListTodo, Info } from 'lucide-react';
import ChatWindow from '@/components/chat/ChatWindow';
import ItineraryView from '@/components/itinerary/ItineraryView';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import ConversationButton from '@/components/chat/ConversationButton';
import { getMessages } from '@/lib/i18n';

export default function ChatPage() {
  const [locale, setLocale] = useState('en');
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState(false);
  const [pendingLabel, setPendingLabel] = useState(null);
  const [status, setStatus] = useState('onboarding');
  const [itinerary, setItinerary] = useState(null);
  const [shareToken, setShareToken] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [showStrikeBanner, setShowStrikeBanner] = useState(false);
  const bootstrapped = useRef(false);

  const t = getMessages(locale);

  // Time-boxed banner for the 3 June 2026 Lisbon transport strike. Shows until
  // the morning of 4 June (Lisbon time) unless the visitor has dismissed it.
  useEffect(() => {
    const beforeSummit = new Date() < new Date('2026-06-04T00:00:00+01:00');
    const dismissed = localStorage.getItem('strikeBannerDismissed') === '1';
    if (beforeSummit && !dismissed) setShowStrikeBanner(true);
  }, []);

  const dismissStrikeBanner = useCallback(() => {
    setShowStrikeBanner(false);
    try { localStorage.setItem('strikeBannerDismissed', '1'); } catch {}
  }, []);

  const fetchItinerary = useCallback(async () => {
    try {
      const res = await fetch('/api/itinerary', { credentials: 'include' });
      const json = await res.json();
      if (json?.success && json.data?.itinerary) {
        setItinerary({
          ...json.data.itinerary,
          version: json.data.version,
        });
        if (json.data.shareToken) setShareToken(json.data.shareToken);
      }
    } catch {
      // non-fatal
    }
  }, []);

  // Bootstrap: ensure session cookie, load history + itinerary.
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    // Establish the session, retrying once on a transient failure (e.g. a
    // brief DB blip that 500/504s) so a single hiccup doesn't leave the chat
    // uninitialised.
    const postSession = async (attempt = 0) => {
      try {
        const res = await fetch('/api/session', { method: 'POST', credentials: 'include' });
        const json = await res.json();
        if (json?.success) return json;
        throw new Error(json?.error || 'session failed');
      } catch (err) {
        if (attempt < 1) {
          await new Promise((r) => setTimeout(r, 800));
          return postSession(attempt + 1);
        }
        throw err;
      }
    };

    (async () => {
      try {
        const sess = await postSession();
        if (sess?.success) {
          setLocale(sess.data.language ?? 'en');
          setStatus(sess.data.status ?? 'onboarding');
        }

        const hist = await fetch('/api/chat', { credentials: 'include' }).then(
          (r) => r.json(),
        );
        if (hist?.success) {
          const rows = hist.data.messages ?? [];
          if (rows.length === 0) {
            const greeting =
              hist.data.status && hist.data.status !== 'onboarding'
                ? getMessages(hist.data.language ?? 'en').chat.greetingReturning
                : getMessages(hist.data.language ?? 'en').chat.greetingNew;
            setMessages([
              { id: 'greeting', role: 'assistant', content: greeting },
            ]);
          } else {
            setMessages(rows);
          }
        }

        await fetchItinerary();
      } catch (err) {
        console.error('chat bootstrap failed', err);
      }
    })();
  }, [fetchItinerary]);

  const handleSend = useCallback(
    async (text) => {
      setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: 'user', content: text }]);
      setPending(true);
      setPendingLabel(t.chat.thinking);

      const replyId = `reply-${Date.now()}`;
      let streamingStarted = false;
      let fullReply = '';

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ message: text }),
        });

        if (!res.ok || !res.body) throw new Error(`Request failed: ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE events are separated by \n\n — hold back any incomplete tail.
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            if (!part.startsWith('data: ')) continue;
            let event;
            try { event = JSON.parse(part.slice(6)); } catch { continue; }

            if (event.type === 'token') {
              fullReply += event.text;
              if (!streamingStarted) {
                streamingStarted = true;
                setPending(false);
                setPendingLabel(null);
                setStreaming(true);
                setMessages((m) => [
                  ...m,
                  { id: replyId, role: 'assistant', content: event.text, streaming: true },
                ]);
              } else {
                setMessages((m) =>
                  m.map((msg) =>
                    msg.id === replyId
                      ? { ...msg, content: msg.content + event.text }
                      : msg,
                  ),
                );
              }
            }

            if (event.type === 'done') {
              setStreaming(false);
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === replyId ? { ...msg, streaming: false } : msg,
                ),
              );
              setStatus(event.status ?? status);

              if (event.itineraryUpdated) {
                const updated = await fetch('/api/itinerary', { credentials: 'include' }).then((r) => r.json());
                if (updated?.success && updated.data?.itinerary) {
                  setItinerary({ ...updated.data.itinerary, version: updated.data.version });
                  if (updated.data.shareToken) setShareToken(updated.data.shareToken);
                }
              }

              if (event.readyToGenerate) {
                setPendingLabel(t.chat.generating);
                setPending(true);
                const gen = await fetch('/api/itinerary', {
                  method: 'POST',
                  credentials: 'include',
                }).then((r) => r.json());
                if (gen?.success) {
                  if (gen.data.itinerary) {
                    setItinerary({ ...gen.data.itinerary, version: gen.data.version });
                    if (gen.data.shareToken) setShareToken(gen.data.shareToken);
                    setPanelOpen(true);
                  }
                  if (gen.data.reply) {
                    setMessages((m) => [
                      ...m,
                      { id: `narration-${Date.now()}`, role: 'assistant', content: gen.data.reply },
                    ]);
                  }
                  setStatus('active');
                }
              }
            }

            if (event.type === 'error') {
              setMessages((m) => [
                ...m,
                { id: `err-${Date.now()}`, role: 'assistant', content: t.chat.errorGeneric },
              ]);
            }
          }
        }

        if (!streamingStarted) {
          setMessages((m) => [
            ...m,
            { id: replyId, role: 'assistant', content: t.chat.errorGeneric },
          ]);
        }
      } catch (err) {
        setMessages((m) => [
          ...m,
          { id: `err-${Date.now()}`, role: 'assistant', content: t.chat.errorGeneric },
        ]);
      } finally {
        setPending(false);
        setPendingLabel(null);
        setStreaming(false);
      }
    },
    [status, t.chat.thinking, t.chat.generating, t.chat.errorGeneric],
  );

  // Voice conversation transcript — each turn from the ElevenLabs WebSocket
  // gets added to the chat history so the visitor can read what was said.
  // ElevenLabs handles audio out directly, no client-side TTS needed.
  const handleConversationMessage = useCallback(({ role, content }) => {
    if (!content?.trim()) return;
    const id = `conv-${role}-${Date.now()}`;
    setMessages((m) => [...m, { id, role, content }]);
  }, []);


  return (
    <main className="flex h-[100dvh] flex-col bg-[color:var(--color-bg)]">
      <header className="relative z-30 flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/gemel.svg"
            alt=""
            aria-hidden
            className="h-7 w-7"
            style={{ imageRendering: 'pixelated' }}
          />
          <span className="font-display text-sm font-semibold tracking-[0.18em] uppercase">
            Gemel<span className="text-[color:var(--color-accent)]">.</span>
          </span>
          <span className="hidden text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-muted)] sm:inline">
            {t.status[status] ?? status}
          </span>
        </Link>
        <div className="flex items-center gap-2">
          {itinerary && (
            <button
              type="button"
              onClick={() => setPanelOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.16em] hover:border-[color:var(--color-border-strong)]"
            >
              <ListTodo size={14} aria-hidden />
              <span className="hidden sm:inline">{t.itinerary.open}</span>
            </button>
          )}
          <ConversationButton
            onMessage={handleConversationMessage}
            language={locale}
          />
          <LanguageSwitcher value={locale} onChange={setLocale} />
          <Link
            href="/disclaimer"
            aria-label="Disclaimer"
            title="Disclaimer"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--color-muted)] transition hover:text-[color:var(--color-text)]"
          >
            <Info size={16} aria-hidden />
          </Link>
        </div>
      </header>

      {showStrikeBanner && (
        <div className="flex shrink-0 items-start gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[13px] text-[color:var(--color-text)] sm:px-6">
          <span aria-hidden className="mt-0.5 text-amber-400">⚠️</span>
          <div className="flex-1 leading-snug">
            <strong>June 3 — national transport strike in Lisbon.</strong>{' '}
            Metro, trains and most buses are down and many flights are affected the day
            before the Summit.{' '}
            <button
              type="button"
              onClick={() => { handleSend('How will the June 3 transport strike in Lisbon affect my arrival and getting around?'); dismissStrikeBanner(); }}
              className="underline underline-offset-2 hover:text-amber-300"
            >
              Ask Gemel how it affects you
            </button>
          </div>
          <button
            type="button"
            onClick={dismissStrikeBanner}
            aria-label="Dismiss"
            className="shrink-0 rounded px-1.5 text-[color:var(--color-muted)] hover:text-[color:var(--color-text)]"
          >
            ✕
          </button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col">
          <ChatWindow
            messages={messages}
            pending={pending}
            streaming={streaming}
            pendingLabel={pendingLabel}
            onSend={handleSend}
            placeholder={t.chat.placeholder}
            sendLabel={t.chat.send}
          />
        </div>

        {panelOpen && itinerary && (
          <>
            <div
              aria-hidden
              onClick={() => setPanelOpen(false)}
              className="absolute inset-0 z-10 bg-black/40 backdrop-blur-sm md:hidden"
            />
            <div className="absolute inset-y-0 right-0 z-20 w-full max-w-md border-l border-[color:var(--color-border)] bg-[color:var(--color-bg)] shadow-2xl md:static md:max-w-[420px] md:shadow-none">
              <ItineraryView
                itinerary={itinerary}
                locale={locale}
                onClose={() => setPanelOpen(false)}
                shareToken={shareToken}
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
