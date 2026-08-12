'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Wordmark } from '@/components/icons';
import { btnPrimary, ErrorBanner, inputCls } from '@/components/ui';

type View = 'checking' | 'form' | 'invalid' | 'expired';

const VIEW_TEXT: Record<'invalid' | 'expired', { title: string; body: string }> = {
  invalid: {
    title: 'Link already used',
    body: 'This reset link is invalid or has already been used. Request a fresh one below.',
  },
  expired: {
    title: 'Link expired',
    body: 'This reset link has expired — reset links are valid for 1 hour. Request a fresh one below.',
  },
};

function ResetPasswordInner() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [view, setView] = useState<View>('checking');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setView('invalid');
      return;
    }
    let cancelled = false;
    fetch(`/api/auth/reset?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          setView('form');
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok) {
        if (data.code === 'invalid' || data.code === 'expired') {
          setView(data.code);
          return;
        }
        setError(data.error || `Request failed (${res.status})`);
        return;
      }
      // Server attached a fresh session — land signed in.
      router.push('/dashboard');
    } catch {
      setError('Network error — try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="edge-top space-y-4 rounded-card border border-line bg-surface p-6">
      {view === 'checking' && (
        <p className="font-mono text-xs uppercase tracking-widest text-dim">Checking link…</p>
      )}
      {(view === 'invalid' || view === 'expired') && (
        <>
          <h1 className="font-display text-lg font-semibold text-fg">{VIEW_TEXT[view].title}</h1>
          <p className="text-sm leading-relaxed text-mut">{VIEW_TEXT[view].body}</p>
          <Link href="/forgot-password" className={`${btnPrimary} w-full`}>
            Request a new link
          </Link>
        </>
      )}
      {view === 'form' && (
        <form onSubmit={submit} className="space-y-4">
          <h1 className="font-display text-lg font-semibold text-fg">Choose a new password</h1>
          <ErrorBanner message={error} />
          <div>
            <label htmlFor="reset-password" className="mb-1 block text-xs font-medium text-mut">
              New password
            </label>
            <div className="relative">
              <input
                id="reset-password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputCls} pr-14`}
                placeholder="At least 8 characters"
              />
              <button
                type="button"
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-1 text-xs text-dim transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-soft"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
            {busy ? 'Resetting…' : 'Reset password'}
          </button>
          <p className="text-center text-xs text-dim">
            Resetting signs out all other sessions.
          </p>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
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
          <ResetPasswordInner />
        </Suspense>
        <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-dim">
          One process · One file · Your data
        </p>
      </div>
    </div>
  );
}
