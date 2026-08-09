'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Portal from '@/components/Portal';
import { Badge, cardCls, ErrorBanner } from '@/components/ui';
import { api, formatDate } from '@/lib/client';
import type { AnalyticsDTO, PostDTO } from '@/lib/types';

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<AnalyticsDTO | null>(null);
  const [upcoming, setUpcoming] = useState<PostDTO[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<AnalyticsDTO>('/api/analytics'),
      api<{ posts: PostDTO[] }>('/api/queue?tab=scheduled'),
    ])
      .then(([a, q]) => {
        setAnalytics(a);
        setUpcoming(q.posts.slice(0, 5));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dashboard'));
  }, []);

  const stats = [
    { label: 'Channels', value: analytics?.totals.channels, icon: '📡' },
    { label: 'Scheduled', value: analytics?.totals.scheduled, icon: '🗓️' },
    { label: 'Published this week', value: analytics?.totals.publishedThisWeek, icon: '✅' },
    { label: 'Failed', value: analytics?.totals.failed, icon: '⚠️' },
  ];

  return (
    <Portal title="Dashboard">
      <div className="space-y-6">
        <ErrorBanner message={error} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className={cardCls}>
              <div className="text-2xl">{s.icon}</div>
              <div className="mt-2 text-3xl font-bold text-white">{s.value ?? '—'}</div>
              <div className="mt-1 text-xs text-slate-400">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className={`${cardCls} lg:col-span-2`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-white">Next up</h2>
              <Link href="/queue" className="text-xs text-indigo-400 hover:text-indigo-300">
                View queue →
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing scheduled yet. Compose your first post!</p>
            ) : (
              <ul className="divide-y divide-slate-800">
                {upcoming.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-200">{p.content}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDate(p.scheduled_at)} ·{' '}
                        {p.targets.map((t) => t.channel_name ?? t.provider).join(', ')}
                      </p>
                    </div>
                    <Badge status={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>

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
                href="/calendar"
                className="block rounded-lg border border-slate-700 px-4 py-2.5 text-center text-sm text-slate-300 hover:bg-slate-800"
              >
                📅 View calendar
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
