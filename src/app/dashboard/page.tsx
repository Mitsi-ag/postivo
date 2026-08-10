'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Portal from '@/components/Portal';
import Timeline from '@/components/Timeline';
import { Badge, cardCls, EmptyState, ErrorBanner, Skeleton, SkeletonCards } from '@/components/ui';
import {
  AlertIcon,
  ArrowRightIcon,
  BoltIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  CommentIcon,
  EyeIcon,
  HeartIcon,
  PenIcon,
  PlugIcon,
  RepostIcon,
  RssIcon,
} from '@/components/icons';
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

/* Tiny sparkline (SVG polyline) from a numeric series. */
function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const w = 96;
  const h = 26;
  const max = Math.max(1, ...values);
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - (v / max) * (h - 5)).toFixed(1)}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden preserveAspectRatio="none">
      <polyline
        points={pts}
        fill="none"
        stroke="var(--color-iris)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  );
}

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<AnalyticsDTO | null>(null);
  const [scheduled, setScheduled] = useState<PostDTO[] | null>(null);
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
        setScheduled(q.posts);
        setPublished(pub.posts);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dashboard'));
    api<{ slots: string[] }>('/api/best-time')
      .then((d) => setBestSlot(d.slots[0] ?? null))
      .catch(() => {});
  }, []);

  const streak = useMemo(() => computeStreak(published), [published]);
  const upcoming = useMemo(() => (scheduled ?? []).slice(0, 5), [scheduled]);

  // Today's scheduled posts, plotted on the 24h dial.
  const todayPoints = useMemo(() => {
    const today = new Date().toDateString();
    return (scheduled ?? [])
      .filter((p) => p.scheduled_at && new Date(p.scheduled_at).toDateString() === today)
      .map((p) => {
        const d = new Date(p.scheduled_at as string);
        const t = d.getHours() + d.getMinutes() / 60;
        const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
        const snippet = (p.content || 'media').slice(0, 28);
        return { t, label: `${time} — ${snippet}` };
      })
      .sort((a, b) => a.t - b.t);
  }, [scheduled]);

  const stats = [
    { label: 'Channels', value: analytics?.totals.channels, Icon: PlugIcon },
    { label: 'Scheduled', value: analytics?.totals.scheduled, Icon: CalendarIcon },
    { label: 'Published this week', value: analytics?.totals.publishedThisWeek, Icon: CheckIcon },
    { label: 'Failed', value: analytics?.totals.failed, Icon: AlertIcon },
    { label: 'Publish streak', value: `${streak}d`, Icon: BoltIcon },
  ];

  const engagement = analytics?.engagement;
  const engagementStats = [
    { label: 'Likes', value: engagement?.likes, Icon: HeartIcon },
    { label: 'Reposts', value: engagement?.reposts, Icon: RepostIcon },
    { label: 'Replies', value: engagement?.replies, Icon: CommentIcon },
    { label: 'Views', value: engagement?.views, Icon: EyeIcon },
    { label: 'Comments', value: engagement?.comments, Icon: CommentIcon },
  ];

  const series = analytics?.last14Days.map((d) => d.count) ?? [];

  return (
    <Portal title="Dashboard">
      <div className="space-y-5">
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
              <div key={s.label} className={`${cardCls} lift relative overflow-hidden`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">{s.label}</span>
                  <s.Icon size={14} className="text-dim" />
                </div>
                <div className="mt-3 font-mono text-[28px] font-medium leading-none tracking-tight text-fg">
                  {s.value ?? '—'}
                </div>
                {s.label === 'Published this week' && series.length > 1 && (
                  <Sparkline values={series} className="mt-3 h-6 w-full" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* The dial — today's schedule on the 24h strip */}
        {scheduled !== null && (
          <div className={cardCls}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
              <span className="chip">
                <span className="dot pulse-dot" />
                Today — {todayPoints.length} scheduled
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-dim">24h dial</span>
            </div>
            <Timeline points={todayPoints} />
          </div>
        )}

        {analytics !== null && (
          <div className={cardCls}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-fg">Engagement</h2>
              <Link href="/analytics" className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-iris-soft transition-colors hover:text-iris">
                Full analytics
                <ArrowRightIcon size={12} />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {engagementStats.map((s) => (
                <div key={s.label} className="rounded-lg border border-line bg-raised/40 px-3 py-2.5">
                  <s.Icon size={13} className="text-dim" />
                  <div className="mt-1.5 font-mono text-lg font-medium text-fg">{(s.value ?? 0).toLocaleString()}</div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-dim">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-3">
          <div className={`${cardCls} lg:col-span-2`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-fg">Next up</h2>
              <Link href="/queue" className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-iris-soft transition-colors hover:text-iris">
                View queue
                <ArrowRightIcon size={12} />
              </Link>
            </div>
            {scheduled === null ? (
              <SkeletonCards count={3} height="h-12" />
            ) : upcoming.length === 0 ? (
              <EmptyState
                icon={<CalendarIcon size={18} />}
                title="Nothing scheduled yet"
                hint={bestSlot ? `NEXT BEST SLOT — ${formatDate(bestSlot)}` : 'COMPOSE YOUR FIRST POST'}
                action={
                  <Link
                    href="/compose"
                    className="inline-flex items-center gap-2 rounded-lg bg-iris px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-iris-deep"
                  >
                    <PenIcon size={14} />
                    Compose a post
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-line/60">
                {upcoming.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-fg">{p.content}</p>
                      <p className="mt-1 font-mono text-[11px] text-dim">
                        {formatDate(p.scheduled_at)} ·{' '}
                        {p.targets.map((t) => t.channel_name ?? t.provider).join(', ')}
                        {p.repeat_every_days ? ` · every ${p.repeat_every_days}d` : ''}
                      </p>
                    </div>
                    <Badge status={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-5">
            {bestSlot && (
              <div className="edge-top edge-top-iris rounded-card border border-iris/25 bg-iris/5 p-5">
                <h2 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-iris-soft">
                  <ClockIcon size={13} />
                  Next best time to post
                </h2>
                <p className="mt-2.5 font-mono text-lg font-medium text-fg">{formatDate(bestSlot)}</p>
                <Link
                  href="/compose"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-iris-soft transition-colors hover:text-iris"
                >
                  Schedule for this slot
                  <ArrowRightIcon size={12} />
                </Link>
              </div>
            )}
            <div className={cardCls}>
              <h2 className="mb-4 font-display text-sm font-semibold text-fg">Quick actions</h2>
              <div className="space-y-2">
                <Link
                  href="/compose"
                  className="flex items-center justify-center gap-2 rounded-lg bg-iris px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-iris-deep"
                >
                  <PenIcon size={14} />
                  Compose a post
                </Link>
                <Link
                  href="/channels"
                  className="flex items-center justify-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm text-mut transition-colors hover:border-line2 hover:bg-raised hover:text-fg"
                >
                  <PlugIcon size={14} />
                  Connect a channel
                </Link>
                <Link
                  href="/automation"
                  className="flex items-center justify-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm text-mut transition-colors hover:border-line2 hover:bg-raised hover:text-fg"
                >
                  <RssIcon size={14} />
                  Automate with RSS
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
