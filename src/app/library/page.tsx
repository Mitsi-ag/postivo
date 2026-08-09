'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Portal from '@/components/Portal';
import { useToast } from '@/components/toast';
import { btnGhost, cardCls, EmptyState, ErrorBanner, inputCls, Skeleton } from '@/components/ui';
import { api, formatDate } from '@/lib/client';
import type { MediaListItemDTO } from '@/lib/types';

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function LibraryPage() {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<MediaListItemDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function load() {
    api<{ media: MediaListItemDTO[] }>('/api/media-list')
      .then((d) => setItems(d.media))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load library'));
  }

  useEffect(load, []);

  async function uploadFiles(files: Iterable<File>) {
    for (const f of files) {
      const fd = new FormData();
      fd.append('file', f);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const data = (await res.json()) as { id?: string; error?: string };
        if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
        toast.success(`Uploaded ${f.name}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Upload failed');
      }
    }
    load();
  }

  async function importUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    try {
      await api('/api/upload/url', { method: 'POST', json: { url: url.trim() } });
      setUrl('');
      toast.success('Media imported from URL');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: MediaListItemDTO) {
    if (!window.confirm(`Delete "${m.name}"? Posts already published keep their copies, but scheduled posts using it may fail.`))
      return;
    try {
      await api(`/api/media/${m.id}`, { method: 'DELETE' });
      toast.success('Media deleted');
      setItems((list) => (list ?? []).filter((x) => x.id !== m.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  function useInComposer(id: string) {
    sessionStorage.setItem('postivo:attach', id);
    router.push('/compose');
  }

  return (
    <Portal title="Media library">
      <div className="mx-auto max-w-5xl space-y-5">
        <ErrorBanner message={error} />

        <div className={cardCls}>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => fileInput.current?.click()} className={btnGhost}>
              ⬆️ Upload file
            </button>
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
            <form onSubmit={importUrl} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://… import from URL"
                aria-label="Import media from URL"
                className={`${inputCls} min-w-40 flex-1`}
              />
              <button type="submit" disabled={busy || !url.trim()} className={btnGhost}>
                {busy ? 'Importing…' : 'Import'}
              </button>
            </form>
          </div>
        </div>

        {items === null ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="aspect-square" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon="🖼️"
            title="Your library is empty"
            hint="Upload images or videos once, reuse them across posts."
            action={
              <button onClick={() => fileInput.current?.click()} className={btnGhost}>
                ⬆️ Upload your first file
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((m) => (
              <div
                key={m.id}
                className="group overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 transition hover:border-slate-600"
              >
                <div className="relative aspect-square">
                  {m.mime.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/media/${m.id}`} alt={m.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-slate-800 text-4xl">🎬</div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition group-hover:opacity-100">
                    <button
                      onClick={() => useInComposer(m.id)}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                      aria-label={`Use ${m.name} in composer`}
                    >
                      Use in composer
                    </button>
                    <button
                      onClick={() => void remove(m)}
                      className="rounded-lg border border-red-900 bg-red-950/80 px-3 py-1.5 text-xs text-red-300 hover:bg-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                      aria-label={`Delete ${m.name}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="px-3 py-2">
                  <p className="truncate text-xs text-slate-300" title={m.name}>
                    {m.name}
                  </p>
                  <p className="text-[10px] text-slate-600">
                    {fmtSize(m.size)} · {formatDate(m.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Portal>
  );
}
