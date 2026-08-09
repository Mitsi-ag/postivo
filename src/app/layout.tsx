import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Postivo — Schedule everywhere. Self-host anywhere.',
  description:
    'A radically simpler social media scheduler. One Next.js app, embedded SQLite, in-process scheduler. MIT licensed.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
