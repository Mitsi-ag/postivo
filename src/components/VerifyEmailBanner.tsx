'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/client';

// Shown at the top of every portal screen while the account email is
// unverified. Non-blocking: the app stays fully usable; the banner just nags.
export default function VerifyEmailBanner() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'ok' | 'err'>('ok');

  async function resend() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await api<{ ok: boolean; email_enabled?: boolean }>('/api/auth/verify/resend', { method: 'POST' });
      setTone(res.email_enabled === false ? 'err' : 'ok');
      setMessage(
        res.email_enabled === false
          ? 'Email delivery is not configured on this instance — no message was sent.'
          : 'Verification email sent — check your inbox.',
      );
    } catch (err) {
      setTone('err');
      setMessage(
        err instanceof ApiError && err.status === 429
          ? 'Too many requests — try again in a few minutes.'
          : 'Could not send right now — try again later.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn/30 bg-warn/10 px-4 py-2.5 text-sm"
    >
      <span className="text-warn">
        <span className="font-medium">Verify your email</span>
        <span className="text-mut"> — confirm your address to secure your account.</span>
      </span>
      <span className="flex items-center gap-3">
        {message && <span className={`text-xs ${tone === 'ok' ? 'text-ok' : 'text-err'}`}>{message}</span>}
        <button
          onClick={resend}
          disabled={busy}
          className="shrink-0 rounded-lg border border-warn/40 px-3 py-1.5 text-xs font-medium text-warn transition-colors hover:bg-warn/15 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warn/40"
        >
          {busy ? 'Sending…' : 'Resend'}
        </button>
      </span>
    </div>
  );
}
