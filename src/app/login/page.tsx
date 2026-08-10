'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client';
import { Wordmark } from '@/components/icons';
import { btnPrimary, ErrorBanner, inputCls } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api('/api/auth/login', { method: 'POST', json: { email, password } });
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
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
        <form onSubmit={submit} className="edge-top space-y-4 rounded-card border border-line bg-surface p-6">
          <h1 className="font-display text-lg font-semibold text-fg">Welcome back</h1>
          <ErrorBanner message={error} />
          <div>
            <label className="mb-1 block text-xs font-medium text-mut">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-mut">Password</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              placeholder="••••••••"
            />
          </div>
          <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
            {busy ? 'Logging in…' : 'Log in'}
          </button>
          <p className="text-center text-xs text-dim">
            No account?{' '}
            <Link href="/register" className="text-iris-soft transition-colors hover:text-iris">
              Register
            </Link>
          </p>
        </form>
        <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-dim">
          One process · One file · Your data
        </p>
      </div>
    </div>
  );
}
