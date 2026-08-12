'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/client';
import { Wordmark } from '@/components/icons';
import { btnPrimary, inputCls } from '@/components/ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      // Always 200 — the response never reveals whether the email exists.
      const res = await api<{ ok: boolean; email_enabled?: boolean }>('/api/auth/forgot', { method: 'POST', json: { email } });
      setEmailEnabled(res.email_enabled !== false);
      setSent(true);
    } catch {
      setSent(true); // keep the anti-enumeration UX even on network errors
    } finally {
      setBusy(false);
    }
  }

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
        <div className="edge-top rounded-card border border-line bg-surface p-6">
          {sent ? (
            <div className="space-y-4">
              <h1 className="font-display text-lg font-semibold text-fg">Check your inbox</h1>
              <p className="text-sm leading-relaxed text-mut">
                If an account exists for <span className="text-fg">{email}</span>, we&apos;ve sent a password reset
                link. It expires in 1 hour.
              </p>
              {!emailEnabled && (
                <p className="rounded-lg border border-line bg-bg/60 px-3 py-2 text-xs leading-relaxed text-dim">
                  Heads up: this Postivo instance doesn&apos;t have email delivery configured, so no message was
                  actually sent. Ask the administrator to set EMAIL_ENABLED/EMAIL_FROM, or contact support.
                </p>
              )}
              <Link href="/login" className={`${btnPrimary} w-full`}>
                Back to log in
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <h1 className="font-display text-lg font-semibold text-fg">Forgot your password?</h1>
              <p className="text-sm leading-relaxed text-mut">
                Enter your account email and we&apos;ll send you a reset link.
              </p>
              <div>
                <label htmlFor="forgot-email" className="mb-1 block text-xs font-medium text-mut">
                  Email
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputCls}
                  placeholder="you@example.com"
                />
              </div>
              <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
              <p className="text-center text-xs text-dim">
                Remembered it?{' '}
                <Link href="/login" className="text-iris-soft transition-colors hover:text-iris">
                  Log in
                </Link>
              </p>
            </form>
          )}
        </div>
        <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-dim">
          One process · One file · Your data
        </p>
      </div>
    </div>
  );
}
