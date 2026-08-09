'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Portal from '@/components/Portal';
import { Badge, cardCls, EmptyState, ErrorBanner, Skeleton, SkeletonCards } from '@/components/ui';
import { api, formatDate } from '@/lib/client';
import type { AnalyticsDTO, PostDTO } from '@/lib/types';

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function computeStreak(published: PostDTO[]): number {
  const days = new Set<string>();
  for (const p of published) {
    for (const t of p.targets) {
      if (t.status === 'published' && t.published_at) days.add(dayKey(new Date(t.published_at)));
    }
  }
  if (days.size === 0) return 0;
  const cursor = new Date();
  // Allow the streak to start yesterday if nothing went out today yet.
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<AnalyticsDTO | null>(null);
  const [upcoming, setUpcoming] = useState<PostDTO[] | null>(null);
  const [published, setPublished] = useState<PostDTO[]>([]);
  const [bestSlot, setBestSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<AnalyticsDTO>('/api/analytics'),
      api<{ posts: PostDTO[] }>('/api/queue?tab=scheduled'),
      api<{ posts: PostDTO[] }>('/api/queue?tab=published'),
    ])
      .then(([a, q, pub]) => {
        setAnalytics(a);
        setUpcoming(q.posts.slice(0, 5));
        setPublished(pub.posts);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dashboard'));
    api<{ slots: string[] }>('/api/best-time')
      .then((d) => setBestSlot(d.slots[0] ?? null))
      .catch(() => {});
  }, []);

  const streak = useMemo(() => computeStreak(published), [published]);

  const stats = [
    { label: 'Channels', value: analytics?.totals.channels, icon: '📡' },
    { label: 'Scheduled', value: analytics?.totals.scheduled, icon: '🗓️' },
    { label: 'Published this week', value: analytics?.totals.publishedThisWeek, icon: '✅' },
    { label: 'Failed', value: analytics?.totals.failed, icon: '⚠️' },
    { label: 'Publish streak', value: `${streak}d`, icon: '🔥' },
  ];

  const engagement = analytics?.engagement;
  const engagementStats = [
    { label: 'Likes', value: engagement?.likes, icon: '❤️' },
    { label: 'Reposts', value: engagement?.reposts, icon: '🔁' },
    { label: 'Replies', value: engagement?.replies, icon: '💬' },
    { label: 'Views', value: engagement?.views, icon: '👁' },
    { label: 'Comments', value: engagement?.comments, icon: '🗨️' },
  ];

  return (
    <Portal title="Dashboard">
      <div className="space-y-6">
        <ErrorBanner message={error} />

        {analytics === null && !error ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {stats.map((s) => (
              <div key={s.label} className={cardCls}>
                <div className="text-2xl" aria-hidden>
                  {s.icon}
                </div>
                <div className="mt-2 text-3xl font-bold text-white">{s.value ?? '—'}</div>
                <div className="mt-1 text-xs text-slate-400">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {analytics !== null && (
          <div className={cardCls}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Engagement</h2>
              <Link href="/analytics" className="text-xs text-indigo-400 hover:text-indigo-300">
                Full analytics →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {engagementStats.map((s) => (
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
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className={`${cardCls} lg:col-span-2`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-white">Next up</h2>
              <Link href="/queue" className="text-xs text-indigo-400 hover:text-indigo-300">
                View queue →
              </Link>
            </div>
            {upcoming === null ? (
              <SkeletonCards count={3} height="h-12" />
            ) : upcoming.length === 0 ? (
              <EmptyState
                icon="🗓️"
                title="Nothing scheduled yet"
                hint={bestSlot ? `Your next best time to post is ${formatDate(bestSlot)}.` : 'Compose your first post!'}
                action={
                  <Link
                    href="/compose"
                    className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                  >
                    ✍️ Compose a post
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-slate-800">
                {upcoming.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-200">{p.content}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDate(p.scheduled_at)} ·{' '}
                        {p.targets.map((t) => t.channel_name ?? t.provider).join(', ')}
                        {p.repeat_every_days ? ` · ♻️ every ${p.repeat_every_days}d` : ''}
                      </p>
                    </div>
                    <Badge status={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-6">
            {bestSlot && (
              <div className="rounded-xl border border-indigo-800/60 bg-indigo-950/30 p-5">
                <h2 className="text-sm font-semibold text-indigo-200">⏱ Next best time to post</h2>
                <p className="mt-1 text-lg font-bold text-white">{formatDate(bestSlot)}</p>
                <Link
                  href="/compose"
                  className="mt-2 inline-block text-xs text-indigo-400 hover:text-indigo-300"
                >
                  Schedule for this slot →
                </Link>
              </div>
            )}
            <div className={cardCls}>
              <h2 className="mb-4 font-semibold text-white">Quick actions</h2>
              <div className="space-y-2">
                <Link
                  href="/compose"
                  className="block rounded-lg bg-indigo-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-indigo-500"
                >
                  ✍️ Compose a post
                </Link>
                <Link
                  href="/channels"
                  className="block rounded-lg border border-slate-700 px-4 py-2.5 text-center text-sm text-slate-300 hover:bg-slate-800"
                >
                  📡 Connect a channel
                </Link>
                <Link
                  href="/automation"
                  className="block rounded-lg border border-slate-700 px-4 py-2.5 text-center text-sm text-slate-300 hover:bg-slate-800"
                >
                  🤖 Automate with RSS
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
