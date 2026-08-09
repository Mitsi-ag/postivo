import type { Metadata } from 'next';
import { ToastProvider } from '@/components/toast';
import './globals.css';

export const metadata: Metadata = {
  title: 'Postivo — Schedule everywhere. Self-host anywhere.',
  description:
    'A radically simpler social media scheduler. One Next.js app, one Postgres, in-process scheduler. MIT licensed.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
