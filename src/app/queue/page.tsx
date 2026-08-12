'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Portal from '@/components/Portal';
import { useToast } from '@/components/toast';
import { CommentIcon, EyeIcon, ExternalIcon, HeartIcon, PenIcon, RefreshIcon, RepostIcon, StackIcon } from '@/components/icons';
import { Badge, btnDanger, btnGhost, cardCls, ConfirmDialog, EmptyState, ErrorBanner, selectCls, SkeletonCards, TagChip } from '@/components/ui';
import { api, formatDate } from '@/lib/client';
import type { ChannelDTO, PostDTO, TargetDTO } from '@/lib/types';

const TABS = [
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'published', label: 'Published' },
  { key: 'failed', label: 'Failed' },
  { key: 'drafts', label: 'Drafts' },
] as const;

// Per-tab empty states. Failed gets no compose CTA — there is nothing to fix by writing more.
const TAB_EMPTY: Record<string, { title: string; hint: string; compose: boolean }> = {
  scheduled: { title: 'Nothing scheduled', hint: 'Posts you schedule will queue up here.', compose: true },
  published: { title: 'Nothing published yet', hint: 'Published posts land here with per-channel results and stats.', compose: true },
  failed: { title: 'No failures', hint: 'Every post went out cleanly. Failures show up here with the exact platform error.', compose: false },
  drafts: { title: 'No drafts', hint: 'Save a draft from the composer and it will wait here.', compose: true },
};

function StatRow({ stats }: { stats: Record<string, number> }) {
  const items: { Icon: typeof HeartIcon; n: number }[] = [];
  if (stats.likes) items.push({ Icon: HeartIcon, n: stats.likes });
  if (stats.reposts) items.push({ Icon: RepostIcon, n: stats.reposts });
  if (stats.replies) items.push({ Icon: CommentIcon, n: stats.replies });
  if (stats.comments && !stats.replies) items.push({ Icon: CommentIcon, n: stats.comments });
  if (stats.views) items.push({ Icon: EyeIcon, n: stats.views });
  if (items.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap text-dim">
      {items.map(({ Icon, n }, i) => (
        <span key={i} className="inline-flex items-center gap-1 font-mono text-[11px]">
          <Icon size={11} />
          {n}
        </span>
      ))}
    </span>
  );
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
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [pendingDelete, setPendingDelete] = useState<PostDTO | null>(null);

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

  // Tab counts — one cheap fetch per tab, refreshed alongside every load/action.
  const loadCounts = useCallback(() => {
    Promise.all(
      TABS.map((t) =>
        api<{ posts: PostDTO[] }>(`/api/queue?tab=${t.key}`)
          .then((d) => [t.key, d.posts.length] as const)
          .catch(() => [t.key, null] as const),
      ),
    ).then((entries) => setCounts(Object.fromEntries(entries)));
  }, []);

  useEffect(() => loadCounts(), [loadCounts, posts]);

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

  function switchTab(key: string) {
    setTab(key);
    router.replace(`/queue?tab=${key}`, { scroll: false });
  }

  const filtering = Boolean(search || tagFilter || channelFilter);

  return (
    <Portal title="Queue">
      <div className="mx-auto max-w-4xl space-y-5">
        <ErrorBanner message={error} />
        <div className="inline-flex max-w-full gap-1 rounded-xl border border-line bg-surface p-1" role="tablist">
          {TABS.map((t) => {
            const n = counts[t.key];
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => switchTab(t.key)}
                className={`rounded-lg px-3 py-2 text-sm ${
                  tab === t.key ? 'bg-iris-fill font-medium text-white' : 'text-mut hover:text-fg'
                }`}
              >
                {t.label}
                {n != null && <span className="ml-1.5 font-mono text-[11px] opacity-80">{n}</span>}
              </button>
            );
          })}
        </div>

        {/* Filter bar — 2-col grid on mobile, flex row from sm up */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search content…"
            aria-label="Search posts"
            className={`${selectCls} w-full text-xs sm:w-44`}
          />
          <select
            aria-label="Filter by tag"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className={`${selectCls} w-full text-xs sm:w-auto`}
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
            className={`${selectCls} w-full text-xs sm:w-auto`}
          >
            <option value="">All channels</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
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
              className="text-xs text-dim hover:text-fg"
            >
              Clear
            </button>
          )}
        </div>

        {loading ? (
          <SkeletonCards count={3} height="h-28" />
        ) : visible.length === 0 ? (
          posts.length === 0 && !filtering ? (
            <EmptyState
              icon={<StackIcon size={18} />}
              title={TAB_EMPTY[tab]?.title ?? 'Nothing here yet'}
              hint={TAB_EMPTY[tab]?.hint}
              action={
                TAB_EMPTY[tab]?.compose ? (
                  <button onClick={() => router.push('/compose')} className={btnGhost}>
                    <PenIcon size={14} />
                    Compose a post
                  </button>
                ) : undefined
              }
            />
          ) : (
            <EmptyState
              icon={<StackIcon size={18} />}
              title="No posts match your filters"
              hint="Try clearing the filters above."
            />
          )
        ) : (
          <div className="space-y-4">
            {visible.map((p) => {
              const overdue =
                p.status === 'scheduled' &&
                Boolean(p.scheduled_at) &&
                new Date(p.scheduled_at as string).getTime() < Date.now();
              return (
              <div key={p.id} className={cardCls}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="whitespace-pre-wrap text-sm text-fg">{p.content || '(media only)'}</p>
                    <p className="mt-1.5 text-xs text-dim">
                      {overdue
                        ? `Was due ${formatDate(p.scheduled_at)}`
                        : p.status === 'scheduled'
                          ? `Scheduled for ${formatDate(p.scheduled_at)}`
                          : `Updated ${formatDate(p.updated_at)}`}
                      {p.media.length > 0 && ` · ${p.media.length} media`}
                      {p.repeat_every_days && (
                        <span className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-ok/30 bg-ok/10 px-1.5 py-0.5 font-mono text-[10px] text-ok">
                          <RefreshIcon size={9} />
                          every {p.repeat_every_days}d
                        </span>
                      )}
                      {p.comments.length > 0 && (
                        <span className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-line bg-raised/60 px-1.5 py-0.5 font-mono text-[10px] text-mut">
                          <StackIcon size={9} />
                          {p.comments.length} follow-up{p.comments.length > 1 ? 's' : ''}
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
                  {overdue ? <Badge status="overdue" /> : <Badge status={p.status} />}
                </div>

                {p.targets.length > 0 && (
                  <ul className="mt-3 space-y-2 border-t border-line pt-3">
                    {p.targets.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 text-xs">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <Badge status={t.status} />
                          <span className="text-mut">{t.channel_name ?? t.provider ?? 'deleted channel'}</span>
                          <TargetStats t={t} />
                          {t.external_url && (
                            <a
                              href={t.external_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 truncate text-iris-soft transition-colors hover:text-iris"
                            >
                              view post
                              <ExternalIcon size={11} />
                            </a>
                          )}
                        </div>
                        {t.status === 'failed' && (
                          <div className="flex items-center gap-2">
                            <span className="max-w-xs truncate text-err" title={t.error ?? ''}>
                              {t.error}
                            </span>
                            <button
                              onClick={() => void act(() => api(`/api/targets/${t.id}/retry`, { method: 'POST' }), 'Retry queued')}
                              className="rounded-lg border border-warn/30 px-2.5 py-1 text-warn hover:bg-warn/10"
                            >
                              Retry
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3 flex gap-2 border-t border-line pt-3">
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
                  <button onClick={() => setPendingDelete(p)} className={btnDanger}>
                    Delete
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this post?"
        body={
          pendingDelete
            ? `“${(pendingDelete.content || '(media only)').slice(0, 120)}” will be permanently removed.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          const p = pendingDelete;
          setPendingDelete(null);
          if (p) void act(() => api(`/api/posts/${p.id}`, { method: 'DELETE' }), 'Post deleted');
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </Portal>
  );
}

export default function QueuePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-dim">Loading…</div>
      }
    >
      <QueueInner />
    </Suspense>
  );
}
