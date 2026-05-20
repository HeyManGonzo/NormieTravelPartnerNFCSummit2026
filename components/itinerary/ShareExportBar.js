'use client';

import { useEffect, useState } from 'react';
import ExportBar from './ExportBar';

// Wrapper used on the public /itinerary/[shareToken] page that builds the
// absolute share URL on the client (we don't have request headers here).
export default function ShareExportBar({ token, locale }) {
  const [shareUrl, setShareUrl] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && token) {
      setShareUrl(`${window.location.origin}/itinerary/${token}`);
    }
  }, [token]);

  return <ExportBar token={token} shareUrl={shareUrl} locale={locale} />;
}
