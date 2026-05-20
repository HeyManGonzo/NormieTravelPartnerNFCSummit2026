'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ListTodo } from 'lucide-react';
import ChatWindow from '@/components/chat/ChatWindow';
import ItineraryView from '@/components/itinerary/ItineraryView';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import { getMessages } from '@/lib/i18n';

export default function ChatPage() {
  const [locale, setLocale] = useState('en');
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState(false);
  const [pendingLabel, setPendingLabel] = useState(null);
  const [status, setStatus] = useState('onboarding');
  const [itinerary, setItinerary] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const bootstrapped = useRef(false);

  const t = getMessages(locale);

  const fetchItinerary = useCallback(async () => {
    try {
      const res = await fetch('/api/itinerary', { credentials: 'include' });
      const json = await res.json();
      if (json?.success && json.data?.itinerary) {
        setItinerary({
          ...json.data.itinerary,
          version: json.data.version,
        });
      }
    } catch {
      // non-fatal
    }
  }, []);

  // Bootstrap: ensure session cookie, load history + itinerary.
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    (async () => {
      try {
        const sess = await fetch('/api/session', {
          method: 'POST',
          credentials: 'include',
        }).then((r) => r.json());
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
      const userMsg = {
        id: `tmp-${Date.now()}`,
        role: 'user',
        content: text,
      };
      setMessages((m) => [...m, userMsg]);
      setPending(true);
      setPendingLabel(t.chat.thinking);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ message: text }),
        });
        const json = await res.json();
        if (!json?.success) throw new Error(json?.error ?? 'chat error');

        setMessages((m) => [
          ...m,
          {
            id: `reply-${Date.now()}`,
            role: 'assistant',
            content: json.data.reply,
          },
        ]);
        setStatus(json.data.status ?? status);

        if (json.data.readyToGenerate) {
          setPendingLabel(t.chat.generating);
          const gen = await fetch('/api/itinerary', {
            method: 'POST',
            credentials: 'include',
          }).then((r) => r.json());
          if (gen?.success) {
            if (gen.data.itinerary) {
              setItinerary({
                ...gen.data.itinerary,
                version: gen.data.version,
              });
              setPanelOpen(true);
            }
            if (gen.data.reply) {
              setMessages((m) => [
                ...m,
                {
                  id: `narration-${Date.now()}`,
                  role: 'assistant',
                  content: gen.data.reply,
                },
              ]);
            }
            setStatus('active');
          }
        }
      } catch (err) {
        setMessages((m) => [
          ...m,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: t.chat.errorGeneric,
          },
        ]);
      } finally {
        setPending(false);
        setPendingLabel(null);
      }
    },
    [status, t.chat.thinking, t.chat.generating, t.chat.errorGeneric],
  );

  return (
    <main className="flex h-[100dvh] flex-col bg-[color:var(--color-bg)]">
      <header className="relative z-30 flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-display text-sm font-semibold tracking-[0.18em] uppercase">
            Norma<span className="text-[color:var(--color-accent)]">.</span>
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
          <LanguageSwitcher value={locale} onChange={setLocale} />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col">
          <ChatWindow
            messages={messages}
            pending={pending}
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
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
