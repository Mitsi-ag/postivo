'use client';

import { useEffect, useState } from 'react';
import Portal from '@/components/Portal';
import { ProviderMark } from '@/components/icons';
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
          <h2 className="mb-4 font-semibold text-fg">Connected channels</h2>
          {channels.length === 0 ? (
            <p className="text-sm text-dim">No channels connected yet. Add one below.</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {channels.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex items-center gap-3">
                    <ProviderMark
                      id={c.provider}
                      name={c.provider_meta?.name ?? c.provider}
                      color={c.provider_meta?.color}
                      size={32}
                    />
                    <div>
                      <p className="text-sm font-medium text-fg">{c.name}</p>
                      <p className="text-xs text-dim">
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
          <h2 className="mb-4 font-semibold text-fg">Add a channel</h2>
          <div className="flex flex-wrap gap-2">
            {providers.map((p) => (
              <button
                key={p.id}
                onClick={() => startAdd(p)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                  addingProvider?.id === p.id
                    ? 'border-iris bg-iris/10 text-iris-soft'
                    : 'border-line text-mut hover:border-line2 hover:text-fg'
                }`}
              >
                <ProviderMark id={p.id} name={p.name} color={p.color} size={18} />
                {p.name}
              </button>
            ))}
          </div>

          {addingProvider && (
            <form onSubmit={submit} className="mt-5 space-y-3 border-t border-line pt-5">
              <p className="text-sm text-mut">
                Connect <span className="font-medium text-fg">{addingProvider.name}</span>
              </p>
              <div>
                <label htmlFor="channel-name" className="mb-1 block text-xs font-medium text-mut">Display name</label>
                <input
                  id="channel-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                  placeholder={addingProvider.name}
                />
              </div>
              {addingProvider.fields.map((f) => (
                <div key={f.key}>
                  <label htmlFor={`channel-field-${f.key}`} className="mb-1 block text-xs font-medium text-mut">
                    {f.label}
                    {f.optional && <span className="text-dim"> (optional)</span>}
                  </label>
                  <input
                    id={`channel-field-${f.key}`}
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
