'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { btnGhost, btnPrimary, ErrorBanner, inputCls, UpgradeBanner } from '@/components/ui';
import { CheckIcon, ProviderMark, Wordmark } from '@/components/icons';
import { api, ApiError } from '@/lib/client';
import { useRequireAuth } from '@/lib/useRequireAuth';
import type { ProviderMeta } from '@/lib/types';

const STEPS = ['Connect a channel', 'Compose a post', 'Done'];
const STEP_KEY = 'postivo-onboarding-step';

// Same demand-ordered grouping as /channels — social first, demo last.
const PROVIDER_SECTIONS: { label: string; ids: string[] }[] = [
  { label: 'Social', ids: ['instagram', 'tiktok', 'youtube', 'x', 'linkedin', 'bluesky', 'mastodon', 'reddit', 'pinterest', 'telegram'] },
  { label: 'Blogs & communities', ids: ['devto', 'hashnode', 'medium', 'wordpress'] },
  { label: 'Developer', ids: ['webhook', 'demo'] },
];

function groupProviders(providers: ProviderMeta[]): { label: string; items: ProviderMeta[] }[] {
  const byId = new Map(providers.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const groups = PROVIDER_SECTIONS.map((s) => ({
    label: s.label,
    items: s.ids
      .filter((id) => {
        const hit = byId.has(id);
        if (hit) seen.add(id);
        return hit;
      })
      .map((id) => byId.get(id) as ProviderMeta),
  }));
  const rest = providers.filter((p) => !seen.has(p.id));
  if (rest.length > 0) groups[groups.length - 2].items.push(...rest);
  return groups.filter((g) => g.items.length > 0);
}

export default function OnboardingPage() {
  const { user, loading } = useRequireAuth();
  const [step, setStep] = useState(0);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [providers, setProviders] = useState<ProviderMeta[]>([]);
  const [addingProvider, setAddingProvider] = useState<ProviderMeta | null>(null);
  const [name, setName] = useState('');
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [busy, setBusy] = useState(false);

  // Resume where the user left off.
  useEffect(() => {
    const saved = Number(sessionStorage.getItem(STEP_KEY));
    if (Number.isInteger(saved) && saved >= 0 && saved < STEPS.length) setStep(saved);
  }, []);

  useEffect(() => {
    api<{ providers: ProviderMeta[] }>('/api/providers')
      .then((d) => setProviders(d.providers))
      .catch(() => {});
  }, []);

  function goStep(n: number) {
    setStep(n);
    sessionStorage.setItem(STEP_KEY, String(n));
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-dim">Loading…</div>
      </div>
    );
  }

  function startAdd(p: ProviderMeta) {
    setAddingProvider(p);
    setName('');
    setForm({});
    setError(null);
  }

  async function connect(provider: string, displayName: string, credentials: Record<string, string>) {
    setBusy(true);
    setError(null);
    setShowUpgrade(false);
    try {
      const data = await api<{ channel: { id: string } }>('/api/channels', {
        method: 'POST',
        json: { provider, name: displayName, credentials },
      });
      setChannelId(data.channel.id);
      goStep(1);
    } catch (err) {
      if (err instanceof ApiError && err.upgrade) setShowUpgrade(true);
      setError(err instanceof Error ? err.message : 'Failed to add channel');
    } finally {
      setBusy(false);
    }
  }

  async function submitConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!addingProvider) return;
    await connect(addingProvider.id, name.trim() || addingProvider.name, form);
  }

  async function connectDemo() {
    await connect('demo', 'My first channel', {});
  }

  async function saveDraft() {
    setBusy(true);
    setError(null);
    try {
      await api('/api/posts', {
        method: 'POST',
        json: { content, media: [], scheduled_at: null, channelIds: channelId ? [channelId] : [] },
      });
      goStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save post');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(closest-side, rgba(110,107,240,.12), transparent)' }}
      />
      <div className="relative w-full max-w-lg">
        <div className="mb-8 flex justify-center">
          <Wordmark size={20} />
        </div>

        {/* Step indicator */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  i < step
                    ? 'bg-ok text-ink'
                    : i === step
                      ? 'bg-iris-fill text-white'
                      : 'bg-raised text-mut'
                }`}
              >
                {i < step ? <CheckIcon size={13} /> : i + 1}
              </span>
              <span className={`text-xs ${i === step ? 'text-fg' : 'text-dim'}`}>{label}</span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-raised" />}
            </div>
          ))}
        </div>

        <div className="edge-top space-y-4 rounded-card border border-line bg-surface p-6">
          <UpgradeBanner show={showUpgrade} />
          <ErrorBanner message={error} />

          {step === 0 && (
            <>
              <h1 className="font-display text-lg font-semibold text-fg">Connect your first channel</h1>
              <p className="text-sm text-mut">
                Channels are where your posts get published. Pick a platform and paste its credentials.
              </p>

              <div className="space-y-3">
                {groupProviders(providers)
                  .filter((s) => s.label !== 'Developer')
                  .map((section) => (
                    <div key={section.label}>
                      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">{section.label}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {section.items.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => startAdd(p)}
                            aria-pressed={addingProvider?.id === p.id}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                              addingProvider?.id === p.id
                                ? 'border-iris bg-iris/10 text-iris-soft'
                                : 'border-line text-mut hover:border-line2 hover:text-fg'
                            }`}
                          >
                            {addingProvider?.id === p.id && <CheckIcon size={11} />}
                            <ProviderMark id={p.id} name={p.name} color={p.color} size={16} />
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>

              {addingProvider && (
                <form onSubmit={submitConnect} className="space-y-3 border-t border-line pt-4">
                  <p className="text-sm text-mut">
                    Connect <span className="font-medium text-fg">{addingProvider.name}</span>
                  </p>
                  <div>
                    <label htmlFor="ob-channel-name" className="mb-1 block text-xs font-medium text-mut">
                      Display name
                    </label>
                    <input
                      id="ob-channel-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={inputCls}
                      placeholder={addingProvider.name}
                    />
                  </div>
                  {addingProvider.fields.map((f) => (
                    <div key={f.key}>
                      <label htmlFor={`ob-field-${f.key}`} className="mb-1 block text-xs font-medium text-mut">
                        {f.label}
                        {f.optional && <span className="text-dim"> (optional)</span>}
                      </label>
                      <input
                        id={`ob-field-${f.key}`}
                        type={f.secret ? 'password' : 'text'}
                        value={form[f.key] ?? ''}
                        onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                        className={inputCls}
                        placeholder={f.placeholder}
                        required={!f.optional}
                        autoComplete="off"
                      />
                      {f.secret && f.placeholder && <p className="mt-1 text-xs text-dim">{f.placeholder}</p>}
                    </div>
                  ))}
                  <div className="flex gap-3 pt-1">
                    <button type="submit" disabled={busy} className={btnPrimary}>
                      {busy ? 'Connecting…' : 'Connect channel'}
                    </button>
                    <button type="button" onClick={() => setAddingProvider(null)} className={btnGhost}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              <button
                onClick={() => void connectDemo()}
                disabled={busy}
                className="text-xs text-dim underline underline-offset-2 transition-colors hover:text-mut disabled:opacity-50"
              >
                Just exploring? Add a demo channel instead
              </button>

              <button onClick={() => goStep(1)} className={`${btnGhost} w-full`}>
                Skip for now
              </button>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="font-display text-lg font-semibold text-fg">Compose your first post</h1>
              <p className="text-sm text-mut">Write something — it will be saved as a draft.</p>
              <textarea
                rows={4}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className={inputCls}
                placeholder="Hello world"
              />
              <button onClick={saveDraft} disabled={busy || !content.trim()} className={`${btnPrimary} w-full`}>
                {busy ? 'Saving…' : 'Save draft'}
              </button>
              <button onClick={() => goStep(2)} className={`${btnGhost} w-full`}>
                Skip for now
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="flex items-center gap-2 font-display text-lg font-semibold text-fg">
                <CheckIcon size={18} className="text-ok" />
                You&apos;re all set
              </h1>
              <p className="text-sm text-mut">
                Head to your dashboard to schedule posts, connect real channels and explore the calendar.
              </p>
              <Link href="/dashboard" className={`${btnPrimary} w-full`}>
                Go to dashboard
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
