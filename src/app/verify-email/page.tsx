'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Wordmark } from '@/components/icons';
import { btnPrimary } from '@/components/ui';

type View = 'loading' | 'success' | 'invalid' | 'expired';

function VerifyEmailInner() {
  const token = useSearchParams().get('token') ?? '';
  const [view, setView] = useState<View>('loading');

  useEffect(() => {
    if (!token) {
      setView('invalid');
      return;
    }
    let cancelled = false;
    fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          setView('success');
        } else {
          const data = (await res.json().catch(() => ({}))) as { code?: string };
          setView(data.code === 'expired' ? 'expired' : 'invalid');
        }
      })
      .catch(() => {
        if (!cancelled) setView('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="edge-top space-y-4 rounded-card border border-line bg-surface p-6">
      {view === 'loading' && <p className="font-mono text-xs uppercase tracking-widest text-dim">Verifying…</p>}
      {view === 'success' && (
        <>
          <h1 className="font-display text-lg font-semibold text-fg">Email verified</h1>
          <p className="text-sm leading-relaxed text-mut">
            Your email address is confirmed. You&apos;re all set.
          </p>
          <Link href="/dashboard" className={`${btnPrimary} w-full`}>
            Go to dashboard
          </Link>
        </>
      )}
      {view === 'invalid' && (
        <>
          <h1 className="font-display text-lg font-semibold text-fg">Link invalid</h1>
          <p className="text-sm leading-relaxed text-mut">
            This verification link is invalid or has already been used. You can request a new one from the
            dashboard banner.
          </p>
          <Link href="/dashboard" className={`${btnPrimary} w-full`}>
            Go to dashboard
          </Link>
        </>
      )}
      {view === 'expired' && (
        <>
          <h1 className="font-display text-lg font-semibold text-fg">Link expired</h1>
          <p className="text-sm leading-relaxed text-mut">
            This verification link has expired — links are valid for 24 hours. Request a new one from the
            dashboard banner.
          </p>
          <Link href="/dashboard" className={`${btnPrimary} w-full`}>
            Go to dashboard
          </Link>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(closest-side, rgba(110,107,240,.12), transparent)' }}
      />
      <div className="relative w-full max-w-sm">
        <Link href="/" className="mb-8 flex justify-center">
          <Wordmark size={20} />
        </Link>
        <Suspense
          fallback={
            <div className="edge-top rounded-card border border-line bg-surface p-6">
              <p className="font-mono text-xs uppercase tracking-widest text-dim">Loading…</p>
            </div>
          }
        >
          <VerifyEmailInner />
        </Suspense>
      </div>
    </div>
  );
}
