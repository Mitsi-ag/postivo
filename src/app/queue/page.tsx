'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Portal from '@/components/Portal';
import { useToast } from '@/components/toast';
import { Badge, btnDanger, btnGhost, cardCls, EmptyState, ErrorBanner, selectCls, SkeletonCards, TagChip } from '@/components/ui';
import { api, formatDate } from '@/lib/client';
import type { ChannelDTO, PostDTO, TargetDTO } from '@/lib/types';

const TABS = [
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'published', label: 'Published' },
  { key: 'failed', label: 'Failed' },
  { key: 'drafts', label: 'Drafts' },
] as const;

function StatRow({ stats }: { stats: Record<string, number> }) {
  const parts: string[] = [];
  if (stats.likes) parts.push(`❤️ ${stats.likes}`);
  if (stats.reposts) parts.push(`🔁 ${stats.reposts}`);
  if (stats.replies) parts.push(`💬 ${stats.replies}`);
  if (stats.comments && !stats.replies) parts.push(`💬 ${stats.comments}`);
  if (stats.views) parts.push(`👁 ${stats.views}`);
  if (parts.length === 0) return null;
  return <span className="whitespace-nowrap text-slate-500">{parts.join('  ')}</span>;
}

function TargetStats({ t }: { t: TargetDTO }) {
  if (t.status !== 'published' || !t.stats || Object.keys(t.stats).length === 0) return null;
  return <StatRow stats={t.stats} />;
}

function QueueInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState<string>(
    initialTab && (TABS as readonly { key: string }[]).some((t) => t.key === initialTab) ? initialTab : 'scheduled',
  );
  const [posts, setPosts] = useState<PostDTO[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [channels, setChannels] = useState<ChannelDTO[]>([]);
  const [tagFilter, setTagFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback((t: string, tag: string) => {
    setLoading(true);
    const tagQ = tag ? `&tag=${encodeURIComponent(tag)}` : '';
    api<{ posts: PostDTO[] }>(`/api/queue?tab=${t}${tagQ}`)
      .then((d) => {
        setPosts(d.posts);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(tab, tagFilter), [tab, tagFilter, load]);

  // Populate tag + channel filter dropdowns once.
  useEffect(() => {
    api<{ posts: PostDTO[] }>('/api/posts')
      .then((d) => setAllTags([...new Set(d.posts.flatMap((p) => p.tags ?? []))].sort()))
      .catch(() => {});
    api<{ channels: ChannelDTO[] }>('/api/channels')
      .then((d) => setChannels(d.channels))
      .catch(() => {});
  }, []);

  const visible = useMemo(
    () =>
      posts.filter((p) => {
        if (channelFilter && !p.targets.some((t) => t.channel_id === channelFilter)) return false;
        if (search && !p.content.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [posts, channelFilter, search],
  );

  async function act(fn: () => Promise<unknown>, successMsg?: string) {
    try {
      await fn();
      if (successMsg) toast.success(successMsg);
      load(tab, tagFilter);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    }
  }

  return (
    <Portal title="Queue">
      <div className="mx-auto max-w-4xl space-y-5">
        <ErrorBanner message={error} />
        <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-900/50 p-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm ${
                tab === t.key ? 'bg-indigo-600 font-medium text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search content…"
            aria-label="Search posts"
            className={`${selectCls} w-44 text-xs`}
          />
          <select
            aria-label="Filter by tag"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className={`${selectCls} w-auto text-xs`}
          >
            <option value="">All tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by channel"
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className={`${selectCls} w-auto text-xs`}
          >
            <option value="">All channels</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.provider_meta?.icon} {c.name}
              </option>
            ))}
          </select>
          {(search || tagFilter || channelFilter) && (
            <button
              onClick={() => {
                setSearch('');
                setTagFilter('');
                setChannelFilter('');
              }}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Clear
            </button>
          )}
        </div>

        {loading ? (
          <SkeletonCards count={3} height="h-28" />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="📭"
            title={posts.length === 0 ? 'Nothing here yet' : 'No posts match your filters'}
            hint={posts.length === 0 ? 'Compose a post and it will show up in your queue.' : 'Try clearing the filters above.'}
            action={
              posts.length === 0 ? (
                <button onClick={() => router.push('/compose')} className={btnGhost}>
                  ✍️ Compose a post
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-4">
            {visible.map((p) => (
              <div key={p.id} className={cardCls}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="whitespace-pre-wrap text-sm text-slate-200">{p.content || '(media only)'}</p>
                    <p className="mt-1.5 text-xs text-slate-500">
                      {p.status === 'scheduled' ? `Scheduled for ${formatDate(p.scheduled_at)}` : `Updated ${formatDate(p.updated_at)}`}
                      {p.media.length > 0 && ` · ${p.media.length} media`}
                      {p.repeat_every_days && (
                        <span className="ml-1.5 inline-block rounded-full border border-emerald-900 bg-emerald-950/50 px-1.5 py-0.5 text-[10px] text-emerald-300">
                          ♻️ every {p.repeat_every_days}d
                        </span>
                      )}
                      {p.comments.length > 0 && (
                        <span className="ml-1.5 inline-block rounded-full border border-slate-700 bg-slate-800/60 px-1.5 py-0.5 text-[10px] text-slate-400">
                          🧵 {p.comments.length} follow-up{p.comments.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </p>
                    {(p.tags ?? []).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {p.tags.map((t) => (
                          <TagChip key={t} tag={t} />
                        ))}
                      </div>
                    )}
                  </div>
                  <Badge status={p.status} />
                </div>

                {p.targets.length > 0 && (
                  <ul className="mt-3 space-y-2 border-t border-slate-800 pt-3">
                    {p.targets.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 text-xs">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <Badge status={t.status} />
                          <span className="text-slate-400">{t.channel_name ?? t.provider ?? 'deleted channel'}</span>
                          <TargetStats t={t} />
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
                              onClick={() => void act(() => api(`/api/targets/${t.id}/retry`, { method: 'POST' }), 'Retry queued')}
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
                      onClick={() => void act(() => api(`/api/posts/${p.id}`, { method: 'PATCH', json: { status: 'draft', scheduled_at: null } }), 'Schedule cancelled')}
                      className={btnGhost}
                    >
                      Cancel schedule
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (window.confirm('Delete this post?')) {
                        void act(() => api(`/api/posts/${p.id}`, { method: 'DELETE' }), 'Post deleted');
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

export default function QueuePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>
      }
    >
      <QueueInner />
    </Suspense>
  );
}
