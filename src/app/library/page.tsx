'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Portal from '@/components/Portal';
import { useToast } from '@/components/toast';
import { FilmIcon, ImageIcon, UploadIcon } from '@/components/icons';
import { btnGhost, cardCls, ConfirmDialog, EmptyState, ErrorBanner, inputCls, Skeleton } from '@/components/ui';
import { api, formatDate } from '@/lib/client';
import type { MediaListItemDTO, UsageDTO } from '@/lib/types';

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
  const [usage, setUsage] = useState<UsageDTO | null>(null);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<MediaListItemDTO | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function load() {
    api<{ media: MediaListItemDTO[] }>('/api/media-list')
      .then((d) => setItems(d.media))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load library'));
  }

  useEffect(load, []);

  useEffect(() => {
    api<UsageDTO>('/api/usage')
      .then(setUsage)
      .catch(() => {});
  }, []);

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
            <button
              onClick={() => fileInput.current?.click()}
              className={`${btnGhost} disabled:border-line/50 disabled:bg-raised/30 disabled:text-dim disabled:opacity-100`}
            >
              <UploadIcon size={14} />
              Upload file
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
              <button
                type="submit"
                disabled={busy || !url.trim()}
                className={`${btnGhost} disabled:border-line/50 disabled:bg-raised/30 disabled:text-dim disabled:opacity-100`}
              >
                {busy ? 'Importing…' : 'Import'}
              </button>
            </form>
            {usage && (
              <a
                href="/settings/billing"
                className="ml-auto font-mono text-[11px] text-dim transition-colors hover:text-fg"
                title="Manage your plan"
              >
                {usage.storageMB.used} MB of {usage.storageMB.limit} MB used
              </a>
            )}
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
            icon={<ImageIcon size={18} />}
            title="Your library is empty"
            hint="Upload images or videos once, reuse them across posts."
            action={
              <button onClick={() => fileInput.current?.click()} className={btnGhost}>
                <UploadIcon size={14} />
                Upload your first file
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((m) => (
              <div
                key={m.id}
                className="group overflow-hidden rounded-xl border border-line bg-surface transition hover:border-line2"
              >
                <div className="relative aspect-square">
                  {m.mime.startsWith('image/') && !broken.has(m.id) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/media/${m.id}`}
                      alt={m.name}
                      className="h-full w-full object-cover"
                      onError={() => setBroken((s) => new Set(s).add(m.id))}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-raised text-dim">
                      {m.mime.startsWith('image/') ? <ImageIcon size={26} /> : <FilmIcon size={26} />}
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                    <button
                      onClick={() => useInComposer(m.id)}
                      className="rounded-lg bg-iris px-3 py-1.5 text-xs font-medium text-fg hover:bg-iris-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris-soft"
                      aria-label={`Use ${m.name} in composer`}
                    >
                      Use in composer
                    </button>
                    <button
                      onClick={() => setPendingDelete(m)}
                      className="rounded-lg border border-err/25 bg-err/15 px-3 py-1.5 text-xs text-err hover:bg-err/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-err"
                      aria-label={`Delete ${m.name}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="px-3 py-2">
                  <p className="truncate text-xs text-fg" title={m.name}>
                    {m.name}
                  </p>
                  <p className="text-[10px] text-dim">
                    {fmtSize(m.size)} · {formatDate(m.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete media?"
        body={
          pendingDelete
            ? `Delete "${pendingDelete.name}"? Posts already published keep their copies, but scheduled posts using it may fail.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          const m = pendingDelete;
          setPendingDelete(null);
          if (m) void remove(m);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </Portal>
  );
}
