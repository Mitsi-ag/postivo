'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Portal from '@/components/Portal';
import { Badge, btnDanger, btnGhost, cardCls, ErrorBanner } from '@/components/ui';
import { api, formatDate } from '@/lib/client';
import type { PostDTO } from '@/lib/types';

const TABS = [
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'published', label: 'Published' },
  { key: 'failed', label: 'Failed' },
  { key: 'drafts', label: 'Drafts' },
] as const;

export default function QueuePage() {
  const router = useRouter();
  const [tab, setTab] = useState<string>('scheduled');
  const [posts, setPosts] = useState<PostDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback((t: string) => {
    setLoading(true);
    api<{ posts: PostDTO[] }>(`/api/queue?tab=${t}`)
      .then((d) => {
        setPosts(d.posts);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(tab), [tab, load]);

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      load(tab);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    }
  }

  return (
    <Portal title="Queue">
      <div className="mx-auto max-w-4xl space-y-5">
        <ErrorBanner message={error} />
        <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-900/50 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm ${
                tab === t.key ? 'bg-indigo-600 font-medium text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : posts.length === 0 ? (
          <div className={`${cardCls} text-center text-sm text-slate-500`}>
            Nothing here yet.
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((p) => (
              <div key={p.id} className={cardCls}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="whitespace-pre-wrap text-sm text-slate-200">{p.content || '(media only)'}</p>
                    <p className="mt-1.5 text-xs text-slate-500">
                      {p.status === 'scheduled' ? `Scheduled for ${formatDate(p.scheduled_at)}` : `Updated ${formatDate(p.updated_at)}`}
                      {p.media.length > 0 && ` · ${p.media.length} media`}
                    </p>
                  </div>
                  <Badge status={p.status} />
                </div>

                {p.targets.length > 0 && (
                  <ul className="mt-3 space-y-2 border-t border-slate-800 pt-3">
                    {p.targets.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 text-xs">
                        <div className="flex min-w-0 items-center gap-2">
                          <Badge status={t.status} />
                          <span className="text-slate-400">{t.channel_name ?? t.provider ?? 'deleted channel'}</span>
                          {t.external_url && (
                            <a
                              href={t.external_url}
                              target="_blank"
                              rel="noreferrer"
                              className="truncate text-indigo-400 hover:text-indigo-300"
                            >
                              view post ↗
                            </a>
                          )}
                        </div>
                        {t.status === 'failed' && (
                          <div className="flex items-center gap-2">
                            <span className="max-w-xs truncate text-red-400" title={t.error ?? ''}>
                              {t.error}
                            </span>
                            <button
                              onClick={() => void act(() => api(`/api/targets/${t.id}/retry`, { method: 'POST' }))}
                              className="rounded-lg border border-amber-800 px-2.5 py-1 text-amber-300 hover:bg-amber-950"
                            >
                              Retry
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3 flex gap-2 border-t border-slate-800 pt-3">
                  {(p.status === 'scheduled' || p.status === 'draft') && (
                    <button onClick={() => router.push(`/compose?post=${p.id}`)} className={btnGhost}>
                      Edit
                    </button>
                  )}
                  {p.status === 'scheduled' && (
                    <button
                      onClick={() => void act(() => api(`/api/posts/${p.id}`, { method: 'PATCH', json: { status: 'draft', scheduled_at: null } }))}
                      className={btnGhost}
                    >
                      Cancel schedule
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (window.confirm('Delete this post?')) {
                        void act(() => api(`/api/posts/${p.id}`, { method: 'DELETE' }));
                      }
                    }}
                    className={btnDanger}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Portal>
  );
}
