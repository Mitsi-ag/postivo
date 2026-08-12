'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import Portal from '@/components/Portal';
import { useToast } from '@/components/toast';
import { ChartIcon, CommentIcon, EyeIcon, HeartIcon, RefreshIcon, RepostIcon } from '@/components/icons';
import { cardCls, EmptyState, ErrorBanner, Skeleton, SkeletonCards } from '@/components/ui';
import { api, ApiError, formatDate } from '@/lib/client';
import type { AnalyticsDTO, PostDTO } from '@/lib/types';

interface StatsRow {
  postId: string;
  content: string;
  channel: string;
  provider: string;
  publishedAt: string | null;
  stats: Record<string, number>;
}

export default function AnalyticsPage() {
  const toast = useToast();
  const [data, setData] = useState<AnalyticsDTO | null>(null);
  const [rows, setRows] = useState<StatsRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(() => {
    Promise.all([api<AnalyticsDTO>('/api/analytics'), api<{ posts: PostDTO[] }>('/api/queue?tab=published')])
      .then(([a, q]) => {
        setData(a);
        setLastRefresh(new Date());
        const out: StatsRow[] = [];
        for (const p of q.posts) {
          for (const t of p.targets) {
            if (t.status === 'published' && t.stats && Object.keys(t.stats).length > 0) {
              out.push({
                postId: p.id,
                content: p.content,
                channel: t.channel_name ?? t.provider ?? 'channel',
                provider: t.provider ?? '',
                publishedAt: t.published_at,
                stats: t.stats,
              });
            }
          }
        }
        setRows(out);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load analytics'));
  }, []);

  useEffect(load, [load]);

  async function refresh() {
    setRefreshBusy(true);
    try {
      const d = await api<{ updated: number; considered: number }>('/api/analytics/refresh', { method: 'POST' });
      toast.success(`Stats refreshed — ${d.updated} of ${d.considered} targets updated`);
      load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        toast.error('Slow down — stats can only be refreshed once per minute. Try again in a minute.');
      } else {
        toast.error(err instanceof Error ? err.message : 'Refresh failed');
      }
    } finally {
      setRefreshBusy(false);
    }
  }

  const maxProvider = Math.max(1, ...(data?.byProvider.map((p) => p.count) ?? [1]));
  const dayMax = Math.max(0, ...(data?.last14Days.map((d) => d.count) ?? [0]));
  const maxDay = Math.max(1, dayMax);

  function timeAgo(d: Date): string {
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m / 60)}h ago`;
  }

  const engagement = data?.engagement;
  const engagementCards = [
    { label: 'Likes', value: engagement?.likes, Icon: HeartIcon },
    { label: 'Reposts', value: engagement?.reposts, Icon: RepostIcon },
    { label: 'Replies', value: engagement?.replies, Icon: CommentIcon },
    { label: 'Views', value: engagement?.views, Icon: EyeIcon },
    { label: 'Comments', value: engagement?.comments, Icon: CommentIcon },
  ];

  return (
    <Portal title="Analytics">
      <div className="mx-auto max-w-4xl space-y-6">
        <ErrorBanner message={error} />
        {!data ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
            <SkeletonCards count={2} height="h-40" />
          </>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Channels', value: data.totals.channels },
                { label: 'Scheduled', value: data.totals.scheduled },
                { label: 'Published this week', value: data.totals.publishedThisWeek },
                { label: 'Failed', value: data.totals.failed },
              ].map((s) => (
                <div key={s.label} className={cardCls}>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">{s.label}</span>
                  <div className="mt-3 font-mono text-[28px] font-medium leading-none tracking-tight text-fg">{s.value}</div>
                </div>
              ))}
            </div>

            {/* Engagement */}
            <div className={cardCls}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-fg">Engagement</h2>
                <div className="flex items-center gap-3">
                  {lastRefresh && (
                    <span className="font-mono text-[10px] text-dim">Updated {timeAgo(lastRefresh)}</span>
                  )}
                  <button
                    onClick={() => void refresh()}
                    disabled={refreshBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-mut transition-colors hover:border-line2 hover:bg-raised disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/50"
                  >
                    <RefreshIcon size={12} />
                    {refreshBusy ? 'Refreshing…' : 'Refresh stats'}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {engagementCards.map((s) => (
                  <div key={s.label} className="rounded-lg border border-line bg-raised/50 px-3 py-2.5">
                    <s.Icon size={13} className="text-dim" />
                    <div className="mt-1.5 font-mono text-lg font-medium text-fg">{(s.value ?? 0).toLocaleString()}</div>
                    <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-dim">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className={cardCls}>
                <h2 className="mb-4 font-semibold text-fg">Published by provider</h2>
                {data.byProvider.length === 0 ? (
                  <p className="text-sm text-dim">No published posts yet.</p>
                ) : data.byProvider.length === 1 ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-fg">{data.byProvider[0].provider}</span>
                    <span className="font-mono text-[28px] font-medium leading-none tracking-tight text-fg">
                      {data.byProvider[0].count}
                    </span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.byProvider.map((p) => (
                      <div key={p.provider}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-fg">{p.provider}</span>
                          <span className="text-dim">{p.count}</span>
                        </div>
                        <div className="h-2 rounded-full bg-raised">
                          <div
                            className="h-2 rounded-full bg-iris"
                            style={{ width: `${(p.count / maxProvider) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={cardCls}>
                <h2 className="mb-4 font-semibold text-fg">Publishes — last 14 days</h2>
                {dayMax === 0 ? (
                  <p className="text-sm text-dim">No publishes in the last 14 days</p>
                ) : (
                  <div className="flex h-32 items-end gap-1.5 border-b border-line">
                    {data.last14Days.map((d, i) => (
                      <div
                        key={d.date}
                        tabIndex={0}
                        aria-label={`${d.date}: ${d.count} publishes`}
                        className="group flex flex-1 flex-col items-center justify-end focus-visible:outline-none"
                      >
                        <span className="mb-1 text-[10px] text-dim opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                          {d.count}
                        </span>
                        {d.count > 0 ? (
                          <div
                            className="w-full rounded-t bg-iris/80"
                            style={{ height: `${Math.max(6, (d.count / maxDay) * 100)}%` }}
                            title={`${d.date}: ${d.count}`}
                          />
                        ) : (
                          <div className="h-px w-full bg-line2" title={`${d.date}: 0`} />
                        )}
                        <span className="mt-1 whitespace-nowrap text-[9px] text-dim">
                          {i % 3 === 0 ? d.date.slice(8) : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Per-target stats */}
            <div className={cardCls}>
              <h2 className="mb-4 font-semibold text-fg">Per-post engagement</h2>
              {rows.length === 0 ? (
                <EmptyState
                  icon={<ChartIcon size={18} />}
                  title="No engagement stats yet"
                  hint="Stats appear after posts are published on channels that support analytics. Hit “Refresh stats” to pull the latest numbers."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-line text-dim">
                        <th className="py-2 pr-3 font-medium">Post</th>
                        <th className="py-2 pr-3 font-medium">Channel</th>
                        <th className="py-2 pr-3 text-right font-medium" title="Likes">
                          <HeartIcon size={11} className="ml-auto" />
                          <span className="sr-only">Likes</span>
                        </th>
                        <th className="py-2 pr-3 text-right font-medium" title="Reposts">
                          <RepostIcon size={11} className="ml-auto" />
                          <span className="sr-only">Reposts</span>
                        </th>
                        <th className="py-2 pr-3 text-right font-medium" title="Replies">
                          <CommentIcon size={11} className="ml-auto" />
                          <span className="sr-only">Replies</span>
                        </th>
                        <th className="py-2 pr-3 text-right font-medium" title="Views">
                          <EyeIcon size={11} className="ml-auto" />
                          <span className="sr-only">Views</span>
                        </th>
                        <th className="py-2 pr-3 text-right font-medium" title="Comments">
                          <CommentIcon size={11} className="ml-auto" />
                          <span className="sr-only">Comments</span>
                        </th>
                        <th className="py-2 font-medium">Published</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60">
                      {rows.map((r, i) => (
                        <tr key={`${r.postId}-${i}`}>
                          <td className="max-w-48 truncate py-2.5 pr-3 text-fg" title={r.content}>
                            <Link
                              href={`/compose?post=${r.postId}`}
                              className="transition-colors hover:text-iris-soft"
                            >
                              {r.content || '(media only)'}
                            </Link>
                          </td>
                          <td className="py-2.5 pr-3 text-mut">{r.channel}</td>
                          <td className="py-2.5 pr-3 text-right text-fg">{r.stats.likes ?? 0}</td>
                          <td className="py-2.5 pr-3 text-right text-fg">{r.stats.reposts ?? 0}</td>
                          <td className="py-2.5 pr-3 text-right text-fg">{r.stats.replies ?? 0}</td>
                          <td className="py-2.5 pr-3 text-right text-fg">{r.stats.views ?? 0}</td>
                          <td className="py-2.5 pr-3 text-right text-fg">{r.stats.comments ?? 0}</td>
                          <td className="py-2.5 text-dim">{formatDate(r.publishedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className={cardCls}>
              <h2 className="mb-4 font-semibold text-fg">Recent publish activity</h2>
              {data.recentLog.length === 0 ? (
                <p className="text-sm text-dim">No activity yet.</p>
              ) : (
                <ul className="divide-y divide-line/60">
                  {data.recentLog.map((l) => (
                    <li key={l.id} className="flex items-start gap-3 py-2.5 text-xs">
                      <span
                        className={`mt-0.5 inline-block w-14 shrink-0 rounded-full border px-2 py-0.5 text-center font-medium ${
                          l.level === 'error'
                            ? 'border-err/30 bg-err/10 text-err'
                            : l.level === 'warn'
                              ? 'border-warn/30 bg-warn/10 text-warn'
                              : 'border-line bg-raised text-fg'
                        }`}
                      >
                        {l.level}
                      </span>
                      <span className="flex-1 text-fg">{l.message}</span>
                      <span className="shrink-0 text-dim">{formatDate(l.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </Portal>
  );
}
