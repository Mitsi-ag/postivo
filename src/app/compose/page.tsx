'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Portal from '@/components/Portal';
import PostPreview from '@/components/PostPreview';
import { useToast } from '@/components/toast';
import { CheckIcon, EyeIcon, FilmIcon, ImageIcon, PenIcon, PlusIcon, SparkIcon, UploadIcon, XIcon } from '@/components/icons';
import { ClockIcon, ProviderMark } from '@/components/icons';
import { btnGhost, btnPrimary, cardCls, ErrorBanner, inputCls, selectCls, TagChip, UpgradeBanner } from '@/components/ui';
import { api, ApiError, formatDate, toLocalInput } from '@/lib/client';
import type { ChannelDTO, ChannelSetDTO, MediaListItemDTO, PostCommentDTO, PostDTO, ProviderMeta, PublicUser } from '@/lib/types';

const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

interface MediaLibraryModalProps {
  onPick: (id: string) => void;
  onClose: () => void;
}

function MediaLibraryModal({ onPick, onClose }: MediaLibraryModalProps) {
  const [items, setItems] = useState<MediaListItemDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    api<{ media: MediaListItemDTO[] }>('/api/media-list')
      .then((d) => setItems(d.media))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load library'));
  }, []);

  // Focus management: move focus into the dialog on open, return it on close,
  // and let Escape dismiss.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Media library"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-fg">Media library</h3>
          <button ref={closeRef} onClick={onClose} aria-label="Close media library" className="text-mut transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris">
            <XIcon size={16} />
          </button>
        </div>
        {error && <ErrorBanner message={error} />}
        {items === null ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-lg bg-raised" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-dim">Your library is empty — upload something first.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {items.map((m) => (
              <button
                key={m.id}
                onClick={() => onPick(m.id)}
                title={m.name}
                className="group relative aspect-square overflow-hidden rounded-lg border border-line hover:border-iris focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris"
              >
                {m.mime.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/media/${m.id}`} alt={m.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-raised text-dim"><FilmIcon size={22} /></span>
                )}
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-1.5 py-0.5 text-left text-[10px] text-fg opacity-0 group-hover:opacity-100">
                  {m.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ComposeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('post');
  const toast = useToast();

  const [channels, setChannels] = useState<ChannelDTO[]>([]);
  const [providers, setProviders] = useState<Record<string, ProviderMeta>>({});
  const [sets, setSets] = useState<ChannelSetDTO[]>([]);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [content, setContent] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [overrideOpen, setOverrideOpen] = useState<Record<string, boolean>>({});
  const [media, setMedia] = useState<string[]>([]);
  const [when, setWhen] = useState('');
  const [comments, setComments] = useState<PostCommentDTO[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [repeat, setRepeat] = useState(''); // '' | '7' | '30' | 'custom'
  const [customDays, setCustomDays] = useState('14');
  const [bestSlots, setBestSlots] = useState<string[] | null>(null);
  const [bestBusy, setBestBusy] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [urlImport, setUrlImport] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [openThread, setOpenThread] = useState(false);
  const [openMedia, setOpenMedia] = useState(false);
  const [openTags, setOpenTags] = useState(false);
  const [setNameOpen, setSetNameOpen] = useState(false);
  const [setName, setSetName] = useState('');
  const [mediaNames, setMediaNames] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      api<{ channels: ChannelDTO[] }>('/api/channels'),
      api<{ providers: ProviderMeta[] }>('/api/providers'),
      api<{ sets: ChannelSetDTO[] }>('/api/sets'),
      api<{ user: PublicUser }>('/api/auth/me'),
    ])
      .then(([c, p, s, u]) => {
        setChannels(c.channels);
        setProviders(Object.fromEntries(p.providers.map((m) => [m.id, m])));
        setSets(s.sets);
        setUser(u.user);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  // Media handed over from /library via sessionStorage.
  useEffect(() => {
    const pending = sessionStorage.getItem('postivo:attach');
    if (pending) {
      sessionStorage.removeItem('postivo:attach');
      setMedia((m) => (m.includes(pending) ? m : [...m, pending]));
      setOpenMedia(true);
      toast.success('Media attached from library');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-linked schedule time (?at=YYYY-MM-DDTHH:mm) — calendar slots link here.
  useEffect(() => {
    if (editId) return;
    const at = searchParams.get('at');
    if (at && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at)) setWhen(at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!editId) return;
    api<{ post: PostDTO }>(`/api/posts/${editId}`)
      .then(({ post }) => {
        setContent(post.content);
        setMedia(post.media);
        setWhen(toLocalInput(post.scheduled_at));
        setComments(post.comments ?? []);
        setTags(post.tags ?? []);
        // Editing a post that already has thread/media/tags → start those open.
        if ((post.comments ?? []).length > 0) setOpenThread(true);
        if (post.media.length > 0) setOpenMedia(true);
        if ((post.tags ?? []).length > 0) setOpenTags(true);
        if (post.repeat_every_days) {
          const r = String(post.repeat_every_days);
          if (r === '7' || r === '30') setRepeat(r);
          else {
            setRepeat('custom');
            setCustomDays(r);
          }
        }
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

  // Warn before navigating away with unsaved work.
  const dirty = content.trim() !== '' || media.length > 0 || selectedIds.length > 0;
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const charLimit = useMemo(() => {
    const limits = selectedIds
      .map((id) => channels.find((c) => c.id === id))
      .filter((c): c is ChannelDTO => Boolean(c))
      .map((c) => providers[c.provider]?.maxLength)
      .filter((n): n is number => typeof n === 'number');
    return limits.length ? Math.min(...limits) : null;
  }, [selectedIds, channels, providers]);
  const overLimit = charLimit !== null && content.length > charLimit;

  // Which channel binds the character limit — attribution for the counter.
  const limitBy = useMemo(() => {
    if (charLimit === null) return null;
    for (const id of selectedIds) {
      const c = channels.find((ch) => ch.id === id);
      if (c && providers[c.provider]?.maxLength === charLimit) {
        return providers[c.provider]?.name ?? c.name;
      }
    }
    return null;
  }, [charLimit, selectedIds, channels, providers]);

  const noReplyChannels = useMemo(
    () =>
      selectedIds
        .map((id) => channels.find((c) => c.id === id))
        .filter((c): c is ChannelDTO => Boolean(c))
        .filter((c) => !providers[c.provider]?.supportsReply),
    [selectedIds, channels, providers],
  );

  const noMediaChannels = useMemo(
    () =>
      selectedIds
        .map((id) => channels.find((c) => c.id === id))
        .filter((c): c is ChannelDTO => Boolean(c))
        .filter((c) => providers[c.provider] && !providers[c.provider].supportsMedia),
    [selectedIds, channels, providers],
  );

  const repeatDays = repeat === '' ? null : repeat === 'custom' ? Number(customDays) || null : Number(repeat);

  function addTag(raw: string) {
    const t = raw.trim().replace(/^#/, '').replace(/,\s*$/, '');
    if (!t) return;
    if (!tags.includes(t)) setTags((prev) => [...prev, t].slice(0, 20));
    setTagInput('');
  }

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
        setMediaNames((n) => ({ ...n, [data.id as string]: f.name }));
        setOpenMedia(true);
        toast.success(`Uploaded ${f.name}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Upload failed');
      }
    }
  }

  async function importFromUrl() {
    const url = urlImport.trim();
    if (!url) return;
    setUrlBusy(true);
    try {
      const data = await api<{ id: string }>('/api/upload/url', { method: 'POST', json: { url } });
      setMedia((m) => [...m, data.id]);
      setUrlImport('');
      toast.success('Media imported from URL');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setUrlBusy(false);
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

  async function fetchBestTime() {
    setBestBusy(true);
    try {
      const q = selectedIds.length ? `?channelIds=${selectedIds.join(',')}` : '';
      const data = await api<{ slots: string[] }>(`/api/best-time${q}`);
      setBestSlots(data.slots);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not compute best times');
    } finally {
      setBestBusy(false);
    }
  }

  function applySet(id: string) {
    const set = sets.find((s) => s.id === id);
    if (!set) return;
    const sel: Record<string, boolean> = {};
    for (const cid of set.channel_ids) sel[cid] = true;
    setSelected(sel);
    toast.success(`Applied set "${set.name}"`);
  }

  function saveAsSet() {
    if (selectedIds.length === 0) {
      toast.error('Select some channels first');
      return;
    }
    setSetName('');
    setSetNameOpen(true);
  }

  async function confirmSaveSet() {
    const name = setName.trim();
    if (!name) return;
    try {
      const d = await api<{ set: ChannelSetDTO }>('/api/sets', {
        method: 'POST',
        json: { name, channelIds: selectedIds },
      });
      setSets((s) => [...s, d.set]);
      setSetNameOpen(false);
      toast.success(`Set "${d.set.name}" saved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save set');
    }
  }

  async function save(asDraft: boolean, atOverride?: string) {
    const whenVal = atOverride ?? when;
    setError(null);
    if (!asDraft) {
      if (!whenVal) {
        setError('Pick a date and time to schedule.');
        return;
      }
      if (selectedIds.length === 0) {
        setError('Select at least one channel.');
        return;
      }
    }
    if (repeatDays && !whenVal) {
      setError('Recurring posts need a scheduled date and time.');
      return;
    }
    if (repeat === 'custom' && (!Number(customDays) || Number(customDays) < 1 || Number(customDays) > 365)) {
      setError('Custom repeat must be between 1 and 365 days.');
      return;
    }
    setBusy(true);
    const payload = {
      content,
      media,
      scheduled_at: asDraft ? null : new Date(whenVal).toISOString(),
      channelIds: selectedIds,
      overrides,
      comments: comments.filter((c) => c.content.trim()),
      repeat_every_days: repeatDays,
      tags,
    };
    try {
      if (editId) {
        await api(`/api/posts/${editId}`, { method: 'PATCH', json: payload });
      } else {
        await api('/api/posts', { method: 'POST', json: payload });
      }
      toast.success(asDraft ? 'Draft saved' : editId ? 'Post updated' : 'Post scheduled');
      router.push('/queue');
    } catch (err) {
      if (err instanceof ApiError && err.upgrade) setShowUpgrade(true);
      setError(err instanceof Error ? err.message : 'Save failed');
      setBusy(false);
    }
  }

  function publishNow() {
    const now = toLocalInput(new Date().toISOString());
    setWhen(now);
    void save(false, now);
  }

  const closeLibrary = useCallback(() => setLibraryOpen(false), []);

  return (
    <Portal title={editId ? 'Edit post' : 'Compose'}>
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          {/* ── Left: editor ─────────────────────────────────────────── */}
          <div className="min-w-0 space-y-5">
            <UpgradeBanner show={showUpgrade} />
            <ErrorBanner message={error} />

            {/* Content */}
            <div className={cardCls}>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="compose-content" className="text-sm font-medium text-fg">
                  Content
                </label>
                <span className={`font-mono text-xs ${overLimit ? 'font-semibold text-err' : 'text-dim'}`}>
                  {content.length}
                  {charLimit !== null ? ` / ${charLimit}` : ''} chars
                  {limitBy ? ` · limited by ${limitBy}` : ''}
                </span>
              </div>
              <textarea
                id="compose-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                className={`${inputCls} resize-y`}
                placeholder="What do you want to share?"
              />
              <div className="mt-3 flex items-center gap-3">
                <button onClick={aiCaption} disabled={aiBusy} className={btnGhost}>
                  <SparkIcon size={14} className="text-iris-soft" />
                  {aiBusy ? 'Thinking…' : 'AI caption'}
                </button>
              </div>
              {suggestions.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-dim">Click a suggestion to use it:</p>
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setContent(s);
                        setSuggestions([]);
                      }}
                      className="block w-full rounded-lg border border-line bg-surface px-3 py-2 text-left text-sm text-fg hover:border-iris"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {media.length > 0 && noMediaChannels.length > 0 && (
                <p className="mt-3 flex items-start gap-2 rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 text-xs text-warn">
                  Some selected channels can&apos;t attach media — it will be published as a link or ignored on:{' '}
                  {noMediaChannels.map((c) => c.name).join(', ')}.
                </p>
              )}
            </div>

            {/* Channels */}
            <div className={cardCls}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-fg">Channels</span>
                <div className="flex items-center gap-2">
                  {sets.length > 0 && (
                    <select
                      aria-label="Apply a channel set"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) applySet(e.target.value);
                        e.target.value = '';
                      }}
                      className={`${selectCls} py-1.5 text-xs`}
                    >
                      <option value="" disabled>
                        Apply set…
                      </option>
                      {sets.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.channel_ids.length})
                        </option>
                      ))}
                    </select>
                  )}
                  <button onClick={() => saveAsSet()} className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-mut transition-colors hover:border-line2 hover:bg-raised">
                    Save as set
                  </button>
                </div>
              </div>
              {setNameOpen && (
                <div className="mb-3 flex items-center gap-2">
                  <input
                    autoFocus
                    value={setName}
                    onChange={(e) => setSetName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void confirmSaveSet();
                      } else if (e.key === 'Escape') {
                        setSetNameOpen(false);
                      }
                    }}
                    placeholder="Set name"
                    aria-label="Set name"
                    className={`${inputCls} max-w-xs`}
                  />
                  <button onClick={() => void confirmSaveSet()} disabled={!setName.trim()} className={btnPrimary}>
                    Save
                  </button>
                  <button onClick={() => setSetNameOpen(false)} className={btnGhost}>
                    Cancel
                  </button>
                </div>
              )}
              {channels.length === 0 ? (
                <p className="text-sm text-dim">
                  No channels yet —{' '}
                  <a href="/channels" className="text-iris-soft hover:text-iris-soft">
                    connect one first
                  </a>
                  .
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Select channels">
                    {channels.map((c) => {
                      const meta = providers[c.provider];
                      const active = !!selected[c.id];
                      return (
                        <button
                          key={c.id}
                          onClick={() => setSelected((s) => ({ ...s, [c.id]: !s[c.id] }))}
                          aria-pressed={active}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/50 ${
                            active
                              ? 'border-iris bg-iris/10 text-iris-soft'
                              : 'border-line text-mut hover:border-line2'
                          }`}
                          title={meta ? `Max ${meta.maxLength} chars` : undefined}
                        >
                          {active && <CheckIcon size={11} />}
                          <ProviderMark id={c.provider} name={meta?.name ?? c.provider} color={meta?.color} size={18} />
                          {c.name}
                          {meta && <span className="ml-1.5 text-[10px] text-dim">{meta.maxLength.toLocaleString()} chars</span>}
                        </button>
                      );
                    })}
                  </div>
                  {selectedIds.map((cid) => {
                    const c = channels.find((ch) => ch.id === cid);
                    if (!c) return null;
                    const meta = providers[c.provider];
                    return (
                      <div key={cid} className="rounded-lg border border-line">
                        <button
                          onClick={() => setOverrideOpen((o) => ({ ...o, [cid]: !o[cid] }))}
                          aria-expanded={!!overrideOpen[cid]}
                          className="flex w-full items-center justify-between px-3 py-2 text-xs text-mut hover:text-fg"
                        >
                          <span className="flex items-center gap-2">
                            <ProviderMark id={c.provider} name={meta?.name ?? c.provider} color={meta?.color} size={16} />
                            Override content for {c.name}
                          </span>
                          <span aria-hidden className="text-dim">{overrideOpen[cid] ? '−' : '+'}</span>
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

            {/* Secondary sections — collapsed behind chips until needed */}
            <div className="flex flex-wrap gap-2" role="group" aria-label="Optional sections">
              {(
                [
                  { label: '+ Thread', open: openThread, toggle: () => setOpenThread((v) => !v) },
                  { label: '+ Media', open: openMedia, toggle: () => setOpenMedia((v) => !v) },
                  { label: '+ Tags', open: openTags, toggle: () => setOpenTags((v) => !v) },
                ] as const
              ).map((s) => (
                <button
                  key={s.label}
                  onClick={s.toggle}
                  aria-pressed={s.open}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/50 ${
                    s.open ? 'border-iris bg-iris/10 text-iris-soft' : 'border-line text-mut hover:border-line2 hover:text-fg'
                  }`}
                >
                  {s.open && <CheckIcon size={11} />}
                  {s.label}
                </button>
              ))}
            </div>

            {/* Follow-ups (thread) */}
            {openThread && (
            <div className={cardCls}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium text-fg">Follow-ups</span>
                <button
                  onClick={() => setComments((c) => [...c, { content: '', delayMin: 5 }])}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-mut transition-colors hover:border-line2 hover:bg-raised"
                >
                  <PlusIcon size={12} />
                  Add follow-up
                </button>
              </div>
              <p className="mb-3 text-xs text-dim">
                Posted as threaded replies after the main post, each delayed by the minutes you set.
              </p>
              {comments.length > 0 && noReplyChannels.length > 0 && (
                <p className="mb-3 flex items-start gap-2 rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 text-xs text-warn">
                  Follow-ups only post on channels that support replies. Ignored on:{' '}
                  {noReplyChannels.map((c) => c.name).join(', ')}.
                </p>
              )}
              <div className="space-y-3">
                {comments.map((c, i) => (
                  <div key={i} className="rounded-lg border border-line p-3">
                    <div className="mb-2 flex items-center justify-between text-xs text-dim">
                      <span>Reply {i + 1}</span>
                      <button
                        onClick={() => setComments((all) => all.filter((_, j) => j !== i))}
                        aria-label={`Remove follow-up ${i + 1}`}
                        className="text-dim transition-colors hover:text-err"
                      >
                        <XIcon size={13} />
                      </button>
                    </div>
                    <textarea
                      value={c.content}
                      onChange={(e) =>
                        setComments((all) => all.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)))
                      }
                      rows={2}
                      className={inputCls}
                      placeholder="Follow-up content…"
                    />
                    <label className="mt-2 flex items-center gap-2 text-xs text-dim">
                      Delay
                      <input
                        type="number"
                        min={0}
                        value={c.delayMin}
                        onChange={(e) =>
                          setComments((all) => all.map((x, j) => (j === i ? { ...x, delayMin: Number(e.target.value) } : x)))
                        }
                        className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-xs text-fg focus:border-iris focus:outline-none"
                      />
                      minutes after previous
                    </label>
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* Media */}
            {openMedia && (
            <div className={cardCls}>
              <span className="mb-3 block text-sm font-medium text-fg">Media</span>
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
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault(); // keep Space from scrolling the page
                    fileInput.current?.click();
                  }
                }}
                className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm transition ${
                  dragOver ? 'border-iris bg-iris/5 text-iris-soft' : 'border-white/15 bg-raised/40 text-mut hover:border-line2'
                }`}
              >
                <UploadIcon size={18} className="mx-auto text-dim" />
                <p className="mt-2">
                  Drag files here, or <span className="text-iris-soft underline underline-offset-2">browse</span>
                </p>
                <p className="mt-1 text-xs text-dim">Images or videos · max 50MB</p>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                aria-label="Upload media files"
                onChange={(e) => {
                  if (e.target.files) void uploadFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <input
                  value={urlImport}
                  onChange={(e) => setUrlImport(e.target.value)}
                  placeholder="https://… import media from URL"
                  className={`${inputCls} w-full flex-1 sm:max-w-xs`}
                  aria-label="Import media from URL"
                />
                <button onClick={() => void importFromUrl()} disabled={urlBusy || !urlImport.trim()} className={btnGhost}>
                  {urlBusy ? 'Importing…' : 'From URL'}
                </button>
                <button onClick={() => setLibraryOpen(true)} className={btnGhost}>
                  <ImageIcon size={14} />
                  Library
                </button>
              </div>
              {media.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-3">
                  {media.map((id) => (
                    <div key={id} className="group relative">
                      {IMAGE_RE.test(id) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/media/${id}`}
                          alt={mediaNames[id] ?? id}
                          className="h-20 w-20 rounded-lg border border-line object-cover"
                        />
                      ) : (
                        <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-line bg-raised text-dim">
                          <FilmIcon size={20} />
                        </div>
                      )}
                      <button
                        onClick={() => setMedia((m) => m.filter((x) => x !== id))}
                        aria-label="Remove media"
                        className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-err text-xs text-fg group-focus-within:flex group-hover:flex [@media(hover:none)]:flex"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            {/* Tags */}
            {openTags && (
            <div className={cardCls}>
              <label htmlFor="tag-input" className="mb-2 block text-sm font-medium text-fg">
                Tags
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {tags.map((t) => (
                  <TagChip key={t} tag={t} onRemove={() => setTags((all) => all.filter((x) => x !== t))} />
                ))}
                <input
                  id="tag-input"
                  value={tagInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.endsWith(',')) addTag(v);
                    else setTagInput(v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag(tagInput);
                    } else if (e.key === 'Backspace' && !tagInput && tags.length) {
                      setTags((all) => all.slice(0, -1));
                    }
                  }}
                  placeholder={tags.length === 0 ? 'Add tags, press Enter…' : ''}
                  className="min-w-32 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-fg placeholder:text-dim focus:border-iris focus:outline-none"
                />
              </div>
              <p className="mt-2 text-xs text-dim">Organize posts and filter them in the queue and calendar.</p>
            </div>
            )}

            {/* Schedule */}
            <div className={cardCls}>
              <label htmlFor="schedule-at" className="mb-2 block text-sm font-medium text-fg">
                Schedule for
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="schedule-at"
                  type="datetime-local"
                  value={when}
                  onChange={(e) => {
                    setWhen(e.target.value);
                    setBestSlots(null);
                  }}
                  className={`${inputCls} max-w-xs`}
                />
                <button onClick={() => void fetchBestTime()} disabled={bestBusy} className={btnGhost}>
                  <ClockIcon size={14} className="text-iris-soft" />
                  {bestBusy ? 'Finding…' : 'Best time'}
                </button>
              </div>
              {bestSlots && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {bestSlots.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setWhen(toLocalInput(s));
                        setBestSlots(null);
                      }}
                      className="rounded-full border border-iris/30 bg-iris/10 px-3 py-1.5 text-xs text-iris-soft hover:border-iris"
                    >
                      {formatDate(s)}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="repeat" className="mb-1 block text-xs font-medium text-mut">
                    Repeat
                  </label>
                  <select
                    id="repeat"
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value)}
                    className={`${selectCls} w-full max-w-xs`}
                  >
                    <option value="">Does not repeat</option>
                    <option value="7">Every 7 days</option>
                    <option value="30">Every 30 days</option>
                    <option value="custom">Custom…</option>
                  </select>
                  {repeat === 'custom' && (
                    <label className="mt-2 flex items-center gap-2 text-xs text-dim">
                      Every
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={customDays}
                        onChange={(e) => setCustomDays(e.target.value)}
                        className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-xs text-fg focus:border-iris focus:outline-none"
                      />
                      days
                    </label>
                  )}
                </div>
                {user?.signature_enabled && user.signature && (
                  <div className="rounded-lg border border-line bg-raised/50 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-mut">
                      <PenIcon size={12} className="text-iris-soft" />
                      Signature appended on publish
                    </p>
                    <p className="mt-1 truncate text-xs text-dim" title={user.signature}>
                      “{user.signature}”
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Sticky action bar — always reachable, shows the scheduled time */}
            <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-line bg-ink/90 py-3 backdrop-blur-md">
              <span className="min-w-0 truncate font-mono text-xs text-dim">
                {when ? formatDate(new Date(when).toISOString()) : 'No time set'}
              </span>
              <div className="flex shrink-0 justify-end gap-2 sm:gap-3">
                <button onClick={() => void save(true)} disabled={busy} className={btnGhost}>
                  Save draft
                </button>
                <button onClick={() => publishNow()} disabled={busy} className={btnGhost}>
                  Publish now
                </button>
                <button onClick={() => void save(false)} disabled={busy} className={btnPrimary}>
                  {busy ? 'Saving…' : 'Schedule post'}
                </button>
              </div>
            </div>
          </div>

          {/* ── Right: live previews (first on mobile) ──────────────── */}
          <div className="order-first min-w-0 lg:order-none">
            <div className="space-y-4 lg:sticky lg:top-6">
              <h2 className="text-sm font-medium text-fg">Live preview</h2>
              {selectedIds.length === 0 ? (
                <div className={`${cardCls} py-10 text-center`}>
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-raised/50 text-dim">
                    <EyeIcon size={18} />
                  </div>
                  <p className="mt-2 text-sm text-mut">Select channels to see per-platform previews.</p>
                </div>
              ) : (
                channels
                  .filter((c) => selected[c.id])
                  .map((c) => {
                    const meta = providers[c.provider] ?? null;
                    const text = (overrides[c.id] ?? '').trim() || content;
                    const max = meta?.maxLength;
                    const over = max !== undefined && text.length > max;
                    return (
                      <div key={c.id}>
                        <div className="mb-1.5 flex items-center justify-between text-xs">
                          <span className="flex items-center gap-2 font-medium text-mut">
                            <ProviderMark id={c.provider} name={meta?.name ?? c.provider} color={meta?.color} size={16} />
                            {c.name}
                            {(overrides[c.id] ?? '').trim() && (
                              <span className="ml-2 rounded-full bg-raised px-1.5 py-0.5 text-[10px] text-mut">
                                override
                              </span>
                            )}
                          </span>
                          <span className={over ? 'font-semibold text-err' : 'text-dim'}>
                            {text.length}
                            {max !== undefined ? ` / ${max}` : ''}
                          </span>
                        </div>
                        <PostPreview
                          meta={meta}
                          channelName={c.name}
                          content={text}
                          media={media}
                          when={when ? formatDate(new Date(when).toISOString()) : 'now'}
                        />
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      </div>

      {libraryOpen && (
        <MediaLibraryModal
          onClose={closeLibrary}
          onPick={(id) => {
            setMedia((m) => (m.includes(id) ? m : [...m, id]));
            setLibraryOpen(false);
            toast.success('Media attached');
          }}
        />
      )}
    </Portal>
  );
}

export default function ComposePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-dim">Loading…</div>
      }
    >
      <ComposeInner />
    </Suspense>
  );
}
