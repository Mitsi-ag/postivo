import type { Metadata, Viewport } from 'next';
import { Instrument_Sans, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import { ToastProvider } from '@/components/toast';
import './globals.css';

const display = Space_Grotesk({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-space-grotesk',
});

const sans = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-instrument-sans',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains-mono',
});

const BASE = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export const metadata: Metadata = {
  metadataBase: new URL(BASE),
  title: 'Postivo — Schedule everywhere. Self-host anywhere.',
  description:
    'A radically simpler social media scheduler. One Next.js app, one Postgres, in-process scheduler. MIT licensed.',
  openGraph: {
    title: 'Postivo — Schedule everywhere. Self-host anywhere.',
    description:
      'A radically simpler social media scheduler. One Next.js app, one Postgres, in-process scheduler. MIT licensed.',
    type: 'website',
    url: BASE,
    siteName: 'Postivo',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Postivo — Schedule everywhere. Ship from one binary.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Postivo — Schedule everywhere. Self-host anywhere.',
    description:
      'A radically simpler social media scheduler. One Next.js app, one Postgres, in-process scheduler. MIT licensed.',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#07080c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
