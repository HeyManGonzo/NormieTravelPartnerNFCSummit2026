'use client';

import { useState } from 'react';
import { Download, FileText, FileType, CalendarPlus, Link as LinkIcon, Check } from 'lucide-react';

function buildHref(path, token, locale) {
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (locale) params.set('locale', locale);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export default function ExportBar({
  token,
  shareUrl,
  locale,
  labels = {
    pdf: 'PDF',
    md: 'Markdown',
    ics: 'Calendar',
    share: 'Copy link',
    shareCopied: 'Copied',
  },
  className = '',
}) {
  const [copied, setCopied] = useState(false);

  async function copyShare() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback: open in a new tab so user can copy manually.
      window.prompt('Copy this link', shareUrl);
    }
  }

  const btn =
    'inline-flex items-center gap-1.5 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-text)] transition hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface-2)]';

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <a className={btn} href={buildHref('/api/itinerary/export/pdf', token, locale)} download>
        <FileType size={12} aria-hidden /> {labels.pdf}
      </a>
      <a className={btn} href={buildHref('/api/itinerary/export/md', token, locale)} download>
        <FileText size={12} aria-hidden /> {labels.md}
      </a>
      <a className={btn} href={buildHref('/api/itinerary/export/ics', token, locale)} download>
        <CalendarPlus size={12} aria-hidden /> {labels.ics}
      </a>
      {shareUrl && (
        <button type="button" onClick={copyShare} className={btn} aria-label={labels.share}>
          {copied ? (
            <>
              <Check size={12} aria-hidden /> {labels.shareCopied}
            </>
          ) : (
            <>
              <LinkIcon size={12} aria-hidden /> {labels.share}
            </>
          )}
        </button>
      )}
    </div>
  );
}
