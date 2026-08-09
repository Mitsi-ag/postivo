'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Portal from '@/components/Portal';
import { btnGhost, btnPrimary, ErrorBanner, inputCls, UpgradeBanner } from '@/components/ui';
import { api, ApiError, toLocalInput } from '@/lib/client';
import type { ChannelDTO, PostDTO, ProviderMeta } from '@/lib/types';

const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

function ComposeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('post');

  const [channels, setChannels] = useState<ChannelDTO[]>([]);
  const [providers, setProviders] = useState<Record<string, ProviderMeta>>({});
  const [content, setContent] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [overrideOpen, setOverrideOpen] = useState<Record<string, boolean>>({});
  const [media, setMedia] = useState<string[]>([]);
  const [when, setWhen] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      api<{ channels: ChannelDTO[] }>('/api/channels'),
      api<{ providers: ProviderMeta[] }>('/api/providers'),
    ])
      .then(([c, p]) => {
        setChannels(c.channels);
        setProviders(Object.fromEntries(p.providers.map((m) => [m.id, m])));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  useEffect(() => {
    if (!editId) return;
    api<{ post: PostDTO }>(`/api/posts/${editId}`)
      .then(({ post }) => {
        setContent(post.content);
        setMedia(post.media);
        setWhen(toLocalInput(post.scheduled_at));
        const sel: Record<string, boolean> = {};
        const ovr: Record<string, string> = {};
        const open: Record<string, boolean> = {};
        for (const t of post.targets) {
          sel[t.channel_id] = true;
          if (t.content_override) {
            ovr[t.channel_id] = t.content_override;
            open[t.channel_id] = true;
          }
        }
        setSelected(sel);
        setOverrides(ovr);
        setOverrideOpen(open);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load post'));
  }, [editId]);

  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);
  const charLimit = useMemo(() => {
    const limits = selectedIds
      .map((id) => channels.find((c) => c.id === id))
      .filter((c): c is ChannelDTO => Boolean(c))
      .map((c) => providers[c.provider]?.maxLength)
      .filter((n): n is number => typeof n === 'number');
    return limits.length ? Math.min(...limits) : null;
  }, [selectedIds, channels, providers]);
  const overLimit = charLimit !== null && content.length > charLimit;

  async function uploadFiles(files: Iterable<File>) {
    setError(null);
    for (const f of files) {
      const fd = new FormData();
      fd.append('file', f);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const data = (await res.json()) as { id?: string; error?: string };
        if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
        setMedia((m) => [...m, data.id as string]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    }
  }

  async function aiCaption() {
    if (!content.trim()) {
      setError('Write some content first, then generate captions.');
      return;
    }
    setAiBusy(true);
    setError(null);
    setShowUpgrade(false);
    try {
      const data = await api<{ suggestions: string[] }>('/api/ai/caption', {
        method: 'POST',
        json: { content },
      });
      setSuggestions(data.suggestions);
    } catch (err) {
      if (err instanceof ApiError && err.upgrade) setShowUpgrade(true);
      setError(err instanceof Error ? err.message : 'Caption generation failed');
    } finally {
      setAiBusy(false);
    }
  }

  async function save(asDraft: boolean) {
    setError(null);
    if (!asDraft) {
      if (!when) {
        setError('Pick a date and time to schedule.');
        return;
      }
      if (selectedIds.length === 0) {
        setError('Select at least one channel.');
        return;
      }
    }
    setBusy(true);
    const payload = {
      content,
      media,
      scheduled_at: asDraft ? null : new Date(when).toISOString(),
      channelIds: selectedIds,
      overrides,
    };
    try {
      if (editId) {
        await api(`/api/posts/${editId}`, { method: 'PATCH', json: payload });
      } else {
        await api('/api/posts', { method: 'POST', json: payload });
      }
      router.push('/queue');
    } catch (err) {
      if (err instanceof ApiError && err.upgrade) setShowUpgrade(true);
      setError(err instanceof Error ? err.message : 'Save failed');
      setBusy(false);
    }
  }

  return (
    <Portal title={editId ? 'Edit post' : 'Compose'}>
      <div className="mx-auto max-w-3xl space-y-5">
        <UpgradeBanner show={showUpgrade} />
        <ErrorBanner message={error} />

        {/* Content */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-slate-300">Content</label>
            <span className={`text-xs ${overLimit ? 'font-semibold text-red-400' : 'text-slate-500'}`}>
              {content.length}
              {charLimit !== null ? ` / ${charLimit}` : ''} chars
            </span>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            className={`${inputCls} resize-y`}
            placeholder="What do you want to share?"
          />
          <div className="mt-3 flex items-center gap-3">
            <button onClick={aiCaption} disabled={aiBusy} className={btnGhost}>
              {aiBusy ? '✨ Thinking…' : '✨ AI caption'}
            </button>
          </div>
          {suggestions.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-slate-500">Click a suggestion to use it:</p>
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setContent(s);
                    setSuggestions([]);
                  }}
                  className="block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-left text-sm text-slate-300 hover:border-indigo-600"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Channels */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <label className="mb-3 block text-sm font-medium text-slate-300">Channels</label>
          {channels.length === 0 ? (
            <p className="text-sm text-slate-500">
              No channels yet —{' '}
              <a href="/channels" className="text-indigo-400 hover:text-indigo-300">
                connect one first
              </a>
              .
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {channels.map((c) => {
                  const meta = providers[c.provider];
                  const active = !!selected[c.id];
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelected((s) => ({ ...s, [c.id]: !s[c.id] }))}
                      className={`rounded-full border px-3 py-1.5 text-sm transition ${
                        active
                          ? 'border-indigo-500 bg-indigo-600/20 text-indigo-200'
                          : 'border-slate-700 text-slate-400 hover:border-slate-500'
                      }`}
                      title={meta ? `Max ${meta.maxLength} chars` : undefined}
                    >
                      {meta?.icon} {c.name}
                      {meta && <span className="ml-1.5 text-xs opacity-60">{meta.maxLength}</span>}
                    </button>
                  );
                })}
              </div>
              {selectedIds.map((cid) => {
                const c = channels.find((ch) => ch.id === cid);
                if (!c) return null;
                const meta = providers[c.provider];
                return (
                  <div key={cid} className="rounded-lg border border-slate-800">
                    <button
                      onClick={() => setOverrideOpen((o) => ({ ...o, [cid]: !o[cid] }))}
                      className="flex w-full items-center justify-between px-3 py-2 text-xs text-slate-400 hover:text-slate-200"
                    >
                      <span>
                        {meta?.icon} Override content for {c.name}
                      </span>
                      <span>{overrideOpen[cid] ? '▲' : '▼'}</span>
                    </button>
                    {overrideOpen[cid] && (
                      <textarea
                        value={overrides[cid] ?? ''}
                        onChange={(e) => setOverrides((o) => ({ ...o, [cid]: e.target.value }))}
                        rows={3}
                        className={`${inputCls} rounded-t-none border-x-0 border-b-0`}
                        placeholder={`Custom text for ${c.name} (leave empty to use the main content)`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Media */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <label className="mb-3 block text-sm font-medium text-slate-300">Media</label>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void uploadFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInput.current?.click()}
            className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm transition ${
              dragOver ? 'border-indigo-500 bg-indigo-950/30 text-indigo-300' : 'border-slate-700 text-slate-500 hover:border-slate-500'
            }`}
          >
            Drag & drop images or videos here, or click to browse (max 50MB)
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void uploadFiles(e.target.files);
              e.target.value = '';
            }}
          />
          {media.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-3">
              {media.map((id) => (
                <div key={id} className="group relative">
                  {IMAGE_RE.test(id) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/media/${id}`}
                      alt="upload"
                      className="h-20 w-20 rounded-lg border border-slate-700 object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-2xl">
                      🎬
                    </div>
                  )}
                  <button
                    onClick={() => setMedia((m) => m.filter((x) => x !== id))}
                    className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white group-hover:flex"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Schedule */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <label className="mb-2 block text-sm font-medium text-slate-300">Schedule for</label>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className={`${inputCls} max-w-xs`}
          />
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={() => void save(true)} disabled={busy} className={btnGhost}>
            Save draft
          </button>
          <button onClick={() => void save(false)} disabled={busy} className={btnPrimary}>
            {busy ? 'Saving…' : editId ? 'Save & schedule' : 'Schedule post'}
          </button>
        </div>
      </div>
    </Portal>
  );
}

export default function ComposePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>
      }
    >
      <ComposeInner />
    </Suspense>
  );
}
