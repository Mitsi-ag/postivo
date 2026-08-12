'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client';
import { Wordmark } from '@/components/icons';
import { btnPrimary, ErrorBanner, inputCls } from '@/components/ui';

// 0–3 segments: ≥8 chars → 1 (err), ≥12 with mixed case → 2 (warn), plus a digit/symbol → 3 (ok).
function passwordStrength(pw: string): 0 | 1 | 2 | 3 {
  if (pw.length < 8) return 0;
  const mixed = /[a-z]/.test(pw) && /[A-Z]/.test(pw);
  const digitOrSymbol = /[0-9]/.test(pw) || /[^a-zA-Z0-9]/.test(pw);
  if (pw.length >= 12 && mixed && digitOrSymbol) return 3;
  if (pw.length >= 12 && mixed) return 2;
  return 1;
}

const STRENGTH_TONE = ['', 'bg-err', 'bg-warn', 'bg-ok'];

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const strength = passwordStrength(password);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api('/api/auth/register', { method: 'POST', json: { name, email, password } });
      router.push('/onboarding');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
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
          <h1 className="font-display text-lg font-semibold text-fg">Create your account</h1>
          <ErrorBanner message={error} />
          <div>
            <label htmlFor="reg-name" className="mb-1 block text-xs font-medium text-mut">Name</label>
            <input
              id="reg-name"
              type="text"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder="Ada Lovelace"
            />
          </div>
          <div>
            <label htmlFor="reg-email" className="mb-1 block text-xs font-medium text-mut">Email</label>
            <input
              id="reg-email"
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
            <label htmlFor="reg-password" className="mb-1 block text-xs font-medium text-mut">Password</label>
            <div className="relative">
              <input
                id="reg-password"
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
            <div aria-hidden className="mt-2 flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${i < strength ? STRENGTH_TONE[strength] : 'bg-raised'}`}
                />
              ))}
            </div>
          </div>
          <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
          <p className="text-center text-xs text-dim">
            By creating an account you agree to our{' '}
            <Link href="/terms" className="text-iris-soft transition-colors hover:text-iris">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-iris-soft transition-colors hover:text-iris">
              Privacy Policy
            </Link>
            .
          </p>
          <p className="text-center text-xs text-dim">
            Already registered?{' '}
            <Link href="/login" className="text-iris-soft transition-colors hover:text-iris">
              Log in
            </Link>
          </p>
        </form>
        <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-dim">
          Free forever · No credit card
        </p>
      </div>
    </div>
  );
}
