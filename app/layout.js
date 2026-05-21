import { Analytics } from '@vercel/analytics/next';
import './globals.css';

export const metadata = {
  title: 'Gemel — NFC Summit 2026 Visitor Concierge',
  description:
    'A conversational concierge for visitors of NFC Summit 2026 in Lisbon, planned by Gemel — Normie #6832.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&f[]=satoshi@400,500,700&display=swap"
        />
      </head>
      <body className="min-h-screen antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
