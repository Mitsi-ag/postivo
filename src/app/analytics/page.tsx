'use client';

import { useCallback, useEffect, useState } from 'react';
import Portal from '@/components/Portal';
import { useToast } from '@/components/toast';
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

  const load = useCallback(() => {
    Promise.all([api<AnalyticsDTO>('/api/analytics'), api<{ posts: PostDTO[] }>('/api/queue?tab=published')])
      .then(([a, q]) => {
        setData(a);
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
  const maxDay = Math.max(1, ...(data?.last14Days.map((d) => d.count) ?? [1]));

  const engagement = data?.engagement;
  const engagementCards = [
    { label: 'Likes', value: engagement?.likes, icon: '❤️' },
    { label: 'Reposts', value: engagement?.reposts, icon: '🔁' },
    { label: 'Replies', value: engagement?.replies, icon: '💬' },
    { label: 'Views', value: engagement?.views, icon: '👁' },
    { label: 'Comments', value: engagement?.comments, icon: '🗨️' },
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
                  <div className="text-3xl font-bold text-white">{s.value}</div>
                  <div className="mt-1 text-xs text-slate-400">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Engagement */}
            <div className={cardCls}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-white">Engagement</h2>
                <button
                  onClick={() => void refresh()}
                  disabled={refreshBusy}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60"
                >
                  {refreshBusy ? '🔄 Refreshing…' : '🔄 Refresh stats'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {engagementCards.map((s) => (
                  <div key={s.label} className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5">
                    <div className="text-lg" aria-hidden>
                      {s.icon}
                    </div>
                    <div className="mt-1 text-xl font-bold text-white">{(s.value ?? 0).toLocaleString()}</div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className={cardCls}>
                <h2 className="mb-4 font-semibold text-white">Published by provider</h2>
                {data.byProvider.length === 0 ? (
                  <p className="text-sm text-slate-500">No published posts yet.</p>
                ) : (
                  <div className="space-y-3">
                    {data.byProvider.map((p) => (
                      <div key={p.provider}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-slate-300">{p.provider}</span>
                          <span className="text-slate-500">{p.count}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-800">
                          <div
                            className="h-2 rounded-full bg-indigo-500"
                            style={{ width: `${(p.count / maxProvider) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={cardCls}>
                <h2 className="mb-4 font-semibold text-white">Publishes — last 14 days</h2>
                <div className="flex h-32 items-end gap-1.5">
                  {data.last14Days.map((d) => (
                    <div key={d.date} className="group flex flex-1 flex-col items-center justify-end">
                      <span className="mb-1 text-[10px] text-slate-500 opacity-0 group-hover:opacity-100">
                        {d.count}
                      </span>
                      <div
                        className="w-full rounded-t bg-indigo-500/80"
                        style={{ height: `${Math.max(d.count > 0 ? 6 : 2, (d.count / maxDay) * 100)}%` }}
                        title={`${d.date}: ${d.count}`}
                      />
                      <span className="mt-1 text-[9px] text-slate-600">{d.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Per-target stats */}
            <div className={cardCls}>
              <h2 className="mb-4 font-semibold text-white">Per-post engagement</h2>
              {rows.length === 0 ? (
                <EmptyState
                  icon="📊"
                  title="No engagement stats yet"
                  hint="Stats appear after posts are published on channels that support analytics. Hit “Refresh stats” to pull the latest numbers."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500">
                        <th className="py-2 pr-3 font-medium">Post</th>
                        <th className="py-2 pr-3 font-medium">Channel</th>
                        <th className="py-2 pr-3 text-right font-medium">❤️</th>
                        <th className="py-2 pr-3 text-right font-medium">🔁</th>
                        <th className="py-2 pr-3 text-right font-medium">💬</th>
                        <th className="py-2 pr-3 text-right font-medium">👁</th>
                        <th className="py-2 font-medium">Published</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {rows.map((r, i) => (
                        <tr key={`${r.postId}-${i}`}>
                          <td className="max-w-48 truncate py-2.5 pr-3 text-slate-300" title={r.content}>
                            {r.content || '(media only)'}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-400">{r.channel}</td>
                          <td className="py-2.5 pr-3 text-right text-slate-300">{r.stats.likes ?? 0}</td>
                          <td className="py-2.5 pr-3 text-right text-slate-300">{r.stats.reposts ?? 0}</td>
                          <td className="py-2.5 pr-3 text-right text-slate-300">
                            {(r.stats.replies ?? 0) + (r.stats.comments ?? 0)}
                          </td>
                          <td className="py-2.5 pr-3 text-right text-slate-300">{r.stats.views ?? 0}</td>
                          <td className="py-2.5 text-slate-500">{formatDate(r.publishedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className={cardCls}>
              <h2 className="mb-4 font-semibold text-white">Recent publish activity</h2>
              {data.recentLog.length === 0 ? (
                <p className="text-sm text-slate-500">No activity yet.</p>
              ) : (
                <ul className="divide-y divide-slate-800">
                  {data.recentLog.map((l) => (
                    <li key={l.id} className="flex items-start gap-3 py-2.5 text-xs">
                      <span
                        className={`mt-0.5 inline-block w-14 shrink-0 rounded-full border px-2 py-0.5 text-center font-medium ${
                          l.level === 'error'
                            ? 'border-red-800 bg-red-950 text-red-300'
                            : l.level === 'warn'
                              ? 'border-amber-800 bg-amber-950 text-amber-300'
                              : 'border-slate-700 bg-slate-800 text-slate-300'
                        }`}
                      >
                        {l.level}
                      </span>
                      <span className="flex-1 text-slate-300">{l.message}</span>
                      <span className="shrink-0 text-slate-600">{formatDate(l.at)}</span>
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
