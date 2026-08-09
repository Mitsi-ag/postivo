'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { btnGhost, btnPrimary, ErrorBanner, inputCls, UpgradeBanner } from '@/components/ui';
import { api, ApiError } from '@/lib/client';
import { useRequireAuth } from '@/lib/useRequireAuth';

const STEPS = ['Connect a channel', 'Compose a post', 'Done'];

export default function OnboardingPage() {
  const { user, loading } = useRequireAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  async function connectDemo() {
    setBusy(true);
    setError(null);
    setShowUpgrade(false);
    try {
      const data = await api<{ channel: { id: string } }>('/api/channels', {
        method: 'POST',
        json: { provider: 'demo', name: 'My first channel', credentials: {} },
      });
      setChannelId(data.channel.id);
      setStep(1);
    } catch (err) {
      if (err instanceof ApiError && err.upgrade) setShowUpgrade(true);
      setError(err instanceof Error ? err.message : 'Failed to add channel');
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    setBusy(true);
    setError(null);
    try {
      await api('/api/posts', {
        method: 'POST',
        json: { content, media: [], scheduled_at: null, channelIds: channelId ? [channelId] : [] },
      });
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save post');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center text-2xl font-bold text-white">⚡ Postivo</div>

        {/* Step indicator */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  i < step
                    ? 'bg-emerald-600 text-white'
                    : i === step
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-500'
                }`}
              >
                {i < step ? '✓' : i + 1}
              </span>
              <span className={`text-xs ${i === step ? 'text-white' : 'text-slate-500'}`}>{label}</span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-slate-700" />}
            </div>
          ))}
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <UpgradeBanner show={showUpgrade} />
          <ErrorBanner message={error} />

          {step === 0 && (
            <>
              <h1 className="text-lg font-semibold text-white">Connect your first channel</h1>
              <p className="text-sm text-slate-400">
                Channels are where your posts get published. Start with the built-in demo channel — you can add
                Bluesky, Mastodon, X, LinkedIn, DEV or a webhook later.
              </p>
              <button onClick={connectDemo} disabled={busy} className={`${btnPrimary} w-full`}>
                {busy ? 'Connecting…' : '🧪 Add demo channel'}
              </button>
              <button onClick={() => setStep(1)} className={`${btnGhost} w-full`}>
                Skip for now
              </button>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="text-lg font-semibold text-white">Compose your first post</h1>
              <p className="text-sm text-slate-400">Write something — it will be saved as a draft.</p>
              <textarea
                rows={4}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className={inputCls}
                placeholder="Hello world 👋"
              />
              <button onClick={saveDraft} disabled={busy || !content.trim()} className={`${btnPrimary} w-full`}>
                {busy ? 'Saving…' : 'Save draft'}
              </button>
              <button onClick={() => setStep(2)} className={`${btnGhost} w-full`}>
                Skip for now
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="text-lg font-semibold text-white">You're all set 🎉</h1>
              <p className="text-sm text-slate-400">
                Head to your dashboard to schedule posts, connect real channels and explore the calendar.
              </p>
              <Link href="/dashboard" className={`${btnPrimary} w-full`}>
                Go to dashboard →
              </Link>
            </>
          )}
        </div>

        <button
          onClick={() => router.push('/dashboard')}
          className="mt-4 block w-full text-center text-xs text-slate-600 hover:text-slate-400"
        >
          Skip onboarding entirely
        </button>
      </div>
    </div>
  );
}
