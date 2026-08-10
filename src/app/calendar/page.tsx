'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Portal from '@/components/Portal';
import { CalendarIcon } from '@/components/icons';
import { Badge, cardCls, EmptyState, ErrorBanner, selectCls, Skeleton } from '@/components/ui';
import { api, formatDate } from '@/lib/client';
import type { ChannelDTO, PostDTO } from '@/lib/types';

function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DOT_COLOR: Record<string, string> = {
  scheduled: 'bg-iris',
  published: 'bg-ok',
  failed: 'bg-err',
  draft: 'bg-dim',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarPage() {
  const [view, setView] = useState<'month' | 'week'>('month');
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [posts, setPosts] = useState<PostDTO[] | null>(null);
  const [channels, setChannels] = useState<ChannelDTO[]>([]);
  const [channelFilter, setChannelFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api<{ posts: PostDTO[] }>('/api/posts'), api<{ channels: ChannelDTO[] }>('/api/channels')])
      .then(([p, c]) => {
        setPosts(p.posts);
        setChannels(c.channels);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load posts'));
  }, []);

  const allTags = useMemo(
    () => [...new Set((posts ?? []).flatMap((p) => p.tags ?? []))].sort(),
    [posts],
  );

  const filtered = useMemo(
    () =>
      (posts ?? []).filter((p) => {
        if (tagFilter && !(p.tags ?? []).includes(tagFilter)) return false;
        if (channelFilter && !p.targets.some((t) => t.channel_id === channelFilter)) return false;
        return true;
      }),
    [posts, tagFilter, channelFilter],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, PostDTO[]>();
    for (const p of filtered) {
      const iso = p.scheduled_at ?? p.created_at;
      const key = dayKey(new Date(iso));
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [filtered]);

  // Month cells
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthCells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (monthCells.length % 7 !== 0) monthCells.push(null);

  // Week cells (Sunday-start week containing cursor)
  const weekStart = new Date(cursor);
  weekStart.setDate(cursor.getDate() - cursor.getDay());
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const label =
    view === 'month'
      ? cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' })
      : `${weekDates[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${weekDates[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const selectedPosts = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  function shift(delta: number) {
    if (view === 'month') {
      setCursor(new Date(year, month + delta, 1));
    } else {
      const d = new Date(cursor);
      d.setDate(d.getDate() + delta * 7);
      setCursor(d);
    }
    setSelectedDay(null);
  }

  function renderDayCell(key: string, dayNum: number, extraCls = '') {
    const dayPosts = byDay.get(key) ?? [];
    const active = selectedDay === key;
    const isToday = key === dayKey(new Date());
    return (
      <button
        key={key}
        onClick={() => setSelectedDay(active ? null : key)}
        aria-label={`${dayPosts.length} posts on ${key}`}
        className={`flex min-h-20 flex-col rounded-lg border p-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/50 ${
          active ? 'border-iris bg-iris/10' : 'border-line bg-surface hover:border-line2'
        } ${extraCls}`}
      >
        <span className={`text-xs ${isToday ? 'font-bold text-iris-soft' : 'text-mut'}`}>{dayNum}</span>
        <div className="mt-1 space-y-1">
          {dayPosts.slice(0, 3).map((p) => (
            <div key={p.id} className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_COLOR[p.status] ?? DOT_COLOR.draft}`} />
              <span className="truncate text-[10px] text-mut">{p.content || '(media)'}</span>
            </div>
          ))}
          {dayPosts.length > 3 && <div className="text-[10px] text-dim">+{dayPosts.length - 3} more</div>}
        </div>
      </button>
    );
  }

  return (
    <Portal title="Calendar">
      <div className="mx-auto max-w-5xl space-y-5">
        <ErrorBanner message={error} />

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by channel"
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className={`${selectCls} w-auto text-xs`}
          >
            <option value="">All channels</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
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
          {(channelFilter || tagFilter) && (
            <button
              onClick={() => {
                setChannelFilter('');
                setTagFilter('');
              }}
              className="text-xs text-dim hover:text-fg"
            >
              Clear filters
            </button>
          )}
          <div className="ml-auto flex gap-1 rounded-lg border border-line bg-surface p-1" role="group" aria-label="Calendar view">
            {(['month', 'week'] as const).map((v) => (
              <button
                key={v}
                onClick={() => {
                  setView(v);
                  setCursor(new Date());
                  setSelectedDay(null);
                }}
                aria-pressed={view === v}
                className={`rounded-md px-3 py-1 text-xs capitalize ${
                  view === v ? 'bg-iris font-medium text-fg' : 'text-mut hover:text-fg'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className={cardCls}>
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={() => shift(-1)}
              aria-label="Previous"
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-fg hover:bg-raised"
            >
              ← Prev
            </button>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-fg">{label}</h2>
              <button
                onClick={() => {
                  const d = new Date();
                  if (view === 'month') d.setDate(1);
                  setCursor(d);
                  setSelectedDay(null);
                }}
                className="text-xs text-iris-soft hover:text-iris-soft"
              >
                Today
              </button>
            </div>
            <button
              onClick={() => shift(1)}
              aria-label="Next"
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-fg hover:bg-raised"
            >
              Next →
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-dim">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          {posts === null ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }, (_, i) => (
                <Skeleton key={i} className="min-h-20" />
              ))}
            </div>
          ) : view === 'month' ? (
            <div className="grid grid-cols-7 gap-1">
              {monthCells.map((day, i) =>
                day === null ? (
                  <div key={i} className="min-h-20 rounded-lg" />
                ) : (
                  renderDayCell(dayKey(new Date(year, month, day)), day)
                ),
              )}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {weekDates.map((d) => renderDayCell(dayKey(d), d.getDate(), 'min-h-40'))}
            </div>
          )}
        </div>

        {selectedDay && (
          <div className={cardCls}>
            <h3 className="mb-3 font-semibold text-fg">
              {new Date(`${selectedDay}T12:00:00`).toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </h3>
            {selectedPosts.length === 0 ? (
              <EmptyState icon={<CalendarIcon size={18} />} title="No posts on this day" hint="PICK A SLOT AND COMPOSE SOMETHING" />
            ) : (
              <ul className="divide-y divide-line/60">
                {selectedPosts.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-fg">{p.content || '(media only)'}</p>
                      <p className="mt-1 text-xs text-dim">
                        {formatDate(p.scheduled_at ?? p.created_at)} ·{' '}
                        {p.targets.map((t) => t.channel_name ?? t.provider).join(', ') || 'no channels'}
                        {p.repeat_every_days ? ` · every ${p.repeat_every_days}d` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge status={p.status} />
                      {(p.status === 'scheduled' || p.status === 'draft') && (
                        <Link
                          href={`/compose?post=${p.id}`}
                          className="rounded-lg border border-line px-2.5 py-1 text-xs text-fg hover:bg-raised"
                        >
                          Edit
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Portal>
  );
}
