import './globals.css';

export const metadata = {
  title: 'NFC Summit 2026 — Visitor Agent',
  description:
    'A conversational concierge for visitors of NFC Summit 2026 in Lisbon.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@500,700&f[]=switzer@400,500&display=swap"
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
