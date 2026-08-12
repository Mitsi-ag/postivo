'use client';

import { useEffect, useRef, useState } from 'react';
import Portal from '@/components/Portal';
import { CheckIcon, ProviderMark } from '@/components/icons';
import { Badge, btnDanger, btnGhost, btnPrimary, cardCls, ConfirmDialog, ErrorBanner, inputCls, UpgradeBanner } from '@/components/ui';
import { api, ApiError, formatDate } from '@/lib/client';
import type { ChannelDTO, ProviderMeta } from '@/lib/types';

// Provider buttons grouped by demand — social first, developer plumbing last.
// Anything the registry adds later lands in "Blogs & communities".
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
    items: s.ids.filter((id) => {
      const hit = byId.has(id);
      if (hit) seen.add(id);
      return hit;
    }).map((id) => byId.get(id) as ProviderMeta),
  }));
  const rest = providers.filter((p) => !seen.has(p.id));
  if (rest.length > 0) groups[groups.length - 2].items.push(...rest);
  return groups.filter((g) => g.items.length > 0);
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelDTO[]>([]);
  const [providers, setProviders] = useState<ProviderMeta[]>([]);
  const [addingProvider, setAddingProvider] = useState<ProviderMeta | null>(null);
  const [editingChannel, setEditingChannel] = useState<ChannelDTO | null>(null);
  const [name, setName] = useState('');
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ChannelDTO | null>(null);
  const connectFormRef = useRef<HTMLDivElement>(null);

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

  // Bring the connect form into view once a provider is picked.
  useEffect(() => {
    if (addingProvider) connectFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [addingProvider]);

  function startAdd(p: ProviderMeta) {
    setAddingProvider(p);
    setEditingChannel(null);
    setName('');
    setForm({});
    setError(null);
  }

  function startEdit(c: ChannelDTO) {
    setEditingChannel(c);
    setAddingProvider(null);
    setName(c.name);
    setForm({});
    setError(null);
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingChannel) return;
    setBusy(true);
    setError(null);
    try {
      // Only non-empty fields are sent — blank fields keep their saved value.
      const credentials = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim()));
      await api(`/api/channels/${editingChannel.id}`, {
        method: 'PATCH',
        json: { name, ...(Object.keys(credentials).length ? { credentials } : {}) },
      });
      setEditingChannel(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update channel');
    } finally {
      setBusy(false);
    }
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
                    <button onClick={() => startEdit(c)} className={btnGhost}>
                      Edit
                    </button>
                    <button onClick={() => setPendingDelete(c)} className={btnDanger}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {editingChannel?.provider_meta && (
            <form onSubmit={submitEdit} className="mt-4 space-y-3 border-t border-line pt-4">
              <p className="text-sm text-mut">
                Edit <span className="font-medium text-fg">{editingChannel.name}</span>
                {editingChannel.status === 'error' && (
                  <span className="text-err"> — publishing failed; update the credentials to reactivate it.</span>
                )}
              </p>
              <div>
                <label htmlFor="edit-channel-name" className="mb-1 block text-xs font-medium text-mut">Display name</label>
                <input
                  id="edit-channel-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                  required
                />
              </div>
              {editingChannel.provider_meta.fields.map((f) => (
                <div key={f.key}>
                  <label htmlFor={`edit-field-${f.key}`} className="mb-1 block text-xs font-medium text-mut">
                    {f.label}
                    <span className="text-dim"> (leave blank to keep current)</span>
                  </label>
                  <input
                    id={`edit-field-${f.key}`}
                    type={f.secret ? 'password' : 'text'}
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                    className={inputCls}
                    placeholder={f.placeholder}
                    autoComplete="off"
                  />
                  {f.secret && f.placeholder && <p className="mt-1 text-xs text-dim">{f.placeholder}</p>}
                </div>
              ))}
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={busy} className={btnPrimary}>
                  {busy ? 'Saving…' : 'Save changes'}
                </button>
                <button type="button" onClick={() => setEditingChannel(null)} className={btnGhost}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        <div className={cardCls}>
          <h2 className="mb-4 font-semibold text-fg">Add a channel</h2>
          <div className="space-y-4">
            {groupProviders(providers).map((section) => (
              <div key={section.label}>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">{section.label}</p>
                <div className="flex flex-wrap gap-2">
                  {section.items.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => startAdd(p)}
                      aria-pressed={addingProvider?.id === p.id}
                      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                        addingProvider?.id === p.id
                          ? 'border-iris bg-iris/10 text-iris-soft'
                          : 'border-line text-mut hover:border-line2 hover:text-fg'
                      }`}
                    >
                      {addingProvider?.id === p.id && <CheckIcon size={11} />}
                      <ProviderMark id={p.id} name={p.name} color={p.color} size={18} />
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {addingProvider && (
            <div ref={connectFormRef} className="scroll-mt-6">
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
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete channel?"
        body={
          pendingDelete
            ? `Delete "${pendingDelete.name}"? Pending posts for it will be dropped.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          const c = pendingDelete;
          setPendingDelete(null);
          if (c) void remove(c.id);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </Portal>
  );
}
