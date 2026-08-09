'use client';

import { useEffect, useState } from 'react';
import Portal from '@/components/Portal';
import { Badge, btnDanger, btnGhost, btnPrimary, cardCls, ErrorBanner, inputCls, UpgradeBanner } from '@/components/ui';
import { api, ApiError, formatDate } from '@/lib/client';
import type { ChannelDTO, ProviderMeta } from '@/lib/types';

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelDTO[]>([]);
  const [providers, setProviders] = useState<ProviderMeta[]>([]);
  const [addingProvider, setAddingProvider] = useState<ProviderMeta | null>(null);
  const [name, setName] = useState('');
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [busy, setBusy] = useState(false);

  function load() {
    Promise.all([
      api<{ channels: ChannelDTO[] }>('/api/channels'),
      api<{ providers: ProviderMeta[] }>('/api/providers'),
    ])
      .then(([c, p]) => {
        setChannels(c.channels);
        setProviders(p.providers);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }

  useEffect(load, []);

  function startAdd(p: ProviderMeta) {
    setAddingProvider(p);
    setName('');
    setForm({});
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!addingProvider) return;
    setBusy(true);
    setError(null);
    setShowUpgrade(false);
    try {
      await api('/api/channels', {
        method: 'POST',
        json: { provider: addingProvider.id, name, credentials: form },
      });
      setAddingProvider(null);
      load();
    } catch (err) {
      if (err instanceof ApiError && err.upgrade) setShowUpgrade(true);
      setError(err instanceof Error ? err.message : 'Failed to add channel');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this channel? Pending posts for it will be dropped.')) return;
    try {
      await api(`/api/channels/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <Portal title="Channels">
      <div className="mx-auto max-w-4xl space-y-6">
        <UpgradeBanner show={showUpgrade} />
        <ErrorBanner message={error} />

        <div className={cardCls}>
          <h2 className="mb-4 font-semibold text-white">Connected channels</h2>
          {channels.length === 0 ? (
            <p className="text-sm text-slate-500">No channels connected yet. Add one below.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {channels.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-lg"
                      style={{ backgroundColor: `${c.provider_meta?.color ?? '#334155'}22` }}
                    >
                      {c.provider_meta?.icon ?? '❓'}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-200">{c.name}</p>
                      <p className="text-xs text-slate-500">
                        {c.provider_meta?.name ?? c.provider} · added {formatDate(c.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge status={c.status} />
                    <button onClick={() => void remove(c.id)} className={btnDanger}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={cardCls}>
          <h2 className="mb-4 font-semibold text-white">Add a channel</h2>
          <div className="flex flex-wrap gap-2">
            {providers.map((p) => (
              <button
                key={p.id}
                onClick={() => startAdd(p)}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  addingProvider?.id === p.id
                    ? 'border-indigo-500 bg-indigo-600/20 text-indigo-200'
                    : 'border-slate-700 text-slate-300 hover:border-slate-500'
                }`}
              >
                {p.icon} {p.name}
              </button>
            ))}
          </div>

          {addingProvider && (
            <form onSubmit={submit} className="mt-5 space-y-3 border-t border-slate-800 pt-5">
              <p className="text-sm text-slate-400">
                Connect <span className="font-medium text-slate-200">{addingProvider.name}</span>
              </p>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Display name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                  placeholder={addingProvider.name}
                />
              </div>
              {addingProvider.fields.map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-xs font-medium text-slate-400">
                    {f.label}
                    {f.optional && <span className="text-slate-600"> (optional)</span>}
                  </label>
                  <input
                    type={f.secret ? 'password' : 'text'}
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                    className={inputCls}
                    placeholder={f.placeholder}
                    required={!f.optional}
                  />
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
        </div>
      </div>
    </Portal>
  );
}
