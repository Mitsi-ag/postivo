'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { AlertIcon, Wordmark } from '@/components/icons';
import { btnGhost, btnPrimary } from '@/components/ui';

type View = 'loading' | 'success' | 'invalid' | 'expired';

function VerifyEmailInner() {
  const token = useSearchParams().get('token') ?? '';
  const [view, setView] = useState<View>('loading');
  const [hasSession, setHasSession] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState<string | null>(null);
  const started = useRef(false); // consume the token exactly once per mount

  useEffect(() => {
    // A resend only makes sense for a signed-in user; everyone else gets a login link.
    fetch('/api/auth/me')
      .then((res) => {
        if (res.ok) setHasSession(true);
      })
      .catch(() => {});
  }, []);

  async function resend() {
    setResending(true);
    setResent(null);
    try {
      const res = await fetch('/api/auth/verify/resend', { method: 'POST' });
      setResent(res.ok ? 'Verification email sent — check your inbox.' : 'Could not send right now — try again later.');
    } catch {
      setResent('Could not send right now — try again later.');
    } finally {
      setResending(false);
    }
  }

  // In-page resend block for the dead-end states.
  const resendBlock = (
    <>
      {hasSession ? (
        <>
          <button onClick={() => void resend()} disabled={resending} className={`${btnGhost} w-full`}>
            {resending ? 'Sending…' : 'Resend verification email'}
          </button>
          {resent && <p className="text-center text-xs text-mut">{resent}</p>}
        </>
      ) : (
        <p className="text-center text-xs text-dim">
          <Link href="/login" className="text-iris-soft transition-colors hover:text-iris">
            Log in to resend
          </Link>
        </p>
      )}
    </>
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
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
    <div
      className={`edge-top space-y-4 rounded-card border bg-surface p-6 ${
        view === 'expired' ? 'border-warn/25' : view === 'invalid' ? 'border-err/25' : 'border-line'
      }`}
    >
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
            This verification link is invalid or has already been used. You can request a new one below or from the
            dashboard banner.
          </p>
          {resendBlock}
          <Link href="/dashboard" className={`${btnPrimary} w-full`}>
            Go to dashboard
          </Link>
        </>
      )}
      {view === 'expired' && (
        <>
          <h1 className="flex items-center gap-2 font-display text-lg font-semibold text-fg">
            <AlertIcon size={17} className="shrink-0 text-warn" />
            Link expired
          </h1>
          <p className="text-sm leading-relaxed text-mut">
            This verification link has expired — links are valid for 24 hours. Request a new one below or from the
            dashboard banner.
          </p>
          {resendBlock}
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
        <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-dim">
          One process · One file · Your data
        </p>
      </div>
    </div>
  );
}
